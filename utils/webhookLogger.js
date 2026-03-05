/**
 * Structured webhook logging for observability.
 */
function logWebhook(level, data) {
    const entry = {
        ts: new Date().toISOString(),
        level,
        eventId: data.eventId ?? null,
        eventType: data.eventType ?? null,
        userId: data.userId ?? null,
        appUserId: data.appUserId ?? null,
        success: data.success,
        durationMs: data.durationMs ?? null,
        error: data.error ?? null,
    };
    const out = JSON.stringify(entry);
    if (level === 'error') {
        console.error(out);
    } else {
        console.log(out);
    }
}

module.exports = {
    logWebhook,
};
