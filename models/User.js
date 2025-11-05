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
        enum: ['weekly', 'monthly', 'yearly'],
        default: null
    },
    trialEndDate: {
        type: Date,
        default: null
    },
    isSubscribed: {
        type: Boolean,
        default: false
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
