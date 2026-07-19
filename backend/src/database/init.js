import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Production SQLite must live on Render's persistent disk. Failing at startup
// is safer than silently creating an ephemeral database that disappears on the
// next deploy.
if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_PATH) {
  console.error(
    '[init] FATAL: NODE_ENV=production but DATABASE_PATH is unset. ' +
    'Set DATABASE_PATH to a path on the persistent disk (for example ' +
    '/var/beepbeep-data/pricetracker.db).'
  );
  process.exit(1);
}

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../data/pricetracker.db');

// Ensure the directory exists (needed for persistent disk mounts on Render)
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

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
  
  // Add tracked_sources column (JSON array of alternative store listings for the same product)
  try {
    db.exec(`ALTER TABLE items ADD COLUMN tracked_sources TEXT`);
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

  // Push notification subscriptions
  db.exec(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT NOT NULL UNIQUE,
      keys_p256dh TEXT NOT NULL,
      keys_auth TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Native iOS device tokens (APNs). Kept separately from browser Web Push
  // subscriptions because APNs accepts a device token, not a VAPID endpoint.
  db.exec(`
    CREATE TABLE IF NOT EXISTS native_push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      platform TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
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

  migratePerUserData(db);

  // Create users table for OAuth authentication
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT,
      provider TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(provider, provider_id)
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_users_provider ON users(provider, provider_id)`);

  console.log('✅ Database initialized successfully');
}

/**
 * Per-user lists: items and push carry user_id; rewards move to user_rewards.
 */
function migratePerUserData(db) {
  // Valid UUID v4 shape so X-User-Id middleware can accept it for one-time “recover old list” if needed
  const LEGACY = '10000000-0000-4000-8000-000000000001';

  try {
    db.exec(`ALTER TABLE items ADD COLUMN user_id TEXT`);
  } catch (e) {
    if (!String(e.message).includes('duplicate column name')) throw e;
  }
  db.prepare(`UPDATE items SET user_id = ? WHERE user_id IS NULL OR TRIM(user_id) = ''`).run(LEGACY);

  try {
    db.exec(`ALTER TABLE push_subscriptions ADD COLUMN user_id TEXT`);
  } catch (e) {
    if (!String(e.message).includes('duplicate column name')) throw e;
  }
  db.prepare(
    `UPDATE push_subscriptions SET user_id = ? WHERE user_id IS NULL OR TRIM(user_id) = ''`
  ).run(LEGACY);

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_rewards (
      user_id TEXT PRIMARY KEY,
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

  const legacyRewards = db.prepare(`SELECT * FROM rewards WHERE id = 1`).get();
  const hasLegacyRow = db.prepare(`SELECT 1 FROM user_rewards WHERE user_id = ?`).get(LEGACY);
  if (legacyRewards && !hasLegacyRow) {
    db.prepare(`
      INSERT INTO user_rewards (
        user_id, coins, giants_caught, first_item_claimed, savings_10_claimed,
        savings_50_claimed, savings_100_claimed, streak_current, streak_best, last_checkin_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      LEGACY,
      legacyRewards.coins ?? 0,
      legacyRewards.giants_caught ?? 0,
      legacyRewards.first_item_claimed ?? 0,
      legacyRewards.savings_10_claimed ?? 0,
      legacyRewards.savings_50_claimed ?? 0,
      legacyRewards.savings_100_claimed ?? 0,
      legacyRewards.streak_current ?? 0,
      legacyRewards.streak_best ?? 0,
      legacyRewards.last_checkin_date ?? null
    );
  }

  db.exec(`CREATE INDEX IF NOT EXISTS idx_items_user_id ON items(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_native_push_subscriptions_user_id ON native_push_subscriptions(user_id)`);
}
