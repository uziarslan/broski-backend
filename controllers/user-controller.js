
const User = require('../models/User');
const ExpressError = require('../utils/ExpressError');
const jwt = require('jsonwebtoken');
const config = require('../config');

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
        challengeStreak: 0,
        rizzLevelName: "Rookie",
        dailyDrillCompleted: false,
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

        const userProfile = {
            id: user._id,
            name: user.name,
            role: user.role,
            subscriptionTier: user.subscriptionTier,
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
            challengeStreak: user.challengeStreak,
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

// Update subscription
const updateSubscription = async (req, res) => {
    const { userId } = req.params;
    const { tier, plan, trialEnd } = req.body;

    // In a real app, you'd update the database and handle payment processing
    console.log(`Updating subscription for user ${userId}:`, { tier, plan, trialEnd });

    res.json({
        success: true,
        message: 'Subscription updated successfully',
        data: {
            userId,
            subscriptionTier: tier,
            plan,
            trialEnd,
            updatedAt: new Date().toISOString()
        }
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
    updateSubscription,
    completeDailyDrill,
    setDailyConfidence,
    getAllUsers,
    toggleUserStatus,
    deleteUser
};
