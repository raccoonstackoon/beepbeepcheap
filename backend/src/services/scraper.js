import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Add stealth plugin to avoid bot detection
puppeteer.use(StealthPlugin());

/**
 * Extract store name from URL
 */
function getStoreName(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    
    const storeMap = {
      'amazon': 'Amazon',
      'walmart': 'Walmart',
      'target': 'Target',
      'bestbuy': 'Best Buy',
      'costco': 'Costco',
      'homedepot': 'Home Depot',
      'lowes': "Lowe's",
      'macys': "Macy's",
      'nordstrom': 'Nordstrom',
      'kohls': "Kohl's",
      'ebay': 'eBay',
      'etsy': 'Etsy',
      'wayfair': 'Wayfair',
      'ikea': 'IKEA',
      'newegg': 'Newegg',
      'bhphotovideo': 'B&H Photo',
      'adorama': 'Adorama',
      'zappos': 'Zappos',
      'nike': 'Nike',
      'adidas': 'Adidas',
      'apple': 'Apple',
      'samsung': 'Samsung',
      'lg': 'LG',
      'currys': 'Currys',
      'argos': 'Argos',
      'johnlewis': 'John Lewis',
      'ao': 'AO',
      'sephora': 'Sephora',
      'ulta': 'Ulta',
      'rei': 'REI',
      'dickssportinggoods': "Dick's Sporting Goods",
      'gamestop': 'GameStop',
      'staples': 'Staples',
      'officedepot': 'Office Depot',
      'microcenter': 'Micro Center',
      // H&M Group brands
      'cos.com': 'COS',
      'hm.com': 'H&M',
      'stories.com': '& Other Stories',
      'arket.com': 'ARKET',
      // Other fashion
      'zara.com': 'Zara',
      'uniqlo.com': 'Uniqlo',
      'asos.com': 'ASOS',
      'net-a-porter': 'Net-a-Porter',
      'mrporter': 'Mr Porter',
      'ssense': 'SSENSE',
      'farfetch': 'Farfetch',
      'revolve': 'Revolve',
    };
    
    for (const [key, name] of Object.entries(storeMap)) {
      if (hostname.includes(key)) {
        return name;
      }
    }
    
    // Extract domain name as fallback
    const parts = hostname.replace('www.', '').split('.');
    if (parts.length > 0) {
      return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    }
    
    return 'Unknown Store';
  } catch {
    return 'Unknown Store';
  }
}

/**
 * Scrapes product information from a URL
 * Uses multiple strategies to find price, name, and image
 */
export async function scrapeProduct(url) {
  let browser;
  
  try {
    console.log(`🔍 Starting scrape for: ${url}`);
    
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080'
      ]
    });
    
    const page = await browser.newPage();
    
    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Set a realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    
    // Set extra headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    });
    
    // Set cookies for sites that require country/region selection
    if (url.includes('cos.com') || url.includes('hm.com')) {
      await page.setCookie(
        { name: 'HMCORP_locale', value: 'en_US', domain: '.cos.com' },
        { name: 'HMCORP_currency', value: 'USD', domain: '.cos.com' },
        { name: 'HMCORP_country', value: 'US', domain: '.cos.com' },
        { name: 'HMCORP_locale', value: 'en_US', domain: '.hm.com' },
      );
    }
    
    // Navigate to the URL with timeout
    await page.goto(url, { 
      waitUntil: 'domcontentloaded',
      timeout: 45000 
    });
    
    // Wait for page to stabilize - longer for fashion sites with more JS
    const fashionSites = ['cos.com', 'hm.com', 'zara.com', 'asos.com', 'stories.com', 'arket.com', 'uniqlo.com'];
    const isFashionSite = fashionSites.some(site => url.includes(site));
    await new Promise(resolve => setTimeout(resolve, isFashionSite ? 5000 : 3000));
    
    // Handle cookie consent and location popups for fashion sites
    if (isFashionSite) {
      try {
        // Try to accept cookies - common button texts
        const cookieSelectors = [
          'button[id*="accept"]',
          'button[id*="cookie"]',
          'button[class*="accept"]',
          'button[class*="consent"]',
          '[data-testid="accept-cookies"]',
          '#onetrust-accept-btn-handler',
          '.onetrust-accept-btn',
          'button:has-text("Accept")',
          'button:has-text("Accept All")',
          'button:has-text("Accept Cookies")',
          'button:has-text("I Accept")',
          'button:has-text("OK")',
        ];
        
        for (const selector of cookieSelectors) {
          try {
            const btn = await page.$(selector);
            if (btn) {
              await btn.click();
              console.log(`Clicked cookie consent button: ${selector}`);
              await new Promise(resolve => setTimeout(resolve, 1000));
              break;
            }
          } catch (e) {}
        }
        
        // For LG - handle cookie consent and wait for dynamic content
        if (url.includes('lg.com')) {
          try {
            // Accept cookies if present
            await page.evaluate(() => {
              const acceptButtons = document.querySelectorAll('button[id*="accept"], button[class*="accept"], .cookie-accept, #onetrust-accept-btn-handler');
              for (const btn of acceptButtons) {
                if (btn.textContent.toLowerCase().includes('accept')) {
                  btn.click();
                  break;
                }
              }
            });
            console.log('Attempted to accept LG cookies');
            
            // Wait for product content to load
            await page.waitForSelector('.price-area, .product-title, [class*="product-price"]', { timeout: 10000 }).catch(() => {});
            await new Promise(resolve => setTimeout(resolve, 3000));
          } catch (e) {
            console.log('Error handling LG:', e.message);
          }
        }
        
        // For Zara - close any greeting/welcome popup and wait for product content
        if (url.includes('zara.com')) {
          try {
            // Close the "Hello" greeting popup
            await page.evaluate(() => {
              // Look for close buttons on modals/popups
              const closeButtons = document.querySelectorAll('button[aria-label="Close"], button[class*="close"], [class*="modal"] button, [class*="popup"] button');
              for (const btn of closeButtons) {
                btn.click();
              }
              
              // Also try clicking outside modals
              const overlays = document.querySelectorAll('[class*="overlay"], [class*="backdrop"]');
              for (const overlay of overlays) {
                overlay.click();
              }
            });
            console.log('Attempted to close Zara popups');
            
            // Wait for product content to load
            await page.waitForSelector('.product-detail-view, .product-detail-info, [class*="product-detail"]', { timeout: 10000 }).catch(() => {});
            
            await new Promise(resolve => setTimeout(resolve, 2000));
          } catch (e) {
            console.log('Error handling Zara:', e.message);
          }
        }
        
        // For COS specifically - handle country selector
        if (url.includes('cos.com')) {
          try {
            // Try clicking on USA in the country selector
            await page.evaluate(() => {
              // Look for USA/United States link
              const links = document.querySelectorAll('a');
              for (const link of links) {
                if (link.textContent.includes('United States') || 
                    link.href?.includes('en_usd') ||
                    link.href?.includes('/us/')) {
                  link.click();
                  return true;
                }
              }
              
              // Try buttons
              const buttons = document.querySelectorAll('button');
              for (const btn of buttons) {
                if (btn.textContent.includes('United States') || 
                    btn.textContent.includes('USA')) {
                  btn.click();
                  return true;
                }
              }
              return false;
            });
            
            console.log('Attempted to select US country');
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Check if we're still on the country selector page
            const pageTitle = await page.title();
            if (pageTitle.includes('Select') || pageTitle.includes('Country')) {
              // Try refreshing the page with the US URL
              const usUrl = url.replace('en_gb', 'en_usd').replace('/gb/', '/us/');
              if (usUrl !== url) {
                console.log(`Navigating to US URL: ${usUrl}`);
                await page.goto(usUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await new Promise(resolve => setTimeout(resolve, 3000));
              }
            }
          } catch (e) {
            console.log('Error handling COS country selector:', e.message);
          }
        }
        
        // Wait a bit more after handling popups
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (e) {
        console.log('Error handling popups:', e.message);
      }
    }
    
    // Get store name from URL
    const storeName = getStoreName(url);
    console.log(`📍 Store detected: ${storeName}`);
    
    // Extract product information with store-specific and generic strategies
    const productInfo = await page.evaluate((store) => {
      // Helper to clean price string and extract number
      const cleanPrice = (priceStr) => {
        if (!priceStr) return null;
        // Remove currency symbols and extract number
        const cleaned = priceStr.replace(/[^0-9.,]/g, '');
        // Handle different number formats
        const match = cleaned.match(/(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)/);
        if (match) {
          return parseFloat(match[0].replace(/,/g, ''));
        }
        return null;
      };
      
      // Stores where JSON-LD structured data is more reliable than DOM selectors
      const jsonLdPriorityStores = ['LG', 'Lg'];
      
      // Helper to get text content safely
      const getText = (selector) => {
        const el = document.querySelector(selector);
        return el ? el.textContent.trim() : null;
      };
      
      // Helper to get all matching text
      const getAllText = (selector) => {
        const els = document.querySelectorAll(selector);
        return Array.from(els).map(el => el.textContent.trim()).filter(Boolean);
      };
      
      // Helper to get attribute safely
      const getAttr = (selector, attr) => {
        const el = document.querySelector(selector);
        return el ? el.getAttribute(attr) : null;
      };
      
      // ========== PRICE EXTRACTION ==========
      let price = null;
      
      // Helper to extract price from JSON-LD structured data
      const getJsonLdPrice = () => {
        try {
          const ldJsonElements = document.querySelectorAll('script[type="application/ld+json"]');
          for (const ldJson of ldJsonElements) {
            const data = JSON.parse(ldJson.textContent);
            const items = Array.isArray(data) ? data : [data];
            for (const item of items) {
              const product = item['@type'] === 'Product' ? item : null;
              if (product?.offers) {
                const offers = Array.isArray(product.offers) ? product.offers : [product.offers];
                for (const offer of offers) {
                  if (offer.price) {
                    return parseFloat(offer.price);
                  }
                }
              }
            }
          }
        } catch (e) {}
        return null;
      };
      
      // For certain stores, prioritize JSON-LD as it's more accurate
      if (jsonLdPriorityStores.includes(store)) {
        price = getJsonLdPrice();
        if (price) {
          console.log(`Found price from JSON-LD for ${store}: ${price}`);
        }
        
        // For LG specifically, also try to find price in inline JavaScript/JSON data
        if (!price && (store === 'LG' || store === 'Lg')) {
          const pageHtml = document.documentElement.innerHTML;
          // Look for schema.org Offer pattern: "price":"1749" or "price": "1749"
          const offerMatch = pageHtml.match(/"@type"\s*:\s*"Offer"[^}]*"price"\s*:\s*"?(\d+(?:\.\d+)?)"?/);
          if (offerMatch && offerMatch[1]) {
            price = parseFloat(offerMatch[1]);
            console.log(`Found LG price from inline schema: ${price}`);
          }
          // Also try GBP price pattern
          if (!price) {
            const gbpMatch = pageHtml.match(/"priceCurrency"\s*:\s*"GBP"[^}]*"price"\s*:\s*"?(\d+(?:\.\d+)?)"?/);
            if (gbpMatch && gbpMatch[1]) {
              price = parseFloat(gbpMatch[1]);
            }
          }
        }
      }
      
      // Store-specific price selectors
      const storePriceSelectors = {
        'Amazon': [
          '.a-price .a-offscreen:first-of-type',
          '#corePrice_feature_div .a-offscreen:first-of-type',
          '#corePriceDisplay_desktop_feature_div .a-offscreen:first-of-type',
          '.priceToPay .a-offscreen',
          '#priceblock_ourprice',
          '#priceblock_dealprice',
          '#priceblock_saleprice',
          '.apexPriceToPay .a-offscreen',
          '#apex_offerDisplay_desktop .a-offscreen',
          '.a-price[data-a-color="price"] .a-offscreen',
          '.a-price[data-a-color="base"] .a-offscreen',
          '.a-color-price',
          '#buyNewSection .a-color-price',
          '#newBuyBoxPrice',
        ],
        'Walmart': [
          '[itemprop="price"]',
          '[data-testid="price-wrap"] span',
          '.price-characteristic',
          '[data-automation="buybox-price"]',
          '.prod-PriceHero .price-group',
          '.price .visuallyhidden',
          '[data-testid="current-price"]',
        ],
        'Target': [
          '[data-test="product-price"]',
          '[data-test="product-price"] span',
          '.h-text-lg',
          '.styles__CurrentPriceFontSize',
          '[data-test="current-price"]',
        ],
        'Best Buy': [
          '.priceView-hero-price span:first-of-type',
          '.priceView-customer-price span:first-of-type',
          '[data-testid="customer-price"] span',
          '.pricing-price__regular-price',
        ],
        // COS and H&M Group brands
        'COS': [
          '.product-price .price-value',
          '.product-price span',
          '[data-testid="product-price"]',
          '.price span',
          '.ProductPrice-module_productPrice',
          '[class*="ProductPrice"] span',
          '[class*="productPrice"]',
          '.m-product-price',
        ],
        'H&M': [
          '.ProductPrice-module_productPrice',
          '[data-testid="product-price"]',
          '.product-item-price span',
          '.price-value',
        ],
        // Other fashion retailers
        'Zara': [
          '.price__amount-current',
          '.money-amount__main',
          '[data-qa-qualifier="price-amount-current"]',
          '.product-detail-info__price .money-amount__main',
          '[class*="price"] [class*="amount"]',
          '.price-current__amount',
        ],
        'Uniqlo': [
          '.price-sales',
          '.product-price .price',
          '[data-test="product-price"]',
        ],
        'LG': [
          '.price-area .price',
          '.price-area .total',
          '.price-box .price',
          '[class*="PriceArea"] .price',
          '[class*="price-area"] span',
          '.product-price .price',
          '[data-price]',
          '.purchase-price',
          '.pdp-price',
          '.price-value',
          'span[class*="Price"]',
        ],
        'ASOS': [
          '[data-testid="current-price"]',
          '.product-price-current',
          '.current-price',
        ],
      };
      
      // Try store-specific selectors (skip if we already have a price from JSON-LD priority)
      if (!price) {
        const storeSelectors = storePriceSelectors[store] || [];
        for (const selector of storeSelectors) {
          try {
            const priceText = getText(selector);
            const parsedPrice = cleanPrice(priceText);
            if (parsedPrice && parsedPrice > 0 && parsedPrice < 100000) {
              price = parsedPrice;
              console.log(`Found price with selector ${selector}: ${price}`);
              break;
            }
          } catch (e) {}
        }
      }
      
      // Generic price selectors as fallback
      if (!price) {
        const genericPriceSelectors = [
          '[itemprop="price"]',
          '[data-price]',
          '.price',
          '.product-price',
          '.current-price',
          '.sale-price',
          '.regular-price',
          '.price-current',
          '.price__current',
          '.ProductPrice',
          '.product__price',
          'span[class*="price"]',
          'div[class*="price"]',
          '[class*="Price"]',
        ];
        
        for (const selector of genericPriceSelectors) {
          try {
            const priceText = getText(selector);
            const parsedPrice = cleanPrice(priceText);
            if (parsedPrice && parsedPrice > 0 && parsedPrice < 100000) {
              price = parsedPrice;
              break;
            }
          } catch (e) {}
        }
      }
      
      // Try to find price from page text using regex
      if (!price) {
        const bodyText = document.body.innerText;
        const priceMatches = bodyText.match(/\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g);
        if (priceMatches && priceMatches.length > 0) {
          // Try to find a reasonable price (not too small, not too large)
          for (const match of priceMatches) {
            const parsed = cleanPrice(match);
            if (parsed && parsed >= 1 && parsed <= 10000) {
              price = parsed;
              break;
            }
          }
        }
      }
      
      // Try meta tags
      if (!price) {
        const metaPrice = getAttr('meta[property="product:price:amount"]', 'content') ||
                         getAttr('meta[property="og:price:amount"]', 'content');
        if (metaPrice) {
          price = parseFloat(metaPrice);
        }
      }
      
      // Try JSON-LD structured data for price
      if (!price) {
        try {
          const ldJsonElements = document.querySelectorAll('script[type="application/ld+json"]');
          for (const ldJson of ldJsonElements) {
            const data = JSON.parse(ldJson.textContent);
            const items = Array.isArray(data) ? data : [data];
            for (const item of items) {
              const product = item['@type'] === 'Product' ? item : null;
              if (product?.offers) {
                const offers = Array.isArray(product.offers) ? product.offers : [product.offers];
                for (const offer of offers) {
                  if (offer.price) {
                    price = parseFloat(offer.price);
                    break;
                  }
                }
              }
              if (price) break;
            }
            if (price) break;
          }
        } catch (e) {}
      }
      
      // ========== NAME EXTRACTION ==========
      let name = null;
      
      // Store-specific name selectors
      const storeNameSelectors = {
        'Amazon': [
          '#productTitle',
          '#title span',
          '#title',
          'h1.a-size-large',
        ],
        'Walmart': [
          '[itemprop="name"]',
          'h1.prod-ProductTitle',
          'h1[data-testid="product-title"]',
          '.prod-ProductTitle',
        ],
        'Target': [
          '[data-test="product-title"]',
          'h1[data-test="product-title"]',
          'h1.Heading',
        ],
        'Best Buy': [
          '.sku-title h1',
          'h1.heading-5',
          '.shop-product-title h1',
        ],
        // COS and H&M Group brands
        'COS': [
          '.product-name h1',
          '.ProductName-module_productName',
          '[data-testid="product-name"]',
          'h1[class*="ProductName"]',
          '.product-title',
          '[class*="productName"]',
          '.pdp-heading h1',
        ],
        'H&M': [
          '.ProductName-module_productName',
          '[data-testid="product-name"]',
          'h1.product-item-name',
        ],
        // Other fashion retailers
        'Zara': [
          '.product-detail-info__header-name',
          'h1.product-name',
          '.product-detail-view__main-info h1',
          '[class*="product-detail"] h1',
          '.product-detail-info__name',
          '[data-qa-qualifier="product-name"]',
        ],
        'Uniqlo': [
          '.product-name',
          'h1[data-test="product-name"]',
        ],
        'LG': [
          '.product-title h1',
          '.pdp-title h1',
          'h1.product-name',
          '.product-info h1',
          '[class*="product-title"]',
          '.model-title',
          '.model-name',
          'h1[class*="Title"]',
          '.product-name-area h1',
        ],
        'ASOS': [
          '[data-testid="product-name"]',
          '.product-hero h1',
          '#aside-content h1',
        ],
      };
      
      // Try store-specific selectors first
      const storeNameSels = storeNameSelectors[store] || [];
      for (const selector of storeNameSels) {
        try {
          const nameText = getText(selector);
          if (nameText && nameText.length > 3 && nameText.length < 500) {
            name = nameText;
            break;
          }
        } catch (e) {}
      }
      
      // Generic name selectors as fallback
      if (!name) {
        const genericNameSelectors = [
          'h1[itemprop="name"]',
          '[itemprop="name"]',
          'h1.product-title',
          'h1.product-name',
          'h1[class*="product"]',
          'h1[class*="title"]',
          'h1[class*="Product"]',
          'h1[class*="Title"]',
          '.product-name h1',
          '.product-title h1',
          'h1',
        ];
        
        for (const selector of genericNameSelectors) {
          try {
            const nameText = getText(selector);
            if (nameText && nameText.length > 3 && nameText.length < 500) {
              name = nameText;
              break;
            }
          } catch (e) {}
        }
      }
      
      // List of invalid names that indicate we didn't find the real product name
      const invalidNames = [
        'Shop Women', 'Shop Men', 'Hello,', 'Hello', 'Welcome',
        'Select your country', 'Choose a country', 'Sign in',
        'Log in', 'Register', 'Create account', 'Search engine',
        'Search', 'Home', 'Cart', 'Checkout', 'My Account',
        'Access Denied', 'Oops!!', 'Oops', "We've noticed", 'unusual activity',
        'Error', 'Page not found', '404', 'Forbidden', 'Blocked'
      ];
      
      const isInvalidName = (n) => {
        if (!n || n.length < 3) return true;
        return invalidNames.some(invalid => n.toLowerCase().includes(invalid.toLowerCase()));
      };
      
      // Try og:title as fallback - try this earlier for fashion sites
      if (isInvalidName(name)) {
        const ogTitle = getAttr('meta[property="og:title"]', 'content');
        if (ogTitle && !isInvalidName(ogTitle)) {
          name = ogTitle;
        }
      }
      
      // Also try product schema
      if (isInvalidName(name)) {
        try {
          const ldJsonElements = document.querySelectorAll('script[type="application/ld+json"]');
          for (const ldJson of ldJsonElements) {
            const data = JSON.parse(ldJson.textContent);
            const items = Array.isArray(data) ? data : [data];
            for (const item of items) {
              const product = item['@type'] === 'Product' ? item : null;
              if (product?.name && !isInvalidName(product.name)) {
                name = product.name;
                break;
              }
            }
            if (!isInvalidName(name)) break;
          }
        } catch (e) {}
      }
      
      // ========== IMAGE EXTRACTION ==========
      let imageUrl = null;
      
      // Store-specific image selectors
      const storeImageSelectors = {
        'Amazon': [
          '#landingImage',
          '#imgBlkFront',
          '#main-image',
          '.a-dynamic-image',
          '#imageBlock img',
          '#imgTagWrapperId img',
          '.image-wrapper img',
        ],
        'Walmart': [
          '[data-testid="hero-image"] img',
          '.hover-zoom-hero-image img',
          '.prod-hero-image img',
          '[data-testid="media-thumbnail"] img:first-of-type',
        ],
        'Target': [
          '[data-test="product-image"] img',
          '.slideDeckPicture img',
          '.styles__ProductImage img',
        ],
        'Best Buy': [
          '.primary-image img',
          '.shop-media-gallery img:first-of-type',
          '[data-testid="product-image"] img',
        ],
        // COS and H&M Group brands - they use specific gallery structures
        'COS': [
          '.product-detail-main-image-container img',
          '.product-image img',
          '[data-testid="product-image"] img',
          '.ProductImage-module_productImage img',
          '[class*="ProductImage"] img',
          '.pdp-image img',
          '.product-gallery img:first-of-type',
          '.slider-item img:first-of-type',
          'picture.product-image img',
          'picture.product-image source',
          '.a-image img',
        ],
        'H&M': [
          '.ProductImage-module_productImage img',
          '[data-testid="product-image"] img',
          '.product-detail-main-image img',
        ],
        // Other fashion retailers
        'Zara': [
          '.media-image img',
          '.product-media img:first-of-type',
          '[class*="media-image"] img',
          '.product-detail-images img:first-of-type',
          '[class*="product-detail"] img:first-of-type',
          '.media__wrapper img',
          'picture.media-image img',
          'picture.media-image source',
        ],
        'Uniqlo': [
          '.product-image img',
          '[data-test="product-image"] img',
        ],
        'LG': [
          // LG product detail page specific selectors
          '.visual-area .swiper-slide img[src*="product"], .visual-area .swiper-slide img[src*="styler"]',
          '.visual-area img[src*="product"], .visual-area img[src*="styler"]',
          '[class*="gallery"] img[src*="product"]',
          '.product-image img[src*="product"]',
          '.pdp-image img',
          '[class*="product-gallery"] img',
          '.carousel-item img[src*="product"]',
          '.slick-slide img[src*="product"]',
          '[class*="ProductImage"] img',
          '.gallery-area img',
          '.main-image img',
          // Fallback - any large product image
          'img[src*="/laundry/"][src*=".jpg"]',
          'img[src*="/styler/"][src*=".jpg"]',
          'img[src*="/tv/"][src*=".jpg"]',
        ],
        'ASOS': [
          '[data-testid="primary-image"] img',
          '.gallery-image img:first-of-type',
        ],
      };
      
      // Helper to extract best image URL from an element
      const extractImageUrl = (el) => {
        if (!el) return null;
        
        // Try various attributes
        const attrs = ['src', 'data-src', 'data-lazy-src', 'data-old-hires', 'data-a-dynamic-image', 'data-srcset', 'srcset'];
        
        for (const attr of attrs) {
          let src = el.getAttribute(attr);
          if (!src) continue;
          
          // Handle Amazon's dynamic image JSON
          if (src.startsWith('{')) {
            try {
              const imgObj = JSON.parse(src);
              const urls = Object.keys(imgObj);
              if (urls.length > 0) {
                return urls[0];
              }
            } catch (e) {}
            continue;
          }
          
          // Handle srcset - get the largest image
          if (attr === 'srcset' || attr === 'data-srcset') {
            const srcsetParts = src.split(',').map(s => s.trim());
            let bestUrl = null;
            let bestSize = 0;
            for (const part of srcsetParts) {
              const [url, sizeStr] = part.split(/\s+/);
              const size = parseInt(sizeStr) || 0;
              if (url && (size > bestSize || !bestUrl)) {
                bestUrl = url;
                bestSize = size;
              }
            }
            if (bestUrl) {
              return bestUrl.startsWith('//') ? 'https:' + bestUrl : bestUrl;
            }
            continue;
          }
          
          // Regular URL
          if (src.startsWith('http') || src.startsWith('//')) {
            return src.startsWith('//') ? 'https:' + src : src;
          }
        }
        
        return null;
      };
      
      // Try store-specific selectors first
      const storeImageSels = storeImageSelectors[store] || [];
      for (const selector of storeImageSels) {
        try {
          const el = document.querySelector(selector);
          const url = extractImageUrl(el);
          if (url) {
            imageUrl = url;
            break;
          }
          
          // Also check for picture > source elements
          if (selector.includes('picture') || el?.tagName === 'PICTURE') {
            const source = el?.querySelector('source') || document.querySelector(selector.replace('img', 'source'));
            const sourceUrl = extractImageUrl(source);
            if (sourceUrl) {
              imageUrl = sourceUrl;
              break;
            }
          }
        } catch (e) {}
      }
      
      // Generic image selectors as fallback
      if (!imageUrl) {
        const genericImageSelectors = [
          'img[itemprop="image"]',
          '.product-image img',
          '.main-image img',
          '[class*="product"] img',
          '[class*="gallery"] img:first-of-type',
          '.pdp-image img',
          'img.primary',
          '[class*="ProductImage"] img',
          '[class*="product-image"] img',
          'picture source',
          'picture img',
        ];
        
        for (const selector of genericImageSelectors) {
          try {
            const el = document.querySelector(selector);
            const url = extractImageUrl(el);
            if (url) {
              imageUrl = url;
              break;
            }
          } catch (e) {}
        }
      }
      
      // Helper to check if an image URL is likely a product image (not a logo/icon/banner)
      const isValidProductImage = (url) => {
        if (!url) return false;
        const lowerUrl = url.toLowerCase();
        // Filter out obvious logos and icons
        if (lowerUrl.includes('logo') || lowerUrl.includes('icon') || lowerUrl.includes('.svg')) {
          return false;
        }
        // Filter out tiny images
        if (lowerUrl.includes('1x1') || lowerUrl.includes('pixel')) {
          return false;
        }
        // Filter out promotional/banner images
        if (lowerUrl.includes('promotion') || lowerUrl.includes('banner') || lowerUrl.includes('promo')) {
          return false;
        }
        // Filter out small marketing images (often banners with dimensions in filename)
        if (lowerUrl.match(/\d+x\d+/) && !lowerUrl.includes('product')) {
          const sizeMatch = lowerUrl.match(/(\d+)x(\d+)/);
          if (sizeMatch) {
            const width = parseInt(sizeMatch[1]);
            const height = parseInt(sizeMatch[2]);
            // Banner-like aspect ratios (very wide or very small)
            if (width < 300 || height < 300 || width / height > 3 || height / width > 3) {
              return false;
            }
          }
        }
        return true;
      };
      
      // For stores where JSON-LD image is more reliable, try that first
      if (jsonLdPriorityStores.includes(store)) {
        try {
          const ldJsonElements = document.querySelectorAll('script[type="application/ld+json"]');
          for (const ldJson of ldJsonElements) {
            const data = JSON.parse(ldJson.textContent);
            const items = Array.isArray(data) ? data : [data];
            for (const item of items) {
              const product = item['@type'] === 'Product' ? item : null;
              if (product?.image) {
                const img = Array.isArray(product.image) ? product.image[0] : product.image;
                if (typeof img === 'string' && img.startsWith('http') && isValidProductImage(img)) {
                  imageUrl = img;
                  console.log(`Found image from JSON-LD for ${store}: ${imageUrl}`);
                  break;
                } else if (img?.url && isValidProductImage(img.url)) {
                  imageUrl = img.url;
                  console.log(`Found image from JSON-LD for ${store}: ${imageUrl}`);
                  break;
                }
              }
            }
            if (imageUrl) break;
          }
        } catch (e) {}
      }
      
      // Check if current image is valid
      if (imageUrl && !isValidProductImage(imageUrl)) {
        imageUrl = null;
      }
      
      // Try og:image meta tag (often more reliable for complex sites)
      if (!imageUrl) {
        const ogImage = getAttr('meta[property="og:image"]', 'content');
        if (isValidProductImage(ogImage)) {
          imageUrl = ogImage;
        }
      }
      
      // Try twitter:image as fallback
      if (!imageUrl) {
        const twitterImage = getAttr('meta[name="twitter:image"]', 'content');
        if (isValidProductImage(twitterImage)) {
          imageUrl = twitterImage;
        }
      }
      
      // Try JSON-LD structured data for image
      if (!imageUrl) {
        try {
          const ldJsonElements = document.querySelectorAll('script[type="application/ld+json"]');
          for (const ldJson of ldJsonElements) {
            const data = JSON.parse(ldJson.textContent);
            const items = Array.isArray(data) ? data : [data];
            for (const item of items) {
              const product = item['@type'] === 'Product' ? item : null;
              if (product?.image) {
                const img = Array.isArray(product.image) ? product.image[0] : product.image;
                if (typeof img === 'string' && img.startsWith('http')) {
                  imageUrl = img;
                  break;
                } else if (img?.url) {
                  imageUrl = img.url;
                  break;
                }
              }
              if (imageUrl) break;
            }
            if (imageUrl) break;
          }
        } catch (e) {}
      }
      
      // Final fallback: try to extract name from URL for fashion sites
      if (isInvalidName(name)) {
        // Try to get name from URL path (e.g., /oversized-wool-blend-coat-p02010744.html)
        try {
          const urlPath = window.location.pathname;
          // Zara: /us/en/oversized-wool-blend-coat-p02010744.html
          // COS: /product.rounded-wool-longline-cardigan-beige.1228029001.html
          const patterns = [
            /\/([a-z][a-z0-9-]+)-p\d+\.html$/i,  // Zara pattern
            /\/product\.([a-z][a-z0-9-]+)\.\d+\.html$/i,  // COS pattern
            /\/([a-z][a-z0-9-]+)(?:-\d+)?\.html$/i,  // Generic pattern
            /\/p\/([a-z][a-z0-9-]+)/i,  // /p/product-name pattern
          ];
          
          for (const pattern of patterns) {
            const matches = urlPath.match(pattern);
            if (matches && matches[1] && matches[1].length > 3) {
              // Convert kebab-case to Title Case
              const extracted = matches[1]
                .split('-')
                .filter(word => word.length > 0)
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');
              if (extracted.length > 3 && !isInvalidName(extracted)) {
                name = extracted;
                break;
              }
            }
          }
        } catch (e) {}
      }
      
      // Also try document title as last resort
      if (isInvalidName(name)) {
        const title = document.title;
        if (title && !isInvalidName(title)) {
          // Clean up common suffixes for various stores
          name = title
            .replace(/\s*[\|–-]\s*(ZARA|COS|H&M|ASOS|Target|Walmart|Amazon|LG UK|LG).*$/i, '')
            .replace(/\s*[\|–-]\s*(United States|UK).*$/i, '')
            .trim();
          
          // For LG specifically, keep model number but format nicely
          if (name.includes('S3') || name.includes('OLED') || name.includes('Styler')) {
            // Good enough, keep it
          }
        }
      }
      
      return { name, price, imageUrl, pageTitle: document.title };
    }, storeName);
    
    await browser.close();
    
    console.log(`✅ Scrape complete:
  - Name: ${productInfo.name?.substring(0, 50)}...
  - Price: ${productInfo.price}
  - Image: ${productInfo.imageUrl ? 'Found' : 'Not found'}
  - Store: ${storeName}`);
    
    // Final name extraction if still missing (server-side)
    let finalName = productInfo.name;
    
    // Check if the name looks like just a model number (short alphanumeric)
    const looksLikeModelNumber = (name) => {
      if (!name) return true;
      // Model numbers are typically short and alphanumeric (e.g., S3BF, B09JQL3NWT)
      return name.length < 10 && /^[A-Z0-9]+$/i.test(name.replace(/\s/g, ''));
    };
    
    // Try to get better name from page title if current name is just a model number
    if (!finalName || finalName === 'Unknown Product' || finalName.length < 3 || looksLikeModelNumber(finalName)) {
      // Check if we have a page title from productInfo
      if (productInfo.pageTitle) {
        // Clean up the page title
        const cleanedTitle = productInfo.pageTitle
          .replace(/\s*[\|–-]\s*(ZARA|COS|H&M|ASOS|Target|Walmart|Amazon|LG UK|LG|Best Buy|Currys).*$/i, '')
          .replace(/\s*[\|–-]\s*(United States|UK).*$/i, '')
          .trim();
        
        if (cleanedTitle && cleanedTitle.length > 3 && !looksLikeModelNumber(cleanedTitle)) {
          finalName = cleanedTitle;
          console.log(`Extracted name from page title: ${finalName}`);
        }
      }
    }
    
    // URL-based extraction as last resort
    if (!finalName || finalName === 'Unknown Product' || finalName.length < 3) {
      try {
        const urlPath = new URL(url).pathname;
        // Zara: /us/en/oversized-wool-blend-coat-p02010744.html
        // COS: /product.rounded-wool-longline-cardigan-beige.1228029001.html
        const patterns = [
          /\/([a-z][a-z0-9-]+)-p\d+\.html$/i,  // Zara pattern
          /\/product\.([a-z][a-z0-9-]+)\.\d+\.html$/i,  // COS pattern
          /\/([a-z][a-z0-9-]+)(?:-\d+)?\.html$/i,  // Generic pattern
          /\/p\/([a-z][a-z0-9-]+)/i,  // /p/product-name pattern
          /\/dp\/([A-Z0-9]+)/i,  // Amazon ASIN
        ];
        
        for (const pattern of patterns) {
          const matches = urlPath.match(pattern);
          if (matches && matches[1] && matches[1].length > 3) {
            // Convert kebab-case to Title Case
            const extracted = matches[1]
              .split('-')
              .filter(word => word.length > 0)
              .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
              .join(' ');
            
            // Only use URL extraction if it's not a model number
            if (!looksLikeModelNumber(extracted)) {
              finalName = extracted;
              console.log(`Extracted name from URL: ${finalName}`);
              break;
            }
          }
        }
      } catch (e) {
        console.log('Error extracting name from URL:', e.message);
      }
    }
    
    return {
      success: true,
      name: finalName || 'Unknown Product',
      price: productInfo.price,
      imageUrl: productInfo.imageUrl,
      storeName,
      url
    };
    
  } catch (error) {
    if (browser) {
      await browser.close();
    }
    
    console.error('❌ Scraping error:', error.message);
    return {
      success: false,
      error: error.message,
      storeName: getStoreName(url),
      url
    };
  }
}

/**
 * Scrapes just the price from a URL (for price updates)
 */
export async function scrapePrice(url) {
  const result = await scrapeProduct(url);
  return result.success ? result.price : null;
}

/**
 * Store domain and search URL mapping
 */
/**
 * Search Google Lens with an image to find exact product matches
 * @param {string} imagePath - Path to the image file to search
 * @returns {object} - { success, productUrl, price, storeName, allResults }
 */
export async function searchGoogleLens(imagePath) {
  let browser;
  
  try {
    console.log(`🔍 Starting Google Lens visual search...`);
    console.log(`   Image: ${imagePath}`);
    
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080'
      ]
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    
    // Go directly to Google Lens
    console.log(`📍 Opening Google Lens...`);
    await page.goto('https://lens.google.com/', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    // Handle cookie consent if present (EU users)
    try {
      const consentSelectors = [
        'button[aria-label*="Accept"]',
        'button:has-text("Accept all")',
        '[aria-label="Accept all"]',
        'form[action*="consent"] button',
        '#L2AGLb' // Common Google consent button ID
      ];
      for (const sel of consentSelectors) {
        const btn = await page.$(sel);
        if (btn) {
          await btn.click();
          console.log(`   Accepted cookies`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          break;
        }
      }
    } catch (e) {}
    
    // Look for file input - Google Lens has a hidden file input
    console.log(`📤 Looking for upload input...`);
    
    // Wait a moment for page to fully render
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Find the file input (might be hidden)
    let fileInput = await page.$('input[type="file"]');
    
    // If no file input found, try clicking the upload area first
    if (!fileInput) {
      console.log(`   Clicking upload area...`);
      const uploadSelectors = [
        '[aria-label*="upload"]',
        '[aria-label*="Upload"]',
        '[data-action="upload"]',
        '.aAo3xb', // Lens upload button class
        '.DV7the',
        '.cB9M7',
        'button[jsaction*="upload"]',
        '[role="button"][tabindex="0"]'
      ];
      
      for (const sel of uploadSelectors) {
        try {
          const el = await page.$(sel);
          if (el) {
            await el.click();
            console.log(`   Clicked: ${sel}`);
            await new Promise(resolve => setTimeout(resolve, 1500));
            break;
          }
        } catch (e) {}
      }
      
      // Try to find file input again after clicking
      fileInput = await page.$('input[type="file"]');
    }
    
    // If still no file input, set one up to be intercepted
    if (!fileInput) {
      console.log(`   Creating file chooser listener...`);
      // Use file chooser interception
      const [fileChooser] = await Promise.all([
        page.waitForFileChooser({ timeout: 5000 }),
        // Click anywhere that might trigger upload
        page.evaluate(() => {
          // Try to trigger upload by clicking elements
          const uploadables = document.querySelectorAll('[role="button"], button, [tabindex="0"]');
          for (const el of uploadables) {
            const text = el.textContent?.toLowerCase() || '';
            const label = el.getAttribute('aria-label')?.toLowerCase() || '';
            if (text.includes('upload') || label.includes('upload') || text.includes('image') || label.includes('image')) {
              el.click();
              return;
            }
          }
          // Click center of page as fallback
          document.body.click();
        })
      ]).catch(async () => {
        // Fallback: look for any file input on page
        const inputs = await page.$$('input');
        for (const input of inputs) {
          const type = await input.evaluate(el => el.type);
          if (type === 'file') {
            return [{ accept: async (files) => await input.uploadFile(...files) }];
          }
        }
        return [null];
      });
      
      if (fileChooser) {
        await fileChooser.accept([imagePath]);
        console.log(`   Image uploaded via file chooser!`);
      } else {
        throw new Error('Could not find any way to upload image');
      }
    } else {
      // Upload using the found file input
      await fileInput.uploadFile(imagePath);
      console.log(`   Image uploaded via file input!`);
    }
    
    // Wait for results to load
    console.log(`⏳ Waiting for Lens results...`);
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Wait for visual matches or shopping results
    try {
      await page.waitForSelector('[data-lpage], [data-docid], .G19kAf, .isv-r, [data-ri]', { timeout: 15000 });
    } catch (e) {
      console.log(`   Still waiting for results...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    // Try to click on "Shopping" or "Products" tab if available
    try {
      const shoppingTab = await page.$('a[href*="tbm=shop"], [aria-label*="Shopping"], [data-hveid] span:has-text("Shopping")');
      if (shoppingTab) {
        await shoppingTab.click();
        await new Promise(resolve => setTimeout(resolve, 3000));
        console.log(`   Switched to Shopping tab`);
      }
    } catch (e) {}
    
    // Extract product results
    const results = await page.evaluate(() => {
      const items = [];
      
      // Helper to clean price
      const cleanPrice = (text) => {
        if (!text) return null;
        const match = text.match(/[£$€]?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/);
        if (match) {
          return parseFloat(match[1].replace(/,/g, ''));
        }
        return null;
      };
      
      // Try multiple result selectors (Google Lens results vary)
      const resultSelectors = [
        // Visual match results
        '.G19kAf', // Product cards
        '.isv-r', // Image results
        '[data-ri]', // Results with index
        '.Vd9M6', // Shopping results
        '[data-lpage]', // Linked pages
        '.sh-dgr__gr-auto', // Shopping grid
        '.sh-dlr__list-result', // Shopping list
      ];
      
      // Collect all potential result elements
      let resultElements = [];
      for (const selector of resultSelectors) {
        const els = document.querySelectorAll(selector);
        if (els.length > 0) {
          resultElements = [...resultElements, ...els];
        }
      }
      
      // Also look for any links with prices nearby
      const allLinks = document.querySelectorAll('a[href*="url?q="], a[href*="shopping"], a[data-lpage]');
      
      // Process each potential result
      for (const el of resultElements) {
        try {
          let title = '';
          let price = null;
          let store = '';
          let link = '';
          
          // Try to find title
          const titleEl = el.querySelector('h3, [class*="title"], [class*="name"], .DKV0Md, .mEiL2d');
          if (titleEl) title = titleEl.textContent.trim();
          
          // Try to find price
          const priceEl = el.querySelector('[class*="price"], .a8Pemb, .kHxwFf, .OFFNJ');
          if (priceEl) {
            price = cleanPrice(priceEl.textContent);
          }
          
          // Try to find store/source
          const storeEl = el.querySelector('[class*="merchant"], [class*="source"], .LbUacb, .zPEcBd');
          if (storeEl) store = storeEl.textContent.trim();
          
          // Try to find link
          const linkEl = el.querySelector('a[href]') || el.closest('a[href]');
          if (linkEl) {
            let href = linkEl.getAttribute('href');
            
            // Extract actual URL from Google redirect
            if (href.includes('url?q=')) {
              const urlMatch = href.match(/url\?q=([^&]+)/);
              if (urlMatch) {
                href = decodeURIComponent(urlMatch[1]);
              }
            }
            
            // Skip Google's own URLs
            if (!href.includes('google.com') && href.startsWith('http')) {
              link = href;
            }
          }
          
          if ((title || link) && (link || price)) {
            items.push({ title, price, store, link });
          }
        } catch (e) {}
      }
      
      // Also process direct links
      for (const linkEl of allLinks) {
        try {
          let href = linkEl.getAttribute('href');
          
          if (href.includes('url?q=')) {
            const urlMatch = href.match(/url\?q=([^&]+)/);
            if (urlMatch) {
              href = decodeURIComponent(urlMatch[1]);
            }
          }
          
          if (!href.includes('google.com') && href.startsWith('http')) {
            // Check for price in parent elements
            const parent = linkEl.closest('[class*="result"], [class*="card"], [data-ri]');
            let price = null;
            let store = '';
            
            if (parent) {
              const priceEl = parent.querySelector('[class*="price"]');
              if (priceEl) price = cleanPrice(priceEl.textContent);
              
              const storeEl = parent.querySelector('[class*="merchant"], [class*="source"]');
              if (storeEl) store = storeEl.textContent.trim();
            }
            
            const title = linkEl.textContent.trim() || linkEl.getAttribute('aria-label') || '';
            
            // Avoid duplicates
            if (!items.find(i => i.link === href)) {
              items.push({ title, price, store, link: href });
            }
          }
        } catch (e) {}
      }
      
      // Sort by price (cheapest first), items without price go last
      items.sort((a, b) => {
        if (a.price === null) return 1;
        if (b.price === null) return -1;
        return a.price - b.price;
      });
      
      return items.slice(0, 10); // Return top 10 results
    });
    
    await browser.close();
    
    console.log(`📊 Found ${results.length} products via Google Lens`);
    
    if (results.length > 0 && results[0].link) {
      const best = results[0];
      console.log(`✅ Best match from Google Lens:`);
      console.log(`   Product: ${best.title || 'Unknown'}`);
      console.log(`   Price: £${best.price || 'Unknown'}`);
      console.log(`   Store: ${best.store || 'Unknown'}`);
      console.log(`   URL: ${best.link}`);
      
      return {
        success: true,
        productUrl: best.link,
        productName: best.title,
        price: best.price,
        storeName: best.store,
        allResults: results,
        method: 'google_lens'
      };
    } else {
      console.log(`❌ No products found via Google Lens`);
      return {
        success: false,
        error: 'No products found via Google Lens',
        allResults: results,
        method: 'google_lens'
      };
    }
    
  } catch (error) {
    if (browser) {
      await browser.close();
    }
    
    console.error('❌ Google Lens search error:', error.message);
    return {
      success: false,
      error: error.message,
      method: 'google_lens'
    };
  }
}

/**
 * Search for a product using the ACTUAL IMAGE + brand name filter
 * Uploads image to Google Lens, then filters results by brand
 * 
 * @param {string} imagePath - Path to the product image file
 * @param {string} brandName - Brand/shop name to prioritize in results
 * @returns {object} - { success, productUrl, productName, price, storeName, allResults }
 */
export async function searchWithBrand(imagePath, brandName) {
  let browser;
  
  try {
    console.log(`📷 VISUAL SEARCH using actual image`);
    console.log(`   Image: ${imagePath}`);
    console.log(`   Brand filter: ${brandName || 'none'}`);
    
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080'
      ]
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    
    // Use TinEye for reverse image search (more reliable than Google for scraping)
    // Or use Bing Visual Search which is more scraping-friendly
    console.log(`🔍 Opening Bing Visual Search...`);
    await page.goto('https://www.bing.com/images', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Find and click the camera/image search icon
    console.log(`📷 Looking for image search button...`);
    const cameraButton = await page.$('#sb_sbip, [aria-label*="image"], [aria-label*="Image"], .sb_sbip, #sbiarea');
    if (cameraButton) {
      await cameraButton.click();
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Find the file input for image upload
    console.log(`📤 Uploading image...`);
    let uploaded = false;
    
    // Try to find file input directly
    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      await fileInput.uploadFile(imagePath);
      uploaded = true;
      console.log(`   ✓ Image uploaded via file input`);
    }
    
    if (!uploaded) {
      // Try clicking upload buttons/areas
      const uploadButtons = await page.$$('[aria-label*="upload"], [aria-label*="Upload"], #sb_fileinput, .sb_sbip');
      for (const btn of uploadButtons) {
        try {
          await btn.click();
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const input = await page.$('input[type="file"]');
          if (input) {
            await input.uploadFile(imagePath);
            uploaded = true;
            console.log(`   ✓ Image uploaded after clicking upload button`);
            break;
          }
        } catch (e) {}
      }
    }
    
    if (!uploaded) {
      throw new Error('Could not find image upload input');
    }
    
    // Wait for results to load
    console.log(`⏳ Waiting for visual search results...`);
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Try to wait for navigation if it happens
    try {
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
    } catch (e) {}
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Normalize brand name for filtering
    const brandLower = brandName ? brandName.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
    
    // Extract search results from Bing
    // Bing Visual Search often redirects to regular search with the identified product name
    const results = await page.evaluate((brandLower) => {
      const items = [];
      
      // Bing search result selectors
      // Main organic results are in <li class="b_algo">
      const resultContainers = document.querySelectorAll('li.b_algo, .b_algo, [class*="result"], article');
      
      for (const container of resultContainers) {
        // Find the main link in this result
        const link = container.querySelector('h2 a, h3 a, a[href^="http"]');
        if (!link) continue;
        
        let href = link.getAttribute('href');
        if (!href) continue;
        
        // Skip Bing/Microsoft own links
        if (href.includes('bing.com') || 
            href.includes('microsoft.com') ||
            href.includes('msn.com') ||
            href.includes('go.microsoft')) continue;
        
        // Get the title
        const h2 = container.querySelector('h2');
        let title = h2?.textContent?.trim() || link.textContent?.trim() || '';
        title = title.substring(0, 200).trim();
        
        if (title.length < 5) continue;
        
        // Check if URL/title contains the brand name
        let isFromBrand = false;
        let storeName = '';
        try {
          const hostname = new URL(href).hostname.toLowerCase();
          const titleLower = title.toLowerCase();
          isFromBrand = brandLower ? (hostname.includes(brandLower) || titleLower.includes(brandLower)) : false;
          storeName = hostname.replace('www.', '').split('.')[0];
          storeName = storeName.charAt(0).toUpperCase() + storeName.slice(1);
        } catch (e) {}
        
        // Avoid duplicates
        if (!items.find(i => i.link === href)) {
          items.push({
            title,
            link: href,
            storeName,
            isFromBrand,
            source: 'bing_visual_search'
          });
        }
      }
      
      // If no structured results, fall back to all external links
      if (items.length === 0) {
        const allLinks = document.querySelectorAll('a[href^="http"]');
        for (const link of allLinks) {
          let href = link.getAttribute('href');
          if (!href) continue;
          
          if (href.includes('bing.com') || 
              href.includes('microsoft.com') ||
              href.includes('msn.com')) continue;
          
          let title = link.getAttribute('aria-label') || 
                      link.textContent?.trim() || '';
          title = title.substring(0, 200).trim();
          
          if (title.length < 5) continue;
          
          let isFromBrand = false;
          let storeName = '';
          try {
            const hostname = new URL(href).hostname.toLowerCase();
            isFromBrand = brandLower ? (hostname.includes(brandLower) || title.toLowerCase().includes(brandLower)) : false;
            storeName = hostname.replace('www.', '').split('.')[0];
            storeName = storeName.charAt(0).toUpperCase() + storeName.slice(1);
          } catch (e) {}
          
          if (!items.find(i => i.link === href)) {
            items.push({ title, link: href, storeName, isFromBrand, source: 'bing_fallback' });
          }
        }
      }
      
      // Sort: brand matches FIRST
      items.sort((a, b) => {
        if (a.isFromBrand && !b.isFromBrand) return -1;
        if (!a.isFromBrand && b.isFromBrand) return 1;
        return 0;
      });
      
      return items.slice(0, 15);
    }, brandLower);
    
    console.log(`📊 Found ${results.length} visual matches`);
    
    // If brand specified, show how many matched
    if (brandName) {
      const brandMatches = results.filter(r => r.isFromBrand);
      console.log(`   ${brandMatches.length} from brand "${brandName}"`);
    }
    
    // If no results from Bing page extraction, Bing still gave us the product name in the URL!
    // Extract it and do a simple search
    if (results.length === 0) {
      const pageUrl = page.url();
      const pageTitle = await page.title();
      console.log(`   Page URL: ${pageUrl}`);
      console.log(`   Page title: ${pageTitle}`);
      
      // Extract the search query from Bing's URL - this is the product name it identified!
      const urlMatch = pageUrl.match(/[?&]q=([^&]+)/);
      if (urlMatch) {
        const identifiedProduct = decodeURIComponent(urlMatch[1].replace(/\+/g, ' '));
        console.log(`   📝 Bing identified product as: "${identifiedProduct}"`);
        
        // Now search DuckDuckGo with this identified product name
        console.log(`   🔄 Falling back to DuckDuckGo search...`);
        
        const ddgUrl = `https://duckduckgo.com/?q=${encodeURIComponent(identifiedProduct)}&ia=web`;
        await page.goto(ddgUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Extract DuckDuckGo results
        const ddgResults = await page.evaluate((brandLower) => {
          const items = [];
          const links = document.querySelectorAll('a[href^="http"]');
          
          for (const link of links) {
            let href = link.getAttribute('href');
            if (!href) continue;
            
            if (href.includes('duckduckgo.com') || href.includes('duck.co')) continue;
            
            // Extract from DDG redirect
            if (href.includes('uddg=')) {
              const match = href.match(/uddg=([^&]+)/);
              if (match) href = decodeURIComponent(match[1]);
            }
            
            if (!href.startsWith('http')) continue;
            
            // Get title from parent
            const parent = link.closest('article, div, li');
            let title = parent?.querySelector('h2, h3')?.textContent?.trim() || 
                        link.textContent?.trim() || '';
            title = title.substring(0, 200);
            if (title.length < 5) continue;
            
            let isFromBrand = false;
            let storeName = '';
            try {
              const hostname = new URL(href).hostname.toLowerCase();
              isFromBrand = brandLower ? (hostname.includes(brandLower) || title.toLowerCase().includes(brandLower)) : false;
              storeName = hostname.replace('www.', '').split('.')[0];
              storeName = storeName.charAt(0).toUpperCase() + storeName.slice(1);
            } catch (e) {}
            
            if (!items.find(i => i.link === href)) {
              items.push({ title, link: href, storeName, isFromBrand, source: 'duckduckgo_fallback' });
            }
          }
          
          items.sort((a, b) => {
            if (a.isFromBrand && !b.isFromBrand) return -1;
            if (!a.isFromBrand && b.isFromBrand) return 1;
            return 0;
          });
          
          return items.slice(0, 15);
        }, brandLower);
        
        console.log(`   📊 DuckDuckGo found ${ddgResults.length} results`);
        
        if (ddgResults.length > 0) {
          // Use DuckDuckGo results instead
          results.push(...ddgResults);
        }
      }
    }
    
    // If we found results, try to get the first product page
    if (results.length > 0) {
      const bestMatch = results[0];
      console.log(`✅ Best match: ${bestMatch.title}`);
      console.log(`   URL: ${bestMatch.link}`);
      console.log(`   Store: ${bestMatch.storeName}${bestMatch.isOfficialStore ? ' (official)' : ''}`);
      
      // Navigate to the product page to get more details
      try {
        await page.goto(bestMatch.link, {
          waitUntil: 'networkidle2',
          timeout: 30000
        });
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Try to extract price and image from the product page
        const productDetails = await page.evaluate(() => {
          let price = null;
          let imageUrl = null;
          let name = null;
          
          // Price selectors (common patterns)
          const priceSelectors = [
            '[class*="price"]:not([class*="compare"])',
            '[data-price]',
            '[itemprop="price"]',
            '.product-price',
            '.sale-price',
            '.current-price',
            '[class*="Price"]'
          ];
          
          for (const sel of priceSelectors) {
            const el = document.querySelector(sel);
            if (el) {
              const text = el.textContent;
              const match = text.match(/[£$€]?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/);
              if (match) {
                price = parseFloat(match[1].replace(/,/g, ''));
                break;
              }
            }
          }
          
          // Image selectors
          const imgSelectors = [
            '[class*="product"] img[src]',
            '[data-product-image]',
            '[itemprop="image"]',
            '.product-image img',
            '.gallery-image img',
            'img[class*="main"]',
            'img[class*="Product"]'
          ];
          
          for (const sel of imgSelectors) {
            const img = document.querySelector(sel);
            if (img && img.src && !img.src.includes('data:')) {
              imageUrl = img.src;
              break;
            }
          }
          
          // Product name from page
          const nameSelectors = [
            'h1[class*="product"]',
            '[itemprop="name"]',
            '.product-name',
            '.product-title',
            'h1[class*="Product"]',
            'h1'
          ];
          
          for (const sel of nameSelectors) {
            const el = document.querySelector(sel);
            if (el && el.textContent.trim().length > 3) {
              name = el.textContent.trim();
              break;
            }
          }
          
          return { price, imageUrl, name };
        });
        
        await browser.close();
        
        return {
          success: true,
          productUrl: bestMatch.link,
          productName: productDetails.name || bestMatch.title,
          price: productDetails.price,
          imageUrl: productDetails.imageUrl,
          storeName: bestMatch.storeName,
          isOfficialStore: bestMatch.isOfficialStore,
          allResults: results,
          method: 'brand_search'
        };
        
      } catch (scrapeError) {
        console.log(`⚠️ Could not scrape product page: ${scrapeError.message}`);
        await browser.close();
        
        return {
          success: true,
          productUrl: bestMatch.link,
          productName: bestMatch.title,
          storeName: bestMatch.storeName,
          isOfficialStore: bestMatch.isOfficialStore,
          allResults: results,
          method: 'brand_search'
        };
      }
    }
    
    await browser.close();
    
    return {
      success: false,
      error: `No visual matches found${brandName ? ` for "${brandName}"` : ''}`,
      allResults: [],
      method: 'visual_search'
    };
    
  } catch (error) {
    if (browser) {
      await browser.close();
    }
    
    console.error(`❌ Visual search error: ${error.message}`);
    return {
      success: false,
      error: error.message,
      method: 'visual_search'
    };
  }
}

/**
 * Search DuckDuckGo Shopping for products and return the cheapest results
 * @param {string} searchQuery - Product name/description to search for
 * @returns {object} - { success, results: [{ title, price, storeName, productUrl, imageUrl }] }
 */
export async function searchDuckDuckGoShopping(searchQuery) {
  let browser;
  
  try {
    console.log(`🛒 DuckDuckGo Shopping search for: ${searchQuery}`);
    
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080'
      ]
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    
    // Use DuckDuckGo Shopping tab directly
    const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(searchQuery)}&iar=shopping&iax=shopping&ia=shopping`;
    console.log(`📍 Search URL: ${searchUrl}`);
    
    await page.goto(searchUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    // Wait for shopping results to load
    await new Promise(resolve => setTimeout(resolve, 6000));
    
    // Debug: log page title
    const pageTitle = await page.title();
    console.log(`   Page title: ${pageTitle}`);
    
    // Extract shopping results from LI elements (DuckDuckGo's actual structure)
    const results = await page.evaluate(() => {
      const items = [];
      
      // Known store patterns for display names
      const storePatterns = [
        'Amazon UK', 'Amazon', 'eBay UK', 'eBay', 'Boots.com', 'Boots', 
        'ASOS', 'Superdrug', 'Tesco', 'OnBuy.com', 'OnBuy', 'Argos',
        'John Lewis', 'Currys', 'Sainsburys', 'Very', 'Next'
      ];
      
      // Find all LI elements that contain price patterns
      const allLis = document.querySelectorAll('li');
      
      for (const li of allLis) {
        try {
          const text = li.innerText || '';
          
          // Must have a price (£X.XX pattern)
          const priceMatch = text.match(/£(\d+\.\d{2})/);
          if (!priceMatch) continue;
          
          // Skip filter/menu items
          if (text.length < 30) continue;
          if (text.includes('Up to £') || text.includes('Price -') || text.includes('Low To High')) continue;
          
          // Find the link inside
          const link = li.querySelector('a');
          const href = link?.getAttribute('href') || '';
          
          // Skip if no link
          if (!href) continue;
          
          // Get all text lines
          const lines = text.split('\n').filter(l => l.trim().length > 0);
          
          // First meaningful line is usually the title (skip "Free shipping" etc)
          let title = '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.length > 20 && !trimmed.startsWith('£') && !trimmed.startsWith('Free')) {
              title = trimmed;
              break;
            }
          }
          
          // If still no title, use first line
          if (!title && lines.length > 0) {
            title = lines[0].trim();
          }
          
          // Find store name from text
          let storeName = '';
          for (const store of storePatterns) {
            if (text.includes(store)) {
              storeName = store;
              break;
            }
          }
          
          // Get image if available
          let imageUrl = null;
          const img = li.querySelector('img[src]');
          if (img) {
            imageUrl = img.getAttribute('src');
          }
          
          // Extract price
          const price = parseFloat(priceMatch[1]);
          
          // Skip duplicates (by title similarity)
          const isDuplicate = items.some(item => 
            item.title.substring(0, 30) === title.substring(0, 30) && 
            item.storeName === storeName
          );
          if (isDuplicate) continue;
          
          items.push({
            title: title.substring(0, 200),
            price,
            storeName,
            productUrl: href,
            imageUrl
          });
        } catch (e) {}
      }
      
      // Sort by price (cheapest first)
      items.sort((a, b) => a.price - b.price);
      
      return items;
    });
    
    await browser.close();
    
    console.log(`📊 Found ${results.length} shopping results`);
    for (const r of results.slice(0, 5)) {
      console.log(`   £${r.price?.toFixed(2)} - ${r.storeName} - ${r.title?.substring(0, 50)}...`);
    }
    
    return {
      success: results.length > 0,
      results: results,
      searchUrl
    };
    
  } catch (error) {
    if (browser) {
      await browser.close();
    }
    
    console.error('❌ DuckDuckGo Shopping search error:', error.message);
    return {
      success: false,
      error: error.message,
      results: []
    };
  }
}

/**
 * Search Google Shopping for a product and return the best matching product URL
 * @param {string} searchQuery - Product name/description to search for
 * @param {string} preferredStore - Optional: prefer results from this store
 * @returns {object} - { success, productUrl, price, storeName, allResults }
 */
export async function searchGoogleShopping(searchQuery, preferredStore = null) {
  let browser;
  
  try {
    console.log(`🛒 Searching Google Shopping for: ${searchQuery}`);
    
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080'
      ]
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    
    // Go to Google Shopping
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&tbm=shop&hl=en`;
    console.log(`📍 Google Shopping URL: ${searchUrl}`);
    
    await page.goto(searchUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    // Wait for results to load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Handle cookie consent if present
    try {
      const acceptBtn = await page.$('button[id*="accept"], [aria-label*="Accept"], button:has-text("Accept all")');
      if (acceptBtn) {
        await acceptBtn.click();
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (e) {}
    
    // Extract shopping results
    const results = await page.evaluate((preferredStore) => {
      const items = [];
      
      // Google Shopping result selectors (they change frequently, so try multiple)
      const resultSelectors = [
        '.sh-dgr__gr-auto', // Grid items
        '.sh-dlr__list-result', // List items
        '[data-docid]', // Items with doc ID
        '.sh-pr__product-results-grid > div', // Product grid
        '.KZmu8e', // Another common class
      ];
      
      let resultElements = [];
      for (const selector of resultSelectors) {
        const els = document.querySelectorAll(selector);
        if (els.length > 0) {
          resultElements = els;
          break;
        }
      }
      
      // If no structured results, try to find any shopping links
      if (resultElements.length === 0) {
        resultElements = document.querySelectorAll('a[href*="shopping/product"], a[href*="url?q="]');
      }
      
      for (const el of resultElements) {
        try {
          // Try to extract product info
          let title = '';
          let price = null;
          let store = '';
          let link = '';
          let imageUrl = '';
          
          // Title
          const titleEl = el.querySelector('h3, h4, [class*="title"], [class*="name"], .tAxDx, .Xjkr3b');
          if (titleEl) title = titleEl.textContent.trim();
          
          // Price
          const priceEl = el.querySelector('[class*="price"], .a8Pemb, .kHxwFf, span[aria-label*="price"]');
          if (priceEl) {
            const priceText = priceEl.textContent;
            const priceMatch = priceText.match(/[£$€]?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/);
            if (priceMatch) {
              price = parseFloat(priceMatch[1].replace(/,/g, ''));
            }
          }
          
          // Store name
          const storeEl = el.querySelector('[class*="merchant"], [class*="store"], .aULzUe, .IuHnof');
          if (storeEl) store = storeEl.textContent.trim();
          
          // Link - try to find the actual product URL
          const linkEl = el.querySelector('a[href*="url?q="], a[href*="shopping/product"], a[href]');
          if (linkEl) {
            let href = linkEl.getAttribute('href');
            
            // Google wraps URLs - extract the actual URL
            if (href.includes('url?q=')) {
              const urlMatch = href.match(/url\?q=([^&]+)/);
              if (urlMatch) {
                href = decodeURIComponent(urlMatch[1]);
              }
            }
            
            // Skip Google's own URLs
            if (!href.includes('google.com')) {
              link = href;
            }
          }
          
          // Image
          const imgEl = el.querySelector('img[src*="http"]');
          if (imgEl) imageUrl = imgEl.getAttribute('src');
          
          if (title && (link || price)) {
            items.push({ title, price, store, link, imageUrl });
          }
        } catch (e) {}
      }
      
      // Sort by price (cheapest first)
      items.sort((a, b) => {
        if (a.price === null) return 1;
        if (b.price === null) return -1;
        return a.price - b.price;
      });
      
      // If preferred store specified, try to find it
      if (preferredStore) {
        const preferredItem = items.find(item => 
          item.store.toLowerCase().includes(preferredStore.toLowerCase())
        );
        if (preferredItem) {
          return { best: preferredItem, all: items };
        }
      }
      
      return { best: items[0] || null, all: items };
    }, preferredStore);
    
    await browser.close();
    
    if (results.best && results.best.link) {
      console.log(`✅ Found on Google Shopping:`);
      console.log(`   Product: ${results.best.title}`);
      console.log(`   Price: £${results.best.price}`);
      console.log(`   Store: ${results.best.store}`);
      console.log(`   URL: ${results.best.link}`);
      
      return {
        success: true,
        productUrl: results.best.link,
        productName: results.best.title,
        price: results.best.price,
        storeName: results.best.store,
        imageUrl: results.best.imageUrl,
        allResults: results.all,
        searchUrl
      };
    } else {
      console.log(`❌ No products found on Google Shopping`);
      return {
        success: false,
        error: 'No products found on Google Shopping',
        searchUrl,
        allResults: results.all || []
      };
    }
    
  } catch (error) {
    if (browser) {
      await browser.close();
    }
    
    console.error('❌ Google Shopping search error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

const storeSearchConfig = {
  'roche bobois': {
    domain: 'www.roche-bobois.com',
    searchUrl: (query) => `https://www.roche-bobois.com/en-GB/search?q=${encodeURIComponent(query)}`,
    productLinkSelector: 'a[href*="/p-"], a[href*="/product/"][href*=".html"], .search-result a[href*="/p-"], [class*="product-card"] a[href*="/p-"], [class*="ProductCard"] a',
  },
  'loewe': {
    domain: 'www.loewe.com',
    searchUrl: (query) => `https://www.loewe.com/eur/en/search?q=${encodeURIComponent(query)}`,
    productLinkSelector: 'a[href*="loewe.com"][href*="/product"], a[href*="loewe.com/eur/en/"][href*=".html"], .product-tile a[href*="loewe"], .product-card a[href*="loewe"]',
  },
  'harrods': {
    domain: 'www.harrods.com',
    searchUrl: (query) => `https://www.harrods.com/en-gb/search?searchTerm=${encodeURIComponent(query)}`,
    productLinkSelector: 'a[href*="/p/"], .product-card a, [class*="product"] a',
  },
  'selfridges': {
    domain: 'www.selfridges.com',
    searchUrl: (query) => `https://www.selfridges.com/GB/en/cat/?freeText=${encodeURIComponent(query)}`,
    productLinkSelector: 'a[href*="/product"], .product-link a, [class*="Product"] a',
  },
  'amazon': {
    domain: 'www.amazon.com',
    searchUrl: (query) => `https://www.amazon.com/s?k=${encodeURIComponent(query)}`,
    productLinkSelector: 'a[href*="/dp/"], .s-result-item a.a-link-normal[href*="/dp/"]',
  },
  'amazon uk': {
    domain: 'www.amazon.co.uk',
    searchUrl: (query) => `https://www.amazon.co.uk/s?k=${encodeURIComponent(query)}`,
    productLinkSelector: 'a[href*="/dp/"], .s-result-item a.a-link-normal[href*="/dp/"]',
  },
  'john lewis': {
    domain: 'www.johnlewis.com',
    searchUrl: (query) => `https://www.johnlewis.com/search?search-term=${encodeURIComponent(query)}`,
    productLinkSelector: 'a[href*="/p/"], .product-card a, [class*="product"] a',
  },
  'zara': {
    domain: 'www.zara.com',
    searchUrl: (query) => `https://www.zara.com/uk/en/search?searchTerm=${encodeURIComponent(query)}`,
    productLinkSelector: 'a[href*=".html"], .product-link a, [class*="product"] a',
  },
  'cos': {
    domain: 'www.cos.com',
    searchUrl: (query) => `https://www.cos.com/en_gbp/search.html?q=${encodeURIComponent(query)}`,
    productLinkSelector: 'a[href*="/product"], .product-item a, [class*="product"] a',
  },
  'h&m': {
    domain: 'www.hm.com',
    searchUrl: (query) => `https://www2.hm.com/en_gb/search-results.html?q=${encodeURIComponent(query)}`,
    productLinkSelector: 'a[href*="productpage"], .product-item a, [class*="product"] a',
  },
  'net-a-porter': {
    domain: 'www.net-a-porter.com',
    searchUrl: (query) => `https://www.net-a-porter.com/en-gb/shop/search/${encodeURIComponent(query)}`,
    productLinkSelector: 'a[href*="/product/"], .product-link a',
  },
  'farfetch': {
    domain: 'www.farfetch.com',
    searchUrl: (query) => `https://www.farfetch.com/uk/shopping/women/search/items.aspx?q=${encodeURIComponent(query)}`,
    productLinkSelector: 'a[href*="/shopping/"], [class*="product"] a',
  },
  'mrporter': {
    domain: 'www.mrporter.com',
    searchUrl: (query) => `https://www.mrporter.com/en-gb/mens/search/${encodeURIComponent(query)}`,
    productLinkSelector: 'a[href*="/product/"], .product-link a',
  },
  'matchesfashion': {
    domain: 'www.matchesfashion.com',
    searchUrl: (query) => `https://www.matchesfashion.com/search?q=${encodeURIComponent(query)}`,
    productLinkSelector: 'a[href*="/products/"], .product-card a',
  },
  'liberty': {
    domain: 'www.libertylondon.com',
    searchUrl: (query) => `https://www.libertylondon.com/search?q=${encodeURIComponent(query)}`,
    productLinkSelector: 'a[href*="/product"], .product-tile a',
  },
  'fortnum & mason': {
    domain: 'www.fortnumandmason.com',
    searchUrl: (query) => `https://www.fortnumandmason.com/search?q=${encodeURIComponent(query)}`,
    productLinkSelector: 'a[href*="/products/"], .product-card a',
  },
  'target': {
    domain: 'www.target.com',
    searchUrl: (query) => `https://www.target.com/s?searchTerm=${encodeURIComponent(query)}`,
    productLinkSelector: 'a[href*="/-/A-"], [data-test="product-title"]',
  },
  'walmart': {
    domain: 'www.walmart.com',
    searchUrl: (query) => `https://www.walmart.com/search?q=${encodeURIComponent(query)}`,
    productLinkSelector: 'a[href*="/ip/"], [class*="product"] a',
  },
  'best buy': {
    domain: 'www.bestbuy.com',
    searchUrl: (query) => `https://www.bestbuy.com/site/searchpage.jsp?st=${encodeURIComponent(query)}`,
    productLinkSelector: 'a[href*=".p?"], .sku-item a',
  },
  'lg': {
    domain: 'www.lg.com',
    searchUrl: (query) => `https://www.lg.com/uk/search/search-all?search=${encodeURIComponent(query)}`,
    productLinkSelector: 'a[href*="/product/"], a[href*="/laundry/"], a[href*="/tv/"]',
  },
};

/**
 * Search a store's website for a product and return the product URL
 * @param {string} storeName - Name of the store
 * @param {string} productName - Name of the product to search for
 * @param {number} targetPrice - Optional target price to match
 * @returns {object} - { success, productUrl, storeDomain }
 */
export async function searchStoreForProduct(storeName, productName, targetPrice = null) {
  let browser;
  
  try {
    // Normalize store name to lowercase for lookup
    const storeKey = storeName.toLowerCase().trim();
    const config = storeSearchConfig[storeKey];
    
    if (!config) {
      console.log(`⚠️ No search config for store: ${storeName}`);
      // Try to construct a generic Google search as fallback
      return {
        success: false,
        error: `Store "${storeName}" not configured for search`,
        suggestedGoogleSearch: `https://www.google.com/search?q=${encodeURIComponent(storeName + ' ' + productName)}`,
      };
    }
    
    console.log(`🔍 Searching ${storeName} for: ${productName}`);
    
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080'
      ]
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    
    // Navigate to search URL
    const searchUrl = config.searchUrl(productName);
    console.log(`📍 Search URL: ${searchUrl}`);
    
    await page.goto(searchUrl, {
      waitUntil: 'networkidle2',
      timeout: 45000
    });
    
    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 4000));
    
    // Handle cookie consent
    try {
      const cookieSelectors = [
        '#onetrust-accept-btn-handler',
        'button[id*="accept"]',
        'button[class*="accept"]',
        '[class*="cookie"] button',
        '[class*="consent"] button',
      ];
      
      for (const selector of cookieSelectors) {
        const btn = await page.$(selector);
        if (btn) {
          await btn.click();
          console.log(`Clicked cookie button: ${selector}`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          break;
        }
      }
    } catch (e) {}
    
    // Wait for search results to fully load
    await new Promise(resolve => setTimeout(resolve, 4000));
    
    // Try to wait for product grid/results
    try {
      await page.waitForSelector('[class*="product"], [class*="search-result"], [class*="grid"]', { timeout: 10000 });
    } catch (e) {
      console.log('No product grid found, continuing...');
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Find product links - try to match by price if provided
    const productUrl = await page.evaluate((selector, domain, targetPrice) => {
      // URLs to ignore (cookie consent, tracking, service pages, etc.)
      const ignoredPatterns = [
        'onetrust.com',
        'cookielaw.org',
        'privacy',
        'consent',
        'facebook.com',
        'twitter.com',
        'instagram.com',
        'youtube.com',
        'google.com',
        'javascript:',
        '#',
        '/services/',
        '/book-an-appointment',
        '/store-locator',
        '/customer-service',
        '/contact',
        '/about',
        '/faq',
        '/help',
        '/login',
        '/register',
        '/cart',
        '/checkout',
        '/wishlist',
        '/account',
        '/products/sofas',
        '/products/chairs',
        '/products/tables',
        '/products/lighting',
        '/products/accessories',
        '/category',
        '/categories',
        '/collections',
      ];
      
      const isValidProductUrl = (href) => {
        if (!href) return false;
        const lowerHref = href.toLowerCase();
        
        // Must contain the store domain or be a relative URL
        if (!lowerHref.includes(domain.toLowerCase()) && !href.startsWith('/')) {
          return false;
        }
        
        // Ignore known non-product URLs
        for (const ignored of ignoredPatterns) {
          if (lowerHref.includes(ignored)) {
            return false;
          }
        }
        
        // Should look like a product URL - prioritize specific product patterns
        const productPatterns = [
          '/product',
          '/p/',
          '/dp/',
          '/ip/',
          '/item',
          '/home-scents/',
          '/accessories/',
          '/bags/',
          '/clothing/',
          '/shoes/',
          '/jewellery/',
          '/gifts/',
          '/objects/',
        ];
        
        // Check for product patterns
        for (const pattern of productPatterns) {
          if (lowerHref.includes(pattern)) {
            return true;
          }
        }
        
        // Also accept .html files that aren't in excluded categories
        if (lowerHref.includes('.html') && !lowerHref.includes('/search')) {
          return true;
        }
        
        return false;
      };
      
      // Helper to extract price from text
      const extractPrice = (text) => {
        if (!text) return null;
        const match = text.match(/[£$€]?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)/);
        if (match) {
          return parseFloat(match[1].replace(/,/g, ''));
        }
        return null;
      };
      
      // If we have a target price, try to find products matching that price
      if (targetPrice) {
        // Find all product cards/tiles that contain both a link and a price
        const productCards = document.querySelectorAll('[class*="product"], [class*="Product"], [class*="card"], [class*="tile"], [class*="item"]');
        
        for (const card of productCards) {
          // Find price in this card
          const priceElement = card.querySelector('[class*="price"], [class*="Price"]');
          if (priceElement) {
            const price = extractPrice(priceElement.textContent);
            
            // Check if price matches (within 1 unit tolerance for rounding)
            if (price && Math.abs(price - targetPrice) <= 1) {
              // Found a matching price, now find the link in this card
              const link = card.querySelector('a[href]');
              if (link) {
                const href = link.getAttribute('href');
                if (isValidProductUrl(href)) {
                  console.log(`Found price-matched product: ${price} (target: ${targetPrice})`);
                  if (href.startsWith('http')) {
                    return href;
                  } else if (href.startsWith('/')) {
                    return `https://${domain}${href}`;
                  }
                }
              }
            }
          }
        }
        
        // No price match found - don't return a random product
        console.log(`No exact price match found for ${targetPrice}`);
        return null;
      }
      
      // Only use fallback if we don't have a target price to match against
      // This prevents returning completely wrong products
      const links = document.querySelectorAll(selector);
      
      for (const link of links) {
        const href = link.getAttribute('href');
        if (isValidProductUrl(href)) {
          if (href.startsWith('http')) {
            return href;
          } else if (href.startsWith('/')) {
            return `https://${domain}${href}`;
          }
        }
      }
      
      return null;
    }, config.productLinkSelector, config.domain, targetPrice);
    
    await browser.close();
    
    if (productUrl) {
      console.log(`✅ Found product URL: ${productUrl}`);
      return {
        success: true,
        productUrl,
        storeDomain: config.domain,
        searchUrl
      };
    } else {
      console.log(`❌ No product found in search results`);
      return {
        success: false,
        error: 'No product found in search results',
        searchUrl,
        storeDomain: config.domain
      };
    }
    
  } catch (error) {
    if (browser) {
      await browser.close();
    }
    
    console.error('❌ Store search error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}
