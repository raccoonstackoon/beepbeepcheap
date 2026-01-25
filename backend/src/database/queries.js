import { getDatabase } from './init.js';

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
  const { name, url, image_url } = updates;
  
  db.prepare(`
    UPDATE items 
    SET name = COALESCE(?, name),
        url = COALESCE(?, url),
        image_url = COALESCE(?, image_url)
    WHERE id = ?
  `).run(name, url, image_url, id);
  
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
  db.prepare(`
    INSERT INTO alerts (item_id, old_price, new_price)
    VALUES (?, ?, ?)
  `).run(itemId, oldPrice, newPrice);
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

