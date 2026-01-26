/**
 * Barcode lookup service
 * Uses multiple free APIs to look up product information from barcodes
 * Supports: food, cosmetics, electronics, household items, and more
 */

/**
 * Look up a product by its barcode using multiple databases
 * @param {string} barcode - The barcode number (UPC, EAN, etc.)
 * @returns {Promise<object>} Product information or null if not found
 */
export async function lookupBarcode(barcode) {
  if (!barcode) return null;
  
  // Clean the barcode (remove spaces, dashes, etc.)
  const cleanBarcode = barcode.replace(/[\s\-]/g, '');
  
  console.log(`🔍 Looking up barcode: ${cleanBarcode}`);
  
  // Try all databases in parallel for speed, then use first successful result
  const lookups = [
    lookupUPCDatabase(cleanBarcode),      // General products - best coverage
    lookupOpenFoodFacts(cleanBarcode),    // Food & beverages
    lookupOpenBeautyFacts(cleanBarcode),  // Cosmetics & beauty
    lookupOpenProductsFacts(cleanBarcode) // General products (newer DB)
  ];
  
  const results = await Promise.all(lookups);
  
  // Find the first successful result (prefer UPC Database for general items)
  for (const result of results) {
    if (result && result.name) {
      console.log(`✅ Found in ${result.source}: ${result.name}`);
      return result;
    }
  }
  
  console.log(`❌ Barcode not found in any database: ${cleanBarcode}`);
  return null;
}

/**
 * Look up product in Open Food Facts (free, no API key needed)
 * Great coverage for food and grocery items
 */
async function lookupOpenFoodFacts(barcode) {
  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`,
      {
        headers: {
          'User-Agent': 'BeepBeepCheap/1.0 (price-tracker-app)'
        }
      }
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    
    if (data.status !== 1 || !data.product) {
      return null;
    }
    
    const product = data.product;
    
    return {
      source: 'Open Food Facts',
      barcode: barcode,
      name: product.product_name || product.product_name_en || null,
      brand: product.brands || null,
      category: product.categories_tags?.[0]?.replace('en:', '') || null,
      imageUrl: product.image_url || product.image_front_url || null,
      quantity: product.quantity || null,
      description: product.generic_name || product.generic_name_en || null,
      // Additional useful fields
      ingredients: product.ingredients_text || null,
      nutrition: product.nutriments ? {
        calories: product.nutriments['energy-kcal_100g'],
        protein: product.nutriments.proteins_100g,
        carbs: product.nutriments.carbohydrates_100g,
        fat: product.nutriments.fat_100g
      } : null
    };
  } catch (error) {
    console.error('Open Food Facts lookup error:', error.message);
    return null;
  }
}

/**
 * Look up product in UPC Database (free tier available)
 * BEST coverage for general products: electronics, household, clothing, etc.
 */
async function lookupUPCDatabase(barcode) {
  try {
    // UPC Database API - free tier has limited requests but good coverage
    const response = await fetch(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${barcode}`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'BeepBeepCheap/1.0'
        }
      }
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    
    if (!data.items || data.items.length === 0) {
      return null;
    }
    
    const item = data.items[0];
    
    return {
      source: 'UPC Database',
      barcode: barcode,
      name: item.title || null,
      brand: item.brand || null,
      category: item.category || null,
      imageUrl: item.images?.[0] || null,
      description: item.description || null,
      // Additional fields from UPC Database
      model: item.model || null,
      color: item.color || null,
      size: item.size || null,
      weight: item.weight || null,
      lowestPrice: item.lowest_recorded_price || null,
      highestPrice: item.highest_recorded_price || null
    };
  } catch (error) {
    console.error('UPC Database lookup error:', error.message);
    return null;
  }
}

/**
 * Look up product in Open Beauty Facts (free, no API key needed)
 * Great for cosmetics, skincare, haircare, perfumes, etc.
 */
async function lookupOpenBeautyFacts(barcode) {
  try {
    const response = await fetch(
      `https://world.openbeautyfacts.org/api/v0/product/${barcode}.json`,
      {
        headers: {
          'User-Agent': 'BeepBeepCheap/1.0 (price-tracker-app)'
        }
      }
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    
    if (data.status !== 1 || !data.product) {
      return null;
    }
    
    const product = data.product;
    
    return {
      source: 'Open Beauty Facts',
      barcode: barcode,
      name: product.product_name || product.product_name_en || null,
      brand: product.brands || null,
      category: product.categories_tags?.[0]?.replace('en:', '') || null,
      imageUrl: product.image_url || product.image_front_url || null,
      quantity: product.quantity || null,
      description: product.generic_name || null
    };
  } catch (error) {
    console.error('Open Beauty Facts lookup error:', error.message);
    return null;
  }
}

/**
 * Look up product in Open Products Facts (free, no API key needed)
 * General products database - electronics, household items, etc.
 */
async function lookupOpenProductsFacts(barcode) {
  try {
    const response = await fetch(
      `https://world.openproductsfacts.org/api/v0/product/${barcode}.json`,
      {
        headers: {
          'User-Agent': 'BeepBeepCheap/1.0 (price-tracker-app)'
        }
      }
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    
    if (data.status !== 1 || !data.product) {
      return null;
    }
    
    const product = data.product;
    
    return {
      source: 'Open Products Facts',
      barcode: barcode,
      name: product.product_name || product.product_name_en || null,
      brand: product.brands || null,
      category: product.categories_tags?.[0]?.replace('en:', '') || null,
      imageUrl: product.image_url || product.image_front_url || null,
      quantity: product.quantity || null,
      description: product.generic_name || null
    };
  } catch (error) {
    console.error('Open Products Facts lookup error:', error.message);
    return null;
  }
}

/**
 * Validate if a string looks like a valid barcode
 * @param {string} code - The potential barcode
 * @returns {boolean} True if it looks like a valid barcode
 */
export function isValidBarcode(code) {
  if (!code || typeof code !== 'string') return false;
  
  // Clean the code
  const clean = code.replace(/[\s\-]/g, '');
  
  // Check if it's all digits
  if (!/^\d+$/.test(clean)) return false;
  
  // Common barcode lengths:
  // UPC-A: 12 digits
  // EAN-13: 13 digits
  // EAN-8: 8 digits
  // UPC-E: 6-8 digits
  const validLengths = [6, 7, 8, 12, 13, 14];
  
  return validLengths.includes(clean.length);
}

