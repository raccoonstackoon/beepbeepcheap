import { getDatabase } from './init.js';
import { sendPushForUser } from '../services/push.js';

// Will be set by index.js after WebSocket is initialized — (alert, userId) =>
let broadcastFunction = null;

export function setBroadcastFunction(fn) {
  broadcastFunction = fn;
}

// ============ ITEMS ============

/** All items (scheduler / cron — every user’s items). */
export function getAllItems() {
  const db = getDatabase();
  return db.prepare('SELECT * FROM items ORDER BY created_at DESC').all();
}

export function getAllItemsForUser(userId) {
  const db = getDatabase();
  return db
    .prepare('SELECT * FROM items WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId);
}

/** Internal: any item by id (scheduler, price checks). */
export function getItemById(id) {
  const db = getDatabase();
  return db.prepare('SELECT * FROM items WHERE id = ?').get(id);
}

export function getItemForUser(id, userId) {
  const db = getDatabase();
  return db.prepare('SELECT * FROM items WHERE id = ? AND user_id = ?').get(id, userId);
}

export function createItem({
  userId,
  name,
  url,
  image_url,
  store_name,
  current_price,
  original_price,
  tracked_sources,
}) {
  const db = getDatabase();
  const lowest_price = current_price;
  const last_checked = new Date().toISOString();
  const sourcesJson = tracked_sources ? JSON.stringify(tracked_sources) : null;

  const result = db
    .prepare(`
    INSERT INTO items (user_id, name, url, image_url, store_name, current_price, original_price, lowest_price, last_checked, tracked_sources)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .run(
      userId,
      name,
      url,
      image_url,
      store_name || null,
      current_price,
      original_price,
      lowest_price,
      last_checked,
      sourcesJson
    );

  if (current_price) {
    addPriceHistory(result.lastInsertRowid, current_price);
  }

  return getItemById(result.lastInsertRowid);
}

export function updateItemPrice(id, newPrice) {
  const db = getDatabase();
  const item = getItemById(id);

  if (!item) return null;

  // Ensure prices are numbers for accurate comparison
  const currentPrice = Number(item.current_price);
  const newPriceNum = Number(newPrice);
  const lowestPrice = Number(item.lowest_price || newPriceNum);

  const lowest_price = Math.min(lowestPrice, newPriceNum);
  const last_checked = new Date().toISOString();

  db.prepare(
    `
    UPDATE items
    SET current_price = ?, lowest_price = ?, last_checked = ?
    WHERE id = ?
  `
  ).run(newPriceNum, lowest_price, last_checked, id);

  addPriceHistory(id, newPriceNum);

  if (currentPrice && newPriceNum < currentPrice) {
    createAlert(id, currentPrice, newPriceNum);
  }

  return getItemById(id);
}

export function updateItem(id, updates, userId) {
  const db = getDatabase();
  const row = getItemForUser(id, userId);
  if (!row) return null;

  const { name, url, image_url, store_name } = updates;

  db.prepare(
    `
    UPDATE items 
    SET name = COALESCE(?, name),
        url = COALESCE(?, url),
        image_url = COALESCE(?, image_url),
        store_name = COALESCE(?, store_name)
    WHERE id = ? AND user_id = ?
  `
  ).run(name, url, image_url, store_name, id, userId);

  return getItemForUser(id, userId);
}

export function deleteItem(id, userId) {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM items WHERE id = ? AND user_id = ?').run(id, userId);
  return result.changes > 0;
}

// ============ PRICE HISTORY ============

export function addPriceHistory(itemId, price) {
  const db = getDatabase();
  db.prepare(
    `
    INSERT INTO price_history (item_id, price)
    VALUES (?, ?)
  `
  ).run(itemId, price);
}

export function getPriceHistoryForUser(itemId, userId) {
  const db = getDatabase();
  const item = getItemForUser(itemId, userId);
  if (!item) return null;
  return db
    .prepare(
      `
    SELECT * FROM price_history 
    WHERE item_id = ? 
    ORDER BY checked_at ASC
  `
    )
    .all(itemId);
}

// ============ ALERTS ============

export function getAllAlerts(userId) {
  const db = getDatabase();
  return db
    .prepare(
      `
    SELECT a.*, i.name as item_name, i.image_url
    FROM alerts a
    JOIN items i ON a.item_id = i.id
    WHERE i.user_id = ?
    ORDER BY a.created_at DESC
  `
    )
    .all(userId);
}

export function getUnreadAlerts(userId) {
  const db = getDatabase();
  return db
    .prepare(
      `
    SELECT a.*, i.name as item_name, i.image_url
    FROM alerts a
    JOIN items i ON a.item_id = i.id
    WHERE a.is_read = 0 AND i.user_id = ?
    ORDER BY a.created_at DESC
  `
    )
    .all(userId);
}

export function createAlert(itemId, oldPrice, newPrice) {
  const db = getDatabase();
  const result = db
    .prepare(
      `
    INSERT INTO alerts (item_id, old_price, new_price)
    VALUES (?, ?, ?)
  `
    )
    .run(itemId, oldPrice, newPrice);

  const item = getItemById(itemId);
  const userId = item?.user_id;
  const alert = {
    id: result.lastInsertRowid,
    item_id: itemId,
    item_name: item?.name,
    image_url: item?.image_url,
    old_price: oldPrice,
    new_price: newPrice,
    created_at: new Date().toISOString(),
  };

  if (broadcastFunction && userId) {
    broadcastFunction(alert, userId);
  }

  const drop = ((oldPrice - newPrice) / oldPrice * 100).toFixed(0);
  sendPushForUser(userId, {
    title: `Price dropped ${drop}%!`,
    body: `${item?.name || 'An item'}: £${oldPrice.toFixed(2)} → £${newPrice.toFixed(2)}`,
    url: `/item/${itemId}`,
  }).catch((err) => console.error('Push notification error:', err));
}

export function markAlertAsRead(id, userId) {
  const db = getDatabase();
  const result = db
    .prepare(
      `
    UPDATE alerts SET is_read = 1
    WHERE id = ? AND item_id IN (SELECT id FROM items WHERE user_id = ?)
  `
    )
    .run(id, userId);
  return result.changes > 0;
}

export function markAllAlertsAsRead(userId) {
  const db = getDatabase();
  db.prepare(
    `
    UPDATE alerts SET is_read = 1
    WHERE item_id IN (SELECT id FROM items WHERE user_id = ?)
  `
  ).run(userId);
}

export function deleteAlert(id, userId) {
  const db = getDatabase();
  const result = db
    .prepare(
      `
    DELETE FROM alerts
    WHERE id = ? AND item_id IN (SELECT id FROM items WHERE user_id = ?)
  `
    )
    .run(id, userId);
  return result.changes > 0;
}

// ============ PUSH SUBSCRIPTIONS ============

export function savePushSubscription(subscription, userId) {
  const db = getDatabase();
  db.prepare(
    `
    INSERT OR REPLACE INTO push_subscriptions (endpoint, keys_p256dh, keys_auth, user_id)
    VALUES (?, ?, ?, ?)
  `
  ).run(subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, userId);
}

export function removePushSubscription(endpoint) {
  const db = getDatabase();
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
}

export function getPushSubscriptionsForUser(userId) {
  const db = getDatabase();
  return db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId);
}

// ============ REWARDS (per user) ============

function ensureUserRewardsRow(userId) {
  const db = getDatabase();
  let row = db.prepare('SELECT * FROM user_rewards WHERE user_id = ?').get(userId);
  if (!row) {
    db.prepare('INSERT INTO user_rewards (user_id) VALUES (?)').run(userId);
    row = db.prepare('SELECT * FROM user_rewards WHERE user_id = ?').get(userId);
  }
  return row;
}

export function getRewards(userId) {
  return ensureUserRewardsRow(userId);
}

export function addCoins(userId, amount) {
  const db = getDatabase();
  ensureUserRewardsRow(userId);
  db.prepare(
    `
    UPDATE user_rewards 
    SET coins = coins + ?
    WHERE user_id = ?
  `
  ).run(amount, userId);
  return getRewards(userId);
}

export function catchGiantMascot(userId) {
  const db = getDatabase();
  ensureUserRewardsRow(userId);
  const coinsEarned = 1;
  db.prepare(
    `
    UPDATE user_rewards 
    SET coins = coins + ?,
        giants_caught = giants_caught + 1
    WHERE user_id = ?
  `
  ).run(coinsEarned, userId);
  return { coinsEarned, rewards: getRewards(userId) };
}

export function recordCheckin(userId) {
  const db = getDatabase();
  const rewards = ensureUserRewardsRow(userId);
  const today = new Date().toISOString().split('T')[0];

  if (rewards.last_checkin_date === today) {
    return { coinsEarned: 0, streakUpdated: false, rewards };
  }

  let newStreak = 1;
  let coinsEarned = 1;

  if (rewards.last_checkin_date) {
    const lastDate = new Date(rewards.last_checkin_date);
    const todayDate = new Date(today);
    const diffDays = Math.floor((todayDate - lastDate) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      newStreak = rewards.streak_current + 1;
      if (newStreak === 7) coinsEarned += 10;
      if (newStreak === 30) coinsEarned += 50;
    }
  }

  const newBest = Math.max(rewards.streak_best, newStreak);

  const db2 = getDatabase();
  db2
    .prepare(
      `
    UPDATE user_rewards 
    SET coins = coins + ?,
        streak_current = ?,
        streak_best = ?,
        last_checkin_date = ?
    WHERE user_id = ?
  `
    )
    .run(coinsEarned, newStreak, newBest, today, userId);

  return {
    coinsEarned,
    streakUpdated: true,
    newStreak,
    rewards: getRewards(userId),
  };
}

export function claimMilestone(userId, type) {
  const db = getDatabase();
  const rewards = ensureUserRewardsRow(userId);

  const milestones = {
    first_item: { column: 'first_item_claimed', coins: 10 },
    savings_10: { column: 'savings_10_claimed', coins: 10 },
    savings_50: { column: 'savings_50_claimed', coins: 25 },
    savings_100: { column: 'savings_100_claimed', coins: 50 },
  };

  const milestone = milestones[type];
  if (!milestone) {
    return { success: false, error: 'Invalid milestone type' };
  }

  if (rewards[milestone.column] === 1) {
    return { success: false, error: 'Already claimed', rewards };
  }

  db.prepare(
    `
    UPDATE user_rewards 
    SET coins = coins + ?,
        ${milestone.column} = 1
    WHERE user_id = ?
  `
  ).run(milestone.coins, userId);

  return {
    success: true,
    coinsEarned: milestone.coins,
    rewards: getRewards(userId),
  };
}
