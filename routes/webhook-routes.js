const express = require('express');
const router = express.Router();
const wrapAsync = require('../utils/wrapAsync');
const { verifyRevenueCatWebhook } = require('../middleware/webhookAuth');
const { handleRevenueCatWebhook } = require('../controllers/webhook-controller');

// RevenueCat webhook - no auth middleware for non-webhook routes
router.post('/revenuecat', verifyRevenueCatWebhook, wrapAsync(handleRevenueCatWebhook));

module.exports = router;
