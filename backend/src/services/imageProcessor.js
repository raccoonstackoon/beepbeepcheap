import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { lookupBarcode, isValidBarcode } from './barcodeService.js';

// Lazy-load Anthropic client (only when needed)
let anthropic = null;

function getAnthropic() {
  if (!anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('Anthropic API key not configured. Please add your API key to the .env file.');
    }
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }
  return anthropic;
}

/**
 * Process an image to extract product information using Claude Vision
 * @param {string} imagePath - Path to the image file
 * @param {string} type - 'pricetag' or 'product'
 * @param {object} focusArea - Optional {x, y, width, height} in percentages to focus on
 */
export async function processImage(imagePath, type = 'product', focusArea = null) {
  try {
    // Read and optimize image for Claude
    // Resize large images to max 1568px (Claude's recommended max) while maintaining aspect ratio
    let imageBuffer = await sharp(imagePath)
      .resize(1568, 1568, { 
        fit: 'inside',  // Maintain aspect ratio, fit within bounds
        withoutEnlargement: true  // Don't upscale small images
      })
      .jpeg({ quality: 90 })  // Convert to JPEG with good quality
      .toBuffer();
    
    const base64Image = imageBuffer.toString('base64');
    const mimeType = 'image/jpeg';  // We're converting to JPEG
    
    // Build focus area instruction if provided
    let focusInstruction = '';
    if (focusArea) {
      focusInstruction = `
IMPORTANT: The user has highlighted a specific area of the image for you to focus on.
The highlighted region is:
- Starting at ${Math.round(focusArea.x)}% from the left edge
- Starting at ${Math.round(focusArea.y)}% from the top edge  
- Width: ${Math.round(focusArea.width)}% of the image
- Height: ${Math.round(focusArea.height)}% of the image

Please FOCUS primarily on this highlighted area when extracting information.
This is likely where the most important information (price, product name, etc.) is located.

`;
    }
    
    let prompt;
    
    if (type === 'pricetag') {
      prompt = `${focusInstruction}Look at this price tag photo carefully.

Extract ALL of the following information:
1. **Barcode number** - Look for any barcode (UPC, EAN, etc.) and read the numbers printed below/near it. This is CRITICAL for product identification.
2. **Price** - The main price shown on the tag
3. **Store/retailer name** - If visible (logo, name, etc.)
4. **Brand name** - Expand any abbreviations to the full brand name
5. **Product name/description** - Any text describing the product
6. **Unit price** - If shown (e.g., "£2.50/kg")
7. **SKU/Product code** - Any store-specific product codes

Be very careful when reading the barcode numbers - accuracy is essential.

Return as JSON:
{
  "barcode": "the barcode number if visible (digits only)",
  "price": 0,
  "currency": "£ or $ or €",
  "storeName": "store name if identifiable",
  "brand": "brand name",
  "itemName": "product name/description from tag",
  "unitPrice": "unit price if shown",
  "sku": "store product code if visible",
  "description": "any other relevant text on the tag"
}`;
    } else {
      prompt = `${focusInstruction}You are analyzing a photo of a product. Your PRIMARY goal is to identify the BRAND.

STEP 1: BRAND DETECTION (CRITICAL)
Look carefully for ANY of these:
- Brand logos (text or symbol)
- Brand name printed/embroidered on the product
- Labels, tags, or packaging with brand name
- Distinctive brand patterns or design elements (e.g., Nike swoosh, Apple logo, IKEA style)

STEP 2: PRODUCT IDENTIFICATION
Identify what the product is and describe it for search purposes.

Return as JSON:
{
  "brand": "the brand name if detected (use official brand name, e.g., 'IKEA' not 'ikea'). Return null if no brand is visible",
  "brandConfidence": "high/medium/low/none - how confident are you about the brand?",
  "brandSource": "where did you see the brand? (e.g., 'logo on product', 'label', 'tag', 'packaging', 'design style', 'not visible')",
  "itemName": "descriptive name of the product (e.g., 'Grey Velvet Cushion with Bear Face')",
  "category": "product category (e.g., 'home decor', 'clothing', 'electronics')",
  "description": "detailed visual description for finding similar items",
  "searchTerms": ["array", "of", "specific", "search", "terms"],
  "visualFeatures": ["key", "visual", "features", "for", "matching"]
}

Be VERY thorough in looking for brand indicators. Even subtle logos or text matter.
Only return the JSON object, no other text.`;
    }
    
    const response = await getAnthropic().messages.create({
      model: 'claude-opus-4-20250514',
      max_tokens: 1024,
      system: "You are a helpful assistant that can accurately read and interpret images, especially price tags and barcodes. When shown a price tag: 1) FIRST look for any barcode and carefully read the numbers printed below it - this is critical for product identification. 2) Read the exact price. 3) Identify store name from logos or branding. 4) Extract product name and brand. Be extremely precise with numbers, especially barcode digits.",
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType,
                data: base64Image
              }
            },
            {
              type: 'text',
              text: prompt
            }
          ]
        }
      ]
    });
    
    const content = response.content[0].text;
    
    // Parse the JSON response
    let parsed;
    try {
      // Try to extract JSON from the response (in case there's extra text)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse Claude response:', content);
      return {
        success: false,
        error: 'Failed to parse AI response',
        rawResponse: content
      };
    }
    
    // If we found a barcode, try to look it up for additional product info
    let barcodeData = null;
    if (parsed.barcode && isValidBarcode(parsed.barcode)) {
      console.log(`📊 Barcode detected: ${parsed.barcode}`);
      barcodeData = await lookupBarcode(parsed.barcode);
      
      if (barcodeData) {
        console.log(`✅ Barcode lookup successful!`);
        console.log(`   Product: ${barcodeData.name}`);
        console.log(`   Brand: ${barcodeData.brand}`);
        console.log(`   Source: ${barcodeData.source}`);
        
        // Enhance the parsed data with barcode lookup results
        // Barcode data is usually more accurate for product name/brand
        if (barcodeData.name && (!parsed.itemName || parsed.itemName.length < 5)) {
          parsed.itemName = barcodeData.name;
        }
        if (barcodeData.brand && !parsed.brand) {
          parsed.brand = barcodeData.brand;
        }
        if (barcodeData.imageUrl) {
          parsed.productImageUrl = barcodeData.imageUrl;
        }
        if (barcodeData.category) {
          parsed.category = barcodeData.category;
        }
      }
    }
    
    return {
      success: true,
      type,
      ...parsed,
      barcodeData: barcodeData // Include full barcode lookup data for reference
    };
    
  } catch (error) {
    console.error('Image processing error:', error);
    
    // Check for specific Anthropic errors
    if (error.status === 401) {
      return {
        success: false,
        error: 'Invalid Anthropic API key. Please check your .env file.'
      };
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Search for a product online based on extracted information
 * Returns suggested URLs to track
 */
export async function searchProduct(productInfo) {
  try {
    const searchTerms = productInfo.searchTerms || [productInfo.itemName, productInfo.brand].filter(Boolean);
    const searchQuery = searchTerms.join(' ');
    
    const prompt = `Given this product information:
- Name: ${productInfo.itemName || 'Unknown'}
- Brand: ${productInfo.brand || 'Unknown'}
- Category: ${productInfo.category || 'Unknown'}
- Description: ${productInfo.description || 'None'}

Suggest 3-5 online retailers where this product might be available for purchase.
Return as JSON:
{
  "suggestions": [
    {
      "store": "Store name",
      "searchUrl": "A search URL for this product on that store",
      "confidence": "high/medium/low"
    }
  ],
  "searchQuery": "the best search query to find this product"
}

Focus on major retailers like Amazon, Walmart, Target, Best Buy, etc.
Only return the JSON object, no other text.`;

    const response = await getAnthropic().messages.create({
      model: 'claude-opus-4-20250514',
      max_tokens: 1024,
      messages: [
        { role: 'user', content: prompt }
      ]
    });
    
    const content = response.content[0].text;
    
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return {
          success: true,
          ...JSON.parse(jsonMatch[0])
        };
      }
    } catch (parseError) {
      console.error('Failed to parse search response:', content);
    }
    
    // Fallback: return basic search URLs
    return {
      success: true,
      suggestions: [
        {
          store: 'Amazon',
          searchUrl: `https://www.amazon.com/s?k=${encodeURIComponent(searchQuery)}`,
          confidence: 'medium'
        },
        {
          store: 'Walmart',
          searchUrl: `https://www.walmart.com/search?q=${encodeURIComponent(searchQuery)}`,
          confidence: 'medium'
        },
        {
          store: 'Target',
          searchUrl: `https://www.target.com/s?searchTerm=${encodeURIComponent(searchQuery)}`,
          confidence: 'medium'
        }
      ],
      searchQuery
    };
    
  } catch (error) {
    console.error('Product search error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get MIME type from file extension
 */
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp'
  };
  return mimeTypes[ext] || 'image/jpeg';
}
