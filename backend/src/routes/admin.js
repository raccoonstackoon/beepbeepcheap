import express from 'express';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { triggerPriceCheck } from '../services/scheduler.js';
import { getDatabase } from '../database/init.js';

const router = express.Router();

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Constant-time compare to avoid timing attacks on the admin token.
function tokensMatch(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function requireAdminToken(req, res, next) {
  const expected = process.env.ADMIN_TOKEN;
  // If ADMIN_TOKEN isn't configured the admin surface is dark — return 404 so
  // probing doesn't reveal the route exists.
  if (!expected) return res.status(404).json({ error: 'Not found' });
  if (!tokensMatch(req.headers['x-admin-token'] || '', expected)) {
    return res.status(401).json({ error: 'Invalid admin token' });
  }
  next();
}

// GET /api/admin/diag
// Read-only diagnostic: shows item counts overall, by user_id, and how many
// are orphaned (NULL user_id). Used to confirm whether items are missing
// vs. just stuck on the wrong user_id.
router.get('/diag', requireAdminToken, (req, res) => {
  const db = getDatabase();
  const total = db.prepare('SELECT COUNT(*) AS n FROM items').get().n;
  const orphans = db
    .prepare("SELECT COUNT(*) AS n FROM items WHERE user_id IS NULL OR user_id = ''")
    .get().n;
  const byUser = db
    .prepare(
      `SELECT user_id, COUNT(*) AS n
       FROM items
       WHERE user_id IS NOT NULL AND user_id != ''
       GROUP BY user_id
       ORDER BY n DESC
       LIMIT 10`
    )
    .all();
  const history = db.prepare('SELECT COUNT(*) AS n FROM price_history').get().n;
  const alerts = db.prepare('SELECT COUNT(*) AS n FROM alerts').get().n;
  const subs = db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get().n;
  // Pragma queries to reveal which file SQLite actually opened — confirms
  // whether DATABASE_PATH resolved to the persistent disk or a local fallback.
  const file = db.prepare('PRAGMA database_list').all();
  const env = {
    DATABASE_PATH: process.env.DATABASE_PATH || null,
    UPLOADS_PATH: process.env.UPLOADS_PATH || null,
    NODE_ENV: process.env.NODE_ENV || null,
  };
  res.json({ total, orphans, byUser, history, alerts, subs, file, env });
});

// POST /api/admin/recover-orphans
// Reassigns every NULL/empty-user_id item to the supplied target_user_id.
// Body: { "target_user_id": "<uuid v4>" }
router.post('/recover-orphans', requireAdminToken, (req, res) => {
  const target = String(req.body?.target_user_id || '').trim().toLowerCase();
  if (!UUID_V4_RE.test(target)) {
    return res.status(400).json({ error: 'target_user_id must be a UUID v4' });
  }
  const db = getDatabase();
  const before = db
    .prepare("SELECT COUNT(*) AS n FROM items WHERE user_id IS NULL OR user_id = ''")
    .get().n;
  const result = db
    .prepare("UPDATE items SET user_id = ? WHERE user_id IS NULL OR user_id = ''")
    .run(target);
  console.log(`[admin] recovered ${result.changes} orphan items → ${target}`);
  res.json({ ok: true, orphansBefore: before, reassigned: result.changes, target });
});

// GET /api/admin/inspect-disk
// Lists files on the persistent disk mount and, if a SQLite DB exists at the
// expected path, opens it read-only and returns row counts. Used to find
// stranded data when the live code is pointing at the wrong DB file.
router.get('/inspect-disk', requireAdminToken, (req, res) => {
  const DISK_ROOT = '/var/beepbeep-data';
  const out = { mountExists: false, files: [], db: null };

  try {
    out.mountExists = fs.existsSync(DISK_ROOT);
    if (out.mountExists) {
      const entries = fs.readdirSync(DISK_ROOT, { withFileTypes: true });
      out.files = entries.map((e) => {
        const full = path.join(DISK_ROOT, e.name);
        let size = null;
        let mtime = null;
        try {
          const st = fs.statSync(full);
          size = st.size;
          mtime = st.mtime.toISOString();
        } catch {}
        return { name: e.name, isDir: e.isDirectory(), size, mtime };
      });
    }

    const candidateDb = path.join(DISK_ROOT, 'pricetracker.db');
    if (fs.existsSync(candidateDb)) {
      const db = new Database(candidateDb, { readonly: true, fileMustExist: true });
      try {
        const tables = db
          .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
          .all()
          .map((r) => r.name);
        const counts = {};
        for (const t of tables) {
          try {
            counts[t] = db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n;
          } catch (e) {
            counts[t] = `err: ${e.message}`;
          }
        }
        const byUser = tables.includes('items')
          ? db
              .prepare(
                `SELECT user_id, COUNT(*) AS n FROM items
                 WHERE user_id IS NOT NULL AND user_id != ''
                 GROUP BY user_id ORDER BY n DESC LIMIT 10`
              )
              .all()
          : [];
        const orphans = tables.includes('items')
          ? db
              .prepare("SELECT COUNT(*) AS n FROM items WHERE user_id IS NULL OR user_id = ''")
              .get().n
          : 0;
        out.db = { path: candidateDb, tables, counts, byUser, orphans };
      } finally {
        db.close();
      }
    }
  } catch (error) {
    out.error = error.message;
  }

  res.json(out);
});

// POST /api/admin/scan
// Triggers the same full price-check the daily cron does. Runs async so the
// HTTP response returns immediately; results land in items/price_history and
// can be observed via GET /api/items afterwards.
router.post('/scan', requireAdminToken, (req, res) => {
  console.log('[admin] manual full scan triggered');
  triggerPriceCheck()
    .then((summary) => console.log('[admin] scan finished:', summary))
    .catch((err) => console.error('[admin] scan failed:', err));
  res.status(202).json({ ok: true, message: 'Scan started — poll GET /api/items to see results' });
});

export default router;
