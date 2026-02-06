import { getDatabase } from './init.js';

// Will be set by index.js after WebSocket is initialized
let broadcastFunction = null;

export function setBroadcastFunction(fn) {
  broadcastFunction = fn;
}

// ============ ITEMS ============

export function getAllItems() {
  const db = getDatabase();
  return db.prepare('SELECT * FROM items ORDER BY created_at DESC').all();
}

export function getItemById(id) {
  const db = getDatabase();
  return db.prepare('SELECT * FROM items WHERE id = ?').get(id);
}

export function createItem({ name, url, image_url, store_name, current_price, original_price }) {
  const db = getDatabase();
  const lowest_price = current_price;
  const last_checked = new Date().toISOString();
  
  const result = db.prepare(`
    INSERT INTO items (name, url, image_url, store_name, current_price, original_price, lowest_price, last_checked)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, url, image_url, store_name || null, current_price, original_price, lowest_price, last_checked);
  
  // Also add to price history
  if (current_price) {
    addPriceHistory(result.lastInsertRowid, current_price);
  }
  
  return getItemById(result.lastInsertRowid);
}

export function updateItemPrice(id, newPrice) {
  const db = getDatabase();
  const item = getItemById(id);
  
  if (!item) return null;
  
  const lowest_price = Math.min(item.lowest_price || newPrice, newPrice);
  const last_checked = new Date().toISOString();
  
  db.prepare(`
    UPDATE items 
    SET current_price = ?, lowest_price = ?, last_checked = ?
    WHERE id = ?
  `).run(newPrice, lowest_price, last_checked, id);
  
  // Add to price history
  addPriceHistory(id, newPrice);
  
  // Check if price dropped and create alert
  if (item.current_price && newPrice < item.current_price) {
    createAlert(id, item.current_price, newPrice);
  }
  
  return getItemById(id);
}

export function updateItem(id, updates) {
  const db = getDatabase();
  const { name, url, image_url, store_name } = updates;
  
  db.prepare(`
    UPDATE items 
    SET name = COALESCE(?, name),
        url = COALESCE(?, url),
        image_url = COALESCE(?, image_url),
        store_name = COALESCE(?, store_name)
    WHERE id = ?
  `).run(name, url, image_url, store_name, id);
  
  return getItemById(id);
}

export function deleteItem(id) {
  const db = getDatabase();
  db.prepare('DELETE FROM items WHERE id = ?').run(id);
}

// ============ PRICE HISTORY ============

export function addPriceHistory(itemId, price) {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO price_history (item_id, price)
    VALUES (?, ?)
  `).run(itemId, price);
}

export function getPriceHistory(itemId) {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM price_history 
    WHERE item_id = ? 
    ORDER BY checked_at ASC
  `).all(itemId);
}

// ============ ALERTS ============

export function getAllAlerts() {
  const db = getDatabase();
  return db.prepare(`
    SELECT a.*, i.name as item_name, i.image_url
    FROM alerts a
    JOIN items i ON a.item_id = i.id
    ORDER BY a.created_at DESC
  `).all();
}

export function getUnreadAlerts() {
  const db = getDatabase();
  return db.prepare(`
    SELECT a.*, i.name as item_name, i.image_url
    FROM alerts a
    JOIN items i ON a.item_id = i.id
    WHERE a.is_read = 0
    ORDER BY a.created_at DESC
  `).all();
}

export function createAlert(itemId, oldPrice, newPrice) {
  const db = getDatabase();
  const result = db.prepare(`
    INSERT INTO alerts (item_id, old_price, new_price)
    VALUES (?, ?, ?)
  `).run(itemId, oldPrice, newPrice);
  
  // Broadcast to connected WebSocket clients
  if (broadcastFunction) {
    const item = getItemById(itemId);
    const alert = {
      id: result.lastInsertRowid,
      item_id: itemId,
      item_name: item?.name,
      image_url: item?.image_url,
      old_price: oldPrice,
      new_price: newPrice,
      created_at: new Date().toISOString()
    };
    broadcastFunction(alert);
  }
}

export function markAlertAsRead(id) {
  const db = getDatabase();
  db.prepare('UPDATE alerts SET is_read = 1 WHERE id = ?').run(id);
}

export function markAllAlertsAsRead() {
  const db = getDatabase();
  db.prepare('UPDATE alerts SET is_read = 1').run();
}

export function deleteAlert(id) {
  const db = getDatabase();
  db.prepare('DELETE FROM alerts WHERE id = ?').run(id);
}

// ============ REWARDS ============

export function getRewards() {
  const db = getDatabase();
  return db.prepare('SELECT * FROM rewards WHERE id = 1').get();
}

export function addCoins(amount) {
  const db = getDatabase();
  db.prepare(`
    UPDATE rewards 
    SET coins = coins + ?
    WHERE id = 1
  `).run(amount);
  return getRewards();
}

export function catchGiantMascot() {
  const db = getDatabase();
  const coinsEarned = 1;
  db.prepare(`
    UPDATE rewards 
    SET coins = coins + ?,
        giants_caught = giants_caught + 1
    WHERE id = 1
  `).run(coinsEarned);
  return { coinsEarned, rewards: getRewards() };
}

export function recordCheckin() {
  const db = getDatabase();
  const rewards = getRewards();
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  
  // If already checked in today, just return current state
  if (rewards.last_checkin_date === today) {
    return { coinsEarned: 0, streakUpdated: false, rewards };
  }
  
  // Calculate if streak continues or resets
  let newStreak = 1;
  let coinsEarned = 1; // Base daily coin
  
  if (rewards.last_checkin_date) {
    const lastDate = new Date(rewards.last_checkin_date);
    const todayDate = new Date(today);
    const diffDays = Math.floor((todayDate - lastDate) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
      // Consecutive day - continue streak
      newStreak = rewards.streak_current + 1;
      
      // Bonus coins for streak milestones
      if (newStreak === 7) coinsEarned += 10;  // Week streak bonus
      if (newStreak === 30) coinsEarned += 50; // Month streak bonus
    }
    // If diffDays > 1, streak resets to 1
  }
  
  const newBest = Math.max(rewards.streak_best, newStreak);
  
  db.prepare(`
    UPDATE rewards 
    SET coins = coins + ?,
        streak_current = ?,
        streak_best = ?,
        last_checkin_date = ?
    WHERE id = 1
  `).run(coinsEarned, newStreak, newBest, today);
  
  return { 
    coinsEarned, 
    streakUpdated: true, 
    newStreak,
    rewards: getRewards() 
  };
}

export function claimMilestone(type) {
  const db = getDatabase();
  const rewards = getRewards();
  
  // Define milestone rewards
  const milestones = {
    first_item: { column: 'first_item_claimed', coins: 10 },
    savings_10: { column: 'savings_10_claimed', coins: 10 },
    savings_50: { column: 'savings_50_claimed', coins: 25 },
    savings_100: { column: 'savings_100_claimed', coins: 50 }
  };
  
  const milestone = milestones[type];
  if (!milestone) {
    return { success: false, error: 'Invalid milestone type' };
  }
  
  // Check if already claimed
  if (rewards[milestone.column] === 1) {
    return { success: false, error: 'Already claimed', rewards };
  }
  
  // Claim the milestone
  db.prepare(`
    UPDATE rewards 
    SET coins = coins + ?,
        ${milestone.column} = 1
    WHERE id = 1
  `).run(milestone.coins);
  
  return { 
    success: true, 
    coinsEarned: milestone.coins, 
    rewards: getRewards() 
  };
}

