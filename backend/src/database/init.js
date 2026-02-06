import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '../../data/pricetracker.db');

let db;

export function getDatabase() {
  if (!db) {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

export function initDatabase() {
  const db = getDatabase();

  // Create items table
  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT,
      image_url TEXT,
      store_name TEXT,
      current_price REAL,
      original_price REAL,
      lowest_price REAL,
      last_checked TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Add store_name column if it doesn't exist (for existing databases)
  try {
    db.exec(`ALTER TABLE items ADD COLUMN store_name TEXT`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Create price_history table
  db.exec(`
    CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      price REAL NOT NULL,
      checked_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
    )
  `);

  // Create alerts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      old_price REAL NOT NULL,
      new_price REAL NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
    )
  `);

  // Create indexes for better query performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_price_history_item_id ON price_history(item_id);
    CREATE INDEX IF NOT EXISTS idx_alerts_item_id ON alerts(item_id);
    CREATE INDEX IF NOT EXISTS idx_alerts_is_read ON alerts(is_read);
  `);

  // Create rewards table for gamification
  db.exec(`
    CREATE TABLE IF NOT EXISTS rewards (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      coins INTEGER DEFAULT 0,
      giants_caught INTEGER DEFAULT 0,
      first_item_claimed INTEGER DEFAULT 0,
      savings_10_claimed INTEGER DEFAULT 0,
      savings_50_claimed INTEGER DEFAULT 0,
      savings_100_claimed INTEGER DEFAULT 0,
      streak_current INTEGER DEFAULT 0,
      streak_best INTEGER DEFAULT 0,
      last_checkin_date TEXT
    )
  `);
  
  // Insert default rewards row if it doesn't exist
  db.exec(`
    INSERT OR IGNORE INTO rewards (id, coins) VALUES (1, 0)
  `);

  console.log('✅ Database initialized successfully');
}

