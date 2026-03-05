/**
 * Token pruning service - removes stale tokens per Spec 4.4.
 * - Delete/deactivate tokens where lastSeenAt > 90 days.
 * - FCM invalid/NotRegistered handling is done in reminderService on send failure.
 */
const PushToken = require('../models/PushToken');

const PRUNE_DAYS = 90;

/**
 * Run token pruning job. Deletes tokens inactive for 90+ days.
 * @returns {{ deleted: number }}
 */
async function runTokenPruning() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - PRUNE_DAYS);

    const result = await PushToken.deleteMany({
        $or: [
            { lastSeenAt: { $lt: cutoff } },
            { isActive: false },
        ],
    });

    return { deleted: result.deletedCount };
}

module.exports = { runTokenPruning };
