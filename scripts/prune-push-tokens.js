#!/usr/bin/env node
/**
 * Invokes POST /api/cron/prune-push-tokens.
 * Requires: CRON_SECRET, BACKEND_URL (e.g. http://localhost:5000).
 * Usage: CRON_SECRET=xxx BACKEND_URL=http://localhost:5000 node scripts/prune-push-tokens.js
 */
require('dotenv').config();

const CRON_SECRET = process.env.CRON_SECRET;
const BACKEND_URL = (process.env.BACKEND_URL || 'http://localhost:5000').replace(/\/$/, '');

if (!CRON_SECRET) {
  console.error('CRON_SECRET is required');
  process.exit(1);
}

fetch(`${BACKEND_URL}/api/cron/prune-push-tokens`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${CRON_SECRET}`,
    'Content-Type': 'application/json',
  },
})
  .then(r => r.json())
  .then(data => {
    console.log(JSON.stringify(data, null, 2));
    process.exit(data.error ? 1 : 0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
