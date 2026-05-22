import express from 'express';
import { triggerPriceCheck } from '../services/scheduler.js';

const router = express.Router();

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
