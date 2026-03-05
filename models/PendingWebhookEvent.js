/**
 * PendingWebhookEvent - Holds RevenueCat webhook events when user cannot be resolved.
 * Processed by workers when user links alias or by retry job.
 */
const mongoose = require('mongoose');

const pendingWebhookEventSchema = new mongoose.Schema({
    eventId: { type: String, required: true, unique: true },
    eventType: { type: String, required: true },
    appUserId: { type: String, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    retryCount: { type: Number, default: 0 },
    lastRetryAt: { type: Date, default: null },
    status: { type: String, enum: ['pending', 'processing'], default: 'pending' },
    schemaVersion: { type: String, default: 'v1' },
    expireAt: { type: Date, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
}, { timestamps: true });

pendingWebhookEventSchema.index({ eventId: 1 }, { unique: true });
pendingWebhookEventSchema.index({ appUserId: 1 });
pendingWebhookEventSchema.index({ retryCount: 1, lastRetryAt: 1 });
pendingWebhookEventSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('PendingWebhookEvent', pendingWebhookEventSchema);
