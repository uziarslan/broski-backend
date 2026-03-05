/**
 * Push token controller - POST (upsert) and DELETE (idempotent).
 * Spec 3: Idempotent, MAX_TOKENS_PER_USER, eviction, rate limited.
 */
const PushToken = require('../models/PushToken');
const User = require('../models/User');
const ExpressError = require('../utils/ExpressError');

const FCM_TOKEN_MIN_LEN = 100;
const FCM_TOKEN_MAX_LEN = 500;

function isValidTokenFormat(token) {
    if (typeof token !== 'string') return false;
    if (token.length < FCM_TOKEN_MIN_LEN || token.length > FCM_TOKEN_MAX_LEN) return false;
    // FCM tokens can include colons and base64 chars (A-Za-z0-9+/=:) per Firebase docs
    return /^[A-Za-z0-9_\-+/=:]+$/.test(token);
}

function redactToken(t) {
    if (!t || t.length < 16) return '[invalid]';
    return `${t.slice(0, 8)}...${t.slice(-4)}`;
}

async function registerPushToken(req, res) {
    const userId = req.user?.userId;
    if (!userId || req.user?.type !== 'user') {
        throw new ExpressError('User authentication required', 401);
    }

    const { token, platform, deviceId } = req.body || {};

    if (!token || typeof token !== 'string') {
        throw new ExpressError('Token is required', 400);
    }
    if (!['ios', 'android'].includes(platform)) {
        throw new ExpressError('Platform must be ios or android', 400);
    }
    if (!isValidTokenFormat(token)) {
        throw new ExpressError('Invalid token format', 400);
    }

    const now = new Date();

    const session = await PushToken.startSession();
    session.startTransaction();
    try {
        let existing = await PushToken.findOne({ userId, token }).session(session);
        if (existing) {
            existing.lastSeenAt = now;
            existing.lastRegisteredAt = now;
            existing.isActive = true;
            await existing.save({ session });
            await session.commitTransaction();
            if (process.env.NODE_ENV !== 'production') {
                console.log('[push-token] token_registered (upsert)', {
                    userId: userId.toString(),
                    platform,
                    token_redacted: redactToken(token),
                });
            }
            return res.status(200).json({ success: true, message: 'Token updated' });
        }

        const otherUserToken = await PushToken.findOne({ token }).session(session);
        if (otherUserToken && otherUserToken.userId.toString() !== userId.toString()) {
            await PushToken.deleteOne({ _id: otherUserToken._id }).session(session);
        }

        const count = await PushToken.countDocuments({ userId, isActive: true }).session(session);
        if (count >= PushToken.MAX_TOKENS_PER_USER) {
            const oldest = await PushToken.findOne({ userId })
                .sort({ lastSeenAt: 1, createdAt: 1 })
                .session(session);
            if (oldest) {
                await PushToken.deleteOne({ _id: oldest._id }).session(session);
                if (process.env.NODE_ENV !== 'production') {
                    console.log('[push-token] token_eviction', {
                        userId: userId.toString(),
                        platform: oldest.platform,
                    });
                }
            }
        }

        await PushToken.create([{
            userId,
            token,
            platform,
            deviceId: deviceId || null,
            isActive: true,
            lastSeenAt: now,
            lastRegisteredAt: now,
        }], { session });

        await session.commitTransaction();

        if (process.env.NODE_ENV !== 'production') {
            console.log('[push-token] token_registered', {
                userId: userId.toString(),
                platform,
                token_redacted: redactToken(token),
            });
        }
        return res.status(201).json({ success: true, message: 'Token registered' });
    } catch (err) {
        await session.abortTransaction();
        throw err;
    } finally {
        session.endSession();
    }
}

async function deletePushToken(req, res) {
    const userId = req.user?.userId;
    if (!userId || req.user?.type !== 'user') {
        throw new ExpressError('User authentication required', 401);
    }

    const { token } = req.body || {};
    if (!token || typeof token !== 'string') {
        throw new ExpressError('Token is required', 400);
    }

    const result = await PushToken.deleteOne({ userId, token });
    if (process.env.NODE_ENV !== 'production' && result.deletedCount > 0) {
        console.log('[push-token] token_deleted', {
            userId: userId.toString(),
            token_redacted: redactToken(token),
        });
    }
    return res.status(200).json({ success: true, message: 'Token removed' });
}

module.exports = {
    registerPushToken,
    deletePushToken,
};
