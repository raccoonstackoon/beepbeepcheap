import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { 
  RefreshCw, 
  Trash2, 
  ExternalLink,
  TrendingDown,
  TrendingUp,
  MoreVertical
} from 'lucide-react';
import './ItemCard.css';

export default function ItemCard({ item, apiBase, onRefresh, style }) {
  const [refreshing, setRefreshing] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu]);

  const handleRefresh = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!item.url) return;
    
    setRefreshing(true);
    try {
      await fetch(`${apiBase}/items/${item.id}/refresh`, { method: 'POST' });
      onRefresh();
    } catch (error) {
      console.error('Failed to refresh:', error);
    }
    setRefreshing(false);
  };

  const handleDelete = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!confirm('Delete this item?')) return;
    
    try {
      await fetch(`${apiBase}/items/${item.id}`, { method: 'DELETE' });
      onRefresh();
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  };

  const priceChange = item.original_price && item.current_price 
    ? ((item.current_price - item.original_price) / item.original_price * 100).toFixed(1)
    : 0;

  const isDropped = priceChange < 0;
  const isIncreased = priceChange > 0;

  return (
    <Link 
      to={`/item/${item.id}`} 
      className="item-card fade-in"
      style={style}
    >
      {/* Image */}
      <div className="item-image-container">
        {item.image_url ? (
          <img 
            src={item.image_url.startsWith('/') ? `http://localhost:3001${item.image_url}` : item.image_url} 
            alt={item.name}
            className="item-image"
            loading="lazy"
          />
        ) : (
          <div className="item-image-placeholder">
            <span>No Image</span>
          </div>
        )}
        
        {/* Price change badge */}
        {priceChange != 0 && (
          <div className={`price-change-badge ${isDropped ? 'dropped' : 'increased'}`}>
            {isDropped ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
            {Math.abs(priceChange)}%
          </div>
        )}
      </div>

      {/* Content */}
      <div className="item-content">
        {item.store_name && (
          <span className="item-store">{item.store_name}</span>
        )}
        <h3 className="item-name">{item.name}</h3>
        
        <div className="item-price-row">
          <span className={`item-current-price price ${isDropped ? 'price-down' : ''}`}>
            £{item.current_price?.toFixed(2) || '--'}
          </span>
          
          {item.original_price && item.original_price !== item.current_price && (
            <span className="item-original-price">
              £{item.original_price.toFixed(2)}
            </span>
          )}
        </div>
        
        {item.lowest_price && item.current_price === item.lowest_price && (
          <span className="lowest-badge">Lowest price!</span>
        )}
      </div>

      {/* Actions */}
      <div className="item-actions">
        {item.url && (
          <button 
            className="btn btn-ghost btn-icon"
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh price"
          >
            <RefreshCw size={16} className={refreshing ? 'spinning' : ''} />
          </button>
        )}
        
        <div className="menu-container" ref={menuRef}>
          <button 
            className="btn btn-ghost btn-icon"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
          >
            <MoreVertical size={16} />
          </button>
          
          {showMenu && (
            <div className="menu-dropdown" onClick={(e) => e.stopPropagation()}>
              {item.url && (
                <a 
                  href={item.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="menu-item"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink size={14} />
                  Open in store
                </a>
              )}
              <button className="menu-item danger" onClick={handleDelete}>
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

