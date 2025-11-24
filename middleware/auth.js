const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const User = require('../models/User');
const ExpressError = require('../utils/ExpressError');
const config = require('../config');

// Middleware to verify JWT token and authenticate admin
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            throw new ExpressError('Access token required', 401);
        }

        // Verify the token
        const decoded = jwt.verify(token, config.JWT_SECRET);

        // Find the admin in the database
        const admin = await Admin.findById(decoded.userId).select('-password');
        if (!admin) {
            throw new ExpressError('Invalid token - admin not found', 401);
        }

        // Add user info to request object
        req.user = {
            userId: admin._id,
            email: admin.email,
            name: admin.name,
            role: admin.role,
            type: 'admin'
        };

        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            throw new ExpressError('Invalid token', 401);
        } else if (error.name === 'TokenExpiredError') {
            throw new ExpressError('Token expired', 401);
        }
        next(error);
    }
};

// Middleware to check if user is admin (optional - for admin-only routes)
const requireAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        throw new ExpressError('Admin access required', 403);
    }
    next();
};

// Middleware to authenticate application users (not admins)
const authenticateUser = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            throw new ExpressError('Access token required', 401);
        }

        // Verify the token
        const decoded = jwt.verify(token, config.JWT_SECRET);

        // Find the user in the database
        const user = await User.findById(decoded.userId).select('-password');
        if (!user) {
            throw new ExpressError('Invalid token - user not found', 401);
        }

        // Add user info to request object
        req.user = {
            userId: user._id,
            email: user.email,
            name: user.name,
            subscriptionTier: user.subscriptionTier,
            isActive: user.isActive !== false,
            type: 'user'
        };

        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            throw new ExpressError('Invalid token', 401);
        } else if (error.name === 'TokenExpiredError') {
            throw new ExpressError('Token expired', 401);
        }
        next(error);
    }
};

// Middleware to authenticate either admin or user
const authenticateAny = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            throw new ExpressError('Access token required', 401);
        }

        // Verify the token
        const decoded = jwt.verify(token, config.JWT_SECRET);

        // Try to find as admin first
        let admin = await Admin.findById(decoded.userId).select('-password');
        if (admin) {
            req.user = {
                userId: admin._id,
                email: admin.email,
                name: admin.name,
                role: admin.role,
                type: 'admin'
            };
            return next();
        }

        // Try to find as user
        let user = await User.findById(decoded.userId).select('-password');
        if (user) {
            req.user = {
                userId: user._id,
                email: user.email,
                name: user.name,
                subscriptionTier: user.subscriptionTier,
                isActive: user.isActive !== false,
                type: 'user'
            };
            return next();
        }

        throw new ExpressError('Invalid token - user not found', 401);
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            throw new ExpressError('Invalid token', 401);
        } else if (error.name === 'TokenExpiredError') {
            throw new ExpressError('Token expired', 401);
        }
        next(error);
    }
};

// Middleware to check if user has valid subscription
const requireValidSubscription = (req, res, next) => {
    if (!req.user || req.user.type !== 'user') {
        throw new ExpressError('User authentication required', 401);
    }

    const validTiers = ['free', 'pro', 'gold'];
    if (!validTiers.includes(req.user.subscriptionTier)) {
        throw new ExpressError('Valid subscription required', 403);
    }

    next();
};

const requireActiveUser = (req, res, next) => {
    if (!req.user || req.user.type !== 'user') {
        throw new ExpressError('User authentication required', 401);
    }

    if (req.user.isActive === false) {
        const error = new ExpressError('Your account is inactive. Please contact support to reactivate.', 403);
        error.code = 'ACCOUNT_INACTIVE';
        throw error;
    }

    next();
};

// Middleware to check if user has premium subscription
const requirePremiumSubscription = (req, res, next) => {
    if (!req.user || req.user.type !== 'user') {
        throw new ExpressError('User authentication required', 401);
    }

    const premiumTiers = ['pro', 'gold'];
    if (!premiumTiers.includes(req.user.subscriptionTier)) {
        throw new ExpressError('Premium subscription required', 403);
    }

    next();
};

module.exports = {
    authenticateToken,
    requireAdmin,
    authenticateUser,
    authenticateAny,
    requireValidSubscription,
    requireActiveUser,
    requirePremiumSubscription
};
