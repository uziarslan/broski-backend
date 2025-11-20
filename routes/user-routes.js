const express = require('express');
const router = express.Router();
const wrapAsync = require('../utils/wrapAsync');
const { authenticateUser, authenticateToken, requireAdmin, requireValidSubscription } = require('../middleware/auth');
const { generalRateLimit, registrationRateLimit } = require('../middleware/rateLimiting');
const {
    registerUser,
    generateUserToken,
    generateUserTokenFromRevenueCat,
    registerRevenueCatAlias,
    getUserProfile,
    updateUserProfile,
    checkUsageLimit,
    incrementUsage,
    syncSubscriptionFromClient,
    completeDailyChallenge,
    completeDailyDrill,
    setDailyConfidence,
    getAllUsers,
    toggleUserStatus,
    deleteUser,
    getSavedChatReplies,
    addSavedChatReply,
    deleteSavedChatReply
} = require('../controllers/user-controller');

// ============ USER MANAGEMENT ROUTES ============

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

// Check usage limits (requires authentication)
router.post('/usage/check', authenticateUser, generalRateLimit, wrapAsync(checkUsageLimit));

// Increment usage count (requires authentication)
router.post('/usage/increment', authenticateUser, generalRateLimit, wrapAsync(incrementUsage));

// Sync subscription data coming from the device (requires authentication)
router.post('/subscription/sync', authenticateUser, generalRateLimit, wrapAsync(syncSubscriptionFromClient));

// Saved chat replies (requires authentication)
router.get('/chat-replies', authenticateUser, generalRateLimit, wrapAsync(getSavedChatReplies));
router.post('/chat-replies', authenticateUser, generalRateLimit, wrapAsync(addSavedChatReply));
router.delete('/chat-replies/:replyId', authenticateUser, generalRateLimit, wrapAsync(deleteSavedChatReply));

// Complete daily challenge (requires authentication)
router.post('/challenge/complete', authenticateUser, generalRateLimit, wrapAsync(completeDailyChallenge));

// Complete daily drill (requires authentication)
router.post('/drill/complete', authenticateUser, requireValidSubscription, generalRateLimit, wrapAsync(completeDailyDrill));

// Set daily confidence message (requires authentication)
router.post('/confidence/set', authenticateUser, requireValidSubscription, generalRateLimit, wrapAsync(setDailyConfidence));

// Get all users (Admin only)
router.get('/all', authenticateToken, requireAdmin, generalRateLimit, wrapAsync(getAllUsers));

// Toggle user status (Admin only)
router.put('/:userId/toggle-status', authenticateToken, requireAdmin, generalRateLimit, wrapAsync(toggleUserStatus));

// Delete user (Admin only)
router.delete('/:userId', authenticateToken, requireAdmin, generalRateLimit, wrapAsync(deleteUser));

module.exports = router;
