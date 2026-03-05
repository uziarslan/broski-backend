/**
 * Cron routes - internal, CRON_SECRET required.
 */
const express = require('express');
const router = express.Router();
const config = require('../config');
const { retryStalePending } = require('../services/pendingWebhookService');
const { runReminderJob } = require('../services/reminderService');
const { runTokenPruning } = require('../services/tokenPruningService');
const crypto = require('crypto');

function constantTimeCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

router.post('/retry-pending-webhooks', async (req, res) => {
    const auth = req.headers['authorization'];
    const secret = config.CRON_SECRET;

    if (!secret) {
        return res.status(503).json({ error: 'CRON_SECRET not configured' });
    }
    if (!auth || !auth.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = auth.slice(7).trim();
    if (!constantTimeCompare(token, secret)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const processed = await retryStalePending();
        res.json({ success: true, processed });
    } catch (err) {
        res.status(500).json({ error: err?.message || 'Internal error' });
    }
});

router.post('/run-reminder-job', async (req, res) => {
    const auth = req.headers['authorization'];
    const secret = config.CRON_SECRET;

    if (!secret) {
        return res.status(503).json({ error: 'CRON_SECRET not configured' });
    }
    if (!auth || !auth.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = auth.slice(7).trim();
    if (!constantTimeCompare(token, secret)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const result = await runReminderJob();
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ error: err?.message || 'Internal error' });
    }
});

router.post('/prune-push-tokens', async (req, res) => {
    const auth = req.headers['authorization'];
    const secret = config.CRON_SECRET;

    if (!secret) {
        return res.status(503).json({ error: 'CRON_SECRET not configured' });
    }
    if (!auth || !auth.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = auth.slice(7).trim();
    if (!constantTimeCompare(token, secret)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const result = await runTokenPruning();
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ error: err?.message || 'Internal error' });
    }
});

module.exports = router;
