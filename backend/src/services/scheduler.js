import cron from 'node-cron';
import { getAllItems, updateItemPrice } from '../database/queries.js';
import { scrapePrice } from './scraper.js';

let schedulerTask = null;

/**
 * Check prices for all tracked items
 */
export async function checkAllPrices() {
  console.log('🔍 Starting daily price check...');
  
  const items = getAllItems();
  const itemsWithUrls = items.filter(item => item.url);
  
  console.log(`Found ${itemsWithUrls.length} items to check`);
  
  let checked = 0;
  let updated = 0;
  let errors = 0;
  
  for (const item of itemsWithUrls) {
    try {
      console.log(`Checking: ${item.name}`);
      // Pass previous price for cross-validation
      const newPrice = await scrapePrice(item.url, item.current_price);

      if (newPrice !== null) {
        const oldPrice = item.current_price;
        updateItemPrice(item.id, newPrice);
        checked++;

        if (oldPrice !== newPrice) {
          updated++;
          const changePercent = ((newPrice - oldPrice) / oldPrice * 100).toFixed(1);
          const direction = newPrice < oldPrice ? '📉' : '📈';
          console.log(`  ${direction} Price changed: £${oldPrice} → £${newPrice} (${changePercent}%)`);
        } else {
          console.log(`  ✓ Price unchanged: £${newPrice}`);
        }
      } else {
        errors++;
        console.log(`  ⚠️ Could not fetch price`);
      }
      
      // Add delay between requests to be respectful to servers
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      errors++;
      console.error(`  ❌ Error checking ${item.name}:`, error.message);
    }
  }
  
  console.log(`✅ Price check complete: ${checked} checked, ${updated} changed, ${errors} errors`);
  
  return { checked, updated, errors };
}

/**
 * Start the daily price check scheduler
 * Runs at 9:00 AM every day by default
 */
export function startScheduler(schedule = '0 9 * * *') {
  if (schedulerTask) {
    console.log('Scheduler already running');
    return;
  }
  
  console.log(`📅 Starting price check scheduler (schedule: ${schedule})`);
  
  schedulerTask = cron.schedule(schedule, async () => {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Price check triggered at ${new Date().toISOString()}`);
    console.log('='.repeat(50));
    
    await checkAllPrices();
  });
  
  console.log('✅ Scheduler started - will check prices daily at 9:00 AM');
}

/**
 * Stop the scheduler
 */
export function stopScheduler() {
  if (schedulerTask) {
    schedulerTask.stop();
    schedulerTask = null;
    console.log('Scheduler stopped');
  }
}

/**
 * Manually trigger a price check (for testing or manual refresh)
 */
export async function triggerPriceCheck() {
  return await checkAllPrices();
}










