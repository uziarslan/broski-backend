const revenueCatService = require('../services/revenueCatService');
const User = require('../models/User');
const ExpressError = require('../utils/ExpressError');
const config = require('../config');

/**
 * Handle RevenueCat webhook events
 * This endpoint receives events from RevenueCat when subscriptions change
 */
const handleWebhook = async (req, res) => {
    try {
        const webhookData = req.body;

        // Verify webhook signature if configured
        const signature = req.headers['authorization'] || req.headers['x-revenuecat-signature'];
        if (config.REVENUECAT_WEBHOOK_SECRET && signature) {
            const isValid = revenueCatService.verifyWebhookSignature(
                JSON.stringify(webhookData),
                signature
            );
            if (!isValid) {
                throw new ExpressError('Invalid webhook signature', 401);
            }
        }

        // Process webhook data
        const processedEvent = revenueCatService.processWebhook(webhookData);

        // Get app user ID from webhook
        const appUserId = processedEvent.appUserId || processedEvent.originalAppUserId;
        
        if (!appUserId) {
            console.warn('Webhook received without app user ID');
            return res.status(200).json({ received: true });
        }

        // Find user by ID (assuming your appUserId matches MongoDB _id or you have a mapping)
        const user = await User.findById(appUserId);
        
        if (!user) {
            console.warn(`User not found for RevenueCat webhook: ${appUserId}`);
            return res.status(200).json({ received: true, message: 'User not found' });
        }

        // Update user subscription status based on webhook event
        const updates = {
            subscriptionTier: processedEvent.isActive ? 'pro' : 'free',
            subscriptionPlan: processedEvent.planType,
            isSubscribed: processedEvent.isActive,
            lastSyncTime: new Date()
        };

        if (processedEvent.expiresDate) {
            updates.trialEndDate = new Date(processedEvent.expiresDate);
        }

        await User.findByIdAndUpdate(appUserId, updates, { new: true });

        console.log(`Updated user ${appUserId} subscription from webhook:`, {
            type: processedEvent.type,
            subscriptionTier: updates.subscriptionTier,
            plan: updates.subscriptionPlan,
            isActive: updates.isSubscribed
        });

        // Return 200 OK to acknowledge receipt
        res.status(200).json({ 
            received: true, 
            processed: true,
            userId: appUserId,
            eventType: processedEvent.type
        });

    } catch (error) {
        console.error('Error processing RevenueCat webhook:', error);
        
        // Still return 200 to prevent RevenueCat from retrying
        // Log the error for debugging
        res.status(200).json({ 
            received: true, 
            error: error.message 
        });
    }
};

/**
 * Validate subscription status for a user
 * Called by the frontend to check subscription
 */
const validateSubscription = async (req, res) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            throw new ExpressError('User ID is required', 400);
        }

        // Check RevenueCat for subscription status
        const subscriptionStatus = await revenueCatService.checkSubscriptionStatus(userId);

        // Update local database with latest status
        const updates = {
            subscriptionTier: subscriptionStatus.isActive ? 'pro' : 'free',
            subscriptionPlan: subscriptionStatus.planType,
            isSubscribed: subscriptionStatus.isActive,
            lastSyncTime: new Date()
        };

        if (subscriptionStatus.expiresDate) {
            updates.trialEndDate = new Date(subscriptionStatus.expiresDate);
        }

        await User.findByIdAndUpdate(userId, updates, { new: true });

        res.json({
            success: true,
            data: {
                isActive: subscriptionStatus.isActive,
                subscriptionTier: updates.subscriptionTier,
                plan: updates.subscriptionPlan,
                expiresDate: subscriptionStatus.expiresDate
            }
        });

    } catch (error) {
        console.error('Error validating subscription:', error);
        
        if (error.status) {
            throw error;
        }
        
        throw new ExpressError('Failed to validate subscription', 500);
    }
};

/**
 * Sync subscription from RevenueCat
 * Manual sync endpoint
 */
const syncSubscription = async (req, res) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            throw new ExpressError('User ID is required', 400);
        }

        const subscriptionStatus = await revenueCatService.checkSubscriptionStatus(userId);

        const updates = {
            subscriptionTier: subscriptionStatus.isActive ? 'pro' : 'free',
            subscriptionPlan: subscriptionStatus.planType,
            isSubscribed: subscriptionStatus.isActive,
            lastSyncTime: new Date()
        };

        if (subscriptionStatus.expiresDate) {
            updates.trialEndDate = new Date(subscriptionStatus.expiresDate);
        }

        const user = await User.findByIdAndUpdate(userId, updates, { new: true });

        if (!user) {
            throw new ExpressError('User not found', 404);
        }

        res.json({
            success: true,
            message: 'Subscription synced successfully',
            data: {
                subscriptionTier: user.subscriptionTier,
                subscriptionPlan: user.subscriptionPlan,
                isSubscribed: user.isSubscribed,
                trialEndDate: user.trialEndDate
            }
        });

    } catch (error) {
        console.error('Error syncing subscription:', error);
        
        if (error.status) {
            throw error;
        }
        
        throw new ExpressError('Failed to sync subscription', 500);
    }
};

module.exports = {
    handleWebhook,
    validateSubscription,
    syncSubscription
};

