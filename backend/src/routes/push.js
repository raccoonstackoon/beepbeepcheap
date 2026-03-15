import express from 'express';
import { savePushSubscription, removePushSubscription } from '../database/queries.js';
import { getPublicVapidKey } from '../services/push.js';

const router = express.Router();

// GET /api/push/vapid-key — the frontend needs this to subscribe
router.get('/vapid-key', (req, res) => {
  const key = getPublicVapidKey();
  if (!key) return res.status(500).json({ error: 'Push not configured' });
  res.json({ publicKey: key });
});

// POST /api/push/subscribe — save a browser's push subscription
router.post('/subscribe', (req, res) => {
  const subscription = req.body;

  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return res.status(400).json({ error: 'Invalid push subscription' });
  }

  try {
    savePushSubscription(subscription);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to save push subscription:', err);
    res.status(500).json({ error: 'Could not save subscription' });
  }
});

// POST /api/push/unsubscribe — remove a subscription
router.post('/unsubscribe', (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'Endpoint required' });

  try {
    removePushSubscription(endpoint);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to remove push subscription:', err);
    res.status(500).json({ error: 'Could not remove subscription' });
  }
});

export default router;
