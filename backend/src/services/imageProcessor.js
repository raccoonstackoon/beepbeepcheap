import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { lookupBarcode, isValidBarcode } from './barcodeService.js';

// Lazy-load Anthropic client (only when needed)
let anthropic = null;
let resolvedAnthropicModel = null;

const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5';

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

export function selectAvailableAnthropicModel(modelIds, configuredModel = null) {
  const available = new Set((modelIds || []).filter(Boolean));
  const preferred = [
    configuredModel,
    DEFAULT_ANTHROPIC_MODEL,
    ...(modelIds || []).filter((id) => /^claude-sonnet-/i.test(id)),
    ...(modelIds || []).filter((id) => /^claude-opus-/i.test(id)),
    ...(modelIds || []).filter((id) => /^claude-haiku-/i.test(id)),
  ].filter(Boolean);

  return preferred.find((id) => available.has(id)) || null;
}

async function createAnthropicMessage(request) {
  const client = getAnthropic();
  const configuredModel = String(process.env.ANTHROPIC_VISION_MODEL || '').trim() || null;
  const initialModel = resolvedAnthropicModel || configuredModel || DEFAULT_ANTHROPIC_MODEL;

  try {
    const response = await client.messages.create({ ...request, model: initialModel });
    resolvedAnthropicModel = initialModel;
    return response;
  } catch (error) {
    // Model aliases and dated IDs are retired over time. On a model-specific
    // 404, ask the account which current models it can use and retry once.
    if (error?.status !== 404) throw error;

    const models = await client.models.list({ limit: 100 });
    const fallbackModel = selectAvailableAnthropicModel(
      models.data?.map((model) => model.id),
      configuredModel
    );
    if (!fallbackModel || fallbackModel === initialModel) throw error;

    console.warn(`⚠️ Anthropic model "${initialModel}" is unavailable; retrying with "${fallbackModel}"`);
    const response = await client.messages.create({ ...request, model: fallbackModel });
    resolvedAnthropicModel = fallbackModel;
    return response;
  }
}

function clampFocusArea(focusArea) {
  if (!focusArea) return null;
  const x = Math.max(0, Math.min(100, Number(focusArea.x)));
  const y = Math.max(0, Math.min(100, Number(focusArea.y)));
  const width = Math.max(0, Math.min(100 - x, Number(focusArea.width)));
  const height = Math.max(0, Math.min(100 - y, Number(focusArea.height)));
  if (![x, y, width, height].every(Number.isFinite) || width < 1 || height < 1) return null;
  if (x === 0 && y === 0 && width === 100 && height === 100) return null;
  return { x, y, width, height };
}

async function getFocusedImageBuffer(imagePath, focusArea) {
  const normalized = clampFocusArea(focusArea);
  const oriented = await sharp(imagePath)
    .rotate()
    .toBuffer({ resolveWithObject: true });
  if (!normalized) return oriented.data;

  const imageWidth = oriented.info.width;
  const imageHeight = oriented.info.height;
  const left = Math.max(0, Math.min(imageWidth - 1, Math.floor(imageWidth * normalized.x / 100)));
  const top = Math.max(0, Math.min(imageHeight - 1, Math.floor(imageHeight * normalized.y / 100)));
  const cropWidth = Math.max(1, Math.min(imageWidth - left, Math.round(imageWidth * normalized.width / 100)));
  const cropHeight = Math.max(1, Math.min(imageHeight - top, Math.round(imageHeight * normalized.height / 100)));

  return sharp(oriented.data)
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .toBuffer();
}

/** Create a public JPEG crop for Google Lens while preserving the original upload. */
export async function createFocusedImage(imagePath, focusArea) {
  if (!clampFocusArea(focusArea)) return imagePath;
  const parsed = path.parse(imagePath);
  const outputPath = path.join(parsed.dir, `${parsed.name}-focus.jpg`);
  const focusedBuffer = await getFocusedImageBuffer(imagePath, focusArea);
  await sharp(focusedBuffer).jpeg({ quality: 92 }).toFile(outputPath);
  return outputPath;
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
    const focusedImage = await getFocusedImageBuffer(imagePath, focusArea);
    let imageBuffer = await sharp(focusedImage)
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
The image supplied here has already been cropped to that highlighted region.
Identify the product visible in this crop and do not infer details from objects outside it.

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
      prompt = `${focusInstruction}You are analyzing a photo of a product. You must ACCURATELY identify both the product type AND the brand.

STEP 1: PRODUCT TYPE IDENTIFICATION (CRITICAL - GET THIS RIGHT)
Before anything else, carefully determine WHAT the product actually is.

For CLOTHING items, pay close attention to:
- Is it a TOP (worn on upper body) or BOTTOM (worn on lower body)?
- Look for: necklines, armholes, sleeves, waistbands, leg openings, hems
- A cardigan/sweater has: neckline, armholes or sleeves, hangs from shoulders
- Trousers/pants have: waistband, two separate leg tubes, worn from waist down
- Consider the garment CONSTRUCTION - how would someone put it on?
- Look at where the garment sits on the model's body

For OTHER products:
- What is its primary function?
- What category does it belong to?

STEP 2: BRAND DETECTION
Look carefully for ANY of these:
- Brand logos (text or symbol)
- Brand name printed/embroidered on the product
- Labels, tags, or packaging with brand name
- Distinctive brand patterns or design elements (e.g., Nike swoosh, Apple logo, IKEA style)

STEP 3: VERIFICATION
Double-check your identification:
- Does your product name make sense given what you see?
- For clothing: confirm it matches where it's worn on the body
- Would your description help someone find this exact item?

Return as JSON:
{
  "brand": "the brand name if detected (use official brand name, e.g., 'IKEA' not 'ikea'). Return null if no brand is visible",
  "brandConfidence": "high/medium/low/none - how confident are you about the brand?",
  "brandSource": "where did you see the brand? (e.g., 'logo on product', 'label', 'tag', 'packaging', 'design style', 'not visible')",
  "itemName": "accurate, descriptive name of the product (e.g., 'Cream Knit Longline Cardigan', 'Navy Tapered Trousers')",
  "category": "product category (e.g., 'clothing - tops', 'clothing - bottoms', 'home decor', 'electronics')",
  "description": "detailed visual description including color, material, style, and key features",
  "searchTerms": ["array", "of", "specific", "search", "terms"],
  "visualFeatures": ["key", "visual", "features", "for", "matching"],
  "variants": {
    "color": "the color if visible (e.g., 'Sage Green', 'White & Rose Gold', 'Navy'). Return null if not applicable",
    "size": "the size/amount if visible (e.g., '225ml', '450G', '500ml', 'Large', '32inch'). Return null if not visible",
    "quantity": "pack quantity if visible (e.g., '2 pack', 'x3', 'set of 4'). Return null if single item or not visible",
    "model": "model number/code if visible (e.g., 'DT9814G0', 'A2442'). Return null if not visible"
  }
}

IMPORTANT: Accuracy of product identification is crucial. Take your time to correctly identify what the item actually is.
Only return the JSON object, no other text.`;
    }
    
    // Use different system prompts based on the type of image analysis
    const systemPrompt = type === 'pricetag' 
      ? "You are a helpful assistant that can accurately read and interpret images, especially price tags and barcodes. When shown a price tag: 1) FIRST look for any barcode and carefully read the numbers printed below it - this is critical for product identification. 2) Read the exact price. 3) Identify store name from logos or branding. 4) Extract product name and brand. Be extremely precise with numbers, especially barcode digits."
      : "You are an expert product identifier with exceptional visual analysis skills. You excel at accurately identifying products from photos, especially clothing and fashion items. For clothing, you carefully analyze garment construction, where it's worn on the body, necklines, sleeves, waistbands, and overall silhouette to correctly distinguish between different garment types (e.g., cardigans vs trousers, dresses vs jumpsuits). You never rush to conclusions and always verify your identification makes sense.";
    
    const response = await createAnthropicMessage({
      max_tokens: 1024,
      system: systemPrompt,
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

    const response = await createAnthropicMessage({
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
