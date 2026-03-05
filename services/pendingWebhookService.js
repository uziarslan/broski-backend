/**
 * Processes pending webhook events when user becomes linkable (alias registration).
 */
const User = require('../models/User');
const SubscriptionEvent = require('../models/SubscriptionEvent');
const PendingWebhookEvent = require('../models/PendingWebhookEvent');
const { addRetryJob } = require('./webhookQueue');
const { resolveUser, buildUpdatesFromEvent } = require('../controllers/webhook-controller-internal');
const { logWebhook } = require('../utils/webhookLogger');

const MAX_RETRIES = 20;

async function processPendingForRcIds(rcIds, timeoutMs = 10000) {
    if (!rcIds || rcIds.length === 0) return { processed: 0, failed: 0 };
    const ids = [...new Set(rcIds)].filter(Boolean);
    const pending = await PendingWebhookEvent.find({ appUserId: { $in: ids }, status: 'pending' }).limit(50).lean();
    let processed = 0;
    let failed = 0;

    for (const doc of pending) {
        try {
            const ok = await processOnePending(doc);
            if (ok) processed++;
            else failed++;
        } catch (e) {
            failed++;
            logWebhook('error', { eventId: doc.eventId, appUserId: doc.appUserId, error: e?.message });
        }
    }
    return { processed, failed };
}

async function processOnePending(doc) {
    const event = doc.payload;
    const eventId = doc.eventId;
    const user = await resolveUser(event);

    if (!user) {
        const retryCount = (doc.retryCount || 0) + 1;
        if (retryCount >= MAX_RETRIES) {
            const DeadLetterWebhookEvent = require('../models/DeadLetterWebhookEvent');
            await DeadLetterWebhookEvent.create({ eventId, payload: event, reason: 'max_retries', retryCount });
            await PendingWebhookEvent.deleteOne({ eventId }).catch(() => {});
            return false;
        }
        await PendingWebhookEvent.updateOne(
            { eventId },
            { $inc: { retryCount: 1 }, $set: { lastRetryAt: new Date(), status: 'pending' } }
        );
        await addRetryJob(eventId, doc.eventType, doc.appUserId, event, doc.schemaVersion || 'v1', 5 * 60 * 1000);
        return false;
    }

    const updates = buildUpdatesFromEvent(event);
    if (!updates) {
        await SubscriptionEvent.updateOne(
            { eventId },
            { $set: { status: 'completed', userId: user._id, processedAt: new Date() } },
            { upsert: true }
        );
        await PendingWebhookEvent.deleteOne({ eventId }).catch(() => {});
        return true;
    }

    const aliasesToAdd = [event?.app_user_id, event?.original_app_user_id].filter(Boolean);
    const updateDoc = {
        $set: updates,
        ...(aliasesToAdd.length > 0 && { $addToSet: { revenueCatAliases: { $each: aliasesToAdd } } }),
    };
    await User.findByIdAndUpdate(user._id, updateDoc, { runValidators: true });
    await SubscriptionEvent.updateOne(
        { eventId },
        { $set: { status: 'completed', userId: user._id, processedAt: new Date() } },
        { upsert: true }
    );
    await PendingWebhookEvent.deleteOne({ eventId }).catch(() => {});
    return true;
}

async function retryStalePending() {
    const cutoff = new Date(Date.now() - 5 * 60 * 1000);
    const pending = await PendingWebhookEvent.find({
        status: 'pending',
        $or: [{ lastRetryAt: null }, { lastRetryAt: { $lt: cutoff } }],
        retryCount: { $lt: MAX_RETRIES },
    })
        .limit(100)
        .lean();

    let processed = 0;
    for (const doc of pending) {
        try {
            const ok = await processOnePending(doc);
            if (ok) processed++;
        } catch {}
    }
    return processed;
}

module.exports = { processPendingForRcIds, retryStalePending };
