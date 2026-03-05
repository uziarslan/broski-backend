/**
 * Shared logic for webhook processing (used by webhook-controller and worker).
 */
const mongoose = require('mongoose');
const User = require('../models/User');

function normalizeStore(store) {
    if (store == null || store === undefined) return null;
    const s = String(store).toUpperCase();
    if (s.includes('APP_STORE') || s.includes('MAC_APP_STORE')) return 'app_store';
    if (s.includes('PLAY_STORE')) return 'play_store';
    if (s.includes('STRIPE')) return 'stripe';
    return null;
}

function normalizeEnvironment(env) {
    if (env == null || env === undefined) return null;
    return String(env).toUpperCase() === 'SANDBOX' ? 'sandbox' : 'production';
}

function planFromProductId(productId) {
    if (productId == null || productId === undefined) return null;
    const id = String(productId).toLowerCase();
    if (id.includes('weekly')) return 'weekly';
    if (id.includes('monthly')) return 'monthly';
    if (id.includes('yearly') || id.includes('annual')) return 'yearly';
    return null;
}

function platformFromStore(store) {
    const s = normalizeStore(store);
    if (s === 'app_store') return 'ios';
    if (s === 'play_store') return 'android';
    return null;
}

function safeDate(ms) {
    if (ms == null || ms === undefined) return null;
    const n = Number(ms);
    if (!Number.isFinite(n)) return null;
    const d = new Date(n);
    return Number.isNaN(d.getTime()) ? null : d;
}

async function resolveUser(event) {
    const ids = [
        event?.app_user_id,
        event?.original_app_user_id,
        ...(Array.isArray(event?.aliases) ? event.aliases : []),
    ].filter(Boolean);

    for (const id of ids) {
        if (typeof id === 'string' && mongoose.Types.ObjectId.isValid(id) && !id.startsWith('$RC')) {
            const user = await User.findById(id).lean();
            if (user) return user;
        }
    }

    for (const id of ids) {
        if (typeof id !== 'string') continue;
        const user = await User.findOne({
            $or: [
                { subscriptionOriginalAppUserId: id },
                { revenueCatAliases: id },
            ],
        }).lean();
        if (user) return user;
    }

    const mongoId = event?.subscriber_attributes?.mongo_user_id?.value;
    if (typeof mongoId === 'string' && mongoose.Types.ObjectId.isValid(mongoId)) {
        const user = await User.findById(mongoId).lean();
        if (user) return user;
    }

    return null;
}

function buildUpdatesFromEvent(event) {
    const type = event?.type;
    const expirationAt = safeDate(event?.expiration_at_ms);
    const purchasedAt = safeDate(event?.purchased_at_ms);
    const now = new Date();
    const isActive = expirationAt != null && expirationAt > now;
    const periodType = event?.period_type ?? null;
    const originalAppUserId = event?.original_app_user_id ?? event?.app_user_id ?? null;

    const base = {
        subscriptionProductId: event?.product_id ?? null,
        subscriptionEntitlementId: (event?.entitlement_ids ?? (event?.entitlement_id ? [event.entitlement_id] : []))[0] ?? null,
        subscriptionStore: normalizeStore(event?.store),
        subscriptionEnvironment: normalizeEnvironment(event?.environment),
        subscriptionPlatform: platformFromStore(event?.store),
        subscriptionLatestPurchaseDate: purchasedAt,
        subscriptionOriginalPurchaseDate: purchasedAt,
        subscriptionExpirationDate: expirationAt,
        subscriptionPlan: planFromProductId(event?.product_id),
        lastWebhookEventAt: now,
        lastWebhookEventType: type ?? null,
        lastWebhookEventId: event?.id ?? null,
    };

    switch (type) {
        case 'INITIAL_PURCHASE':
        case 'RENEWAL':
        case 'UNCANCELLATION':
        case 'PRODUCT_CHANGE':
        case 'SUBSCRIPTION_EXTENDED':
        case 'TEMPORARY_ENTITLEMENT_GRANT':
            return { ...base, subscriptionStatus: isActive ? 'active' : 'expired', isSubscribed: isActive, subscriptionTier: isActive ? 'pro' : 'free', subscriptionWillRenew: periodType !== 'TRIAL', isInTrialPeriod: periodType === 'TRIAL', subscriptionOriginalAppUserId: originalAppUserId };
        case 'CANCELLATION':
            return { ...base, subscriptionWillRenew: false, subscriptionStatus: isActive ? 'active' : 'expired', isSubscribed: isActive, subscriptionTier: isActive ? 'pro' : 'free', subscriptionOriginalAppUserId: originalAppUserId };
        case 'EXPIRATION':
            return { ...base, subscriptionStatus: 'expired', isSubscribed: false, subscriptionTier: 'free', subscriptionWillRenew: false, subscriptionOriginalAppUserId: originalAppUserId };
        case 'BILLING_ISSUE':
            return { ...base, subscriptionStatus: 'billing_issue', subscriptionWillRenew: false, subscriptionOriginalAppUserId: originalAppUserId, isSubscribed: expirationAt != null && expirationAt > now, subscriptionTier: expirationAt != null && expirationAt > now ? 'pro' : 'free' };
        case 'TRANSFER': {
            const toId = (event?.transferred_to && event.transferred_to[0]) ?? event?.app_user_id ?? null;
            return { ...base, subscriptionOriginalAppUserId: toId, subscriptionStatus: isActive ? 'active' : 'expired', isSubscribed: isActive, subscriptionTier: isActive ? 'pro' : 'free' };
        }
        case 'TEST':
            return null;
        default:
            return { ...base, subscriptionOriginalAppUserId: originalAppUserId };
    }
}

module.exports = { resolveUser, buildUpdatesFromEvent };
