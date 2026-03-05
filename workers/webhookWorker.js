/**
 * Webhook job worker - processes RevenueCat events from queue.
 */
const mongoose = require('mongoose');
const User = require('../models/User');
const SubscriptionEvent = require('../models/SubscriptionEvent');
const PendingWebhookEvent = require('../models/PendingWebhookEvent');
const DeadLetterWebhookEvent = require('../models/DeadLetterWebhookEvent');
const { getQueue, addRetryJob } = require('../services/webhookQueue');
const { resolveUser, buildUpdatesFromEvent } = require('../controllers/webhook-controller-internal');
const { logWebhook } = require('../utils/webhookLogger');

const MAX_RETRIES = 20;

async function processJob(job) {
    const start = Date.now();
    const { eventId: payloadEventId, eventType, appUserId, payload, schemaVersion, isRetry } = job.data;
    const eventId = payloadEventId || String(job.id);

    try {
        const existing = await SubscriptionEvent.findOne({ eventId }).lean();
        if (existing?.status === 'completed') {
            logWebhook('info', { eventId, eventType, appUserId, outcome: 'duplicate', durationMs: Date.now() - start });
            return;
        }

        if (eventType === 'TEST') {
            await SubscriptionEvent.updateOne(
                { eventId },
                { $set: { status: 'completed', processedAt: new Date() } },
                { upsert: true }
            );
            logWebhook('info', { eventId, eventType, appUserId, outcome: 'test', durationMs: Date.now() - start });
            return;
        }

        const user = await resolveUser(payload);
        if (!user) {
            const pending = await PendingWebhookEvent.findOne({ eventId }).lean();
            const retryCount = (pending?.retryCount || 0) + 1;

            if (retryCount >= MAX_RETRIES) {
                await DeadLetterWebhookEvent.create({
                    eventId,
                    payload,
                    reason: 'max_retries',
                    retryCount,
                });
                await PendingWebhookEvent.deleteOne({ eventId }).catch(() => {});
                await SubscriptionEvent.updateOne(
                    { eventId },
                    { $set: { status: 'completed', processedAt: new Date() } },
                    { upsert: true }
                ).catch(() => {});
                logWebhook('info', { eventId, eventType, appUserId, outcome: 'dead_letter', retryCount, durationMs: Date.now() - start });
                return;
            }

            await PendingWebhookEvent.findOneAndUpdate(
                { eventId },
                {
                    $set: {
                        eventType,
                        appUserId,
                        payload,
                        lastRetryAt: new Date(),
                        status: 'pending',
                        schemaVersion: schemaVersion || 'v1',
                        updatedAt: new Date(),
                    },
                    $inc: { retryCount: 1 },
                },
                { upsert: true }
            );

            await addRetryJob(eventId, eventType, appUserId, payload, schemaVersion, 5 * 60 * 1000);
            logWebhook('info', { eventId, eventType, appUserId, outcome: 'queued_retry', retryCount, durationMs: Date.now() - start });
            return;
        }

        const updates = buildUpdatesFromEvent(payload);
        if (!updates) {
            await SubscriptionEvent.updateOne(
                { eventId },
                { $set: { status: 'completed', userId: user._id, processedAt: new Date() } },
                { upsert: true }
            );
            await PendingWebhookEvent.deleteOne({ eventId }).catch(() => {});
            logWebhook('info', { eventId, eventType, appUserId, userId: user._id.toString(), outcome: 'completed', durationMs: Date.now() - start });
            return;
        }

        const aliasesToAdd = [payload?.app_user_id, payload?.original_app_user_id].filter(Boolean);
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

        logWebhook('info', {
            eventId,
            eventType,
            appUserId,
            userId: user._id.toString(),
            outcome: 'processed',
            durationMs: Date.now() - start,
        });
    } catch (err) {
        logWebhook('error', {
            eventId,
            eventType,
            appUserId,
            outcome: 'failed',
            durationMs: Date.now() - start,
            error: err.message || String(err),
        });
        throw err;
    }
}

function startWorker(concurrency = 5) {
    const queue = getQueue();
    queue.process(concurrency, processJob);
    queue.on('failed', (job, err) => {
        console.error('[webhookWorker] Job failed', { jobId: job?.id, error: err?.message });
    });
    queue.on('error', (err) => {
        console.error('[webhookWorker] Queue error', err);
    });
    console.log(`[webhookWorker] Started with concurrency ${concurrency}`);
    return queue;
}

module.exports = { startWorker, processJob };
