/**
 * Challenge reminder service - sends FCM to eligible users.
 * Spec: backend schedules; atomic DB update for job deduplication; no client timers.
 */
const admin = require('firebase-admin');
const PushToken = require('../models/PushToken');
const User = require('../models/User');
const config = require('../config');

const PAYLOAD_VERSION = '1';

function redactToken(t) {
    if (!t || t.length < 16) return '[invalid]';
    return `${t.slice(0, 8)}...${t.slice(-4)}`;
}

function getAdmin() {
    if (admin.apps.length > 0) return admin;
    if (!config.FCM_PROJECT_ID || !config.FCM_CLIENT_EMAIL || !config.FCM_PRIVATE_KEY) {
        return null;
    }
    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: config.FCM_PROJECT_ID,
                clientEmail: config.FCM_CLIENT_EMAIL,
                privateKey: config.FCM_PRIVATE_KEY,
            }),
        });
    } catch (e) {
        console.warn('[reminderService] FCM init failed:', e?.message);
        return null;
    }
    return admin;
}

async function sendReminderToUser(userId, tokens) {
    const app = getAdmin();
    if (!app) return { sent: 0, failed: tokens.length };

    const intervalMs = config.REMINDER_INTERVAL_HOURS * 60 * 60 * 1000;
    const message = {
        notification: {
            title: 'Your daily challenge awaits',
            body: 'Keep your streak going!',
        },
        data: {
            version: PAYLOAD_VERSION,
            type: 'challenge_reminder',
            screen: 'Home',
        },
    };

    let sent = 0;
    let failed = 0;

    for (const t of tokens) {
        try {
            const resp = await app.messaging().send({
                ...message,
                token: t.token,
                android: { priority: 'high' },
                apns: { payload: { aps: { contentAvailable: true } } },
            });
            if (resp) {
                sent++;
                if (process.env.NODE_ENV !== 'production') {
                    console.log('[reminderService] notification_delivery_success', {
                        userId: userId.toString(),
                        token_redacted: redactToken(t.token),
                    });
                }
            }
        } catch (e) {
            failed++;
            const code = e?.code || e?.errorInfo?.code;
            if (code === 'messaging/invalid-registration-token' ||
                code === 'messaging/registration-token-not-registered') {
                await PushToken.updateOne(
                    { _id: t._id },
                    { $set: { isActive: false } }
                );
            }
            if (process.env.NODE_ENV !== 'production') {
                console.warn('[reminderService] notification_delivery_failure', {
                    userId: userId.toString(),
                    token_redacted: redactToken(t.token),
                    code,
                });
            }
        }
    }
    return { sent, failed };
}

/**
 * Run reminder job. Uses atomic update for deduplication (Spec 11.5).
 * Only send if lastChallengeReminderSentAt is null or older than REMINDER_INTERVAL_HOURS.
 */
async function runReminderJob() {
    const app = getAdmin();
    if (!app) {
        if (process.env.NODE_ENV !== 'production') {
            console.debug('[reminderService] FCM not configured; skipping');
        }
        return { processed: 0, sent: 0, skipped: 0 };
    }

    const intervalMs = config.REMINDER_INTERVAL_HOURS * 60 * 60 * 1000;
    const now = Date.now();
    const reminderCutoff = new Date(now - intervalMs);

    const users = await User.find({
        notificationsEnabled: { $ne: false },
        challengeCompletedAt: { $exists: true, $ne: null, $lt: reminderCutoff },
        $or: [
            { lastChallengeReminderSentAt: null },
            { lastChallengeReminderSentAt: { $lt: reminderCutoff } },
        ],
    }).lean();

    let processed = 0;
    let sent = 0;
    let skipped = 0;

    for (const user of users) {
        const result = await User.findOneAndUpdate(
            {
                _id: user._id,
                $or: [
                    { lastChallengeReminderSentAt: null },
                    { lastChallengeReminderSentAt: { $lt: reminderCutoff } },
                ],
            },
            { $set: { lastChallengeReminderSentAt: new Date() } },
            { new: true }
        );

        if (!result) {
            skipped++;
            continue;
        }

        const tokens = await PushToken.find({
            userId: user._id,
            isActive: true,
        }).lean();

        if (tokens.length === 0) {
            processed++;
            continue;
        }

        const { sent: s } = await sendReminderToUser(user._id, tokens);
        processed++;
        sent += s;
    }

    return { processed, sent, skipped };
}

module.exports = {
    runReminderJob,
    getAdmin,
};
