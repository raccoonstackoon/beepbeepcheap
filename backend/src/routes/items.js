import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import * as queries from '../database/queries.js';
import { scrapeProduct, scrapePrice, searchDuckDuckGoShopping } from '../services/scraper.js';
import { processImage } from '../services/imageProcessor.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: path.join(__dirname, '../../uploads'),
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

// GET /api/items - Get all tracked items
router.get('/', (req, res) => {
  try {
    const items = queries.getAllItems();
    res.json(items);
  } catch (error) {
    console.error('Error getting items:', error);
    res.status(500).json({ error: 'Failed to get items' });
  }
});

// GET /api/items/:id - Get a single item
router.get('/:id', (req, res) => {
  try {
    const item = queries.getItemById(parseInt(req.params.id));
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
    const history = queries.getPriceHistory(parseInt(req.params.id));
    res.json(history);
  } catch (error) {
    console.error('Error getting price history:', error);
    res.status(500).json({ error: 'Failed to get price history' });
  }
});

// POST /api/items/url - Add item by URL (scrape the page)
router.post('/url', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    console.log(`Scraping URL: ${url}`);
    const scraped = await scrapeProduct(url);
    
    if (!scraped.success) {
      return res.status(400).json({ 
        error: 'Failed to scrape product',
        details: scraped.error 
      });
    }
    
    const item = queries.createItem({
      name: scraped.name,
      url: url,
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
    const imageUrl = `/uploads/${req.file.filename}`;
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
    
    console.log(`🛒 Searching DuckDuckGo Shopping for: "${searchQuery}"`);
    
    const shoppingResults = await searchDuckDuckGoShopping(searchQuery);
    
    console.log(`📊 Found ${shoppingResults.results?.length || 0} shopping results`);
    
    // Filter results to ONLY show items from the specified store (if brand provided)
    let filteredResults = shoppingResults.results || [];
    
    if (brandName) {
      const brandLower = brandName.toLowerCase();
      const beforeCount = filteredResults.length;
      
      filteredResults = filteredResults.filter(r => {
        const storeLower = (r.storeName || '').toLowerCase();
        const titleLower = (r.title || '').toLowerCase();
        // Match if store name or product title contains the brand
        return storeLower.includes(brandLower) || titleLower.includes(brandLower);
      });
      
      console.log(`🏪 Filtered to "${brandName}" only: ${filteredResults.length} of ${beforeCount} results`);
    }
    
    // Get top 3 cheapest (already sorted by price in the scraper)
    const topResults = filteredResults.slice(0, 3);
    
    for (const r of topResults) {
      console.log(`   💰 £${r.price || 'N/A'} - ${r.title?.substring(0, 50)}... (${r.storeName})`);
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 4: Return TOP 3 results for user to choose from
    // ═══════════════════════════════════════════════════════════════════════
    res.json({
      extracted: { 
        ...result, 
        brand: brandName || detectedBrand 
      },
      localImageUrl: imageUrl,
      // Return the top 3 cheapest options for user to choose
      shoppingOptions: topResults,
      // Also include search metadata
      searchQuery: searchQuery,
      totalResultsFound: shoppingResults.results?.length || 0,
      searchMethod: 'duckduckgo_shopping'
    });
    
  } catch (error) {
    console.error('Error processing image:', error);
    res.status(500).json({ error: 'Failed to process image' });
  }
});

// POST /api/items/manual - Add item manually (after image processing or manual entry)
router.post('/manual', (req, res) => {
  try {
    const { name, url, image_url, current_price } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Item name is required' });
    }
    
    const item = queries.createItem({
      name,
      url: url || null,
      image_url: image_url || null,
      current_price: current_price ? parseFloat(current_price) : null,
      original_price: current_price ? parseFloat(current_price) : null
    });
    
    res.json(item);
  } catch (error) {
    console.error('Error adding item manually:', error);
    res.status(500).json({ error: 'Failed to add item' });
  }
});

// PUT /api/items/:id - Update an item
router.put('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const item = queries.updateItem(id, req.body);
    
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
router.post('/:id/refresh', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const item = queries.getItemById(id);
    
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    if (!item.url) {
      return res.status(400).json({ error: 'Item has no URL to check' });
    }
    
    console.log(`Refreshing price for: ${item.name}`);
    const newPrice = await scrapePrice(item.url);
    
    if (newPrice === null) {
      return res.status(400).json({ error: 'Could not fetch current price' });
    }
    
    const updatedItem = queries.updateItemPrice(id, newPrice);
    res.json(updatedItem);
  } catch (error) {
    console.error('Error refreshing price:', error);
    res.status(500).json({ error: 'Failed to refresh price' });
  }
});

// DELETE /api/items/:id - Delete an item
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    queries.deleteItem(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

export default router;

