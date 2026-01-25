import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

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
      prompt = `${focusInstruction}Look at this price tag photo.

Tell me:
- The store (retailer)
- The brand (expand abbreviations to full brand name using your knowledge)
- The full product name
- The price

JSON: {"storeName": "", "brand": "", "itemName": "", "price": 0, "currency": "", "description": ""}`;
    } else {
      prompt = `${focusInstruction}You are analyzing a photo of a product. 
Please identify this product and return information as JSON:
{
  "itemName": "your best guess at the product name",
  "brand": "the brand if you can identify it",
  "category": "the product category (e.g., electronics, clothing, food)",
  "description": "a brief description of the product",
  "searchTerms": ["array", "of", "search", "terms", "to find this product online"]
}

Be as specific as possible with the product identification. Include model numbers if visible.
Only return the JSON object, no other text.`;
    }
    
    const response = await getAnthropic().messages.create({
      model: 'claude-opus-4-20250514',
      max_tokens: 1024,
      system: "You are a helpful assistant that can accurately read and interpret images. When shown a price tag, carefully identify the store name (look for logos), the product brand and name, and the exact price. Be precise with numbers and text.",
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
    
    return {
      success: true,
      type,
      ...parsed
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
