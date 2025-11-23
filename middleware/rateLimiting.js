const rateLimit = require('express-rate-limit');
const ExpressError = require('../utils/ExpressError');

// Rate limiting for AI endpoints (more restrictive)
const aiRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: (req) => {
        // Different limits based on subscription tier
        if (req.user && req.user.type === 'user') {
            switch (req.user.subscriptionTier) {
                case 'free': return 10; // 10 requests per 15 minutes for free users
                case 'pro': return 100; // 100 requests per 15 minutes for pro users
                case 'gold': return 500; // 500 requests per 15 minutes for gold users
                default: return 5; // Very restrictive for unknown tiers
            }
        }
        // Default limit for unauthenticated requests
        return 5;
    },
    message: {
        success: false,
        error: 'Too many AI requests. Please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // Skip rate limiting for admin users
        return req.user && req.user.type === 'admin';
    }
});

// Rate limiting for general API endpoints
const generalRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: (req) => {
        // In development, be much more lenient
        if (process.env.NODE_ENV !== 'production') {
            return 1000; // 1000 requests per 15 minutes in development
        }
        
        if (req.user && req.user.type === 'user') {
            switch (req.user.subscriptionTier) {
                case 'free': return 50; // 50 requests per 15 minutes for free users
                case 'pro': return 200; // 200 requests per 15 minutes for pro users
                case 'gold': return 1000; // 1000 requests per 15 minutes for gold users
                default: return 20; // Default for unknown tiers
            }
        }
        // Default limit for unauthenticated requests
        return 30;
    },
    message: {
        success: false,
        error: 'Too many requests. Please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // Skip rate limiting for admin users
        if (req.user && req.user.type === 'admin') {
            return true;
        }
        // In development, skip rate limiting for localhost
        if (process.env.NODE_ENV !== 'production') {
            const ip = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for']?.split(',')[0];
            if (ip) {
                if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') return true;
                if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.match(/^172\.(1[6-9]|2[0-9]|3[01])\./)) return true;
            }
        }
        return false;
    }
});

// Rate limiting for authentication endpoints
const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 login attempts per 15 minutes
    message: {
        success: false,
        error: 'Too many authentication attempts. Please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Don't count successful requests
});

// Rate limiting for user registration
const registrationRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'production' ? 5 : 100, // 5 per 15 min in production, 100 in development/testing
    message: {
        success: false,
        error: 'Too many registration attempts. Please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // In development, skip rate limiting for localhost and local network IPs
        if (process.env.NODE_ENV !== 'production') {
            const ip = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for']?.split(',')[0];
            // Skip for localhost and local network IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
            if (ip) {
                if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') return true;
                if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.match(/^172\.(1[6-9]|2[0-9]|3[01])\./)) return true;
            }
        }
        return false;
    }
});

// Rate limiting for file uploads
const uploadRateLimit = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: (req) => {
        if (req.user && req.user.type === 'user') {
            switch (req.user.subscriptionTier) {
                case 'free': return 5; // 5 uploads per hour for free users
                case 'pro': return 20; // 20 uploads per hour for pro users
                case 'gold': return 100; // 100 uploads per hour for gold users
                default: return 2; // Very restrictive for unknown tiers
            }
        }
        return 2; // Default for unauthenticated requests
    },
    message: {
        success: false,
        error: 'Too many file uploads. Please try again later.',
        retryAfter: '1 hour'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // Skip rate limiting for admin users
        return req.user && req.user.type === 'admin';
    }
});

module.exports = {
    aiRateLimit,
    generalRateLimit,
    authRateLimit,
    registrationRateLimit,
    uploadRateLimit
};
