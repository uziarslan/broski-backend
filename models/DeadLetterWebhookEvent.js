/**
 * DeadLetterWebhookEvent - Events that failed after max retries.
 * Used for manual replay and audit.
 */
const mongoose = require('mongoose');

const deadLetterWebhookEventSchema = new mongoose.Schema({
    eventId: { type: String, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    reason: {
        type: String,
        enum: ['max_retries', 'parse_error', 'unsupported_schema', 'unknown'],
        required: true,
    },
    retryCount: { type: Number, default: 0 },
}, { timestamps: true });

deadLetterWebhookEventSchema.index({ eventId: 1 });
deadLetterWebhookEventSchema.index({ createdAt: 1 });

module.exports = mongoose.model('DeadLetterWebhookEvent', deadLetterWebhookEventSchema);
