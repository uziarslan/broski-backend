const express = require('express');
const router = express.Router();
const wrapAsync = require('../utils/wrapAsync');
const { authRateLimit } = require('../middleware/rateLimiting');
const {
    adminLogin,
    getCurrentUser,
    adminRegister
} = require('../controllers/auth-controller');

// ============ AUTHENTICATION ROUTES ============

// Admin login (rate limited)
router.post('/user/login', authRateLimit, wrapAsync(adminLogin));

// Admin registration (rate limited)
router.post('/user/signup', authRateLimit, wrapAsync(adminRegister));

// Get current user (no auth needed for token validation)
router.get('/user', wrapAsync(getCurrentUser));

// Google login (placeholder - implement if needed)
router.post('/google-login', (req, res) => {
    res.status(501).json({ message: 'Google login not implemented yet' });
});

module.exports = router;
