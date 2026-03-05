/**
 * RevenueCat webhook authorization verification.
 * RevenueCat sends Authorization: Bearer <secret> (configured in dashboard).
 */
const config = require('../config');
const ExpressError = require('../utils/ExpressError');

const BEARER_PREFIX = 'Bearer ';

function verifyRevenueCatWebhook(req, res, next) {
    const secret = config.REVENUECAT_WEBHOOK_SECRET;
    if (!secret) {
        return next(new ExpressError('Webhook secret not configured', 500));
    }

    const auth = req.headers['authorization'];
    if (!auth || !auth.startsWith(BEARER_PREFIX)) {
        return next(new ExpressError('Missing or invalid webhook authorization', 401));
    }

    const token = auth.slice(BEARER_PREFIX.length).trim();
    if (token !== secret) {
        return next(new ExpressError('Invalid webhook authorization', 401));
    }

    next();
}

module.exports = { verifyRevenueCatWebhook };
