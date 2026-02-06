import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

import { initDatabase } from './database/init.js';
import { setBroadcastFunction } from './database/queries.js';
import itemsRouter from './routes/items.js';
import alertsRouter from './routes/alerts.js';
import rewardsRouter from './routes/rewards.js';
import { startScheduler } from './services/scheduler.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Create HTTP server and WebSocket server
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Store connected clients
const clients = new Set();

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('📱 New WebSocket client connected');
  clients.add(ws);
  
  // Send a welcome message
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

// Function to broadcast price drop alerts to all connected clients
export function broadcastPriceDropAlert(alert) {
  const message = JSON.stringify({
    type: 'price_drop',
    alert: alert
  });
  
  console.log(`🔔 Broadcasting price drop to ${clients.size} clients`);
  
  clients.forEach((client) => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(message);
    }
  });
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
  credentials: true
}));
app.use(express.json());

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Initialize database
initDatabase();

// Connect WebSocket broadcast to database alerts
setBroadcastFunction(broadcastPriceDropAlert);

// Routes
app.use('/api/items', itemsRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/rewards', rewardsRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Test endpoint to simulate a price drop notification (for testing only)
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
  
  broadcastPriceDropAlert(testAlert);
  res.json({ success: true, message: 'Test notification sent!' });
});

// Test endpoint to simulate a REAL price drop on an actual item (for testing only)
app.post('/api/test-real-drop', async (req, res) => {
  const queries = await import('./database/queries.js');
  try {
    // Get the first item with a price
    const items = queries.getAllItems();
    const item = items.find(i => i.current_price > 0);
    
    if (!item) {
      return res.status(404).json({ error: 'No items with prices found' });
    }
    
    // Simulate a 10% price drop
    const oldPrice = item.current_price;
    const newPrice = Math.round(oldPrice * 0.9 * 100) / 100;
    
    console.log(`🧪 Test: Simulating price drop for "${item.name}"`);
    console.log(`   £${oldPrice} → £${newPrice}`);
    
    // This will trigger the alert creation AND the WebSocket broadcast
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
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚗 beepbeep.cheap running on port ${PORT}`);
  console.log(`📱 Accessible on your local network at http://<your-ip>:${PORT}`);
  console.log(`🔌 WebSocket server ready for real-time notifications`);
  
  // Start the daily price check scheduler
  startScheduler();
});

// Updated Sun Jan 18 17:32:41 GMT 2026





