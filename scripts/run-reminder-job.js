#!/usr/bin/env node
/**
 * Invokes POST /api/cron/run-reminder-job.
 * Requires: CRON_SECRET, BACKEND_URL (e.g. http://localhost:5000).
 * Usage: CRON_SECRET=xxx BACKEND_URL=http://localhost:5000 node scripts/run-reminder-job.js
 */
require('dotenv').config();

const CRON_SECRET = process.env.CRON_SECRET;
const BACKEND_URL = (process.env.BACKEND_URL || 'http://localhost:5000').replace(/\/$/, '');

if (!CRON_SECRET) {
  console.error('CRON_SECRET is required');
  process.exit(1);
}

fetch(`${BACKEND_URL}/api/cron/run-reminder-job`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${CRON_SECRET}`,
    'Content-Type': 'application/json',
  },
})
  .then(async (r) => {
    const text = await r.text();
    if (!text) {
      console.error('Empty response from server. Is the backend running?');
      console.error(`URL: ${BACKEND_URL}/api/cron/run-reminder-job`);
      process.exit(1);
    }
    try {
      return JSON.parse(text);
    } catch {
      console.error('Server returned non-JSON:', text.slice(0, 200));
      process.exit(1);
    }
  })
  .then((data) => {
    console.log(JSON.stringify(data, null, 2));
    process.exit(data?.error ? 1 : 0);
  })
  .catch((err) => {
    console.error(err.message || err);
    if (err.cause?.code === 'ECONNREFUSED') {
      console.error(`Cannot connect to ${BACKEND_URL}. Is the backend running?`);
    }
    process.exit(1);
  });
