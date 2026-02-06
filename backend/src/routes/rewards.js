import express from 'express';
import * as queries from '../database/queries.js';

const router = express.Router();

// GET /api/rewards - Get current rewards state
router.get('/', (req, res) => {
  try {
    const rewards = queries.getRewards();
    res.json(rewards);
  } catch (error) {
    console.error('Error getting rewards:', error);
    res.status(500).json({ error: 'Failed to get rewards' });
  }
});

// POST /api/rewards/catch - Caught a giant mascot!
router.post('/catch', (req, res) => {
  try {
    const result = queries.catchGiantMascot();
    console.log(`🦝 Giant mascot caught! +${result.coinsEarned} coins (Total: ${result.rewards.coins})`);
    res.json(result);
  } catch (error) {
    console.error('Error recording mascot catch:', error);
    res.status(500).json({ error: 'Failed to record catch' });
  }
});

// POST /api/rewards/checkin - Daily check-in
router.post('/checkin', (req, res) => {
  try {
    const result = queries.recordCheckin();
    if (result.streakUpdated) {
      console.log(`🔥 Daily check-in! Streak: ${result.newStreak} days, +${result.coinsEarned} coins`);
    }
    res.json(result);
  } catch (error) {
    console.error('Error recording check-in:', error);
    res.status(500).json({ error: 'Failed to record check-in' });
  }
});

// POST /api/rewards/claim/:type - Claim a milestone reward
router.post('/claim/:type', (req, res) => {
  try {
    const { type } = req.params;
    const result = queries.claimMilestone(type);
    
    if (result.success) {
      console.log(`🎉 Milestone claimed: ${type} +${result.coinsEarned} coins`);
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error claiming milestone:', error);
    res.status(500).json({ error: 'Failed to claim milestone' });
  }
});

export default router;

