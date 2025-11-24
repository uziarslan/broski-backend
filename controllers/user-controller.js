
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

// User registration
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
        return null;
    }

    try {
        const response = await axios.get(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(revenueCatUserId)}`, {
            headers: {
                Authorization: `Bearer ${config.REVENUECAT_API_KEY}`,
            },
            timeout: 5000,
        });

        const subscriber = response.data?.subscriber;
        if (!subscriber) {
            return null;
        }

        // Try subscriber attributes first
        const attributeUserId = subscriber.attributes?.mongo_user_id?.value;
        if (attributeUserId && mongoose.Types.ObjectId.isValid(attributeUserId)) {
            const attrUser = await User.findById(attributeUserId);
            if (attrUser) {
                return attrUser;
            }
        }

        // Collect all aliases including the current app user ID
        const aliases = [revenueCatUserId, ...(subscriber.aliases || [])];

        // First, try to find by MongoDB ObjectId
        for (const alias of aliases) {
            if (mongoose.Types.ObjectId.isValid(alias)) {
                const user = await User.findById(alias);
                if (user) {
                    return user;
                }
            }
        }

        // Then, try to find by subscriptionOriginalAppUserId or revenueCatAliases
        for (const alias of aliases) {
            const user = await User.findOne({
                $or: [
                    { subscriptionOriginalAppUserId: alias },
                    { revenueCatAliases: { $in: [alias] } }
                ]
            });
            if (user) {
                return user;
            }
        }

    } catch (error) {
    }

    return null;
};

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

        const user = await (async () => {
            const conditions = [
                { subscriptionOriginalAppUserId: revenueCatUserId },
                { revenueCatAliases: { $in: [revenueCatUserId] } }
            ];

            if (mongoose.Types.ObjectId.isValid(revenueCatUserId)) {
                conditions.unshift({ _id: revenueCatUserId });
            }

            const found = await User.findOne({ $or: conditions });
            if (found) {
                return found;
            }
            const viaRevenueCatApi = await fetchUserIdFromRevenueCat(revenueCatUserId);
            if (viaRevenueCatApi) {
                return viaRevenueCatApi;
            }

            if (fallback) {
                const fallbackUser = await findUserByFallback(fallback);
                if (fallbackUser) {
                    return fallbackUser;
                }
            }

            return null;
        })();

        if (!user) {
            throw new ExpressError('User not found', 404);
        }

        await appendRevenueCatAlias(user, revenueCatUserId);

        const token = jwt.sign(
            { userId: user._id },
            config.JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({
            success: true,
            message: 'Token generated successfully',
            token,
            userId: user._id.toString()
        });
    } catch (error) {
        if (error.status) {
            throw error;
        }
        throw new ExpressError('Failed to generate token', 500);
    }
};

const findUserByFallback = async (fallback) => {
    const queries = [];

    if (fallback.originalAppUserId) {
        queries.push({ subscriptionOriginalAppUserId: fallback.originalAppUserId });
        queries.push({ revenueCatAliases: { $in: [fallback.originalAppUserId] } });
    }

    if (fallback.productId) {
        queries.push({ subscriptionProductId: fallback.productId });
    }

    if (fallback.originalPurchaseDate) {
        const date = new Date(fallback.originalPurchaseDate);
        if (!Number.isNaN(date.getTime())) {
            const start = new Date(date.getTime() - 5 * 60 * 1000);
            const end = new Date(date.getTime() + 5 * 60 * 1000);
            queries.push({
                subscriptionOriginalPurchaseDate: {
                    $gte: start,
                    $lte: end
                }
            });
        }
    }

    if (queries.length === 0) {
        return null;
    }

    return User.findOne({ $or: queries });
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

        const userProfile = {
            id: user._id,
            name: user.name,
            role: user.role,
            hasCompletedOnboarding: user.hasCompletedOnboarding,
            // Subscription
            subscriptionTier: user.subscriptionTier,
            subscriptionPlan: user.subscriptionPlan,
            isSubscribed: user.isSubscribed,
            subscriptionStatus: user.subscriptionStatus,
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

// Update user profile
const updateUserProfile = async (req, res) => {
    const { userId } = req.params;
    const updates = req.body;

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

// Sync subscription data coming from the client (RevenueCat)
const syncSubscriptionFromClient = async (req, res) => {
    const userId = req.user?.userId;

    if (!userId) {
        throw new ExpressError('User authentication required', 401);
    }

    const {
        status,
        plan,
        productId,
        entitlementId,
        originalAppUserId,
        store,
        environment,
        platform,
        latestPurchaseDate,
        originalPurchaseDate,
        expirationDate,
        willRenew,
        periodType
    } = req.body || {};

    // Debug: Log received periodType
    if (process.env.NODE_ENV !== 'production') {
        console.log('[Subscription Sync] Received periodType:', periodType, 'from body:', JSON.stringify(req.body, null, 2));
    }

    const allowedStatus = ['none', 'active', 'expired', 'canceled', 'billing_issue'];
    const allowedPlans = ['weekly', 'monthly', 'yearly'];

    const normalizedStatus = allowedStatus.includes(status) ? status : 'none';
    const normalizedPlan = allowedPlans.includes(plan) ? plan : null;
    const dateOrNull = (value) => (value ? new Date(value) : null);

    // Check if user is in trial period
    // Also check dates to infer trial status if periodType is not provided
    let isInTrial = periodType === 'trial' || periodType === 'TRIAL';

    // Fallback: If periodType is not 'trial' but subscription is active and dates suggest trial
    // This handles cases where RevenueCat returns "NORMAL" even during trial period
    if (!isInTrial && normalizedStatus === 'active' && originalPurchaseDate && expirationDate) {
        const purchaseDate = new Date(originalPurchaseDate);
        const expDate = new Date(expirationDate);
        const now = new Date();

        const daysSinceOriginal = (now.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24);
        const daysUntilExpiration = (expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        const totalDays = (expDate.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24);

        // If subscription is within first 3-4 days of original purchase and expires soon, it's likely a trial
        // Also check if total duration is around 3 days (trial period)
        if (daysSinceOriginal <= 4 && daysUntilExpiration >= 0 && daysUntilExpiration <= 4 && totalDays >= 2.5 && totalDays <= 4) {
            isInTrial = true;
            if (process.env.NODE_ENV !== 'production') {
                console.log('[Subscription Sync] Detected trial based on dates:', {
                    daysSinceOriginal: daysSinceOriginal.toFixed(2),
                    daysUntilExpiration: daysUntilExpiration.toFixed(2),
                    totalDays: totalDays.toFixed(2),
                    originalPurchaseDate,
                    expirationDate
                });
            }
        }
    }

    const updates = {
        subscriptionTier: normalizedStatus === 'active' ? 'pro' : 'free',
        isSubscribed: normalizedStatus === 'active',
        subscriptionPlan: normalizedPlan,
        subscriptionStatus: normalizedStatus,
        subscriptionProductId: productId || null,
        subscriptionEntitlementId: entitlementId || null,
        subscriptionStore: store || null,
        subscriptionEnvironment: environment || null,
        subscriptionPlatform: platform || null,
        subscriptionLatestPurchaseDate: dateOrNull(latestPurchaseDate),
        subscriptionOriginalPurchaseDate: dateOrNull(originalPurchaseDate),
        subscriptionExpirationDate: dateOrNull(expirationDate),
        subscriptionWillRenew: typeof willRenew === 'boolean' ? willRenew : false,
        isInTrialPeriod: isInTrial,
        lastSyncTime: new Date()
    };

    const hasSubscriptionHistory =
        normalizedStatus !== 'none' ||
        Boolean(originalPurchaseDate) ||
        Boolean(expirationDate) ||
        Boolean(productId) ||
        Boolean(entitlementId);

    if (hasSubscriptionHistory) {
        updates.hasCompletedOnboarding = true;
    }

    const updateDoc = { $set: updates };

    const aliasesToAdd = [];
    let resolvedOriginalAppUserId = null;

    if (originalAppUserId) {
        aliasesToAdd.push(originalAppUserId);

        if (mongoose.Types.ObjectId.isValid(originalAppUserId) && !originalAppUserId.startsWith('$RC')) {
            resolvedOriginalAppUserId = originalAppUserId;
        }
    }

    if (!resolvedOriginalAppUserId && mongoose.Types.ObjectId.isValid(userId)) {
        resolvedOriginalAppUserId = userId;
    }

    if (resolvedOriginalAppUserId) {
        updateDoc.$set.subscriptionOriginalAppUserId = resolvedOriginalAppUserId;
        if (!aliasesToAdd.includes(resolvedOriginalAppUserId)) {
            aliasesToAdd.push(resolvedOriginalAppUserId);
        }
    }

    if (aliasesToAdd.length > 0) {
        updateDoc.$addToSet = { revenueCatAliases: { $each: aliasesToAdd } };
    }

    const user = await User.findByIdAndUpdate(userId, updateDoc, { new: true, runValidators: true });

    if (!user) {
        throw new ExpressError('User not found', 404);
    }

    res.json({
        success: true,
        message: 'Subscription synced successfully',
        data: {
            subscriptionTier: user.subscriptionTier,
            subscriptionPlan: user.subscriptionPlan,
            subscriptionStatus: user.subscriptionStatus,
            isSubscribed: user.isSubscribed,
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
            lastSyncTime: user.lastSyncTime
        }
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

// Get all users (Admin only)
const getAllUsers = async (req, res) => {
    try {
        const users = await User.find({}).select('-__v').sort({ createdAt: -1 });

        res.json({
            success: true,
            data: users,
            count: users.length
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

module.exports = {
    registerUser,
    generateUserToken,
    generateUserTokenFromRevenueCat,
    registerRevenueCatAlias,
    getUserProfile,
    updateUserProfile,
    checkUsageLimit,
    incrementUsage,
    syncSubscriptionFromClient,
    getSavedChatReplies,
    addSavedChatReply,
    deleteSavedChatReply,
    completeDailyChallenge,
    completeDailyDrill,
    setDailyConfidence,
    getAllUsers,
    toggleUserStatus,
    deleteUser
};
