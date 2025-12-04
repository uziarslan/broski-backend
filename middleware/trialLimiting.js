const User = require('../models/User');
const ExpressError = require('../utils/ExpressError');

const checkTrialRequestLimit = async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            throw new ExpressError('User authentication required', 401);
        }

        const user = await User.findById(userId);
        if (!user) {
            throw new ExpressError('User not found', 404);
        }

        // Check if user is in trial period
        if (!user.isInTrialPeriod) {
            // Not in trial, allow request without limiting
            return next();
        }

        // Check if we need to reset the daily count
        const today = new Date().toDateString();
        if (user.lastTrialRequestResetDate !== today) {
            user.trialRequestCount = 0;
            user.lastTrialRequestResetDate = today;
            await user.save();
        }

        const DAILY_LIMIT = 40;

        // Check if user has exceeded limit
        if (user.trialRequestCount >= DAILY_LIMIT) {
            return res.status(403).json({
                success: false,
                error: 'Trial request limit exceeded',
                message: `You have reached your daily limit of ${DAILY_LIMIT} requests. Upgrade to continue using Broski unlimited.`,
                trialRequestCount: user.trialRequestCount,
                limit: DAILY_LIMIT
            });
        }

        // Increment the count
        user.trialRequestCount += 1;
        await user.save();

        // Add trial info to request for controllers to include in response
        req.trialInfo = {
            count: user.trialRequestCount,
            limit: DAILY_LIMIT,
            remaining: Math.max(DAILY_LIMIT - user.trialRequestCount, 0)
        };

        next();
    } catch (error) {
        next(error);
    }
};

module.exports = { checkTrialRequestLimit };

