const express = require('express');
const router = express.Router();
const wrapAsync = require('../utils/wrapAsync');
const { authenticateUser, authenticateToken, requireAdmin } = require('../middleware/auth');
const { generalRateLimit, registrationRateLimit } = require('../middleware/rateLimiting');
const { reconcileSubscriptionFromRevenueCat } = require('../controllers/subscription-reconcile-controller');
const { registerPushToken, deletePushToken } = require('../controllers/push-token-controller');
const { pushTokenRateLimit, pushTokenDeleteRateLimit } = require('../middleware/rateLimiting');
const {
    registerAnonymous,
    registerUser,
    generateUserToken,
    generateUserTokenFromRevenueCat,
    registerRevenueCatAlias,
    getUserProfile,
    updateUserProfile,
    checkUsageLimit,
    incrementUsage,
    completeDailyChallenge,
    completeDailyDrill,
    setDailyConfidence,
    getAllUsers,
    toggleUserStatus,
    deleteUser,
    deleteOwnAccount,
    getSavedChatReplies,
    addSavedChatReply,
    deleteSavedChatReply,
    findUserBySubscriptionMetadata
} = require('../controllers/user-controller');

// ============ USER MANAGEMENT ROUTES ============

// Anonymous registration (no onboarding - Get Started Free)
router.post('/register/anon', registrationRateLimit, wrapAsync(registerAnonymous));

// User registration (rate limited)
router.post('/register', registrationRateLimit, wrapAsync(registerUser));

// Generate token for existing user (no auth required - for users who registered before token system)
router.post('/generate-token', generalRateLimit, wrapAsync(generateUserToken));
router.post('/generate-token/revenuecat', generalRateLimit, wrapAsync(generateUserTokenFromRevenueCat));
router.post('/revenuecat/alias', authenticateUser, generalRateLimit, wrapAsync(registerRevenueCatAlias));

// Get user profile (requires authentication)
router.get('/profile/:userId', authenticateUser, generalRateLimit, wrapAsync(getUserProfile));

// Update user profile (requires authentication)
router.put('/profile/:userId', authenticateUser, generalRateLimit, wrapAsync(updateUserProfile));

// Delete own account (requires authentication)
router.delete('/profile/me', authenticateUser, generalRateLimit, wrapAsync(deleteOwnAccount));

// Check usage limits (requires authentication)
router.post('/usage/check', authenticateUser, generalRateLimit, wrapAsync(checkUsageLimit));

// Increment usage count (requires authentication)
router.post('/usage/increment', authenticateUser, generalRateLimit, wrapAsync(incrementUsage));

// Saved chat replies (requires authentication)
router.get('/chat-replies', authenticateUser, generalRateLimit, wrapAsync(getSavedChatReplies));
router.post('/chat-replies', authenticateUser, generalRateLimit, wrapAsync(addSavedChatReply));
router.delete('/chat-replies/:replyId', authenticateUser, generalRateLimit, wrapAsync(deleteSavedChatReply));

// Push token (requires authentication, rate limited)
router.post('/push-token', authenticateUser, pushTokenRateLimit, wrapAsync(registerPushToken));
router.delete('/push-token', authenticateUser, pushTokenDeleteRateLimit, wrapAsync(deletePushToken));

// Complete daily challenge (requires authentication)
router.post('/challenge/complete', authenticateUser, generalRateLimit, wrapAsync(completeDailyChallenge));

// Subscription lookup for StoreKit restore (no auth required)
router.post('/subscription/lookup', generalRateLimit, wrapAsync(findUserBySubscriptionMetadata));

// Complete daily drill (free, no subscription required)
router.post('/drill/complete', authenticateUser, generalRateLimit, wrapAsync(completeDailyDrill));

// Set daily confidence message (free, no subscription required)
router.post('/confidence/set', authenticateUser, generalRateLimit, wrapAsync(setDailyConfidence));

// Get all users (Admin only)
router.get('/all', authenticateToken, requireAdmin, generalRateLimit, wrapAsync(getAllUsers));

// Reconcile subscription from RevenueCat (Admin only)
router.post('/subscription/reconcile/:userId', authenticateToken, requireAdmin, generalRateLimit, wrapAsync(reconcileSubscriptionFromRevenueCat));

// Toggle user status (Admin only)
router.put('/:userId/toggle-status', authenticateToken, requireAdmin, generalRateLimit, wrapAsync(toggleUserStatus));

// Delete user (Admin only)
router.delete('/:userId', authenticateToken, requireAdmin, generalRateLimit, wrapAsync(deleteUser));

module.exports = router;
