/**
 * Admin-only: Reconcile user subscription from RevenueCat API.
 * For manual repair when webhook may have been missed.
 */
const mongoose = require('mongoose');
const axios = require('axios');
const User = require('../models/User');
const ExpressError = require('../utils/ExpressError');
const config = require('../config');
const { getEffectiveSubscription } = require('../utils/subscriptionUtils');

function planFromProductId(productId) {
    if (!productId) return null;
    const id = String(productId).toLowerCase();
    if (id.includes('weekly')) return 'weekly';
    if (id.includes('monthly')) return 'monthly';
    if (id.includes('yearly') || id.includes('annual')) return 'yearly';
    return null;
}

function normalizeStore(store) {
    if (!store) return null;
    const s = String(store).toUpperCase();
    if (s.includes('APP_STORE') || s.includes('MAC')) return 'app_store';
    if (s.includes('PLAY')) return 'play_store';
    if (s.includes('STRIPE')) return 'stripe';
    return null;
}

async function reconcileSubscriptionFromRevenueCat(req, res) {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw new ExpressError('Invalid user ID', 400);
    }

    const user = await User.findById(userId).lean();
    if (!user) {
        throw new ExpressError('User not found', 404);
    }

    const rcIds = [
        user.subscriptionOriginalAppUserId,
        user._id.toString(),
        ...(user.revenueCatAliases || []),
    ].filter(Boolean);

    if (!config.REVENUECAT_API_KEY) {
        throw new ExpressError('RevenueCat API key not configured', 500);
    }

    let subscriber = null;
    let lastError = null;

    for (const rcId of rcIds) {
        try {
            const response = await axios.get(
                `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(rcId)}`,
                {
                    headers: { Authorization: `Bearer ${config.REVENUECAT_API_KEY}` },
                    timeout: 10000,
                }
            );
            subscriber = response.data?.subscriber;
            if (subscriber) break;
        } catch (err) {
            lastError = err;
            if (err?.response?.status === 404) continue;
        }
    }

    if (!subscriber) {
        throw new ExpressError(
            lastError?.response?.data?.message || 'Subscriber not found in RevenueCat',
            404
        );
    }

    const entitlements = subscriber.entitlements || {};
    const proEnt = entitlements.pro || entitlements.Pro || Object.values(entitlements)[0];

    const now = new Date();
    let updates = {
        subscriptionStatus: 'none',
        isSubscribed: false,
        subscriptionTier: 'free',
        subscriptionProductId: null,
        subscriptionEntitlementId: null,
        subscriptionStore: null,
        subscriptionEnvironment: null,
        subscriptionPlatform: null,
        subscriptionLatestPurchaseDate: null,
        subscriptionOriginalPurchaseDate: null,
        subscriptionExpirationDate: null,
        subscriptionPlan: null,
        subscriptionWillRenew: false,
        isInTrialPeriod: false,
        lastWebhookEventAt: now,
        lastWebhookEventType: 'RECONCILE',
        lastWebhookEventId: null,
    };

    if (proEnt) {
        const purchaseDate = proEnt.purchase_date ? new Date(proEnt.purchase_date) : null;
        const expDate = proEnt.expires_date ? new Date(proEnt.expires_date) : null;
        const isActive = expDate && !Number.isNaN(expDate.getTime()) && expDate > now;
        const storeKey = Object.keys(subscriber.subscriptions || {})[0] || '';

        updates = {
            ...updates,
            subscriptionProductId: proEnt.product_identifier ?? null,
            subscriptionEntitlementId: Object.keys(entitlements).find(k => entitlements[k] === proEnt) ?? null,
            subscriptionStore: normalizeStore(proEnt.store ?? storeKey),
            subscriptionEnvironment: (proEnt.store ?? storeKey).toString().toLowerCase().includes('sandbox') ? 'sandbox' : 'production',
            subscriptionPlatform: (proEnt.store ?? storeKey).toString().toLowerCase().includes('app') ? 'ios' : 'android',
            subscriptionLatestPurchaseDate: purchaseDate,
            subscriptionOriginalPurchaseDate: purchaseDate,
            subscriptionExpirationDate: expDate,
            subscriptionPlan: planFromProductId(proEnt.product_identifier),
            subscriptionStatus: isActive ? 'active' : 'expired',
            isSubscribed: isActive,
            subscriptionTier: isActive ? 'pro' : 'free',
            subscriptionWillRenew: !proEnt.unsubscribe_detected_at,
            isInTrialPeriod: (proEnt.period_type || '').toUpperCase() === 'TRIAL',
        };
    }

    const aliasesToAdd = [
        subscriber.original_app_user_id,
        ...(subscriber.aliases || []),
    ].filter(Boolean);

    const updateDoc = {
        $set: updates,
        ...(aliasesToAdd.length > 0 && { $addToSet: { revenueCatAliases: { $each: aliasesToAdd } } }),
    };

    const updated = await User.findByIdAndUpdate(userId, updateDoc, { new: true, runValidators: true });
    const effective = getEffectiveSubscription(updated);

    res.json({
        success: true,
        message: 'Subscription reconciled from RevenueCat',
        data: {
            subscriptionTier: effective.subscriptionTier,
            subscriptionStatus: effective.subscriptionStatus,
            isSubscribed: effective.isSubscribed,
            subscriptionPlan: updated.subscriptionPlan,
            subscriptionExpirationDate: updated.subscriptionExpirationDate,
        },
    });
}

module.exports = { reconcileSubscriptionFromRevenueCat };
