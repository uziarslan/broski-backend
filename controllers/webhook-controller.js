/**
 * RevenueCat Webhook Handler - Enterprise (queue) or Sync fallback.
 * Fast-ack when queue enabled; sync processing when queue disabled/unavailable.
 */
const config = require('../config');
const User = require('../models/User');
const SubscriptionEvent = require('../models/SubscriptionEvent');
const ExpressError = require('../utils/ExpressError');
const { logWebhook } = require('../utils/webhookLogger');
const { resolveUser, buildUpdatesFromEvent } = require('./webhook-controller-internal');

let webhookQueue = null;
function getWebhookQueue() {
    if (!webhookQueue && config.USE_WEBHOOK_QUEUE) {
        try {
            webhookQueue = require('../services/webhookQueue');
        } catch (e) {
            webhookQueue = null;
        }
    }
    return webhookQueue;
}

async function insertEventIdAtomic(eventId, eventType, appUserId) {
    try {
        await SubscriptionEvent.create({
            eventId,
            eventType,
            appUserId,
            status: 'processing',
        });
        return true;
    } catch (err) {
        if (err.code === 11000) return false;
        throw err;
    }
}

async function handleRevenueCatWebhook(req, res) {
    const start = Date.now();
    // RevenueCat sends { api_version, event: { id, type, ... } } - extract nested event
    const body = req.body;
    const event = body?.event && typeof body.event === 'object' ? body.event : body;

    if (!event || typeof event !== 'object' || !event.id || !event.type) {
        logWebhook('error', { eventId: event?.id, eventType: event?.type, success: false, durationMs: Date.now() - start, error: 'Invalid payload' });
        throw new ExpressError('Invalid webhook payload', 400);
    }

    const eventId = String(event.id);
    const eventType = String(event.type);
    const appUserId = event?.app_user_id ?? (event?.transferred_to && event.transferred_to[0]) ?? 'unknown';

    const queue = getWebhookQueue();
    const useQueue = queue && config.USE_WEBHOOK_QUEUE;

    if (useQueue) {
        try {
            const existing = await SubscriptionEvent.findOne({ eventId }).lean();
            if (existing?.status === 'completed') {
                logWebhook('info', { eventId, eventType, appUserId, success: true, durationMs: Date.now() - start, outcome: 'duplicate' });
                return res.status(200).json({ received: true, duplicate: true });
            }

            await queue.addWebhookJob(eventId, eventType, appUserId, event, 'v1');
            logWebhook('info', { eventId, eventType, appUserId, success: true, durationMs: Date.now() - start, outcome: 'queued' });
            return res.status(200).json({ received: true, queued: true });
        } catch (err) {
            if (err.code === 'QUEUE_FULL') {
                logWebhook('error', { eventId, eventType, appUserId, success: false, durationMs: Date.now() - start, error: 'Queue full' });
                throw new ExpressError('Service temporarily unavailable', 503);
            }
            logWebhook('error', { eventId, eventType, appUserId, success: false, durationMs: Date.now() - start, error: err.message });
            throw err;
        }
    }

    return handleSync(req, res, start, event, eventId, eventType, appUserId);
}

async function handleSync(req, res, start, event, eventId, eventType, appUserId) {
    let inserted = false;
    try {
        inserted = await insertEventIdAtomic(eventId, eventType, appUserId);
        if (!inserted) {
            const existing = await SubscriptionEvent.findOne({ eventId }).lean();
            if (existing?.status === 'completed') {
                logWebhook('info', { eventId, eventType, appUserId, success: true, durationMs: Date.now() - start });
                return res.status(200).json({ received: true, duplicate: true });
            }
        }

        if (eventType === 'TEST') {
            await SubscriptionEvent.updateOne({ eventId }, { $set: { status: 'completed', processedAt: new Date() } });
            logWebhook('info', { eventId, eventType, appUserId, success: true, durationMs: Date.now() - start });
            return res.status(200).json({ received: true });
        }

        const user = await resolveUser(event);
        if (!user) {
            const PendingWebhookEvent = require('../models/PendingWebhookEvent');
            try {
                await PendingWebhookEvent.create({
                    eventId,
                    eventType,
                    appUserId,
                    payload: event,
                    retryCount: 0,
                    status: 'pending',
                });
            } catch (e) {
                if (e.code === 11000) {
                    return res.status(200).json({ received: true, queued: true });
                }
                throw e;
            }
            await SubscriptionEvent.updateOne({ eventId }, { $set: { status: 'completed', processedAt: new Date() } });
            logWebhook('info', { eventId, eventType, appUserId, queued: true, success: true, durationMs: Date.now() - start });
            return res.status(200).json({ received: true, queued: true });
        }

        const updates = buildUpdatesFromEvent(event);
        if (!updates) {
            await SubscriptionEvent.updateOne({ eventId }, { $set: { status: 'completed', userId: user._id, processedAt: new Date() } });
            logWebhook('info', { eventId, eventType, appUserId, userId: user._id.toString(), success: true, durationMs: Date.now() - start });
            return res.status(200).json({ received: true });
        }

        const aliasesToAdd = [event?.app_user_id, event?.original_app_user_id].filter(Boolean);
        const updateDoc = {
            $set: updates,
            ...(aliasesToAdd.length > 0 && { $addToSet: { revenueCatAliases: { $each: aliasesToAdd } } }),
        };

        await User.findByIdAndUpdate(user._id, updateDoc, { runValidators: true });
        await SubscriptionEvent.updateOne({ eventId }, { $set: { status: 'completed', userId: user._id, processedAt: new Date() } });

        logWebhook('info', {
            eventId,
            eventType,
            appUserId,
            userId: user._id.toString(),
            success: true,
            durationMs: Date.now() - start,
        });
        return res.status(200).json({ received: true, userId: user._id.toString() });
    } catch (err) {
        logWebhook('error', {
            eventId,
            eventType,
            appUserId,
            success: false,
            durationMs: Date.now() - start,
            error: err.message ?? String(err),
        });
        throw err;
    }
}

module.exports = { handleRevenueCatWebhook };
