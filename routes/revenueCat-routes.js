const express = require('express');
const router = express.Router();
const wrapAsync = require('../utils/wrapAsync');
const { authenticateUser } = require('../middleware/auth');
const {
    handleWebhook,
    validateSubscription,
    syncSubscription
} = require('../controllers/revenueCat-controller');

// RevenueCat webhook endpoint (no auth required - uses signature verification)
// RevenueCat will POST to this endpoint
router.post('/webhook', wrapAsync(handleWebhook));

// Validate subscription status (requires authentication)
router.get('/validate/:userId', authenticateUser, wrapAsync(validateSubscription));

// Sync subscription manually (requires authentication)
router.post('/sync/:userId', authenticateUser, wrapAsync(syncSubscription));

module.exports = router;

