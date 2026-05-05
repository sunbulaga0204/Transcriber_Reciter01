const { getStore } = require('@netlify/blobs');

// 1 request per 5 minutes per user per action
const RATE_WINDOW_MS = 5 * 60 * 1000;

/**
 * Checks rate limit for a user + action combo.
 * Returns { allowed: bool, retryAfterSeconds: number }
 */
async function checkRateLimit(userId, action) {
  const store = getStore({ name: 'rate-limits', consistency: 'strong' });
  const key = `${userId}:${action}`;
  const now = Date.now();

  const record = await store.get(key, { type: 'json' });

  if (record && (now - record.lastRequest) < RATE_WINDOW_MS) {
    const retryAfterSeconds = Math.ceil((RATE_WINDOW_MS - (now - record.lastRequest)) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  // Update the timestamp
  await store.setJSON(key, { lastRequest: now });
  return { allowed: true, retryAfterSeconds: 0 };
}

module.exports = { checkRateLimit, RATE_WINDOW_MS };
