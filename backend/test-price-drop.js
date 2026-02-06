import { getDatabase } from './src/database/init.js';
import { updateItemPrice, getItemById } from './src/database/queries.js';

// Get the first item
const db = getDatabase();
const item = db.prepare('SELECT * FROM items WHERE current_price IS NOT NULL LIMIT 1').get();

if (item) {
  console.log(`\n📦 Testing with: ${item.name}`);
  console.log(`   Current price: £${item.current_price}`);
  
  // Simulate a price drop (10% lower)
  const newPrice = Math.round(item.current_price * 0.9 * 100) / 100;
  console.log(`   Simulating drop to: £${newPrice}`);
  
  updateItemPrice(item.id, newPrice);
  console.log(`\n✅ Price drop simulated! Check your browser for the notification.`);
  console.log(`\n⚠️  Note: Run this script again to restore the price if needed.`);
} else {
  console.log('No items with prices found in database');
}
