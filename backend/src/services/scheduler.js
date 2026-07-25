import cron from 'node-cron';
import { getAllItems, updateItemPrice } from '../database/queries.js';
import { findMatchingOffers, scrapePriceResult, selectCheapestOffer, verifyShoppingOffer } from './scraper.js';

let schedulerTask = null;

/** Run the exact verified refresh used by both cron and the refresh button. */
export async function checkTrackedItem(item) {
  let discoveryTracked = false;
  try {
    const sources = item.tracked_sources ? JSON.parse(item.tracked_sources) : [];
    discoveryTracked = Array.isArray(sources) && sources.length > 0;
  } catch {
    discoveryTracked = false;
  }

  const discoveredOffers = discoveryTracked
    ? await findMatchingOffers(item.name, item.currency || 'GBP')
    : [];
  const verifiedOffers = [];

  // Search metadata can be stale or a merchant can block scraping. Verify in
  // ascending price order, then compare the confirmed merchant-page prices.
  // A stale £500 snippet might verify at £640 while the next offer is truly
  // £530, so stopping after the first successful scrape is still incorrect.
  for (const offer of discoveredOffers.slice(0, 3)) {
    const verified = await verifyShoppingOffer(offer, item.name);
    if (verified) verifiedOffers.push(verified);
  }
  let cheapestOffer = selectCheapestOffer(verifiedOffers);
  let newPrice = cheapestOffer?.price ?? null;

  if (newPrice === null) {
    const scrapeResult = await scrapePriceResult(item.url, item.current_price, item.currency);
    if (!scrapeResult.verified) {
      return { checked: false, updated: false, item, reason: scrapeResult.reason };
    }
    newPrice = scrapeResult.price;
    cheapestOffer = null;
  }
  if (newPrice === null) return { checked: false, updated: false, item };

  let trackedSources = null;
  if (cheapestOffer) {
    try {
      const existing = item.tracked_sources ? JSON.parse(item.tracked_sources) : [];
      const source = {
        title: cheapestOffer.title,
        price: cheapestOffer.price,
        currency: cheapestOffer.currencyCode || item.currency,
        storeName: cheapestOffer.storeName,
        productUrl: cheapestOffer.productUrl,
        url: cheapestOffer.productUrl,
        imageUrl: cheapestOffer.imageUrl || item.image_url,
      };
      const sourceKey = `${source.storeName}|${source.productUrl}`;
      trackedSources = [source, ...existing.filter((entry) =>
        `${entry.storeName}|${entry.productUrl || entry.url}` !== sourceKey
      )].slice(0, 10);
    } catch {
      trackedSources = null;
    }
  }

  const updatedItem = updateItemPrice(item.id, newPrice, cheapestOffer ? {
    ...cheapestOffer,
    tracked_sources: trackedSources,
  } : null, cheapestOffer?.currencyCode || item.currency);

  return {
    checked: true,
    updated: Number(item.current_price) !== Number(newPrice),
    item: updatedItem,
    offer: cheapestOffer,
  };
}

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
      const result = await checkTrackedItem(item);
      if (result.checked) {
        const newPrice = result.item.current_price;
        const cheapestOffer = result.offer;
        const oldPrice = item.current_price;
        checked++;

        if (cheapestOffer && (item.url !== cheapestOffer.productUrl || item.store_name !== cheapestOffer.storeName)) {
          console.log(`  🏪 Cheapest seller: ${cheapestOffer.storeName} (£${Number(newPrice).toFixed(2)})`);
        }

        if (result.updated) {
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
