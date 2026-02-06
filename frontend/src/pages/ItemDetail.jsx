import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  RefreshCw, 
  Trash2, 
  ExternalLink,
  TrendingDown,
  TrendingUp,
  Calendar,
  Clock,
  Search,
  Sparkles,
  AlertCircle,
  PlusCircle,
  Check,
  Replace,
  X
} from 'lucide-react';
import PriceChart from '../components/PriceChart';
import './ItemDetail.css';

export default function ItemDetail({ apiBase, onRefresh }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Alternatives state
  const [alternatives, setAlternatives] = useState([]);
  const [alternativesLoading, setAlternativesLoading] = useState(false);
  const [alternativesError, setAlternativesError] = useState(null);
  const [alternativesSearched, setAlternativesSearched] = useState(false);
  const [hasBestPrice, setHasBestPrice] = useState(false);
  const [addingToWatchlist, setAddingToWatchlist] = useState({}); // Track which items are being added
  const [addedToWatchlist, setAddedToWatchlist] = useState({}); // Track which items have been added
  
  // Confirmation modal state
  const [showWatchlistModal, setShowWatchlistModal] = useState(false);
  const [selectedAlternative, setSelectedAlternative] = useState(null);
  const [selectedAltIndex, setSelectedAltIndex] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [itemRes, historyRes] = await Promise.all([
          fetch(`${apiBase}/items/${id}`),
          fetch(`${apiBase}/items/${id}/history`)
        ]);
        const itemData = await itemRes.json();
        const historyData = await historyRes.json();
        setItem(itemData);
        setHistory(historyData);
      } catch (error) {
        console.error('Failed to fetch item:', error);
      }
      setLoading(false);
    };
    fetchData();
  }, [id, apiBase]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`${apiBase}/items/${id}/refresh`, { method: 'POST' });
      const updatedItem = await res.json();
      setItem(updatedItem);
      
      // Refetch history
      const historyRes = await fetch(`${apiBase}/items/${id}/history`);
      const historyData = await historyRes.json();
      setHistory(historyData);
      
      onRefresh();
    } catch (error) {
      console.error('Failed to refresh:', error);
    }
    setRefreshing(false);
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this item?')) return;
    
    try {
      await fetch(`${apiBase}/items/${id}`, { method: 'DELETE' });
      onRefresh();
      navigate('/');
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  };

  // Search for cheaper alternatives at other stores
  const searchAlternatives = async () => {
    setAlternativesLoading(true);
    setAlternativesError(null);
    setAlternativesSearched(true);
    
    try {
      const res = await fetch(`${apiBase}/items/${id}/alternatives`);
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to search');
      }
      
      setAlternatives(data.alternatives || []);
      setHasBestPrice(data.hasBestPrice || false);
    } catch (error) {
      console.error('Failed to find alternatives:', error);
      setAlternativesError(error.message);
    }
    
    setAlternativesLoading(false);
  };

  // Show confirmation modal when user wants to add to watchlist
  const handleTrackClick = (alt, index, e) => {
    e.preventDefault(); // Don't follow the link
    e.stopPropagation();
    
    setSelectedAlternative(alt);
    setSelectedAltIndex(index);
    setShowWatchlistModal(true);
  };

  // Close the modal
  const closeWatchlistModal = () => {
    setShowWatchlistModal(false);
    setSelectedAlternative(null);
    setSelectedAltIndex(null);
  };

  // Add the alternative to watchlist (keep current item)
  const addToWatchlist = async () => {
    if (!selectedAlternative || selectedAltIndex === null) return;
    
    const alt = selectedAlternative;
    const index = selectedAltIndex;
    
    setShowWatchlistModal(false);
    setAddingToWatchlist(prev => ({ ...prev, [index]: true }));
    
    try {
      const res = await fetch(`${apiBase}/items/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: alt.title,
          url: alt.productUrl,
          image_url: alt.imageUrl,
          current_price: alt.price,
          store_name: alt.storeName
        })
      });
      
      if (!res.ok) {
        throw new Error('Failed to add item');
      }
      
      setAddedToWatchlist(prev => ({ ...prev, [index]: true }));
      onRefresh(); // Refresh the dashboard
    } catch (error) {
      console.error('Failed to add to watchlist:', error);
      alert('Failed to add item to watchlist');
    }
    
    setAddingToWatchlist(prev => ({ ...prev, [index]: false }));
    setSelectedAlternative(null);
    setSelectedAltIndex(null);
  };

  // Replace current item with the alternative
  const replaceWithAlternative = async () => {
    if (!selectedAlternative || selectedAltIndex === null) return;
    
    const alt = selectedAlternative;
    const index = selectedAltIndex;
    
    setShowWatchlistModal(false);
    setAddingToWatchlist(prev => ({ ...prev, [index]: true }));
    
    try {
      // First, add the new item
      const addRes = await fetch(`${apiBase}/items/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: alt.title,
          url: alt.productUrl,
          image_url: alt.imageUrl,
          current_price: alt.price,
          store_name: alt.storeName
        })
      });
      
      if (!addRes.ok) {
        throw new Error('Failed to add item');
      }
      
      const newItem = await addRes.json();
      
      // Then, delete the current item
      const deleteRes = await fetch(`${apiBase}/items/${id}`, {
        method: 'DELETE'
      });
      
      if (!deleteRes.ok) {
        console.warn('Failed to delete original item, but new item was added');
      }
      
      onRefresh(); // Refresh the dashboard
      
      // Navigate to the new item
      navigate(`/item/${newItem.id}`);
    } catch (error) {
      console.error('Failed to replace item:', error);
      alert('Failed to replace item');
      setAddingToWatchlist(prev => ({ ...prev, [index]: false }));
    }
    
    setSelectedAlternative(null);
    setSelectedAltIndex(null);
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="item-detail">
        <div className="error-state">
          <h2>Item not found</h2>
          <Link to="/" className="btn btn-primary">Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  const priceChange = item.original_price && item.current_price 
    ? ((item.current_price - item.original_price) / item.original_price * 100).toFixed(1)
    : 0;
  const savings = item.original_price && item.current_price && item.current_price < item.original_price
    ? (item.original_price - item.current_price).toFixed(2)
    : null;

  return (
    <div className="item-detail">
      {/* Header */}
      <header className="detail-header">
        <Link to="/" className="back-link">
          <ArrowLeft size={20} />
          Back to Dashboard
        </Link>
      </header>

      {/* Main content */}
      <div className="detail-content">
        {/* Product info */}
        <div className="product-info card fade-in">
          <div className="product-image-container">
            {item.image_url ? (
              <img 
                src={item.image_url.startsWith('/') ? `http://localhost:3001${item.image_url}` : item.image_url} 
                alt={item.name}
                className="product-image"
              />
            ) : (
              <div className="product-image-placeholder">
                <span>No Image</span>
              </div>
            )}
            {item.store_name && (
              <span className="image-store-badge">{item.store_name}</span>
            )}
            <div className="image-actions">
              {item.url && (
                <button 
                  className="image-action-btn"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  title="Refresh price"
                >
                  <RefreshCw size={16} className={refreshing ? 'spinning' : ''} />
                </button>
              )}
              <button 
                className="image-action-btn image-action-btn--danger" 
                onClick={handleDelete}
                title="Delete item"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
          <div className="product-details">
            {item.url ? (
              <a 
                href={item.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="product-name-link"
              >
                <h1 className="product-name">
                  {item.name}
                  <ExternalLink size={16} className="external-link-icon" />
                </h1>
              </a>
            ) : (
              <h1 className="product-name">{item.name}</h1>
            )}
            
            <div className="price-section">
              <span className="price-now">£{item.current_price?.toFixed(2) || '--'}</span>
              {priceChange != 0 && (
                <span className={`price-badge ${priceChange < 0 ? 'price-down' : 'price-up'}`}>
                  {priceChange < 0 ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
                  {Math.abs(priceChange)}%
                </span>
              )}
              {item.original_price && item.original_price !== item.current_price && (
                <span className="price-original">was £{item.original_price.toFixed(2)}</span>
              )}
              {savings && (
                <span className="price-savings">save £{savings}</span>
              )}
            </div>
            
            <div className="timestamps">
              <div className="timestamp">
                <Calendar size={14} />
                <span>Added {new Date(item.created_at).toLocaleDateString()}</span>
              </div>
              {item.last_checked && (
                <div className="timestamp">
                  <Clock size={14} />
                  <span>Last checked {new Date(item.last_checked).toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Find Cheaper Alternatives Section */}
        <div className="alternatives-section card fade-in" style={{ animationDelay: '0.05s' }}>
          <div className="alternatives-header">
            <h2>
              Find it Cheaper
            </h2>
            {!alternativesSearched && (
              <button 
                className="btn btn-search-alternatives"
                onClick={searchAlternatives}
                disabled={alternativesLoading}
              >
                {alternativesLoading ? (
                  <>
                    <RefreshCw size={14} className="spinning" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search size={14} />
                    Search Other Shops
                  </>
                )}
              </button>
            )}
          </div>
          
          {alternativesLoading && (
            <div className="alternatives-loading">
              <div className="loading-spinner small"></div>
              <p>Searching for cheaper prices...</p>
              <span className="loading-hint">This may take 10-15 seconds</span>
            </div>
          )}
          
          {alternativesError && (
            <div className="alternatives-error">
              <AlertCircle size={16} />
              <span>{alternativesError}</span>
              <button onClick={searchAlternatives} className="retry-btn">
                Try again
              </button>
            </div>
          )}
          
          {alternativesSearched && !alternativesLoading && !alternativesError && (
            <>
              {/* Best price banner - shows when current price is cheapest */}
              {hasBestPrice && alternatives.length > 0 && (
                <div className="best-price-banner">
                  <Sparkles size={18} className="best-price-icon" />
                  <div className="best-price-text">
                    <strong>You've got the best price!</strong>
                    <span>£{item.current_price?.toFixed(2)} is cheaper than all alternatives</span>
                  </div>
                </div>
              )}
              
              {alternatives.length > 0 ? (
                <div className="alternatives-list">
                  {alternatives.map((alt, index) => (
                    <div 
                      key={index}
                      className={`alternative-item ${alt.isCheaper ? 'is-cheaper' : 'is-more-expensive'}`}
                    >
                      <a 
                        href={alt.productUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="alt-link"
                      >
                        <div className="alt-rank">#{index + 1}</div>
                        <div className="alt-info">
                          <span className="alt-store">{alt.storeName || 'Unknown Store'}</span>
                          <span className="alt-title">{alt.title?.substring(0, 80) || 'Product'}</span>
                        </div>
                        <div className="alt-price-section">
                          <span className="alt-price">£{alt.price?.toFixed(2)}</span>
                          {alt.isCheaper && alt.savings && (
                            <span className="alt-savings">
                              <Sparkles size={12} />
                              Save £{alt.savings}
                            </span>
                          )}
                          {!alt.isCheaper && alt.extraCost && (
                            <span className="alt-extra-cost">
                              +£{alt.extraCost} more
                            </span>
                          )}
                        </div>
                        <ExternalLink size={14} className="alt-link-icon" />
                      </a>
                      
                      {/* Add to Watchlist button for cheaper items */}
                      {alt.isCheaper && (
                        <button
                          className={`btn-add-watchlist ${addedToWatchlist[index] ? 'added' : ''}`}
                          onClick={(e) => handleTrackClick(alt, index, e)}
                          disabled={addingToWatchlist[index] || addedToWatchlist[index]}
                          title={addedToWatchlist[index] ? 'Added to watchlist!' : 'Track this price'}
                        >
                          {addingToWatchlist[index] ? (
                            <RefreshCw size={14} className="spinning" />
                          ) : addedToWatchlist[index] ? (
                            <>
                              <Check size={14} />
                              <span>Added!</span>
                            </>
                          ) : (
                            <>
                              <PlusCircle size={14} />
                              <span>Track</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="no-alternatives">
                  <p>No matching products found</p>
                  <span>Couldn't find this exact product at other stores</span>
                </div>
              )}
              
              <button 
                className="btn btn-search-again"
                onClick={searchAlternatives}
                disabled={alternativesLoading}
              >
                <RefreshCw size={14} />
                Search Again
              </button>
            </>
          )}
          
        </div>

        {/* Price history chart */}
        <div className="price-history-section card fade-in" style={{ animationDelay: '0.1s' }}>
          <h2>Price History</h2>
          {history.length > 1 ? (
            <PriceChart data={history} />
          ) : (
            <p className="no-history">
              Not enough data yet. Price history will appear after more checks.
            </p>
          )}
        </div>

        {/* Price history table */}
        {history.length > 0 && (
          <div className="history-table-section card fade-in" style={{ animationDelay: '0.2s' }}>
            <h2>Price Log</h2>
            <div className="history-table-wrapper">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Price</th>
                    <th>Change</th>
                  </tr>
                </thead>
                <tbody>
                  {history.slice().reverse().map((entry, index, arr) => {
                    const prevEntry = arr[index + 1];
                    const change = prevEntry 
                      ? ((entry.price - prevEntry.price) / prevEntry.price * 100).toFixed(1)
                      : null;
                    
                    return (
                      <tr key={entry.id}>
                        <td>{new Date(entry.checked_at).toLocaleString()}</td>
                        <td className="price">£{entry.price.toFixed(2)}</td>
                        <td>
                          {change !== null && change != 0 && (
                            <span className={parseFloat(change) < 0 ? 'price-down' : 'price-up'}>
                              {parseFloat(change) < 0 ? '↓' : '↑'} {Math.abs(change)}%
                            </span>
                          )}
                          {change == 0 && <span className="price-same">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      
      {/* Watchlist Confirmation Modal */}
      {showWatchlistModal && selectedAlternative && (
        <div className="watchlist-modal-overlay" onClick={closeWatchlistModal}>
          <div className="watchlist-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={closeWatchlistModal}>
              <X size={18} />
            </button>
            
            <div className="modal-header">
              <h3>Track This Item?</h3>
            </div>
            
            <div className="modal-product-preview">
              <span className="preview-store">{selectedAlternative.storeName}</span>
              <span className="preview-title">{selectedAlternative.title?.substring(0, 60)}...</span>
              <span className="preview-price">£{selectedAlternative.price?.toFixed(2)}</span>
              {selectedAlternative.savings && (
                <span className="preview-savings">Save £{selectedAlternative.savings}</span>
              )}
            </div>
            
            <p className="modal-question">What would you like to do?</p>
            
            <div className="modal-actions">
              <button 
                className="btn btn-add-both"
                onClick={addToWatchlist}
              >
                <PlusCircle size={16} />
                <div className="btn-text">
                  <span className="btn-label">Add to List</span>
                  <span className="btn-desc">Keep tracking both items</span>
                </div>
              </button>
              
              <button 
                className="btn btn-replace"
                onClick={replaceWithAlternative}
              >
                <Replace size={16} />
                <div className="btn-text">
                  <span className="btn-label">Replace Current</span>
                  <span className="btn-desc">Switch to tracking this instead</span>
                </div>
              </button>
            </div>
            
            <button className="btn btn-cancel" onClick={closeWatchlistModal}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

