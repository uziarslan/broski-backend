/**
 * Webhook job queue - Bull + Redis.
 * jobId = eventId for logical exactly-once.
 */
const Bull = require('bull');
const config = require('../config');

const QUEUE_NAME = 'revenuecat_webhooks';
const MAX_QUEUE_DEPTH = 50000;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let queue = null;

function getQueue() {
    if (!queue) {
        queue = new Bull(QUEUE_NAME, REDIS_URL, {
            defaultJobOptions: {
                removeOnComplete: 100,
                removeOnFail: 500,
                attempts: 5,
                backoff: {
                    type: 'exponential',
                    delay: 60 * 1000,
                },
                timeout: 30 * 1000,
                jobId: undefined,
            },
        });
    }
    return queue;
}

/**
 * Add job with jobId = eventId for exactly-once semantics.
 * Returns { added: boolean, jobId } or throws on queue full.
 */
async function addWebhookJob(eventId, eventType, appUserId, payload, schemaVersion = 'v1') {
    const q = getQueue();
    const count = await q.getJobCounts();
    const total = (count.waiting || 0) + (count.active || 0) + (count.delayed || 0);
    if (total >= MAX_QUEUE_DEPTH) {
        const err = new Error('Webhook queue full');
        err.code = 'QUEUE_FULL';
        throw err;
    }
    const job = await q.add(
        { eventId, eventType, appUserId, payload, schemaVersion },
        { jobId: eventId }
    );
    return { added: true, jobId: job.id };
}

async function getQueueDepth() {
    const q = getQueue();
    const counts = await q.getJobCounts();
    return (counts.waiting || 0) + (counts.active || 0) + (counts.delayed || 0);
}

async function addRetryJob(eventId, eventType, appUserId, payload, schemaVersion, delayMs = 5 * 60 * 1000) {
    const q = getQueue();
    const jobId = `retry:${eventId}:${Date.now()}`;
    await q.add(
        { eventId, eventType, appUserId, payload, schemaVersion, isRetry: true },
        { jobId, delay: delayMs }
    );
}

function isQueueAvailable() {
    try {
        getQueue();
        return true;
    } catch {
        return false;
    }
}

module.exports = {
    getQueue,
    addWebhookJob,
    addRetryJob,
    getQueueDepth,
    isQueueAvailable,
    QUEUE_NAME,
    MAX_QUEUE_DEPTH,
};
