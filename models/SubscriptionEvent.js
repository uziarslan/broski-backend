/**
 * SubscriptionEvent - Idempotency tracking for RevenueCat webhooks.
 * Prevents duplicate processing when RevenueCat retries or replays events.
 */
const mongoose = require('mongoose');

const subscriptionEventSchema = new mongoose.Schema({
    eventId: { type: String, required: true, unique: true },
    eventType: { type: String, required: true },
    appUserId: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: ['processing', 'completed'], default: 'processing' },
    processedAt: { type: Date, default: Date.now },
}, { timestamps: true });

subscriptionEventSchema.index({ eventId: 1 }, { unique: true });
subscriptionEventSchema.index({ appUserId: 1, eventType: 1 });

module.exports = mongoose.model('SubscriptionEvent', subscriptionEventSchema);
