/**
 * Brand Service - Dynamic brand search (no hardcoded database!)
 * 
 * Instead of maintaining a list of brands, we:
 * 1. Accept any brand/shop name from the user
 * 2. Use Google search with brand + product to find results
 * 3. Let Google's algorithms find the most relevant (often official) stores
 */

/**
 * Normalize a brand name for search
 */
function normalizeBrand(brand) {
  if (!brand) return null;
  return brand
    .replace(/[''']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build a Google search query combining brand and product
 * @param {string} brandName - The brand/shop name (any name works!)
 * @param {string} productDescription - Product description
 * @returns {object} - { searchQuery, googleSearchUrl }
 */
export function buildBrandSearch(brandName, productDescription) {
  const brand = normalizeBrand(brandName);
  const product = productDescription?.trim() || '';
  
  // Combine brand + product for search
  // Adding "official" or "store" helps Google prioritize official sources
  const searchQuery = brand 
    ? `${brand} ${product}`.trim()
    : product;
  
  const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
  
  return {
    success: true,
    searchQuery,
    googleSearchUrl,
    brandName: brand
  };
}

/**
 * For backwards compatibility - returns null since we don't use a database
 * The route will handle any brand dynamically
 */
export function getBrandInfo(brandName) {
  // No database - we handle all brands dynamically
  // Return a simple object so the route knows we "know" this brand
  if (!brandName) return null;
  
  return {
    name: normalizeBrand(brandName),
    dynamic: true // Flag that this is dynamic, not from a database
  };
}

/**
 * Check if a URL looks like it might be from a specific brand
 * Used to prioritize results that match the brand name
 */
export function urlMatchesBrand(url, brandName) {
  if (!url || !brandName) return false;
  
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const brand = brandName.toLowerCase()
      .replace(/[^a-z0-9]/g, '') // Remove special chars
      .replace(/\s+/g, '');
    
    // Check if hostname contains the brand name
    return hostname.includes(brand);
  } catch {
    return false;
  }
}

