/**
 * PushToken model - multi-device per user.
 * Spec 4: userId, token, platform, isActive, lastSeenAt, lastRegisteredAt.
 * Unique (userId, token). MAX_TOKENS_PER_USER = 10, evict oldest by lastSeenAt.
 */
const mongoose = require('mongoose');

const MAX_TOKENS_PER_USER = 10;

const pushTokenSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    token: {
        type: String,
        required: true,
    },
    platform: {
        type: String,
        enum: ['ios', 'android'],
        required: true,
    },
    deviceId: {
        type: String,
        default: null,
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    lastSeenAt: {
        type: Date,
        default: () => new Date(),
    },
    lastRegisteredAt: {
        type: Date,
        default: () => new Date(),
    },
}, { timestamps: true });

pushTokenSchema.index({ userId: 1, token: 1 }, { unique: true });
pushTokenSchema.index({ userId: 1, isActive: 1 });
pushTokenSchema.index({ lastSeenAt: 1 });

function redactToken(t) {
    if (!t || t.length < 16) return '[invalid]';
    return `${t.slice(0, 8)}...${t.slice(-4)}`;
}

pushTokenSchema.statics.MAX_TOKENS_PER_USER = MAX_TOKENS_PER_USER;

pushTokenSchema.statics.redactToken = redactToken;

module.exports = mongoose.model('PushToken', pushTokenSchema);
