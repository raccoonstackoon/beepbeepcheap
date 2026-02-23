import { useState, useRef, useEffect } from 'react';
import { 
  X, 
  Camera, 
  Loader,
  ArrowRight,
  ExternalLink,
  Check,
  Search
} from 'lucide-react';
import './AddItemModal.css';
import ImageAnnotator from './ImageAnnotator';

export default function AddItemModal({ onClose, onSuccess, apiBase, initialMode }) {
  const mappedMode = initialMode === 'search' ? 'url' : initialMode;
  const [mode, setMode] = useState(mappedMode || null);
  
  // Ref to file input so we can trigger it programmatically
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Unified input state (handles both URLs and search queries)
  const [inputValue, setInputValue] = useState('');
  
  // Image mode state
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [extractedData, setExtractedData] = useState(null);
  const [searchResults, setSearchResults] = useState(null);
  
  // Annotation state - the spotlight focus area
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [focusArea, setFocusArea] = useState(null);
  
  // Shop name input state - shown when no brand/shop detected
  const [needsShopName, setNeedsShopName] = useState(false);
  const [shopNameInput, setShopNameInput] = useState('');
  const [identifiedProduct, setIdentifiedProduct] = useState(null);
  const [productNameInput, setProductNameInput] = useState(''); // Editable product name
  const [variantsInput, setVariantsInput] = useState({ color: '', size: '', quantity: '', model: '' }); // Variant info
  
  // Shopping options state - top 3 cheapest results
  const [shoppingOptions, setShoppingOptions] = useState([]);
  const [selectedOption, setSelectedOption] = useState(null);
  const [backupResults, setBackupResults] = useState([]);
  
  // Manual entry state (after extraction or direct)
  const [manualData, setManualData] = useState({
    name: '',
    url: '',
    price: '',
    imageUrl: '',
    storeName: ''
  });

  // When opened directly in photo mode, trigger file picker immediately
  useEffect(() => {
    if (initialMode === 'product' && fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, [initialMode]);

  const isUrl = (str) => {
    const trimmed = str.trim();
    return /^https?:\/\//i.test(trimmed) || /^www\./i.test(trimmed) || /\.[a-z]{2,}\/\S/i.test(trimmed);
  };

  const handleUnifiedSubmit = async () => {
    if (!inputValue.trim()) return;

    if (isUrl(inputValue)) {
      await handleUrlSubmit();
    } else {
      await handleSearchSubmit();
    }
  };

  const handleUrlSubmit = async () => {
    if (!inputValue.trim()) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch(`${apiBase}/items/url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: inputValue.trim() })
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

  const handleSearchSubmit = async () => {
    if (!inputValue.trim()) return;
    
    setLoading(true);
    setError(null);
    setShoppingOptions([]);
    setSelectedOption(null);
    setExtractedData(null);
    setSearchResults(null);
    
    try {
      const res = await fetch(`${apiBase}/items/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: inputValue.trim() })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to search');
      }
      
      setExtractedData({ itemName: inputValue.trim() });
      
      if (data.shoppingOptions && data.shoppingOptions.length > 0) {
        setShoppingOptions(data.shoppingOptions);
        setBackupResults(data.backupResults || []);
      } else {
        setSearchResults({
          found: false,
          searchUrl: `https://www.google.com/search?q=${encodeURIComponent(inputValue.trim())}&tbm=shop`,
          error: 'No shopping results found'
        });
      }
    } catch (err) {
      setError(err.message);
    }
    
    setLoading(false);
  };

  // Handle clicking "Take a Photo" - immediately open file picker
  const handlePhotoModeClick = () => {
    setMode('product');
    // Trigger the file input immediately
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    // Reset ALL state for fresh upload
    setExtractedData(null);
    setSearchResults(null);
    setShoppingOptions([]);
    setSelectedOption(null);
    setFocusArea(null);
    setError(null);
    setNeedsShopName(false);
    setShopNameInput('');
    setProductNameInput('');
    setIdentifiedProduct(null);
    setManualData({ name: '', url: '', price: '', imageUrl: '', storeName: '' });
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
    // Reset file input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Step 1: Identify the product (check if we need shop name)
  const handleImageProcess = async (area = null) => {
    if (!imageFile) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append('image', imageFile);
      formData.append('identifyOnly', 'true'); // Just identify, don't search yet
      
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
      
      // Store the identified product info
      setIdentifiedProduct({
        ...data.extracted,
        localImageUrl: data.localImageUrl
      });
      
      // Set the product name for potential editing
      setProductNameInput(data.extracted.itemName || '');
      
      // Set variants if extracted
      const variants = data.extracted.variants || {};
      setVariantsInput({
        color: variants.color || '',
        size: variants.size || '',
        quantity: variants.quantity || '',
        model: variants.model || ''
      });
      
      // Always show the confirmation/edit screen first
      // User can verify/edit the product name and enter brand if needed
      setNeedsShopName(true);
      setShopNameInput(data.extracted.brand || '');
      
    } catch (err) {
      setError(err.message);
    }
    
    setLoading(false);
  };
  
  // Step 2: Search shopping sites for cheapest prices
  const searchWithShopName = async (shopName, productData = null) => {
    const product = productData || identifiedProduct;
    
    if (!imageFile) return;
    
    setLoading(true);
    setError(null);
    setNeedsShopName(false);
    setShoppingOptions([]);
    setSelectedOption(null);
    
    try {
      const formData = new FormData();
      formData.append('image', imageFile);
      if (shopName) {
        formData.append('shopName', shopName);
      }
      
      // Include the focus area if we have it
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
      
      setExtractedData(data.extracted);
      
      // NEW: Handle shopping options (top 3 cheapest)
      if (data.shoppingOptions && data.shoppingOptions.length > 0) {
        setShoppingOptions(data.shoppingOptions);
        // Don't auto-select, let user choose
      } else {
        // No shopping results found
        const searchQuery = shopName 
          ? `${shopName} ${product?.itemName || ''}` 
          : product?.itemName || '';
        
        setSearchResults({
          found: false,
          searchUrl: `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&tbm=shop`,
          error: 'No shopping results found'
        });
      }
      
    } catch (err) {
      setError(err.message);
    }
    
    setLoading(false);
  };
  
  const handleDismissOption = (index) => {
    setShoppingOptions(prev => {
      const updated = [...prev];
      updated.splice(index, 1);
      
      // Pull in a backup result if available
      if (backupResults.length > 0) {
        const [next, ...rest] = backupResults;
        updated.push(next);
        setBackupResults(rest);
      }
      
      return updated;
    });
  };
  
  // Handle user selecting a shopping option
  const handleSelectOption = (option) => {
    setSelectedOption(option);
    
    // Use the retailer's product image from the shopping option
    // Fall back to user's uploaded image if retailer image not available
    let finalImageUrl = option.imageUrl || identifiedProduct?.localImageUrl || '';
    
    // Fix protocol-relative URLs
    if (finalImageUrl && finalImageUrl.startsWith('//')) {
      finalImageUrl = 'https:' + finalImageUrl;
    }
    
    // Debug logging to track image URL issues
    console.log('📸 Image URL selection:', {
      optionImageUrl: option.imageUrl,
      localImageUrl: identifiedProduct?.localImageUrl,
      finalImageUrl: finalImageUrl
    });
    
    setManualData({
      name: option.title || identifiedProduct?.itemName || '',
      url: option.productUrl || '',
      price: option.price?.toString() || '',
      imageUrl: finalImageUrl,
      storeName: option.storeName || ''
    });
  };
  
  // Confirm selection and save item
  const handleConfirmSelection = async () => {
    if (!selectedOption && !manualData.name) {
      setError('Please select an option or enter details manually');
      return;
    }
    
    await handleManualSave();
  };
  
  const handleTrackAll = async () => {
    if (shoppingOptions.length === 0) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const fixUrl = (url) => {
        if (url && url.startsWith('//')) return 'https:' + url;
        return url || '';
      };
      
      // Use the cheapest option as the main item
      const main = shoppingOptions[0];
      const mainImageUrl = fixUrl(main.imageUrl || identifiedProduct?.localImageUrl || '');
      
      // Build tracked_sources from ALL options (including main, for a complete picture)
      const trackedSources = shoppingOptions.map(opt => ({
        title: (opt.title || '').trim(),
        url: opt.productUrl || null,
        imageUrl: fixUrl(opt.imageUrl || ''),
        price: opt.price || null,
        storeName: opt.storeName || null
      }));
      
      const res = await fetch(`${apiBase}/items/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: (main.title || inputValue || '').trim(),
          url: main.productUrl || null,
          image_url: mainImageUrl || null,
          current_price: main.price || null,
          store_name: main.storeName || null,
          tracked_sources: trackedSources
        })
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save item');
      }
      
      onSuccess();
    } catch (err) {
      setError(err.message);
    }
    
    setLoading(false);
  };
  
  // Handle confirmation/submission
  const handleConfirmAndSearch = () => {
    if (!shopNameInput.trim()) {
      setError('Please enter the brand or shop name');
      return;
    }
    if (!productNameInput.trim()) {
      setError('Please enter a product description');
      return;
    }
    // Update identified product with user's edits
    const updatedProduct = {
      ...identifiedProduct,
      itemName: productNameInput.trim()
    };
    setIdentifiedProduct(updatedProduct);
    searchWithShopName(shopNameInput.trim(), updatedProduct, identifiedProduct?.localImageUrl);
  };
  
  // Skip brand and search with just product name
  const handleSkipShopName = () => {
    if (!productNameInput.trim()) {
      setError('Please enter a product description');
      return;
    }
    const updatedProduct = {
      ...identifiedProduct,
      itemName: productNameInput.trim()
    };
    searchWithShopName(null, updatedProduct, identifiedProduct?.localImageUrl);
  };

  const handleManualSave = async () => {
    if (!manualData.name.trim()) {
      setError('Item name is required');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    // Debug logging
    console.log('💾 Saving item with image_url:', manualData.imageUrl);
    
    try {
      const res = await fetch(`${apiBase}/items/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: manualData.name.trim(),
          url: manualData.url.trim() || null,
          image_url: manualData.imageUrl || null,
          current_price: manualData.price ? parseFloat(manualData.price) : null,
          store_name: manualData.storeName || null
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
        
        {/* Hidden file input - triggered immediately when clicking "Take a Photo" */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageSelect}
          style={{ display: 'none' }}
        />
        
        {/* Mode selection */}
        {!mode && (
          <div className="mode-selection">
            <button className="mode-card" onClick={() => setMode('url')}>
              <div className="mode-icon url-icon">
                <Search size={28} />
              </div>
              <h3>Search or Paste URL</h3>
              <p>Type a product name or paste a URL from any store</p>
            </button>
            
            <button className="mode-card" onClick={handlePhotoModeClick}>
              <div className="mode-icon product-icon">
                <Camera size={28} />
              </div>
              <h3>Take a Photo</h3>
              <p>Snap a product and we'll find the best price online</p>
            </button>
          </div>
        )}
        
        {/* Unified URL / Search Mode */}
        {mode === 'url' && !extractedData && !loading && (
          <div className="url-mode">
            <p className="mode-description">
              Paste a product URL or type a name to search for the best prices.
            </p>
            
            <div className="input-group">
              <input
                type="text"
                placeholder="Paste URL or search e.g. dyson v15, nike air max..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUnifiedSubmit()}
                disabled={loading}
                autoFocus
              />
            </div>
            
            {inputValue.trim() && (
              <p className="input-hint">
                {isUrl(inputValue) ? '🔗 Looks like a URL — we\'ll fetch the product details' : '🔍 We\'ll search for the best prices online'}
              </p>
            )}
            
            {error && <p className="error-message">{error}</p>}
            
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setMode(null)}>
                Back
              </button>
              <button 
                className="btn btn-primary"
                onClick={handleUnifiedSubmit}
                disabled={!inputValue.trim() || loading}
              >
                {loading ? (
                  <>
                    <Loader size={18} className="spinning" />
                    {isUrl(inputValue) ? 'Fetching...' : 'Searching...'}
                  </>
                ) : (
                  <>
                    {isUrl(inputValue) ? 'Add Item' : 'Search'}
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </div>
          </div>
        )}
        
        {/* Unified Search/URL - Loading */}
        {mode === 'url' && loading && !extractedData && (
          <div className="image-mode processing">
            <div className="processing-indicator">
              <Loader size={32} className="spinning" />
              <p>{isUrl(inputValue) ? 'Fetching product...' : 'Searching for deals...'}</p>
              <span className="processing-hint">
                {isUrl(inputValue) ? 'Extracting price and details' : 'Finding the best prices online'}
              </span>
            </div>
          </div>
        )}
        
        {/* Image Mode - Step 1: Upload (shown if user cancels file picker or needs to re-select) */}
        {mode === 'product' && !extractedData && !isAnnotating && !loading && !imageFile && !needsShopName && (
          <div className="image-mode">
            <p className="mode-description">
              Upload a photo of the product. We'll identify it and find the best price online.
            </p>
            
            <div className="image-upload-area">
              <button 
                className="upload-label" 
                type="button"
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera size={32} />
                <span>Click to upload or take a photo</span>
              </button>
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
        {mode === 'product' && isAnnotating && imagePreview && !loading && (
          <div className="annotation-mode">
            <ImageAnnotator
              imageUrl={imagePreview}
              mode={mode}
              onConfirm={handleAnnotationConfirm}
              onCancel={handleAnnotationCancel}
            />
          </div>
        )}
        
        {/* Image Mode - Step 3: Confirm/edit product details */}
        {mode === 'product' && needsShopName && !loading && (
          <div className="brand-input-mode">
            <div className="brand-preview">
              {imagePreview && (
                <img src={imagePreview} alt="Product" className="brand-preview-image" />
              )}
            </div>
            
            <div className="brand-prompt">
              <h3>Confirm Details</h3>
              <p className="mode-description">
                Check if we got it right. Edit if needed!
              </p>
              
              <div className="form-group">
                <label>What is this product?</label>
                <input
                  type="text"
                  placeholder="e.g., Brown Bear Face Cushion"
                  value={productNameInput}
                  onChange={(e) => setProductNameInput(e.target.value)}
                />
                <span className="form-hint">Edit if the AI got it wrong</span>
              </div>
              
              <div className="form-group">
                <label>Brand / Shop</label>
                <input
                  type="text"
                  placeholder="e.g., IKEA, Miffy, Zara..."
                  value={shopNameInput}
                  onChange={(e) => setShopNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleConfirmAndSearch()}
                />
                <span className="form-hint">Where did you buy it?</span>
              </div>
              
              {/* Variant fields - only show if we detected any */}
              {(variantsInput.color || variantsInput.size || variantsInput.quantity || variantsInput.model) && (
                <div className="variants-section">
                  <label className="variants-label">Variants (for accurate matching)</label>
                  <div className="variants-grid">
                    {variantsInput.color && (
                      <div className="variant-chip">
                        <span className="variant-type">Color</span>
                        <input
                          type="text"
                          value={variantsInput.color}
                          onChange={(e) => setVariantsInput({...variantsInput, color: e.target.value})}
                          className="variant-input"
                        />
                      </div>
                    )}
                    {variantsInput.size && (
                      <div className="variant-chip">
                        <span className="variant-type">Size</span>
                        <input
                          type="text"
                          value={variantsInput.size}
                          onChange={(e) => setVariantsInput({...variantsInput, size: e.target.value})}
                          className="variant-input"
                        />
                      </div>
                    )}
                    {variantsInput.quantity && (
                      <div className="variant-chip">
                        <span className="variant-type">Qty</span>
                        <input
                          type="text"
                          value={variantsInput.quantity}
                          onChange={(e) => setVariantsInput({...variantsInput, quantity: e.target.value})}
                          className="variant-input"
                        />
                      </div>
                    )}
                    {variantsInput.model && (
                      <div className="variant-chip">
                        <span className="variant-type">Model</span>
                        <input
                          type="text"
                          value={variantsInput.model}
                          onChange={(e) => setVariantsInput({...variantsInput, model: e.target.value})}
                          className="variant-input"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {error && <p className="error-message">{error}</p>}
              
              <div className="modal-actions">
                <button 
                  className="btn btn-secondary" 
                  onClick={handleSkipShopName}
                  disabled={!productNameInput.trim()}
                >
                  Search without brand
                </button>
                <button 
                  className="btn btn-primary"
                  onClick={handleConfirmAndSearch}
                  disabled={!shopNameInput.trim() || !productNameInput.trim()}
                >
                  Search
                  <ArrowRight size={18} />
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Image Mode - Loading state while processing */}
        {mode === 'product' && loading && !extractedData && (
          <div className="image-mode processing">
            <div className="processing-indicator">
              <Loader size={32} className="spinning" />
              <p>Finding exact matches...</p>
              <span className="processing-hint">
                Searching for the best price...
              </span>
            </div>
          </div>
        )}
        
        {/* Shopping Options - User picks from top 3 cheapest */}
        {extractedData && shoppingOptions.length > 0 && !selectedOption && (
          <div className="shopping-options-mode">
            <h3>Pick one to track</h3>
            <p className="mode-description">
              We found these options online. Select one to monitor its price:
            </p>
            
            <div className="shopping-options-list">
              {shoppingOptions.map((option, index) => (
                <div 
                  key={index} 
                  className="shopping-option-card"
                  onClick={() => handleSelectOption(option)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="option-rank">#{index + 1}</div>
                  {option.imageUrl && (
                    <img src={option.imageUrl} alt={option.title} className="option-image" />
                  )}
                  <div className="option-details">
                    <h4 className="option-title">{option.title?.substring(0, 60)}...</h4>
                    <div className="option-meta">
                      <span className="option-store">{option.storeName}</span>
                      {option.price && (
                        <span className="option-price">£{option.price.toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                  <div className="option-actions">
                    <ExternalLink size={16} className="option-arrow" />
                    <button 
                      className="option-dismiss"
                      onClick={(e) => { e.stopPropagation(); handleDismissOption(index); }}
                      title="Remove this result"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="shopping-options-footer">
              <p className="form-help">
                Can't find what you're looking for?
              </p>
                <button 
                  className="btn btn-link"
                  onClick={() => {
                    // Allow manual entry - use server-side image URL, not blob URL
                    setSelectedOption({ manual: true });
                    setManualData({
                      name: identifiedProduct?.itemName || '',
                      url: '',
                      price: '',
                      imageUrl: identifiedProduct?.localImageUrl || '',
                      storeName: ''
                    });
                  }}
                >
                  Enter details manually
                </button>
            </div>
            
            {error && <p className="error-message">{error}</p>}
            
            <div className="modal-actions">
              <button 
                className="btn btn-secondary" 
                onClick={() => {
                  setExtractedData(null);
                  setShoppingOptions([]);
                  if (mode === 'product') {
                    setNeedsShopName(true);
                  }
                }}
              >
                Back
              </button>
              {shoppingOptions.length > 1 && (
                <button 
                  className="btn btn-primary"
                  onClick={handleTrackAll}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader size={18} className="spinning" />
                      Saving...
                    </>
                  ) : (
                    <>
                      Track All {shoppingOptions.length}
                      <Check size={18} />
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}
        
        {/* Confirm selected option OR manual entry */}
        {extractedData && (selectedOption || (searchResults && !searchResults.found)) && (
          <div className="extracted-mode">
            {selectedOption && !selectedOption.manual && (
              <div className="extracted-success">
                <Check size={20} />
                <span>Great choice! Confirm details below.</span>
              </div>
            )}
            
            <div className="extracted-preview">
              {/* Show product image */}
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
              
              <div className="form-group">
                <label>URL to Track</label>
                <input
                  type="url"
                  value={manualData.url}
                  onChange={(e) => setManualData({ ...manualData, url: e.target.value })}
                  placeholder="https://..."
                />
                {selectedOption && !selectedOption.manual && (
                  <p className="form-help success-text">
                    ✓ URL auto-filled from your selection
                  </p>
                )}
              </div>
              
              {selectedOption && !selectedOption.manual && manualData.price && (
                <div className="selected-price-display">
                  <span className="price-label">Current price:</span>
                  <span className="price-value">£{parseFloat(manualData.price).toFixed(2)}</span>
                  <span className="price-store">at {manualData.storeName}</span>
                </div>
              )}
            </div>
            
            {/* No shopping results found - show manual search link */}
            {searchResults && !searchResults.found && (
              <div className="search-suggestions not-found">
                <h4>⚠️ No results found</h4>
                <p className="form-help">
                  Try searching manually or paste a URL if you find it.
                </p>
                {searchResults.searchUrl && (
                  <a
                    href={searchResults.searchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="suggestion-link"
                  >
                    <ExternalLink size={14} />
                    Search Google Shopping
                  </a>
                )}
              </div>
            )}
            
            {error && <p className="error-message">{error}</p>}
            
            <div className="modal-actions">
              <button 
                className="btn btn-secondary" 
                onClick={() => {
                  setSelectedOption(null);
                  if (shoppingOptions.length > 0) {
                    // Go back to options
                  } else {
                    setExtractedData(null);
                    setSearchResults(null);
                  }
                }}
              >
                Back
              </button>
              <button 
                className="btn btn-primary"
                onClick={handleConfirmSelection}
                disabled={!manualData.name.trim() || loading}
              >
                {loading ? (
                  <>
                    <Loader size={18} className="spinning" />
                    Saving...
                  </>
                ) : (
                  <>
                    Track This Item
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

