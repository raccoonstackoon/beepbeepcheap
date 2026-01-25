import express from 'express';
import * as queries from '../database/queries.js';

const router = express.Router();

// GET /api/alerts - Get all alerts
router.get('/', (req, res) => {
  try {
    const alerts = queries.getAllAlerts();
    res.json(alerts);
  } catch (error) {
    console.error('Error getting alerts:', error);
    res.status(500).json({ error: 'Failed to get alerts' });
  }
});

// GET /api/alerts/unread - Get only unread alerts
router.get('/unread', (req, res) => {
  try {
    const alerts = queries.getUnreadAlerts();
    res.json(alerts);
  } catch (error) {
    console.error('Error getting unread alerts:', error);
    res.status(500).json({ error: 'Failed to get unread alerts' });
  }
});

// PUT /api/alerts/:id/read - Mark an alert as read
router.put('/:id/read', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    queries.markAlertAsRead(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking alert as read:', error);
    res.status(500).json({ error: 'Failed to mark alert as read' });
  }
});

// PUT /api/alerts/read-all - Mark all alerts as read
router.put('/read-all', (req, res) => {
  try {
    queries.markAllAlertsAsRead();
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking all alerts as read:', error);
    res.status(500).json({ error: 'Failed to mark alerts as read' });
  }
});

// DELETE /api/alerts/:id - Delete an alert
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    queries.deleteAlert(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting alert:', error);
    res.status(500).json({ error: 'Failed to delete alert' });
  }
});

export default router;






