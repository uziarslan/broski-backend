
const mongoose = require('mongoose');
const axios = require('axios');
const User = require('../models/User');
const ExpressError = require('../utils/ExpressError');
const jwt = require('jsonwebtoken');
const config = require('../config');
const {
    dailyChallenges,
    DAILY_CHALLENGE_COUNT,
    DEFAULT_CHALLENGE_REWARD,
} = require('../utils/dailyChallenges');

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const SUB_LOOKUP_WINDOW_MINUTES = parseInt(process.env.SUBSCRIPTION_LOOKUP_WINDOW_MINUTES || '5', 10);
const SUB_LOOKUP_WINDOW_MS = SUB_LOOKUP_WINDOW_MINUTES * 60 * 1000;
const { getEffectiveSubscription } = require('../utils/subscriptionUtils');
const { processPendingForRcIds } = require('../services/pendingWebhookService');

const parseDateSafely = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }
    return parsed;
};

const pickNextChallengeId = (currentId = -1) => {
    if (DAILY_CHALLENGE_COUNT === 0) return 0;
    return (currentId + 1) % DAILY_CHALLENGE_COUNT;
};

const resolveChallengeLevelName = (level) => {
    if (level < 5) return 'Rookie';
    if (level < 15) return 'Smooth Starter';
    if (level < 30) return 'Flirt Expert';
    return 'Broski Elite';
};

const assignNewChallenge = (user) => {
    const nextId = pickNextChallengeId(typeof user.currentChallengeId === 'number' ? user.currentChallengeId : -1);
    user.currentChallengeId = nextId;
    user.challengeAssignedAt = new Date();
    user.dailyChallengeCompleted = false;
    user.challengeCompletedAt = null;
};

const hasChallengeExpired = (user) => {
    if (!user.challengeAssignedAt) return false;
    const assignedAt = new Date(user.challengeAssignedAt);
    if (Number.isNaN(assignedAt.getTime())) return false;
    const elapsed = Date.now() - assignedAt.getTime();
    return elapsed >= DAY_IN_MS;
};

const hasCompletionExpired = (user) => {
    if (!user.challengeCompletedAt) return false;
    const completedAt = new Date(user.challengeCompletedAt);
    if (Number.isNaN(completedAt.getTime())) return false;
    const elapsed = Date.now() - completedAt.getTime();
    return elapsed >= DAY_IN_MS;
};

const ensureDailyChallengeForUser = async (user) => {
    let mutated = false;

    if (typeof user.currentChallengeId !== 'number' || user.currentChallengeId >= DAILY_CHALLENGE_COUNT) {
        assignNewChallenge(user);
        mutated = true;
    }

    if (user.dailyChallengeCompleted) {
        if (!user.challengeCompletedAt && user.lastChallengeDate) {
            const completedAt = new Date(user.lastChallengeDate);
            if (!Number.isNaN(completedAt.getTime())) {
                user.challengeCompletedAt = completedAt;
                mutated = true;
            }
        }

        if (hasCompletionExpired(user)) {
            assignNewChallenge(user);
            mutated = true;
        }
    } else if (hasChallengeExpired(user)) {
        assignNewChallenge(user);
        mutated = true;
    }

    if (mutated) {
        user.updatedAt = new Date();
        await user.save();
    }

    return user;
};

const serializeSavedReply = (reply) => ({
    id: reply.id,
    text: reply.text,
    tone: reply.tone || '',
    source: reply.source,
    savedAt: reply.savedAt,
});

// ============ USER MANAGEMENT ============

// Anonymous registration (no onboarding - used when user taps Get Started Free)
const registerAnonymous = async (req, res) => {
    try {
        const user = new User({
            name: 'Bro',
            userGoal: 'General',
            userChallenge: 'General',
            userPersonality: '',
            hasCompletedOnboarding: true,
            role: 'user',
            subscriptionTier: 'free',
            isActive: true,
            dailyAnalysisCount: 0,
            rizzLevel: 1,
            totalScore: 0,
            dailyWingItCount: 0,
            dailyWingItLimit: 3,
            lastWingItResetDate: new Date().toDateString(),
            totalXP: 0,
            challengeLevel: 1,
            challengeLevelName: 'Rookie',
            dailyChallengeCompleted: false,
            lastChallengeDate: '',
            currentChallengeId: 0,
            challengeAssignedAt: new Date(),
            challengeCompletedAt: null,
            challengeStreak: 0,
            rizzLevelName: 'Rookie',
            dailyDrillCompleted: false,
            savedChatReplies: [],
            lastSyncTime: new Date()
        });

        await user.save();

        const token = jwt.sign(
            { userId: user._id },
            config.JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            token,
            user: {
                id: user._id.toString(),
                name: user.name,
                role: user.role,
                hasCompletedOnboarding: user.hasCompletedOnboarding,
                subscriptionTier: user.subscriptionTier,
                userGoal: user.userGoal || '',
                userChallenge: user.userChallenge || '',
                userPersonality: user.userPersonality || ''
            }
        });
    } catch (err) {
        console.error('[registerAnonymous] Error:', err.message || err);
        if (err.name === 'ValidationError') {
            console.error('[registerAnonymous] Validation details:', JSON.stringify(err.errors, null, 2));
        }
        throw err;
    }
};

// User registration (legacy - with onboarding)
const registerUser = async (req, res) => {
    const { name, userGoal, userChallenge, userPersonality } = req.body;

    // Validate required fields
    if (!name) {
        throw new ExpressError('Name is required', 400);
    }

    // Validate onboarding data
    if (!userGoal || !userChallenge) {
        throw new ExpressError('User goal and challenge are required', 400);
    }

    // Create new user with comprehensive data
    const user = new User({
        name,
        userGoal: userGoal || '',
        userChallenge: userChallenge || '',
        userPersonality: userPersonality || '',
        hasCompletedOnboarding: false,
        role: 'user',
        subscriptionTier: 'free',
        isActive: true,
        // Initialize all app data with defaults
        dailyAnalysisCount: 0,
        rizzLevel: 1,
        totalScore: 0,
        dailyWingItCount: 0,
        dailyWingItLimit: 3,
        lastWingItResetDate: new Date().toDateString(),
        totalXP: 0,
        challengeLevel: 1,
        challengeLevelName: "Rookie",
        dailyChallengeCompleted: false,
        lastChallengeDate: "",
        currentChallengeId: 0,
        challengeAssignedAt: new Date(),
        challengeCompletedAt: null,
        challengeStreak: 0,
        rizzLevelName: "Rookie",
        dailyDrillCompleted: false,
        savedChatReplies: [],
        lastSyncTime: new Date()
    });

    await user.save();

    // Generate JWT token for the user
    const token = jwt.sign(
        { userId: user._id },
        config.JWT_SECRET,
        { expiresIn: '30d' } // Token expires in 30 days
    );

    res.status(201).json({
        success: true,
        message: 'User registered successfully',
        token: token, // Include token in response
        user: {
            id: user._id,
            name: user.name,
            role: user.role,
            hasCompletedOnboarding: user.hasCompletedOnboarding,
            subscriptionTier: user.subscriptionTier,
            userGoal: user.userGoal,
            userChallenge: user.userChallenge,
            userPersonality: user.userPersonality
        }
    });
};

// Generate token for existing user (login)
const generateUserToken = async (req, res) => {
    const { userId } = req.body;

    if (!userId) {
        throw new ExpressError('User ID is required', 400);
    }

    try {
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            throw new ExpressError('Invalid user ID', 400);
        }

        // Find user in database
        const user = await User.findById(userId);
        if (!user) {
            throw new ExpressError('User not found', 404);
        }

        // Generate JWT token for the user
        const token = jwt.sign(
            { userId: user._id },
            config.JWT_SECRET,
            { expiresIn: '30d' } // Token expires in 30 days
        );

        res.json({
            success: true,
            message: 'Token generated successfully',
            token: token
        });
    } catch (error) {
        if (error.status) {
            throw error;
        }
        throw new ExpressError('Failed to generate token', 500);
    }
};

const fetchUserIdFromRevenueCat = async (revenueCatUserId) => {
    if (!config.REVENUECAT_API_KEY) {
        return { user: null, matchType: null };
    }

    try {
        const response = await axios.get(
            `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(revenueCatUserId)}`,
            {
                headers: {
                    Authorization: `Bearer ${config.REVENUECAT_API_KEY}`,
                },
                timeout: 5000,
            }
        );

        const subscriber = response.data?.subscriber;
        if (!subscriber) {
            return { user: null, matchType: null };
        }

        // 1) Try mongo_user_id attribute (strongest signal)
        const attributeUserId = subscriber.attributes?.mongo_user_id?.value;
        if (attributeUserId && mongoose.Types.ObjectId.isValid(attributeUserId)) {
            const attrUser = await User.findById(attributeUserId);
            if (attrUser) {
                if (process.env.NODE_ENV !== 'production') {
                    console.log('[RC Restore][Backend] Matched via mongo_user_id', {
                        revenueCatUserId,
                        userId: attrUser._id.toString(),
                    });
                }
                return { user: attrUser, matchType: 'mongo_user_id' };
            }
        }

        // 2) Collect all aliases including the current app user ID
        const aliases = [revenueCatUserId, subscriber.original_app_user_id, ...(subscriber.aliases || [])]
            .filter(Boolean);

        // First, try to find by MongoDB ObjectId
        for (const alias of aliases) {
            if (mongoose.Types.ObjectId.isValid(alias)) {
                const user = await User.findById(alias);
                if (user) {
                    if (process.env.NODE_ENV !== 'production') {
                        console.log('[RC Restore][Backend] Matched via RC alias ObjectId', {
                            revenueCatUserId,
                            alias,
                            userId: user._id.toString(),
                        });
                    }
                    return { user, matchType: 'alias_object_id' };
                }
            }
        }

        // Then, try to find by subscriptionOriginalAppUserId or revenueCatAliases
        const user = await User.findOne({
            $or: [
                { subscriptionOriginalAppUserId: { $in: aliases } },
                { revenueCatAliases: { $in: aliases } },
            ],
        });
        if (user) {
            if (process.env.NODE_ENV !== 'production') {
                console.log('[RC Restore][Backend] Matched via RC alias subscription field', {
                    revenueCatUserId,
                    userId: user._id.toString(),
                });
            }
            return { user, matchType: 'alias_subscription_field' };
        }
    } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
            console.error('[RC Restore][Backend] RC API error', {
                revenueCatUserId,
                message: error?.message,
                status: error?.response?.status,
            });
        }
    }

    return { user: null, matchType: null };
};

async function findUserByProductIdAndPurchaseDate(productId, originalPurchaseDate) {
    if (!productId || !originalPurchaseDate) return null;
    const purchaseDate = new Date(originalPurchaseDate);
    if (Number.isNaN(purchaseDate.getTime())) return null;
    const windowStart = new Date(purchaseDate.getTime() - SUB_LOOKUP_WINDOW_MS);
    const windowEnd = new Date(purchaseDate.getTime() + SUB_LOOKUP_WINDOW_MS);
    // Match on product id plus purchase time window. Product ids in Mongo may
    // include store-specific suffixes (e.g. "broski_weekly:broski-weekly"), so
    // we allow a prefix match on the bare productId as well.
    const candidates = await User.find({
        subscriptionProductId: { $regex: new RegExp(`^${productId}`) },
        subscriptionOriginalPurchaseDate: { $gte: windowStart, $lte: windowEnd },
    }).limit(2);

    if (candidates.length === 0) {
        return null;
    }

    if (candidates.length > 1) {
        if (process.env.NODE_ENV !== 'production') {
            console.error('[RC Restore][Backend] Ambiguous metadata fallback mapping', {
                productId,
                originalPurchaseDate,
                userIds: candidates.map((u) => u._id.toString()),
            });
        }
        // Signal ambiguity to caller via a custom error; caller should fail closed.
        throw new ExpressError('Multiple users found for subscription metadata', 409);
    }

    return candidates[0];
}

const appendRevenueCatAlias = async (user, alias) => {
    if (!alias) return;

    const aliases = new Set(user.revenueCatAliases || []);
    aliases.add(alias);
    user.revenueCatAliases = Array.from(aliases);

    if (!user.subscriptionOriginalAppUserId || user.subscriptionOriginalAppUserId !== alias) {
        user.subscriptionOriginalAppUserId = alias;
    }

    await user.save();
};

const generateUserTokenFromRevenueCat = async (req, res) => {
    const { revenueCatUserId, fallback } = req.body;

    if (!revenueCatUserId) {
        throw new ExpressError('RevenueCat user ID is required', 400);
    }

    try {
        // Normalize fallback dates
        const normalizedFallback = {
            productId: fallback?.productId || null,
            originalPurchaseDate: fallback?.originalPurchaseDate || null,
            latestPurchaseDate: fallback?.latestPurchaseDate || null,
            originalAppUserId: fallback?.originalAppUserId || null,
        };

        if (process.env.NODE_ENV !== 'production') {
            console.log('[RC Restore][Backend] Request received', {
                revenueCatUserId,
                hasFallback: Boolean(fallback),
                productId: normalizedFallback.productId,
                originalPurchaseDate: normalizedFallback.originalPurchaseDate,
            });
        }

        const aliasCandidates = [
            revenueCatUserId,
            normalizedFallback.originalAppUserId,
        ].filter(Boolean);

        let resolvedUser = null;
        let matchType = null;

        // Step A: Strong alias-based mapping (priority level 2)
        if (aliasCandidates.length > 0) {
            // 1) Direct ObjectId matches
            const objectIdCandidates = aliasCandidates.filter((id) => mongoose.Types.ObjectId.isValid(id));
            let aliasObjectIdUser = null;
            const seenIds = new Set();
            for (const id of objectIdCandidates) {
                const user = await User.findById(id);
                if (user) {
                    seenIds.add(user._id.toString());
                    aliasObjectIdUser = user;
                }
            }
            if (seenIds.size > 1) {
                if (process.env.NODE_ENV !== 'production') {
                    console.error('[RC Restore][Backend] Ambiguous alias ObjectId mapping', {
                        revenueCatUserId,
                        candidateUserIds: Array.from(seenIds),
                    });
                }
                throw new ExpressError('Multiple candidate users found for this subscription', 409);
            }
            if (aliasObjectIdUser) {
                resolvedUser = aliasObjectIdUser;
                matchType = 'alias_object_id';
            }

            // 2) subscriptionOriginalAppUserId / revenueCatAliases
            if (!resolvedUser) {
                const aliasUser = await User.findOne({
                    $or: [
                        { subscriptionOriginalAppUserId: { $in: aliasCandidates } },
                        { revenueCatAliases: { $in: aliasCandidates } },
                    ],
                });
                if (aliasUser) {
                    resolvedUser = aliasUser;
                    matchType = 'alias_subscription_field';
                }
            }
        }

        // Step B: RevenueCat REST API (priority level 1 then 2)
        if (!resolvedUser) {
            const { user: apiUser, matchType: apiMatchType } = await fetchUserIdFromRevenueCat(revenueCatUserId);
            if (apiUser) {
                resolvedUser = apiUser;
                matchType = apiMatchType || 'revenuecat_api';
            }
        }

        // Step C: Metadata fallback (priority level 3)
        if (!resolvedUser && normalizedFallback.productId && normalizedFallback.originalPurchaseDate) {
            const byMeta = await findUserByProductIdAndPurchaseDate(
                normalizedFallback.productId,
                normalizedFallback.originalPurchaseDate
            );
            if (byMeta) {
                if (process.env.NODE_ENV !== 'production') {
                    console.log('[RC Restore][Backend] Matched user via metadata', {
                        revenueCatUserId,
                        userId: byMeta._id.toString(),
                        productId: normalizedFallback.productId,
                        originalPurchaseDate: normalizedFallback.originalPurchaseDate,
                    });
                }
                resolvedUser = byMeta;
                matchType = 'metadata_fallback';
            }
        }

        if (!resolvedUser) {
            if (process.env.NODE_ENV !== 'production') {
                console.warn('[RC Restore][Backend] No mapping found', {
                    revenueCatUserId,
                    hasFallback: Boolean(fallback),
                    productId: normalizedFallback.productId,
                    originalPurchaseDate: normalizedFallback.originalPurchaseDate,
                });
            }
            throw new ExpressError('User not found', 404);
        }

        await appendRevenueCatAlias(resolvedUser, revenueCatUserId);
        processPendingForRcIds([revenueCatUserId]).catch(() => { });

        const token = jwt.sign(
            { userId: resolvedUser._id },
            config.JWT_SECRET,
            { expiresIn: '30d' }
        );

        if (process.env.NODE_ENV !== 'production') {
            console.log('[RC Restore][Backend] Mapping success', {
                revenueCatUserId,
                userId: resolvedUser._id.toString(),
                matchType,
            });
        }

        res.json({
            success: true,
            message: 'Token generated successfully',
            token,
            userId: resolvedUser._id.toString(),
            matchType: matchType || null,
        });
    } catch (error) {
        if (error.status) {
            throw error;
        }
        if (process.env.NODE_ENV !== 'production') {
            console.error('[RC Restore][Backend] Failed to generate token from RevenueCat', {
                revenueCatUserId,
                message: error?.message,
            });
        }
        throw new ExpressError('Failed to generate token', 500);
    }
};

const registerRevenueCatAlias = async (req, res) => {
    const { revenueCatUserId } = req.body;
    const userId = req.user?.userId;

    if (!revenueCatUserId) {
        throw new ExpressError('RevenueCat user ID is required', 400);
    }

    if (!userId) {
        throw new ExpressError('Unauthorized', 401);
    }

    const user = await User.findById(userId);
    if (!user) {
        throw new ExpressError('User not found', 404);
    }

    await appendRevenueCatAlias(user, revenueCatUserId);
    processPendingForRcIds([revenueCatUserId]).catch(() => { });

    res.json({
        success: true,
        message: 'RevenueCat alias registered',
        aliases: user.revenueCatAliases,
    });
};

// Get user profile
const getUserProfile = async (req, res) => {
    const { userId } = req.params;

    try {
        // Fetch user from database
        const user = await User.findById(userId);
        if (!user) {
            throw new ExpressError('User not found', 404);
        }

        await ensureDailyChallengeForUser(user);

        const effective = getEffectiveSubscription(user);
        const userProfile = {
            id: user._id,
            name: user.name,
            role: user.role,
            hasCompletedOnboarding: user.hasCompletedOnboarding,
            // Subscription (server-computed, expiry-safe)
            subscriptionTier: effective.subscriptionTier,
            subscriptionPlan: user.subscriptionPlan,
            isSubscribed: effective.isSubscribed,
            subscriptionStatus: effective.subscriptionStatus,
            subscriptionProductId: user.subscriptionProductId,
            subscriptionEntitlementId: user.subscriptionEntitlementId,
            subscriptionOriginalAppUserId: user.subscriptionOriginalAppUserId,
            subscriptionStore: user.subscriptionStore,
            subscriptionEnvironment: user.subscriptionEnvironment,
            subscriptionPlatform: user.subscriptionPlatform,
            subscriptionLatestPurchaseDate: user.subscriptionLatestPurchaseDate,
            subscriptionOriginalPurchaseDate: user.subscriptionOriginalPurchaseDate,
            subscriptionExpirationDate: user.subscriptionExpirationDate,
            subscriptionWillRenew: user.subscriptionWillRenew,
            isInTrialPeriod: user.isInTrialPeriod,
            trialRequestCount: user.trialRequestCount,
            lastTrialRequestResetDate: user.lastTrialRequestResetDate,
            userGoal: user.userGoal,
            userChallenge: user.userChallenge,
            userPersonality: user.userPersonality,
            // App usage data
            dailyAnalysisCount: user.dailyAnalysisCount,
            rizzLevel: user.rizzLevel,
            totalScore: user.totalScore,
            lastDrillDate: user.lastDrillDate,
            dailyConfidenceMessage: user.dailyConfidenceMessage,
            lastConfidenceDate: user.lastConfidenceDate,
            // Wing It System
            dailyWingItCount: user.dailyWingItCount,
            dailyWingItLimit: user.dailyWingItLimit,
            lastWingItResetDate: user.lastWingItResetDate,
            // Daily Challenges
            totalXP: user.totalXP,
            challengeLevel: user.challengeLevel,
            challengeLevelName: user.challengeLevelName,
            dailyChallengeCompleted: user.dailyChallengeCompleted,
            lastChallengeDate: user.lastChallengeDate,
            currentChallengeId: user.currentChallengeId,
            challengeAssignedAt: user.challengeAssignedAt,
            challengeCompletedAt: user.challengeCompletedAt,
            challengeStreak: user.challengeStreak,
            savedChatReplies: (user.savedChatReplies || []).map(serializeSavedReply),
            // Rizz Drills
            rizzLevelName: user.rizzLevelName,
            dailyDrillCompleted: user.dailyDrillCompleted,
            // Account status
            isActive: user.isActive,
            lastLogin: user.lastLogin,
            lastSyncTime: user.lastSyncTime,
            notificationsEnabled: user.notificationsEnabled,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
        };

        res.json({ success: true, data: userProfile });
    } catch (error) {

        // If it's already an ExpressError, re-throw it with the original status
        if (error.status) {
            throw error;
        }

        // Otherwise, throw a generic 500 error
        throw new ExpressError('Failed to fetch user profile', 500);
    }
};

const SUBSCRIPTION_FIELDS_BLOCKED = [
    'subscriptionTier', 'subscriptionPlan', 'isSubscribed', 'subscriptionStatus',
    'subscriptionProductId', 'subscriptionEntitlementId', 'subscriptionOriginalAppUserId',
    'subscriptionStore', 'subscriptionEnvironment', 'subscriptionPlatform',
    'subscriptionLatestPurchaseDate', 'subscriptionOriginalPurchaseDate', 'subscriptionExpirationDate',
    'subscriptionWillRenew', 'isInTrialPeriod', 'revenueCatAliases',
    'lastWebhookEventAt', 'lastWebhookEventType', 'lastWebhookEventId'
];

// Update user profile (subscription fields are read-only, webhook-only)
const updateUserProfile = async (req, res) => {
    const { userId } = req.params;
    const raw = req.body || {};
    const updates = { ...raw };
    SUBSCRIPTION_FIELDS_BLOCKED.forEach(f => delete updates[f]);

    try {
        // Find and update user in database
        const user = await User.findByIdAndUpdate(
            userId,
            {
                ...updates,
                updatedAt: new Date(),
                lastSyncTime: new Date()
            },
            { new: true, runValidators: true }
        );

        if (!user) {
            throw new ExpressError('User not found', 404);
        }

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: {
                id: user._id,
                name: user.name,
                hasCompletedOnboarding: user.hasCompletedOnboarding,
                subscriptionTier: user.subscriptionTier,
                subscriptionPlan: user.subscriptionPlan,
                isSubscribed: user.isSubscribed,
                subscriptionStatus: user.subscriptionStatus,
                userGoal: user.userGoal,
                userChallenge: user.userChallenge,
                userPersonality: user.userPersonality,
                dailyAnalysisCount: user.dailyAnalysisCount,
                rizzLevel: user.rizzLevel,
                totalScore: user.totalScore,
                totalXP: user.totalXP,
                challengeLevel: user.challengeLevel,
                challengeLevelName: user.challengeLevelName,
                lastSyncTime: user.lastSyncTime,
                updatedAt: user.updatedAt
            }
        });
    } catch (error) {
        // If it's already an ExpressError, re-throw it with the original status
        if (error.status) {
            throw error;
        }

        // Otherwise, throw a generic 500 error
        throw new ExpressError('Failed to update user profile', 500);
    }
};

// Check usage limits
const checkUsageLimit = async (req, res) => {
    const { userId, subscriptionTier, dailyAnalysisCount } = req.body;

    const limits = {
        free: 2,
        pro: 50,
        gold: 1000
    };

    const limit = limits[subscriptionTier] || limits.free;
    const canUse = dailyAnalysisCount < limit;

    res.json({
        success: true,
        data: {
            canUse,
            currentUsage: dailyAnalysisCount,
            limit,
            remaining: Math.max(0, limit - dailyAnalysisCount)
        }
    });
};

// Increment usage count
const incrementUsage = async (req, res) => {
    const { userId, subscriptionTier, currentCount } = req.body;

    const limits = {
        free: 2,
        pro: 50,
        gold: 1000
    };

    const limit = limits[subscriptionTier] || limits.free;
    const newCount = currentCount + 1;
    const canUse = newCount < limit;

    res.json({
        success: true,
        data: {
            newCount,
            canUse,
            limit,
            remaining: Math.max(0, limit - newCount)
        }
    });
};

// Find user by subscription metadata (productId + originalPurchaseDate)
const findUserBySubscriptionMetadata = async (req, res) => {
    const { productId, originalPurchaseDate } = req.body || {};

    if (!productId || !originalPurchaseDate) {
        throw new ExpressError('productId and originalPurchaseDate are required', 400);
    }

    const purchaseDate = new Date(originalPurchaseDate);

    if (Number.isNaN(purchaseDate.getTime())) {
        throw new ExpressError('Invalid originalPurchaseDate', 400);
    }

    const windowStart = new Date(purchaseDate.getTime() - SUB_LOOKUP_WINDOW_MS);
    const windowEnd = new Date(purchaseDate.getTime() + SUB_LOOKUP_WINDOW_MS);

    if (process.env.NODE_ENV !== 'production') {
        console.log('[Subscription Lookup]', {
            productId,
            originalPurchaseDate,
            windowStart,
            windowEnd
        });
    }

    const candidates = await User.find({
        subscriptionProductId: productId,
        subscriptionOriginalPurchaseDate: { $gte: windowStart, $lte: windowEnd }
    }).limit(2);

    if (candidates.length === 0) {
        if (process.env.NODE_ENV !== 'production') {
            console.log('[Subscription Lookup] No user found for', {
                productId,
                originalPurchaseDate
            });
        }
        throw new ExpressError('User not found', 404);
    }

    if (candidates.length > 1) {
        if (process.env.NODE_ENV !== 'production') {
            console.error('[Subscription Lookup] Ambiguous subscription metadata mapping', {
                productId,
                originalPurchaseDate,
                userIds: candidates.map((u) => u._id.toString()),
            });
        }
        throw new ExpressError('Multiple users found for subscription metadata', 409);
    }

    if (process.env.NODE_ENV !== 'production') {
        console.log('[Subscription Lookup] Found user', candidates[0]._id.toString());
    }

    res.json({
        success: true,
        userId: candidates[0]._id.toString()
    });
};

// Complete daily challenge
const completeDailyChallenge = async (req, res) => {
    const { userId } = req.body;

    if (!userId) {
        throw new ExpressError('User ID is required', 400);
    }

    const user = await User.findById(userId);

    if (!user) {
        throw new ExpressError('User not found', 404);
    }

    // Save the previous completion date BEFORE ensureDailyChallengeForUser potentially resets it
    const previousCompletionDate =
        parseDateSafely(user.challengeCompletedAt) || parseDateSafely(user.lastChallengeDate);
    const previousStreak = user.challengeStreak || 0;

    await ensureDailyChallengeForUser(user);

    if (user.dailyChallengeCompleted && !hasCompletionExpired(user)) {
        return res.status(400).json({
            success: false,
            message: 'Challenge already completed. Come back after 24 hours for a new one.'
        });
    }

    const now = new Date();
    const reward = dailyChallenges[user.currentChallengeId]?.xp ?? DEFAULT_CHALLENGE_REWARD;

    // Use the saved previousCompletionDate for streak calculation
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0); // Normalize to start of day for accurate date comparison

    // Check if previous completion was yesterday (consecutive day)
    let isConsecutiveDay = false;
    if (previousCompletionDate) {
        const previousDate = new Date(previousCompletionDate);
        previousDate.setHours(0, 0, 0, 0); // Normalize to start of day
        isConsecutiveDay = previousDate.getTime() === yesterday.getTime();
    }

    // Calculate streak: increment if consecutive, reset to 1 if not
    const challengeStreak = isConsecutiveDay ? previousStreak + 1 : 1;

    const totalXP = (user.totalXP || 0) + reward;
    const challengeLevel = Math.floor(totalXP / 50) + 1;
    const challengeLevelName = resolveChallengeLevelName(challengeLevel);

    user.totalXP = totalXP;
    user.challengeLevel = challengeLevel;
    user.challengeLevelName = challengeLevelName;
    user.dailyChallengeCompleted = true;
    user.lastChallengeDate = now.toDateString();
    user.challengeCompletedAt = now;
    user.challengeStreak = challengeStreak;

    await user.save();

    res.json({
        success: true,
        message: 'Challenge completed',
        data: {
            totalXP: user.totalXP,
            challengeLevel: user.challengeLevel,
            challengeLevelName: user.challengeLevelName,
            challengeStreak: user.challengeStreak,
            dailyChallengeCompleted: user.dailyChallengeCompleted,
            challengeCompletedAt: user.challengeCompletedAt,
            currentChallengeId: user.currentChallengeId,
        }
    });
};

const getSavedChatReplies = async (req, res) => {
    const userId = req.user?.userId || req.body?.userId;

    if (!userId) {
        throw new ExpressError('User authentication required', 401);
    }

    const user = await User.findById(userId);
    if (!user) {
        throw new ExpressError('User not found', 404);
    }

    const savedReplies = (user.savedChatReplies || []).map(serializeSavedReply);

    res.json({
        success: true,
        data: savedReplies,
    });
};

const addSavedChatReply = async (req, res) => {
    const userId = req.user?.userId || req.body?.userId;
    if (!userId) {
        throw new ExpressError('User authentication required', 401);
    }

    const { text, tone = '', source = 'chat_coach' } = req.body;

    if (!text || typeof text !== 'string') {
        throw new ExpressError('Text is required', 400);
    }

    const normalizedSource = ['chat_coach', 'awkward_situations'].includes(source)
        ? source
        : 'chat_coach';

    const user = await User.findById(userId);
    if (!user) {
        throw new ExpressError('User not found', 404);
    }

    const entry = {
        id: new mongoose.Types.ObjectId().toString(),
        text,
        tone,
        source: normalizedSource,
        savedAt: new Date(),
    };

    user.savedChatReplies.unshift(entry);
    await user.save();

    res.status(201).json({
        success: true,
        data: serializeSavedReply(entry),
    });
};

const deleteSavedChatReply = async (req, res) => {
    const userId = req.user?.userId || req.body?.userId;
    const { replyId } = req.params;

    if (!userId) {
        throw new ExpressError('User authentication required', 401);
    }

    if (!replyId) {
        throw new ExpressError('Reply ID is required', 400);
    }

    const user = await User.findById(userId);
    if (!user) {
        throw new ExpressError('User not found', 404);
    }

    const index = user.savedChatReplies.findIndex((reply) => reply.id === replyId);
    if (index === -1) {
        throw new ExpressError('Saved reply not found', 404);
    }

    const [removed] = user.savedChatReplies.splice(index, 1);
    await user.save();

    res.json({
        success: true,
        message: 'Saved reply removed',
        data: serializeSavedReply(removed),
    });
};

// Complete daily drill
const completeDailyDrill = async (req, res) => {
    const { userId, score } = req.body;

    // In a real app, you'd update the database

    res.json({
        success: true,
        message: 'Daily drill completed',
        data: {
            userId,
            score,
            completedAt: new Date().toISOString()
        }
    });
};

// Set daily confidence message
const setDailyConfidence = async (req, res) => {
    const { userId, message } = req.body;

    // In a real app, you'd update the database

    res.json({
        success: true,
        message: 'Daily confidence message set',
        data: {
            userId,
            message,
            setAt: new Date().toISOString()
        }
    });
};

// Get users (Admin only) - paginated with effective subscription
const getAllUsers = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
        const sort = req.query.sort === 'createdAt' ? { createdAt: 1 } : { createdAt: -1 };
        const skip = (page - 1) * limit;
        const users = await User.find({}).select('-__v').sort(sort).skip(skip).limit(limit + 1).lean();
        const hasMore = users.length > limit;
        const data = (hasMore ? users.slice(0, limit) : users).map((u) => {
            const effective = getEffectiveSubscription(u);
            return {
                ...u,
                subscriptionTier: effective.subscriptionTier,
                subscriptionStatus: effective.subscriptionStatus,
                isSubscribed: effective.isSubscribed,
            };
        });

        res.json({
            success: true,
            data,
            pagination: { page, limit, hasMore },
        });
    } catch (error) {
        throw new ExpressError('Failed to fetch users', 500);
    }
};

// Toggle user status (Admin only)
const toggleUserStatus = async (req, res) => {
    const { userId } = req.params;

    try {
        const user = await User.findById(userId);

        if (!user) {
            throw new ExpressError('User not found', 404);
        }

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            {
                isActive: !user.isActive,
                updatedAt: new Date(),
                lastSyncTime: new Date()
            },
            { new: true, runValidators: true }
        );

        res.json({
            success: true,
            message: `User ${updatedUser.isActive ? 'activated' : 'deactivated'} successfully`,
            data: updatedUser
        });
    } catch (error) {
        if (error.status) {
            throw error;
        }
        throw new ExpressError('Failed to toggle user status', 500);
    }
};

// Delete user (Admin only)
const deleteUser = async (req, res) => {
    const { userId } = req.params;

    try {
        const user = await User.findByIdAndDelete(userId);

        if (!user) {
            throw new ExpressError('User not found', 404);
        }

        res.json({
            success: true,
            message: 'User deleted successfully'
        });
    } catch (error) {
        if (error.status) {
            throw error;
        }
        throw new ExpressError('Failed to delete user', 500);
    }
};

// Delete own account (authenticated user)
const deleteOwnAccount = async (req, res) => {
    const userId = req.user?.userId;

    if (!userId) {
        throw new ExpressError('User authentication required', 401);
    }

    try {
        const user = await User.findByIdAndDelete(userId);

        if (!user) {
            throw new ExpressError('User not found', 404);
        }

        res.json({
            success: true,
            message: 'User deleted successfully'
        });
    } catch (error) {
        if (error.status) {
            throw error;
        }
        throw new ExpressError('Failed to delete user', 500);
    }
};

module.exports = {
    registerAnonymous,
    registerUser,
    generateUserToken,
    generateUserTokenFromRevenueCat,
    registerRevenueCatAlias,
    getUserProfile,
    updateUserProfile,
    checkUsageLimit,
    incrementUsage,
    getSavedChatReplies,
    addSavedChatReply,
    deleteSavedChatReply,
    completeDailyChallenge,
    completeDailyDrill,
    setDailyConfidence,
    getAllUsers,
    toggleUserStatus,
    deleteUser,
    deleteOwnAccount,
    findUserBySubscriptionMetadata
};
