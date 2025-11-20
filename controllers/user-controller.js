
const mongoose = require('mongoose');
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
            // Subscription
            subscriptionTier: user.subscriptionTier,
            subscriptionPlan: user.subscriptionPlan,
            isSubscribed: user.isSubscribed,
            trialEndDate: user.trialEndDate,
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
            subscriptionTrialActive: user.subscriptionTrialActive,
            subscriptionTrialStartDate: user.subscriptionTrialStartDate,
            subscriptionTrialEndDate: user.subscriptionTrialEndDate,
            subscriptionManagementURL: user.subscriptionManagementURL,
            subscriptionPeriodType: user.subscriptionPeriodType,
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
        console.error('Error fetching user profile:', error);

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

        console.log(`Updated user ${userId}:`, updates);

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: {
                id: user._id,
                name: user.name,
                subscriptionTier: user.subscriptionTier,
                subscriptionPlan: user.subscriptionPlan,
                isSubscribed: user.isSubscribed,
                subscriptionStatus: user.subscriptionStatus,
                trialEndDate: user.trialEndDate,
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
        console.error('Error updating user profile:', error);

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
        isSandbox,
        trialStartDate,
        trialEndDate,
        periodType,
        managementURL
    } = req.body || {};

    const allowedStatus = ['none', 'active', 'expired', 'canceled', 'billing_issue'];
    const allowedPlans = ['weekly', 'monthly', 'yearly'];

    const normalizedStatus = allowedStatus.includes(status) ? status : 'none';
    const normalizedPlan = allowedPlans.includes(plan) ? plan : null;
    const dateOrNull = (value) => (value ? new Date(value) : null);

    const updates = {
        subscriptionTier: normalizedStatus === 'active' ? 'pro' : 'free',
        isSubscribed: normalizedStatus === 'active',
        subscriptionPlan: normalizedPlan,
        trialEndDate: dateOrNull(trialEndDate),
        subscriptionStatus: normalizedStatus,
        subscriptionProductId: productId || null,
        subscriptionEntitlementId: entitlementId || null,
        subscriptionOriginalAppUserId: originalAppUserId || null,
        subscriptionStore: store || null,
        subscriptionEnvironment: environment || null,
        subscriptionPlatform: platform || null,
        subscriptionLatestPurchaseDate: dateOrNull(latestPurchaseDate),
        subscriptionOriginalPurchaseDate: dateOrNull(originalPurchaseDate),
        subscriptionExpirationDate: dateOrNull(expirationDate),
        subscriptionWillRenew: typeof willRenew === 'boolean' ? willRenew : false,
        subscriptionIsSandbox: typeof isSandbox === 'boolean' ? isSandbox : false,
        subscriptionTrialActive: normalizedStatus === 'active' && (!!trialEndDate ? new Date(trialEndDate) > new Date() : false),
        subscriptionTrialStartDate: dateOrNull(trialStartDate),
        subscriptionTrialEndDate: dateOrNull(trialEndDate),
        subscriptionManagementURL: managementURL || null,
        subscriptionPeriodType: periodType || null,
        lastSyncTime: new Date()
    };

    if (updates.subscriptionTrialEndDate && !updates.trialEndDate) {
        updates.trialEndDate = updates.subscriptionTrialEndDate;
    }

    const user = await User.findByIdAndUpdate(userId, updates, { new: true, runValidators: true });

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
            subscriptionTrialEndDate: user.subscriptionTrialEndDate,
            trialEndDate: user.trialEndDate,
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

    await ensureDailyChallengeForUser(user);

    if (user.dailyChallengeCompleted && !hasCompletionExpired(user)) {
        return res.status(400).json({
            success: false,
            message: 'Challenge already completed. Come back after 24 hours for a new one.'
        });
    }

    const now = new Date();
    const reward = dailyChallenges[user.currentChallengeId]?.xp ?? DEFAULT_CHALLENGE_REWARD;

    const previousCompletion = user.challengeCompletedAt ? new Date(user.challengeCompletedAt) : null;
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    const isConsecutiveDay = previousCompletion && previousCompletion.toDateString() === yesterday.toDateString();
    const challengeStreak = isConsecutiveDay ? user.challengeStreak + 1 : 1;

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
    console.log(`User ${userId} completed daily drill with score: ${score}`);

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
    console.log(`Setting daily confidence message for user ${userId}:`, message);

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
        console.error('Error fetching all users:', error);
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
        console.error('Error toggling user status:', error);
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
        console.error('Error deleting user:', error);
        if (error.status) {
            throw error;
        }
        throw new ExpressError('Failed to delete user', 500);
    }
};

module.exports = {
    registerUser,
    generateUserToken,
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
