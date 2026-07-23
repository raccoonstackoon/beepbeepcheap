import express from 'express';
import * as queries from '../database/queries.js';

const router = express.Router();
// userId is set by optionalAuth middleware in index.js

// GET /api/alerts - Get all alerts for this user
router.get('/', (req, res) => {
  try {
    const alerts = queries.getAllAlerts(req.userId);
    res.json(alerts);
  } catch (error) {
    console.error('Error getting alerts:', error);
    res.status(500).json({ error: 'Failed to get alerts' });
  }
});

// GET /api/alerts/unread - Get only unread alerts
router.get('/unread', (req, res) => {
  try {
    const alerts = queries.getUnreadAlerts(req.userId);
    res.json(alerts);
  } catch (error) {
    console.error('Error getting unread alerts:', error);
    res.status(500).json({ error: 'Failed to get unread alerts' });
  }
});

// PUT /api/alerts/read-all — must be before /:id/read so "read-all" is not parsed as an id
router.put('/read-all', (req, res) => {
  try {
    queries.markAllAlertsAsRead(req.userId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking all alerts as read:', error);
    res.status(500).json({ error: 'Failed to mark alerts as read' });
  }
});

// PUT /api/alerts/:id/read - Mark an alert as read
router.put('/:id/read', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const ok = queries.markAlertAsRead(id, req.userId);
    if (!ok) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking alert as read:', error);
    res.status(500).json({ error: 'Failed to mark alert as read' });
  }
});

// DELETE /api/alerts/:id - Delete an alert
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const ok = queries.deleteAlert(id, req.userId);
    if (!ok) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting alert:', error);
    res.status(500).json({ error: 'Failed to delete alert' });
  }
});

export default router;
