import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import { initDatabase } from './database/init.js';
import itemsRouter from './routes/items.js';
import alertsRouter from './routes/alerts.js';
import { startScheduler } from './services/scheduler.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
// Allow all origins in development for local network testing (phone, tablet, etc.)
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? [
        'https://beepbeep.cheap',
        'https://www.beepbeep.cheap',
        process.env.FRONTEND_URL
      ].filter(Boolean)
    : true, // Allow all origins in development
  credentials: true
}));
app.use(express.json());

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Initialize database
initDatabase();

// Routes
app.use('/api/items', itemsRouter);
app.use('/api/alerts', alertsRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Manual trigger for price checks (used by external cron services)
app.post('/api/cron/check-prices', async (req, res) => {
  const { checkAllPrices } = await import('./services/scheduler.js');
  console.log('🔔 Price check triggered by external cron');
  checkAllPrices();
  res.json({ status: 'started', timestamp: new Date().toISOString() });
});

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(frontendPath));
  
  // Handle client-side routing
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

// Start server - listen on 0.0.0.0 to allow connections from other devices on the network
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚗 beepbeep.cheap running on port ${PORT}`);
  console.log(`📱 Accessible on your local network at http://<your-ip>:${PORT}`);
  
  // Start the daily price check scheduler
  startScheduler();
});

// Updated Sun Jan 18 17:32:41 GMT 2026





