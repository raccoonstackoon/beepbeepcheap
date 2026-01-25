import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import * as queries from '../database/queries.js';
import { scrapeProduct, scrapePrice, searchStoreForProduct } from '../services/scraper.js';
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

// POST /api/items/image - Add item by image (price tag or product photo)
// Optional: pass storeName in body to override auto-detection (useful for mirrored/unclear labels)
// Optional: pass focusArea in body with {x, y, width, height} percentages to focus on specific area
router.post('/image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Image is required' });
    }
    
    const imageType = req.body.type || 'product'; // 'pricetag' or 'product'
    const userProvidedStore = req.body.storeName; // User can override store detection
    const imagePath = req.file.path;
    const imageUrl = `/uploads/${req.file.filename}`;
    
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
    
    console.log(`Processing ${imageType} image: ${imagePath}`);
    console.log(`📦 Request body:`, JSON.stringify(req.body));
    if (userProvidedStore) {
      console.log(`📍 User specified store: ${userProvidedStore}`);
    }
    
    // Process image with Claude Vision (pass focus area if available)
    const result = await processImage(imagePath, imageType, focusArea);
    
    if (!result.success) {
      return res.status(400).json({ 
        error: 'Failed to process image',
        details: result.error 
      });
    }
    
    // Use user-provided store name if given, otherwise use detected one
    const storeName = userProvidedStore || result.storeName;
    
    // If we have a store name, try to find the product URL on their website
    let productUrl = null;
    let storeSearchResult = null;
    let scrapedImageUrl = null;
    
    if (storeName && result.itemName) {
      // Build a better search query - include brand if it's different from the store
      let searchQuery = result.itemName;
      if (result.brand && result.brand.toLowerCase() !== storeName.toLowerCase()) {
        // If brand isn't already in the item name, prepend it
        if (!result.itemName.toLowerCase().includes(result.brand.toLowerCase())) {
          searchQuery = `${result.brand} ${result.itemName}`;
        }
      }
      
      console.log(`🔍 Searching ${storeName} for: ${searchQuery} (price: ${result.price})`);
      storeSearchResult = await searchStoreForProduct(storeName, searchQuery, result.price);
      
      if (storeSearchResult.success) {
        productUrl = storeSearchResult.productUrl;
        console.log(`✅ Found product URL: ${productUrl}`);
        
        // Scrape the product page to get the product image
        console.log(`🖼️ Scraping product image from: ${productUrl}`);
        try {
          const productData = await scrapeProduct(productUrl);
          if (productData.success && productData.imageUrl) {
            scrapedImageUrl = productData.imageUrl;
            console.log(`✅ Found product image: ${scrapedImageUrl}`);
          }
        } catch (scrapeError) {
          console.log(`⚠️ Could not scrape product image: ${scrapeError.message}`);
        }
      } else {
        console.log(`⚠️ Could not find product URL: ${storeSearchResult.error}`);
      }
    }
    
    // Return extracted info for user to review/edit before saving
    res.json({
      extracted: {
        ...result,
        storeName: storeName // Use the final store name (user override or detected)
      },
      localImageUrl: imageUrl,
      productUrl: productUrl,
      productImageUrl: scrapedImageUrl, // Image from the actual product page
      storeSearch: storeSearchResult
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

