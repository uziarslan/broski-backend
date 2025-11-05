const express = require('express');
const router = express.Router();
const wrapAsync = require('../utils/wrapAsync');
const { authenticateUser, authenticateToken, requireAdmin, requireValidSubscription } = require('../middleware/auth');
const { generalRateLimit, authRateLimit, registrationRateLimit } = require('../middleware/rateLimiting');
const {
    registerUser,
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
} = require('../controllers/user-controller');

// ============ USER MANAGEMENT ROUTES ============

// User registration (rate limited)
router.post('/register', registrationRateLimit, wrapAsync(registerUser));

// Get user profile (requires authentication)
router.get('/profile/:userId', authenticateUser, generalRateLimit, wrapAsync(getUserProfile));

// Update user profile (requires authentication)
router.put('/profile/:userId', authenticateUser, generalRateLimit, wrapAsync(updateUserProfile));

// Check usage limits (requires authentication)
router.post('/usage/check', authenticateUser, generalRateLimit, wrapAsync(checkUsageLimit));

// Increment usage count (requires authentication)
router.post('/usage/increment', authenticateUser, generalRateLimit, wrapAsync(incrementUsage));

// Update subscription (admin only)
router.put('/subscription/:userId', authenticateToken, requireAdmin, generalRateLimit, wrapAsync(updateSubscription));

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
