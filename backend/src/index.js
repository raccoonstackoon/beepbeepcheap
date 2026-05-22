import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

import { initDatabase } from './database/init.js';
import { setBroadcastFunction } from './database/queries.js';
import itemsRouter from './routes/items.js';
import alertsRouter from './routes/alerts.js';
import rewardsRouter from './routes/rewards.js';
import pushRouter from './routes/push.js';
import adminRouter from './routes/admin.js';
import { startScheduler } from './services/scheduler.js';
import { initPush } from './services/push.js';
import { requireUserId } from './middleware/userId.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Create HTTP server and WebSocket server
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Store connected clients (each ws has .userId from query ?userId=)
const clients = new Set();

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  let userId = null;
  try {
    const u = new URL(req.url || '/', 'http://localhost');
    userId = u.searchParams.get('userId');
    if (userId) userId = userId.trim().toLowerCase();
  } catch {
    /* ignore */
  }
  ws.userId = userId;

  console.log('📱 New WebSocket client connected' + (userId ? ` (user ${userId.slice(0, 8)}…)` : ' (no userId)'));
  clients.add(ws);

  ws.send(JSON.stringify({ type: 'connected', message: 'Connected to beepbeep.cheap notifications!' }));

  ws.on('close', () => {
    console.log('📱 WebSocket client disconnected');
    clients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clients.delete(ws);
  });
});

/** Price-drop toast only to sockets that registered the same user id as the item owner. */
export function broadcastPriceDropAlert(alert, userId) {
  const message = JSON.stringify({
    type: 'price_drop',
    alert: alert
  });

  let n = 0;
  clients.forEach((client) => {
    if (client.readyState !== 1) return;
    if (userId && client.userId && client.userId !== userId) return;
    if (userId && !client.userId) return;
    client.send(message);
    n++;
  });

  console.log(`🔔 Broadcasting price drop to ${n} client(s) for user ${userId ? userId.slice(0, 8) + '…' : '(any)'}`);
}

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
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Id'],
}));
app.use(express.json());

// Serve uploaded images (configurable for persistent disk on hosted platforms)
const uploadsPath = process.env.UPLOADS_PATH || path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}
app.use('/uploads', express.static(uploadsPath));

// Initialize database
initDatabase();

// Connect WebSocket broadcast to database alerts
setBroadcastFunction(broadcastPriceDropAlert);

// Initialize push notifications (generates VAPID keys on first run)
initPush();

// Routes
// requireUserId populates req.userId from the X-User-Id header. Without it,
// every items write would land with NULL user_id and disappear from the owner's list.
// alerts/rewards routers already apply requireUserId internally; push exposes a
// public /vapid-key endpoint, so it gates per-route.
app.use('/api/items', requireUserId, itemsRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/rewards', rewardsRouter);
app.use('/api/push', pushRouter);
app.use('/api/admin', adminRouter);

// Health check with environment diagnostics
app.get('/api/health', async (req, res) => {
  const fs = await import('fs');
  const { execSync } = await import('child_process');

  const chromePaths = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
  ].filter(Boolean);

  const chromeStatus = {};
  for (const p of chromePaths) {
    chromeStatus[p] = fs.existsSync(p);
  }

  let puppeteerCacheContents = '(unknown)';
  const cacheDir = path.join(process.env.HOME || '/tmp', '.cache', 'puppeteer');
  try {
    if (fs.existsSync(cacheDir)) {
      puppeteerCacheContents = execSync(`ls -la "${cacheDir}" 2>&1`).toString().trim();
    } else {
      puppeteerCacheContents = `(dir not found: ${cacheDir})`;
    }
  } catch (e) {
    puppeteerCacheContents = e.message;
  }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: {
      NODE_ENV: process.env.NODE_ENV,
      HOME: process.env.HOME,
      PUPPETEER_EXECUTABLE_PATH: process.env.PUPPETEER_EXECUTABLE_PATH || '(not set)',
      PUPPETEER_SKIP_DOWNLOAD: process.env.PUPPETEER_SKIP_DOWNLOAD || '(not set)',
      PUPPETEER_CACHE_DIR: process.env.PUPPETEER_CACHE_DIR || '(not set)',
      SERPAPI_KEY: process.env.SERPAPI_KEY ? '✅ set' : '❌ not set',
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? '✅ set' : '❌ not set',
    },
    chrome: chromeStatus,
    puppeteerCache: puppeteerCacheContents,
  });
});

// Test endpoints — only available in development
if (process.env.NODE_ENV !== 'production') {
  app.post('/api/test-notification', (req, res) => {
    const testAlert = {
      id: Date.now(),
      item_id: 1,
      item_name: 'Test Product',
      image_url: null,
      old_price: 29.99,
      new_price: 19.99,
      created_at: new Date().toISOString()
    };
    
    broadcastPriceDropAlert(testAlert, null);
    res.json({ success: true, message: 'Test notification sent!' });
  });

  app.post('/api/test-real-drop', async (req, res) => {
    const queries = await import('./database/queries.js');
    try {
      const items = queries.getAllItems();
      const item = items.find(i => i.current_price > 0);
      
      if (!item) {
        return res.status(404).json({ error: 'No items with prices found' });
      }
      
      const oldPrice = item.current_price;
      const newPrice = Math.round(oldPrice * 0.9 * 100) / 100;
      
      console.log(`🧪 Test: Simulating price drop for "${item.name}"`);
      console.log(`   £${oldPrice} → £${newPrice}`);
      
      queries.updateItemPrice(item.id, newPrice);
      
      res.json({ 
        success: true, 
        message: `Price drop simulated for ${item.name}`,
        oldPrice,
        newPrice,
        itemId: item.id
      });
    } catch (error) {
      console.error('Test error:', error);
      res.status(500).json({ error: error.message });
    }
  });
}

// Manual trigger for price checks (used by external cron services)
app.post('/api/cron/check-prices', async (req, res) => {
  const { checkAllPrices } = await import('./services/scheduler.js');
  console.log('🔔 Price check triggered by external cron');
  checkAllPrices();
  res.json({ status: 'started', timestamp: new Date().toISOString() });
});

// Serve frontend in production (only if the built frontend exists)
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '../../frontend/dist');
  if (fs.existsSync(frontendPath)) {
    app.use(express.static(frontendPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(frontendPath, 'index.html'));
    });
  }
}

// Start server - listen on 0.0.0.0 to allow connections from other devices on the network
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚗 beepbeep.cheap running on port ${PORT}`);
  console.log(`📱 Accessible on your local network at http://<your-ip>:${PORT}`);
  console.log(`🔌 WebSocket server ready for real-time notifications`);
  
  // Start the daily price check scheduler
  startScheduler();
});






