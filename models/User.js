const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    subscriptionTier: {
        type: String,
        enum: ['free', 'pro', 'elite'],
        default: 'free'
    },
    subscriptionPlan: {
        type: String,
        enum: ['weekly', 'monthly', 'yearly', null],
        default: null
    },
    isSubscribed: {
        type: Boolean,
        default: false
    },
    subscriptionStatus: {
        type: String,
        enum: ['none', 'active', 'expired', 'canceled', 'billing_issue'],
        default: 'none'
    },
    subscriptionProductId: {
        type: String,
        default: null
    },
    subscriptionEntitlementId: {
        type: String,
        default: null
    },
    subscriptionOriginalAppUserId: {
        type: String,
        default: null
    },
    subscriptionStore: {
        type: String,
        enum: ['app_store', 'play_store', 'stripe', null],
        default: null
    },
    subscriptionEnvironment: {
        type: String,
        enum: ['sandbox', 'production', null],
        default: null
    },
    subscriptionPlatform: {
        type: String,
        enum: ['ios', 'android', null],
        default: null
    },
    subscriptionLatestPurchaseDate: {
        type: Date,
        default: null
    },
    subscriptionOriginalPurchaseDate: {
        type: Date,
        default: null
    },
    subscriptionExpirationDate: {
        type: Date,
        default: null
    },
    subscriptionWillRenew: {
        type: Boolean,
        default: false
    },
    revenueCatAliases: {
        type: [String],
        default: []
    },
    // Onboarding data
    userGoal: {
        type: String,
        required: true,
        default: ''
    },
    userChallenge: {
        type: String,
        required: true,
        default: ''
    },
    userPersonality: {
        type: String,
        default: ''
    },
    // App usage data
    dailyAnalysisCount: {
        type: Number,
        default: 0
    },
    rizzLevel: {
        type: Number,
        default: 1
    },
    totalScore: {
        type: Number,
        default: 0
    },
    lastDrillDate: {
        type: Date
    },
    dailyConfidenceMessage: {
        type: String
    },
    lastConfidenceDate: {
        type: Date
    },
    // Wing It System
    dailyWingItCount: {
        type: Number,
        default: 0
    },
    dailyWingItLimit: {
        type: Number,
        default: 3
    },
    lastWingItResetDate: {
        type: String,
        default: () => new Date().toDateString()
    },
    // Daily Challenges
    totalXP: {
        type: Number,
        default: 0
    },
    challengeLevel: {
        type: Number,
        default: 1
    },
    challengeLevelName: {
        type: String,
        default: "Rookie"
    },
    dailyChallengeCompleted: {
        type: Boolean,
        default: false
    },
    lastChallengeDate: {
        type: String,
        default: ""
    },
    currentChallengeId: {
        type: Number,
        default: 0
    },
    challengeAssignedAt: {
        type: Date,
        default: () => new Date()
    },
    challengeCompletedAt: {
        type: Date,
        default: null
    },
    challengeStreak: {
        type: Number,
        default: 0
    },
    // Rizz Drills
    rizzLevelName: {
        type: String,
        default: "Rookie"
    },
    dailyDrillCompleted: {
        type: Boolean,
        default: false
    },
    savedChatReplies: {
        type: [
            {
                id: {
                    type: String,
                    required: true
                },
                text: {
                    type: String,
                    required: true
                },
                tone: {
                    type: String,
                    default: ''
                },
                source: {
                    type: String,
                    enum: ['chat_coach', 'awkward_situations'],
                    default: 'chat_coach'
                },
                savedAt: {
                    type: Date,
                    default: () => new Date()
                }
            }
        ],
        default: []
    },
    // Backend sync
    lastSyncTime: {
        type: Date
    },
    // Account status
    isActive: {
        type: Boolean,
        default: true
    },
    lastLogin: {
        type: Date
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('User', userSchema);
