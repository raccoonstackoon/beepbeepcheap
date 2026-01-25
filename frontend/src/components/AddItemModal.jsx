import { useState } from 'react';
import { 
  X, 
  Link as LinkIcon, 
  Camera, 
  Package,
  Loader,
  ArrowRight,
  ExternalLink,
  Check
} from 'lucide-react';
import './AddItemModal.css';
import ImageAnnotator from './ImageAnnotator';

export default function AddItemModal({ onClose, onSuccess, apiBase }) {
  const [mode, setMode] = useState(null); // 'url', 'pricetag', 'product'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // URL mode state
  const [url, setUrl] = useState('');
  
  // Image mode state
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [extractedData, setExtractedData] = useState(null);
  const [searchResults, setSearchResults] = useState(null);
  
  // Annotation state - the spotlight focus area
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [focusArea, setFocusArea] = useState(null);
  
  // Manual entry state (after extraction or direct)
  const [manualData, setManualData] = useState({
    name: '',
    url: '',
    price: '',
    imageUrl: '',
    storeName: ''
  });

  const handleUrlSubmit = async () => {
    if (!url.trim()) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch(`${apiBase}/items/url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to add item');
      }
      
      onSuccess();
    } catch (err) {
      setError(err.message);
    }
    
    setLoading(false);
  };

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setExtractedData(null);
    setSearchResults(null);
    setFocusArea(null);
    setError(null);
    // Automatically move to annotation step
    setIsAnnotating(true);
  };

  // Called when user confirms the spotlight area
  const handleAnnotationConfirm = (area) => {
    setFocusArea(area);
    setIsAnnotating(false);
    // Automatically process the image after annotation
    handleImageProcess(area);
  };

  // Called when user cancels annotation (goes back)
  const handleAnnotationCancel = () => {
    setIsAnnotating(false);
    setImageFile(null);
    setImagePreview(null);
  };

  // Process the image with optional focus area from spotlight annotation
  const handleImageProcess = async (area = null) => {
    if (!imageFile) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append('image', imageFile);
      formData.append('type', mode);
      
      // Include the focus area coordinates if provided (from spotlight annotation)
      const areaToUse = area || focusArea;
      if (areaToUse) {
        formData.append('focusArea', JSON.stringify(areaToUse));
      }
      
      const res = await fetch(`${apiBase}/items/image`, {
        method: 'POST',
        body: formData
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to process image');
      }
      
      setExtractedData(data.extracted);
      
      // Use the found product URL if available
      const foundUrl = data.productUrl || '';
      
      // Use scraped product image if available, otherwise fall back to uploaded image
      const imageToUse = data.productImageUrl || data.localImageUrl || '';
      
      setManualData({
        name: data.extracted.itemName || data.extracted.name || '',
        url: foundUrl,
        price: data.extracted.price?.toString() || '',
        imageUrl: imageToUse,
        storeName: data.extracted.storeName || ''
      });
      
      // Set search results based on what we found
      if (data.productUrl && data.storeSearch?.success) {
        // We found the actual product URL!
        setSearchResults({
          found: true,
          searched: true,
          productUrl: data.productUrl,
          storeName: data.extracted.storeName,
          searchUrl: data.storeSearch.searchUrl
        });
      } else if (data.storeSearch && !data.storeSearch.success) {
        // We searched but didn't find the product
        setSearchResults({
          found: false,
          searched: true,
          storeName: data.extracted.storeName,
          searchUrl: data.storeSearch.searchUrl,
          error: data.storeSearch.error
        });
      } else if (data.extracted.itemName) {
        // No search was attempted, show generic suggestions
        setSearchResults({
          found: false,
          searched: false,
          suggestions: [
            {
              store: data.extracted.storeName || 'Google',
              searchUrl: `https://www.google.com/search?q=${encodeURIComponent((data.extracted.storeName || '') + ' ' + data.extracted.itemName)}`,
              confidence: 'high'
            },
            {
              store: 'Google Shopping',
              searchUrl: `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(data.extracted.itemName)}`,
              confidence: 'medium'
            }
          ]
        });
      }
      
    } catch (err) {
      setError(err.message);
    }
    
    setLoading(false);
  };

  // Re-search with corrected store name
  const handleReSearch = async () => {
    if (!manualData.storeName.trim() || !manualData.name.trim()) {
      setError('Store name and item name are required to search');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append('image', imageFile);
      formData.append('type', mode);
      formData.append('storeName', manualData.storeName.trim());
      
      // Include focus area if available
      if (focusArea) {
        formData.append('focusArea', JSON.stringify(focusArea));
      }
      
      const res = await fetch(`${apiBase}/items/image`, {
        method: 'POST',
        body: formData
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to search');
      }
      
      // Update with new results
      const foundUrl = data.productUrl || '';
      const scrapedImage = data.productImageUrl || '';
      setManualData(prev => ({
        ...prev,
        url: foundUrl,
        imageUrl: scrapedImage || prev.imageUrl // Use scraped image if available
      }));
      
      if (data.productUrl && data.storeSearch?.success) {
        setSearchResults({
          found: true,
          productUrl: data.productUrl,
          storeName: manualData.storeName,
          searchUrl: data.storeSearch.searchUrl
        });
      } else {
        setSearchResults({
          found: false,
          error: data.storeSearch?.error || 'Product not found',
          searchUrl: data.storeSearch?.searchUrl
        });
      }
      
    } catch (err) {
      setError(err.message);
    }
    
    setLoading(false);
  };

  const handleManualSave = async () => {
    if (!manualData.name.trim()) {
      setError('Item name is required');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch(`${apiBase}/items/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: manualData.name.trim(),
          url: manualData.url.trim() || null,
          image_url: manualData.imageUrl || null,
          current_price: manualData.price ? parseFloat(manualData.price) : null
        })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save item');
      }
      
      onSuccess();
    } catch (err) {
      setError(err.message);
    }
    
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          <X size={20} />
        </button>
        
        <h2>Add Item to Track</h2>
        
        {/* Mode selection */}
        {!mode && (
          <div className="mode-selection">
            <button className="mode-card" onClick={() => setMode('url')}>
              <div className="mode-icon url-icon">
                <LinkIcon size={28} />
              </div>
              <h3>Paste URL</h3>
              <p>Enter a product URL from any online store</p>
            </button>
            
            <button className="mode-card" onClick={() => setMode('pricetag')}>
              <div className="mode-icon pricetag-icon">
                <Camera size={28} />
              </div>
              <h3>Price Tag Photo</h3>
              <p>Take a photo of a price tag from a physical store</p>
            </button>
            
            <button className="mode-card" onClick={() => setMode('product')}>
              <div className="mode-icon product-icon">
                <Package size={28} />
              </div>
              <h3>Product Photo</h3>
              <p>Take a photo of a product to identify it</p>
            </button>
          </div>
        )}
        
        {/* URL Mode */}
        {mode === 'url' && (
          <div className="url-mode">
            <p className="mode-description">
              Paste a product URL from any online store. We'll automatically extract the price and details.
            </p>
            
            <div className="input-group">
              <input
                type="url"
                placeholder="https://www.amazon.com/product/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
                disabled={loading}
              />
            </div>
            
            {error && <p className="error-message">{error}</p>}
            
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setMode(null)}>
                Back
              </button>
              <button 
                className="btn btn-primary"
                onClick={handleUrlSubmit}
                disabled={!url.trim() || loading}
              >
                {loading ? (
                  <>
                    <Loader size={18} className="spinning" />
                    Fetching...
                  </>
                ) : (
                  <>
                    Add Item
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </div>
          </div>
        )}
        
        {/* Image Mode - Step 1: Upload (pricetag or product) */}
        {(mode === 'pricetag' || mode === 'product') && !extractedData && !isAnnotating && !loading && (
          <div className="image-mode">
            <p className="mode-description">
              {mode === 'pricetag' 
                ? 'Upload a photo of a price tag. We\'ll extract the item name, price, and store.'
                : 'Upload a photo of the product. We\'ll try to identify it so you can track its price online.'
              }
            </p>
            
            <div className="image-upload-area">
              <label className="upload-label">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  capture="environment"
                />
                <Camera size={32} />
                <span>Click to upload or take a photo</span>
              </label>
            </div>
            
            {error && <p className="error-message">{error}</p>}
            
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setMode(null)}>
                Back
              </button>
            </div>
          </div>
        )}
        
        {/* Image Mode - Step 2: Annotate with Spotlight */}
        {(mode === 'pricetag' || mode === 'product') && isAnnotating && imagePreview && !loading && (
          <div className="annotation-mode">
            <ImageAnnotator
              imageUrl={imagePreview}
              mode={mode}
              onConfirm={handleAnnotationConfirm}
              onCancel={handleAnnotationCancel}
            />
          </div>
        )}
        
        {/* Image Mode - Loading state while processing */}
        {(mode === 'pricetag' || mode === 'product') && loading && !extractedData && (
          <div className="image-mode processing">
            <div className="processing-indicator">
              <Loader size={32} className="spinning" />
              <p>Analyzing your image...</p>
              <span className="processing-hint">
                {mode === 'pricetag' 
                  ? 'Looking for price, product name, and store info...'
                  : 'Identifying the product...'
                }
              </span>
            </div>
          </div>
        )}
        
        {/* Extracted Data Review */}
        {extractedData && (
          <div className="extracted-mode">
            <div className="extracted-success">
              <Check size={20} />
              <span>Information extracted! Review and save below.</span>
            </div>
            
            <div className="extracted-preview">
              {/* Show scraped product image if available, otherwise show uploaded preview */}
              {(manualData.imageUrl?.startsWith('http') || imagePreview) && (
                <img 
                  src={manualData.imageUrl?.startsWith('http') ? manualData.imageUrl : imagePreview} 
                  alt="Product" 
                  className="extracted-image" 
                />
              )}
              
              <div className="form-group">
                <label>Item Name</label>
                <input
                  type="text"
                  value={manualData.name}
                  onChange={(e) => setManualData({ ...manualData, name: e.target.value })}
                  placeholder="Product name"
                />
              </div>
              
              {mode === 'pricetag' && (
                <>
                  <div className="form-group">
                    <label>Store Name</label>
                    <div className="store-input-row">
                      <input
                        type="text"
                        value={manualData.storeName}
                        onChange={(e) => setManualData({ ...manualData, storeName: e.target.value })}
                        placeholder="e.g., Roche Bobois, Harrods, Zara"
                      />
                      <button 
                        className="btn btn-secondary btn-sm"
                        onClick={handleReSearch}
                        disabled={loading || !manualData.storeName.trim()}
                        title="Search this store for the product"
                      >
                        {loading ? <Loader size={14} className="spinning" /> : 'Find URL'}
                      </button>
                    </div>
                    <p className="form-help">
                      Correct the store name and click "Find URL" to search again
                    </p>
                  </div>
                  <div className="form-group">
                    <label>Price</label>
                    <input
                      type="number"
                      step="0.01"
                      value={manualData.price}
                      onChange={(e) => setManualData({ ...manualData, price: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                </>
              )}
              
              <div className="form-group">
                <label>URL to Track (optional)</label>
                <input
                  type="url"
                  value={manualData.url}
                  onChange={(e) => setManualData({ ...manualData, url: e.target.value })}
                  placeholder="https://..."
                />
                <p className="form-help">
                  Add a URL if you want to track the price online
                </p>
              </div>
            </div>
            
            {/* Found product URL */}
            {searchResults?.found && (
              <div className="search-suggestions found-url">
                <div className="found-url-header">
                  <Check size={18} />
                  <h4>Product found on {searchResults.storeName}!</h4>
                </div>
                <a
                  href={searchResults.productUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="found-product-link"
                >
                  <ExternalLink size={14} />
                  View product page
                </a>
                <p className="form-help success-text">
                  ✓ URL auto-filled above - ready to track!
                </p>
              </div>
            )}
            
            {/* Product not found online */}
            {searchResults && searchResults.searched && !searchResults.found && (
              <div className="search-suggestions not-found">
                <h4>⚠️ Product not found on {searchResults.storeName} website</h4>
                <p className="form-help">
                  This item may only be available in-store, or sold under a different name online.
                </p>
                <a
                  href={searchResults.searchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="suggestion-link"
                >
                  <ExternalLink size={14} />
                  Try searching manually
                </a>
              </div>
            )}
            
            {/* Search suggestions (when URL not found) */}
            {searchResults && !searchResults.found && searchResults.suggestions && (
              <div className="search-suggestions">
                <h4>Search for this item online:</h4>
                <div className="suggestion-links">
                  {searchResults.suggestions.map((suggestion, i) => (
                    <a
                      key={i}
                      href={suggestion.searchUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="suggestion-link"
                    >
                      <ExternalLink size={14} />
                      {suggestion.store}
                    </a>
                  ))}
                </div>
                <p className="form-help">
                  Find the product, copy the URL, and paste it above to track the price
                </p>
              </div>
            )}
            
            {error && <p className="error-message">{error}</p>}
            
            <div className="modal-actions">
              <button 
                className="btn btn-secondary" 
                onClick={() => {
                  setExtractedData(null);
                  setSearchResults(null);
                }}
              >
                Back
              </button>
              <button 
                className="btn btn-primary"
                onClick={handleManualSave}
                disabled={!manualData.name.trim() || loading}
              >
                {loading ? (
                  <>
                    <Loader size={18} className="spinning" />
                    Saving...
                  </>
                ) : (
                  <>
                    Save Item
                    <Check size={18} />
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

