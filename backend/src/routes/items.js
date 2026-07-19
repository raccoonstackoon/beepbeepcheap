import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import * as queries from '../database/queries.js';
import { requireUserId } from '../middleware/userId.js';
import { scrapeProduct, scrapePrice, searchShoppingSerpAPI, resolveMerchantOffers, searchCostco, getStoreName } from '../services/scraper.js';
import { processImage } from '../services/imageProcessor.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for image uploads (configurable for persistent disk on hosted platforms)
const uploadsDir = process.env.UPLOADS_PATH || path.join(__dirname, '../../uploads');
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed'));
  }
});

// userId is set by optionalAuth middleware in index.js - no need for strict requirement here

// GET /api/items - Get all tracked items for this user
router.get('/', (req, res) => {
  try {
    const items = queries.getAllItemsForUser(req.userId);
    res.json(items);
  } catch (error) {
    console.error('Error getting items:', error);
    res.status(500).json({ error: 'Failed to get items' });
  }
});

// GET /api/items/:id - Get a single item
router.get('/:id', (req, res) => {
  try {
    const item = queries.getItemForUser(parseInt(req.params.id, 10), req.userId);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json(item);
  } catch (error) {
    console.error('Error getting item:', error);
    res.status(500).json({ error: 'Failed to get item' });
  }
});

// GET /api/items/:id/history - Get price history for an item
router.get('/:id/history', (req, res) => {
  try {
    const history = queries.getPriceHistoryForUser(parseInt(req.params.id, 10), req.userId);
    if (history === null) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json(history);
  } catch (error) {
    console.error('Error getting price history:', error);
    res.status(500).json({ error: 'Failed to get price history' });
  }
});

function normalizeItemUrl(raw) {
  let u = String(raw || '').trim();
  if (!u) return '';
  if (u.startsWith('//')) return 'https:' + u;
  if (!/^https?:\/\//i.test(u)) {
    u = 'https://' + u.replace(/^\/*/g, '');
  }
  return u;
}

// POST /api/items/url-preview — scrape only; lets the UI confirm/edit before save
router.post('/url-preview', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const normalizedUrl = normalizeItemUrl(url);
    console.log(`Scrape preview URL: ${normalizedUrl}`);
    const scraped = await scrapeProduct(normalizedUrl);

    if (!scraped.success) {
      return res.status(400).json({
        error: 'Failed to scrape product',
        details: scraped.error,
      });
    }

    const warnings = [];
    if (scraped.price == null || Number.isNaN(Number(scraped.price))) {
      warnings.push('no_price');
    }
    if (!scraped.imageUrl) {
      warnings.push('no_image');
    }

    res.json({
      name: scraped.name,
      url: normalizedUrl,
      current_price: scraped.price,
      image_url: scraped.imageUrl,
      store_name: scraped.storeName,
      warnings,
    });
  } catch (error) {
    console.error('Error previewing URL:', error);
    res.status(500).json({ error: 'Failed to load product page' });
  }
});

// POST /api/items/url - Add item by URL (scrape the page) — still supported for API clients
router.post('/url', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    const normalizedUrl = normalizeItemUrl(url);
    console.log(`Scraping URL: ${normalizedUrl}`);
    const scraped = await scrapeProduct(normalizedUrl);
    
    if (!scraped.success) {
      return res.status(400).json({ 
        error: 'Failed to scrape product',
        details: scraped.error 
      });
    }
    
    const item = queries.createItem({
      userId: req.userId,
      name: scraped.name,
      url: normalizedUrl,
      image_url: scraped.imageUrl,
      store_name: scraped.storeName,
      current_price: scraped.price,
      original_price: scraped.price
    });
    
    res.json(item);
  } catch (error) {
    console.error('Error adding item by URL:', error);
    res.status(500).json({ error: 'Failed to add item' });
  }
});

// POST /api/items/image - Add item by product photo
// NEW FLOW:
// 1. Analyze image to detect brand/logo
// 2. If no brand detected, return needsShopName=true so frontend asks user
// 3. Once we have a brand, search the brand's official website for visually similar products
// 4. Return the matching product URL from the brand's official site
//
// Params:
// - identifyOnly=true: Just identify the product and check for brand (step 1-2)
// - shopName: User-provided brand/shop name (for step 3)
router.post('/image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Image is required' });
    }
    
    const imagePath = req.file.path;
    // Create full URL for the uploaded image (not just relative path)
    const host = req.get('host');
    const protocol = req.protocol;
    const imageUrl = `${protocol}://${host}/uploads/${req.file.filename}`;
    const identifyOnly = req.body.identifyOnly === 'true';
    const userProvidedShop = req.body.shopName?.trim() || null;
    
    // Parse focus area if provided (from spotlight annotation)
    let focusArea = null;
    if (req.body.focusArea) {
      try {
        focusArea = JSON.parse(req.body.focusArea);
        console.log(`🔦 Focus area specified: x=${focusArea.x}%, y=${focusArea.y}%, w=${focusArea.width}%, h=${focusArea.height}%`);
      } catch (e) {
        console.log(`⚠️ Could not parse focus area: ${e.message}`);
      }
    }
    
    console.log(`📸 Processing product image: ${imagePath}`);
    if (identifyOnly) console.log(`   Mode: Identify only`);
    if (userProvidedShop) console.log(`   User-provided brand: ${userProvidedShop}`);
    
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: Analyze image with AI to detect brand and identify product
    // ═══════════════════════════════════════════════════════════════════════
    const result = await processImage(imagePath, 'product', focusArea);
    
    if (!result.success) {
      return res.status(400).json({ 
        error: 'Failed to process image',
        details: result.error 
      });
    }
    
    // Check if we detected a brand
    const detectedBrand = result.brand && 
                          result.brand.toLowerCase() !== 'unknown' && 
                          result.brand.toLowerCase() !== 'null' &&
                          result.brandConfidence !== 'none'
                          ? result.brand : null;
    
    console.log(`🏷️ AI Analysis Results:`);
    console.log(`   Product: ${result.itemName || 'Unknown'}`);
    console.log(`   Brand: ${detectedBrand || 'Not detected'}`);
    console.log(`   Confidence: ${result.brandConfidence || 'N/A'}`);
    console.log(`   Source: ${result.brandSource || 'N/A'}`);
    
    // The brand to use (user-provided takes precedence)
    const brandName = userProvidedShop || detectedBrand;
    const hasBrand = !!brandName;
    
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: If identifyOnly mode, return identification results
    // Frontend will check needsShopName to decide if user input is needed
    // ═══════════════════════════════════════════════════════════════════════
    if (identifyOnly) {
      return res.json({
        extracted: { 
          ...result, 
          brand: detectedBrand,
          brandConfidence: result.brandConfidence,
          brandSource: result.brandSource
        },
        localImageUrl: imageUrl,
        hasBrand: hasBrand,
        needsShopName: !hasBrand // Tell frontend to ask for brand name
      });
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: SEARCH DUCKDUCKGO SHOPPING for cheapest prices
    // Returns TOP 3 cheapest results for user to choose from
    // ═══════════════════════════════════════════════════════════════════════
    const productName = result.itemName || result.description || '';
    
    // Build search query: brand + product name (avoid duplicating brand if already in product name)
    let searchQuery = productName;
    if (brandName) {
      const brandLower = brandName.toLowerCase();
      const productLower = productName.toLowerCase();
      // Only add brand if not already in product name
      if (!productLower.includes(brandLower)) {
        searchQuery = `${brandName} ${productName}`.trim();
      }
    }
    
    console.log(`🛒 Searching shopping for: "${searchQuery}"`);
    
    const shoppingResults = await searchShoppingSerpAPI(searchQuery);
    
    console.log(`📊 Found ${shoppingResults.results?.length || 0} shopping results`);
    
    // Filter results to ONLY show items from the specified store (if brand provided)
    let filteredResults = shoppingResults.results || [];
    
    if (brandName) {
      const brandLower = brandName.toLowerCase();
      const beforeCount = filteredResults.length;
      
      filteredResults = filteredResults.filter(r => {
        const storeLower = (r.storeName || '').toLowerCase();
        const titleLower = (r.title || '').toLowerCase();
        return storeLower.includes(brandLower) || titleLower.includes(brandLower);
      });
      
      console.log(`🏪 Filtered to "${brandName}" only: ${filteredResults.length} of ${beforeCount} results`);
    }
    
    // Claude/Google can return the same product from several merchants in an
    // arbitrary order. Once the brand/product filter has established
    // relevance, put the cheapest valid offer first.
    filteredResults.sort((a, b) => {
      const aPrice = Number(a.price) || Number.POSITIVE_INFINITY;
      const bPrice = Number(b.price) || Number.POSITIVE_INFINITY;
      return aPrice - bPrice;
    });

    const topResults = await resolveMerchantOffers(filteredResults.slice(0, 3));
    topResults.sort((a, b) => (Number(a.price) || Number.POSITIVE_INFINITY) - (Number(b.price) || Number.POSITIVE_INFINITY));
    
    for (const r of topResults) {
      console.log(`   💰 ${r.currency || '£'}${r.price || 'N/A'} - ${r.title?.substring(0, 50)}... (${r.storeName})`);
    }
    
    res.json({
      extracted: { 
        ...result, 
        brand: brandName || detectedBrand 
      },
      localImageUrl: imageUrl,
      shoppingOptions: topResults,
      searchQuery: searchQuery,
      totalResultsFound: shoppingResults.results?.length || 0,
      searchMethod: 'serpapi',
    });
    
  } catch (error) {
    console.error('Error processing image:', error);
    res.status(500).json({ error: 'Failed to process image' });
  }
});

// POST /api/items/search - Search for a product by text query
router.post('/search', async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || !query.trim()) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const searchQuery = query.trim();
    console.log(`🔎 Text search for: "${searchQuery}"`);

    const shoppingResults = await searchShoppingSerpAPI(searchQuery);
    const allResults = shoppingResults.results || [];

    // Split search words into identity words (product/brand name) vs spec words (sizes, dimensions)
    const stopWords = new Set([
      'a', 'an', 'the', 'and', 'or', 'for', 'in', 'on', 'at', 'to', 'of',
      'is', 'it', 'by', 'with', 'from', 'as', 'be', 'was', 'are', 'but'
    ]);
    const allWords = searchQuery
      .toLowerCase()
      .split(/\s+/)
      .map(w => w.replace(/[^a-z0-9x×]/g, ''))
      .filter(w => w.length >= 2 && !stopWords.has(w));

    // Identity words = alphabetic (brand/product name like "rugvista", "quentin")
    // Spec words = contain digits (sizes/dimensions like "200x300", "100ml")
    const identityWords = allWords.filter(w => /^[a-z]+$/.test(w));
    const specWords = allWords.filter(w => /\d/.test(w));

    console.log(`   🎯 Identity words: [${identityWords.join(', ')}]`);
    console.log(`   📐 Spec words: [${specWords.join(', ')}]`);

    // Helper: check if a spec word matches in text, handling dimension formatting
    // "200x300" should match "200 x 300", "200×300", "200x300cm", etc.
    const specWordMatches = (specWord, text) => {
      if (text.includes(specWord)) return true;
      const dimMatch = specWord.match(/^(\d+)x(\d+)$/);
      if (dimMatch) {
        const pattern = new RegExp(dimMatch[1] + '\\s*[x×]\\s*' + dimMatch[2], 'i');
        return pattern.test(text);
      }
      return false;
    };

    // Score each result: identity match count + spec match count (tracked separately)
    const scored = allResults.map(r => {
      const titleLower = (r.title || '').toLowerCase();
      const storeLower = (r.storeName || '').toLowerCase();
      const combined = titleLower + ' ' + storeLower;
      const idMatchCount = identityWords.filter(w => combined.includes(w)).length;
      const specMatchCount = specWords.filter(w => specWordMatches(w, combined)).length;
      return { ...r, idMatchCount, specMatchCount };
    });

    // Step 1: ALL identity words must match (this is the hard requirement)
    const identityMatches = scored.filter(r => r.idMatchCount === identityWords.length);

    let topResults;
    let backupResults;

    if (identityMatches.length > 0) {
      // Sort by: most spec matches first, then cheapest price
      identityMatches.sort((a, b) => b.specMatchCount - a.specMatchCount || a.price - b.price);
      topResults = identityMatches.slice(0, 3);
      backupResults = identityMatches.slice(3, 10);
      console.log(`   ✅ ${identityMatches.length} product matches (all ${identityWords.length} identity words)`);
    } else {
      // Fallback: match at least half the identity words,
      // sorted by identity match count (most first), then spec matches, then price
      const minWords = Math.max(1, Math.ceil(identityWords.length / 2));
      const partialMatches = scored
        .filter(r => r.idMatchCount >= minWords)
        .sort((a, b) => b.idMatchCount - a.idMatchCount || b.specMatchCount - a.specMatchCount || a.price - b.price);

      topResults = partialMatches.slice(0, 3);
      backupResults = partialMatches.slice(3, 10);
      console.log(`   ⚠️ No exact product matches; ${partialMatches.length} partial matches (>=${minWords} of ${identityWords.length} identity words)`);
    }

    // Resolve only the visible top three results. Backup results remain cheap
    // search metadata until a future request promotes them.
    topResults = await resolveMerchantOffers(topResults);
    topResults.sort((a, b) => {
      if (b.idMatchCount !== a.idMatchCount) return b.idMatchCount - a.idMatchCount;
      if (b.specMatchCount !== a.specMatchCount) return b.specMatchCount - a.specMatchCount;
      return (Number(a.price) || Number.POSITIVE_INFINITY) - (Number(b.price) || Number.POSITIVE_INFINITY);
    });
    backupResults = backupResults.map(({ serpapiProductApi, ...result }) => result);

    for (const r of topResults) {
      console.log(`   💰 £${r.price || 'N/A'} - ${r.title?.substring(0, 50)}... (${r.storeName}) [id:${r.idMatchCount}/${identityWords.length} spec:${r.specMatchCount}/${specWords.length}]`);
    }

    res.json({
      shoppingOptions: topResults,
      backupResults,
      searchQuery,
      totalResultsFound: allResults.length,
      searchMethod: 'serpapi',
    });
  } catch (error) {
    console.error('Error searching products:', error);
    res.status(500).json({ error: 'Failed to search for products' });
  }
});

// POST /api/items/manual - Add item manually (after image processing or manual entry)
router.post('/manual', (req, res) => {
  try {
    const { name, url, image_url, current_price, store_name, tracked_sources } = req.body;
    
    console.log(`📥 Manual item request received:`);
    console.log(`   - Name: ${name}`);
    console.log(`   - URL: ${url || 'none'}`);
    console.log(`   - Image URL received: ${image_url || 'NONE'}`);
    console.log(`   - Store: ${store_name || 'none'}`);
    if (tracked_sources) console.log(`   - Tracked sources: ${tracked_sources.length} stores`);
    
    if (!name) {
      return res.status(400).json({ error: 'Item name is required' });
    }

    // Validate price is a reasonable number
    if (current_price != null) {
      const priceNum = parseFloat(current_price);
      if (isNaN(priceNum) || priceNum < 0 || priceNum > 1000000) {
        return res.status(400).json({ error: 'Invalid price value' });
      }
    }
    
    // Fix image URL issues
    let finalImageUrl = image_url || null;
    if (finalImageUrl) {
      // Convert relative /uploads/ paths to full URLs
      if (finalImageUrl.startsWith('/uploads/')) {
        const host = req.get('host');
        const protocol = req.protocol;
        finalImageUrl = `${protocol}://${host}${finalImageUrl}`;
        console.log(`   - Converted relative path to: ${finalImageUrl}`);
      }
      // Fix protocol-relative URLs
      else if (finalImageUrl.startsWith('//')) {
        finalImageUrl = 'https:' + finalImageUrl;
        console.log(`   - Fixed protocol-relative URL to: ${finalImageUrl}`);
      }
      // Reject blob URLs (they don't persist)
      else if (finalImageUrl.startsWith('blob:')) {
        console.warn('⚠️ Blob URL received for image, ignoring:', finalImageUrl);
        finalImageUrl = null;
      }
    }
    
    console.log(`   - Final image URL to save: ${finalImageUrl || 'NONE'}`);
    
    const item = queries.createItem({
      userId: req.userId,
      name,
      url: url || null,
      image_url: finalImageUrl,
      store_name: store_name || null,
      current_price: current_price ? parseFloat(current_price) : null,
      original_price: current_price ? parseFloat(current_price) : null,
      tracked_sources: tracked_sources || null
    });
    
    console.log(`📌 Added item manually: "${name}" at ${store_name || 'Unknown'} for £${current_price || 'N/A'}`);
    console.log(`   - Saved with image_url: ${item.image_url || 'NONE'}`);
    
    res.json(item);
  } catch (error) {
    console.error('Error adding item manually:', error);
    res.status(500).json({ error: 'Failed to add item' });
  }
});

// PUT /api/items/:id - Update an item
router.put('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const item = queries.updateItem(id, req.body, req.userId);

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json(item);
  } catch (error) {
    console.error('Error updating item:', error);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// POST /api/items/:id/refresh - Manually refresh price for an item
// Also fetches image and store name if missing, and fixes DuckDuckGo tracking URLs
router.post('/:id/refresh', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const item = queries.getItemForUser(id, req.userId);

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    if (!item.url) {
      return res.status(400).json({ error: 'Item has no URL to check' });
    }
    
    console.log(`Refreshing price for: ${item.name}`);
    
    // Check if URL is a DuckDuckGo tracking URL - if so, try to extract real URL
    let urlToScrape = item.url;
    let fixedUrl = null;
    let extractedStoreName = null;
    
    if (item.url.includes('duckduckgo.com') || item.url.includes('links.duckduckgo')) {
      console.log(`🔗 Detected DuckDuckGo tracking URL, extracting real URL...`);
      
      // Method 1: Extract from ad_domain parameter (easiest)
      const adDomainMatch = item.url.match(/ad_domain=([^&]+)/);
      if (adDomainMatch) {
        const domain = decodeURIComponent(adDomainMatch[1]);
        extractedStoreName = getStoreName('https://' + domain);
        console.log(`   - Found ad_domain: ${domain} → Store: ${extractedStoreName}`);
      }
      
      // Method 2: Extract actual URL from spld JSON (contains base64 encoded URL in "u" field)
      const spldMatch = item.url.match(/spld=([^&]+)/);
      if (spldMatch) {
        try {
          const spldJson = JSON.parse(decodeURIComponent(spldMatch[1]));
          if (spldJson.u) {
            // The "u" field is base64 encoded, then URL encoded
            const base64Url = spldJson.u;
            fixedUrl = decodeURIComponent(Buffer.from(base64Url, 'base64').toString('utf-8'));
            urlToScrape = fixedUrl;
            console.log(`   - Extracted real URL: ${fixedUrl}`);
          }
        } catch (e) {
          console.log(`   - Failed to decode spld: ${e.message}`);
        }
      }
      
      // Method 3: Fallback to uddg parameter
      if (!fixedUrl) {
        const uddgMatch = item.url.match(/uddg=([^&]+)/);
        if (uddgMatch) {
          try {
            fixedUrl = decodeURIComponent(uddgMatch[1]);
            urlToScrape = fixedUrl;
            console.log(`   - Extracted from uddg: ${fixedUrl}`);
          } catch (e) {
            console.log(`   - Failed to decode uddg`);
          }
        }
      }
    }
    
    // If image or store name is missing/bad, do a full scrape
    // Otherwise just get the price (faster)
    let newPrice = null;
    let newImageUrl = null;
    let newStoreName = null;
    
    // Check if store name is a bad/tracking domain that needs fixing
    const badStoreNames = ['links', 'duckduckgo', 'redbrain', 'unknown', 'shop', 'uk'];
    const storeNameIsBad = item.store_name && badStoreNames.includes(item.store_name.toLowerCase());
    
    // Always do a full scrape when user clicks refresh - they want fresh data!
    const needsFullScrape = true;
    
    if (needsFullScrape) {
      console.log(`🔄 Item ${id} doing full scrape...`);
      console.log(`   - Missing image: ${!item.image_url}`);
      console.log(`   - Missing store: ${!item.store_name}`);
      console.log(`   - Bad store name: ${storeNameIsBad ? item.store_name : 'NO'}`);
      console.log(`   - URL needs fixing: ${!!fixedUrl}`);
      const scraped = await scrapeProduct(urlToScrape);
      newPrice = scraped.price;
      newImageUrl = scraped.imageUrl;
      newStoreName = scraped.storeName;
      console.log(`   - Found image: ${newImageUrl ? 'YES' : 'NO'}`);
      console.log(`   - Image URL: ${newImageUrl || 'NONE'}`);
      console.log(`   - Found store: ${newStoreName || 'NO'}`);
    } else {
      newPrice = await scrapePrice(urlToScrape);
    }
    
    if (newPrice === null) {
      return res.status(400).json({ error: 'Could not fetch current price' });
    }
    
    // Update price
    let updatedItem = queries.updateItemPrice(id, newPrice);
    
    // Update image, store name, and/or URL if needed
    const updates = {};
    // Always update image if we got a fresh one (user clicked refresh for a reason!)
    if (newImageUrl) {
      updates.image_url = newImageUrl;
      console.log(`   ✅ Updating image URL`);
    }
    
    // Use extracted store name from ad_domain OR scraped store name
    // Override bad store names like "Links", "Duckduckgo", "Redbrain" etc.
    if (extractedStoreName) {
      // Always trust the ad_domain extracted store name
      updates.store_name = extractedStoreName;
      console.log(`   ✅ Using ad_domain store name: ${extractedStoreName}`);
    } else if (newStoreName && (storeNameIsBad || !item.store_name)) {
      // Use scraped store name if current one is bad or missing
      updates.store_name = newStoreName;
      console.log(`   ✅ Using scraped store name: ${newStoreName}`);
    }
    
    if (fixedUrl) {
      updates.url = fixedUrl;
    }
    
    if (Object.keys(updates).length > 0) {
      updatedItem = queries.updateItem(id, updates, req.userId);
      console.log(`📝 Updated item ${id}:`, updates);
    }
    
    res.json(updatedItem);
  } catch (error) {
    console.error('Error refreshing price:', error);
    res.status(500).json({ error: 'Failed to refresh price' });
  }
});

// DELETE /api/items/:id - Delete an item
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const ok = queries.deleteItem(id, req.userId);
    if (!ok) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

// GET /api/items/:id/alternatives - Find the same product CHEAPER at other stores
// DuckDuckGo already searches for the full product name (including size/model)
// We just verify: Brand + key product words, then sort by CHEAPEST price
// Only returns results that are CHEAPER than current price!
router.get('/:id/alternatives', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const item = queries.getItemForUser(id, req.userId);

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    if (!item.name) {
      return res.status(400).json({ error: 'Item has no name to search for' });
    }
    
    // Clean up the product name
    const cleanName = item.name.replace(/\s+/g, ' ').trim();
    
    console.log(`🔍 Finding cheaper prices for: ${cleanName}`);
    console.log(`   Current store: ${item.store_name || 'Unknown'}`);
    console.log(`   Current price: £${item.current_price || 'N/A'}`);
    
    // ═══════════════════════════════════════════════════════════════════════
    // Extract BRAND + PRODUCT NAME for strict matching
    // Examples:
    //   "Tefal AeroSteam Garment Steamer" → brand=tefal, product=aerosteam
    //   "Polycell Polyfilla Multi-Purpose" → brand=polycell, product=polyfilla
    //   "Byredo La Tulipe Body Wash" → brand=byredo, product=la tulipe
    // ═══════════════════════════════════════════════════════════════════════
    
    const words = cleanName.split(/\s+/).filter(w => w.length > 0);
    
    // Generic words that don't identify a specific product
    const genericWords = new Set([
      'garment', 'steamer', 'handheld', 'clothes', 'body', 'wash', 'lotion', 'cream',
      'spray', 'powder', 'filler', 'multi-purpose', 'multipurpose', 'indoor', 'outdoor',
      'plants', 'plant', 'killer', 'for', 'the', 'and', 'with', 'white', 'black', 'gold',
      'rose', 'blue', 'red', 'green', 'grey', 'gray', 'silver', 'pink', 'purple', 'sage',
      'small', 'medium', 'large', 'xl', 'xxl', 'mini', 'pro', 'plus', 'max', 'lite',
      'ml', 'l', 'g', 'kg', 'oz', 'pack', 'set', 'bundle', 'kit', 'x2', 'x3', 'x4'
    ]);
    
    // Find identifying words: brand + product name (skip generic descriptors)
    const identifyingWords = [];
    for (const word of words) {
      const cleanWord = word.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanWord.length < 2) continue;
      if (genericWords.has(cleanWord)) continue;
      
      identifyingWords.push(cleanWord);
      
      // Take first 2 meaningful words (brand + product line)
      if (identifyingWords.length >= 2) break;
    }
    
    // Also extract model number if present (e.g., DT9814G0)
    const modelMatch = cleanName.match(/\b([A-Z]{1,3}\d{3,}[A-Z0-9]*)\b/i);
    const modelNumber = modelMatch ? modelMatch[1].toLowerCase() : null;
    
    // ═══════════════════════════════════════════════════════════════════════
    // Extract VARIANTS: any "number + unit" patterns (size, quantity, count, etc.)
    // These MUST match for accurate comparison - 120 tablets ≠ 60 tablets!
    // ═══════════════════════════════════════════════════════════════════════
    
    // Flexible pattern: find ALL "number + unit word" patterns in the name
    // This catches: 225ml, 450g, 120 tablets, 24 count, 32 inch, 500ml, x2, 2 pack, etc.
    // Excludes: model numbers (have letters before digits like DT9814), years (1900-2099)
    const variantPatterns = [];
    
    // Pattern 1: number followed by unit word (e.g., "225ml", "120 tablets", "24 count")
    const numberUnitMatches = cleanName.matchAll(/\b(\d+(?:\.\d+)?)\s*([a-zA-Z]{1,12})\b/gi);
    for (const match of numberUnitMatches) {
      const full = match[0].toLowerCase().replace(/\s+/g, '');
      const num = match[1];
      const unit = match[2].toLowerCase();
      
      // Skip if it looks like a model number (unit is all caps in original, or very short generic suffix)
      // Skip years (4 digits starting with 19 or 20)
      if (/^(19|20)\d{2}$/.test(num)) continue;
      
      // Skip generic suffixes that aren't size/quantity indicators
      const skipUnits = ['th', 'st', 'nd', 'rd', 'am', 'pm', 'v', 'w']; // ordinals, time, voltage, watts
      if (skipUnits.includes(unit)) continue;
      
      variantPatterns.push(full);
    }
    
    // Pattern 2: "x" prefix quantities (e.g., "x2", "x3")
    const xQuantityMatch = cleanName.match(/\bx(\d+)\b/i);
    if (xQuantityMatch) {
      variantPatterns.push(xQuantityMatch[0].toLowerCase());
    }
    
    // Pattern 3: Letter sizes (S, M, L, XL, XXL, XS, etc.) - standalone or with "Size" prefix
    const letterSizeMatches = cleanName.matchAll(/\b(size\s+)?(x{0,2}s|x{0,3}l|m)\b/gi);
    for (const match of letterSizeMatches) {
      // Normalize: "Size M" and "M" both become "m"
      const size = match[0].toLowerCase().replace(/size\s*/i, '').trim();
      if (size) variantPatterns.push(`size:${size}`);
    }
    
    // Pattern 4: Numbered sizes with prefix (Size 10, UK 12, US 8, EU 40)
    const numberedSizeMatches = cleanName.matchAll(/\b(size|uk|us|eu)\s*(\d+)\b/gi);
    for (const match of numberedSizeMatches) {
      variantPatterns.push(match[0].toLowerCase().replace(/\s+/g, ''));
    }
    
    // Deduplicate and sort for consistent comparison
    const variants = [...new Set(variantPatterns)].sort();
    
    console.log(`   🎯 Identifying words: [${identifyingWords.join(', ')}]`);
    if (modelNumber) console.log(`   🎯 Model number: ${modelNumber}`);
    if (variants.length > 0) console.log(`   🎯 Variants: [${variants.join(', ')}]`);
    console.log(`   (from: "${cleanName.substring(0, 60)}...")`);
    
    // ═══════════════════════════════════════════════════════════════════════
    // Search Google Shopping via SerpAPI (full name including size/model)
    // ═══════════════════════════════════════════════════════════════════════
    const shoppingResults = await searchShoppingSerpAPI(cleanName);
    
    // ═══════════════════════════════════════════════════════════════════════
    // BONUS: Search Costco UK (doesn't appear in Google Shopping)
    // ═══════════════════════════════════════════════════════════════════════
    const costcoResults = await searchCostco(cleanName);
    
    // Combine results from both sources
    const allResults = [
      ...(shoppingResults.results || []),
      ...(costcoResults.results || [])
    ];
    
    if (allResults.length === 0) {
      return res.json({
        success: true,
        alternatives: [],
        message: 'No alternatives found',
        searchQuery: cleanName
      });
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // Filter: Brand + enough product keywords must match
    // Show top 3 alternatives regardless of price, but flag if user has best price
    // ═══════════════════════════════════════════════════════════════════════
    const currentStoreLower = (item.store_name || '').toLowerCase();
    const currentPrice = item.current_price || 0;
    
    const alternatives = allResults
      .filter(r => {
        const storeLower = (r.storeName || '').toLowerCase();
        const titleLower = (r.title || '').toLowerCase();
        
        // Exclude same store
        if (currentStoreLower && 
            (storeLower.includes(currentStoreLower) || currentStoreLower.includes(storeLower))) {
          return false;
        }
        
        // Must have valid price
        if (!r.price || r.price <= 0) return false;
        
        // ALL identifying words must appear in the alternative title
        // e.g., for "Tefal AeroSteam...", both "tefal" AND "aerosteam" must appear
        const allWordsMatch = identifyingWords.every(word => titleLower.includes(word));
        if (!allWordsMatch) {
          return false;
        }
        
        // If we found a model number, it MUST also match
        // This prevents showing DT3030 when user is tracking DT9814
        if (modelNumber && !titleLower.includes(modelNumber)) {
          return false;
        }
        
        // ═══════════════════════════════════════════════════════════════════════
        // VARIANT MATCHING: All variants must match!
        // 120 tablets ≠ 60 tablets, 225ml ≠ 500ml
        // ═══════════════════════════════════════════════════════════════════════
        
        if (variants.length > 0) {
          // Extract variants from the alternative title using the same flexible pattern
          const altVariants = [];
          
          const altNumberUnitMatches = titleLower.matchAll(/\b(\d+(?:\.\d+)?)\s*([a-zA-Z]{1,12})\b/gi);
          for (const match of altNumberUnitMatches) {
            const full = match[0].toLowerCase().replace(/\s+/g, '');
            const num = match[1];
            const unit = match[2].toLowerCase();
            
            if (/^(19|20)\d{2}$/.test(num)) continue;
            const skipUnits = ['th', 'st', 'nd', 'rd', 'am', 'pm', 'v', 'w'];
            if (skipUnits.includes(unit)) continue;
            
            altVariants.push(full);
          }
          
          const altXMatch = titleLower.match(/\bx(\d+)\b/i);
          if (altXMatch) altVariants.push(altXMatch[0].toLowerCase());
          
          // Letter sizes (S, M, L, XL, etc.)
          const altLetterSizeMatches = titleLower.matchAll(/\b(size\s+)?(x{0,2}s|x{0,3}l|m)\b/gi);
          for (const match of altLetterSizeMatches) {
            const size = match[0].toLowerCase().replace(/size\s*/i, '').trim();
            if (size) altVariants.push(`size:${size}`);
          }
          
          // Numbered sizes (Size 10, UK 12, US 8, EU 40)
          const altNumberedSizeMatches = titleLower.matchAll(/\b(size|uk|us|eu)\s*(\d+)\b/gi);
          for (const match of altNumberedSizeMatches) {
            altVariants.push(match[0].toLowerCase().replace(/\s+/g, ''));
          }
          
          const altVariantSet = new Set(altVariants);
          
          // ALL our variants must appear in the alternative
          const allVariantsMatch = variants.every(v => altVariantSet.has(v));
          if (!allVariantsMatch) {
            return false; // Missing variant = different product
          }
        }
        
        return true;
      })
      // Sort by CHEAPEST price first
      .sort((a, b) => a.price - b.price)
      // Take top 3
      .slice(0, 3);
    
    console.log(`✅ Found ${alternatives.length} matching alternatives (filtered from ${allResults.length} results: ${shoppingResults.results?.length || 0} SerpAPI + ${costcoResults.results?.length || 0} Costco)`);
    
    // Check if user has the best price (cheapest of all alternatives)
    const cheapestAltPrice = alternatives.length > 0 ? alternatives[0].price : Infinity;
    const hasBestPrice = currentPrice > 0 && currentPrice <= cheapestAltPrice;
    
    // Map alternatives with savings/extra cost info
    const alternativesWithSavings = alternatives.map(alt => {
      const isCheaper = currentPrice > 0 && alt.price < currentPrice;
      const priceDiff = Math.abs(currentPrice - alt.price);
      return {
        title: alt.title,
        price: alt.price,
        storeName: alt.storeName,
        productUrl: alt.productUrl,
        imageUrl: alt.imageUrl,
        savings: isCheaper ? priceDiff.toFixed(2) : null,
        savingsPercent: isCheaper ? ((priceDiff / currentPrice) * 100).toFixed(0) : null,
        extraCost: !isCheaper ? priceDiff.toFixed(2) : null,
        extraCostPercent: !isCheaper && currentPrice > 0 ? ((priceDiff / currentPrice) * 100).toFixed(0) : null,
        isCheaper
      };
    });
    
    for (const alt of alternativesWithSavings) {
      if (alt.isCheaper) {
        console.log(`   💰 £${alt.price} at ${alt.storeName} (Save £${alt.savings}! = ${alt.savingsPercent}% off)`);
      } else {
        console.log(`   📍 £${alt.price} at ${alt.storeName} (+£${alt.extraCost} more)`);
      }
    }
    
    if (hasBestPrice) {
      console.log(`   🏆 You've got the best price at £${currentPrice}!`);
    }
    
    res.json({
      success: true,
      alternatives: alternativesWithSavings,
      currentPrice,
      currentStore: item.store_name,
      searchQuery: cleanName,
      hasBestPrice,  // true if current price is cheapest
      sources: {
        serpapi: shoppingResults.results?.length || 0,
        costco: costcoResults.results?.length || 0
      }
    });
    
  } catch (error) {
    console.error('Error finding alternatives:', error);
    res.status(500).json({ error: 'Failed to find alternatives' });
  }
});

export default router;
