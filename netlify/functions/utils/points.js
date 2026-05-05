const { getStore } = require('@netlify/blobs');

const FREE_POINTS = 3;

/**
 * Gets the point store for a specific user.
 */
function getUserStore(userId) {
  return getStore({ name: 'user-points', consistency: 'strong' });
}

/**
 * Gets a user's current point balance. Initializes to FREE_POINTS if new user.
 */
async function getPoints(userId) {
  const store = getUserStore(userId);
  const data = await store.get(userId, { type: 'json' });
  if (data === null) {
    await store.setJSON(userId, { points: FREE_POINTS, tier: 'free' });
    return { points: FREE_POINTS, tier: 'free' };
  }
  return data;
}

/**
 * Deducts points BEFORE the API call. Returns { success, remaining }.
 * If insufficient, returns { success: false }.
 */
async function deductPoint(userId, cost = 1) {
  const store = getUserStore(userId);
  const data = await getPoints(userId);

  if (data.points < cost) {
    return { success: false, remaining: data.points };
  }

  const newBalance = data.points - cost;
  await store.setJSON(userId, { ...data, points: newBalance });
  return { success: true, remaining: newBalance };
}

/**
 * Refunds points after a verified API failure. Returns new balance.
 */
async function refundPoint(userId, amount = 1) {
  const store = getUserStore(userId);
  const data = await getPoints(userId);
  const newBalance = data.points + amount;
  await store.setJSON(userId, { ...data, points: newBalance });
  console.log(`[Points] Refunded ${amount} point(s) to user ${userId}. New balance: ${newBalance}`);
  return newBalance;
}

/**
 * Admin: Top up a user's points.
 */
async function topUpPoints(userId, amount) {
  const store = getUserStore(userId);
  const data = await getPoints(userId);
  const newBalance = data.points + amount;
  const tier = amount >= 300 ? 'pro' : amount >= 60 ? 'basic' : data.tier;
  await store.setJSON(userId, { ...data, points: newBalance, tier });
  return newBalance;
}

module.exports = { getPoints, deductPoint, refundPoint, topUpPoints, FREE_POINTS };
