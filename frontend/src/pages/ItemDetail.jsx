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
  Clock
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
        <div className="detail-actions">
          {item.url && (
            <button 
              className="btn btn-secondary"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw size={18} className={refreshing ? 'spinning' : ''} />
              {refreshing ? 'Checking...' : 'Refresh Price'}
            </button>
          )}
          <button className="btn btn-ghost" onClick={handleDelete}>
            <Trash2 size={18} />
            Delete
          </button>
        </div>
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
          </div>
          <div className="product-details">
            {item.store_name && (
              <span className="product-store">{item.store_name}</span>
            )}
            <h1 className="product-name">{item.name}</h1>
            
            {item.url && (
              <a 
                href={item.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="product-link"
              >
                <ExternalLink size={14} />
                View on store
              </a>
            )}
            
            <div className="price-section">
              <div className="current-price-display">
                <span className="price-label">Current Price</span>
                <span className="price-value price">
                  £{item.current_price?.toFixed(2) || '--'}
                </span>
                {priceChange != 0 && (
                  <span className={`price-badge ${priceChange < 0 ? 'price-down' : 'price-up'}`}>
                    {priceChange < 0 ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
                    {Math.abs(priceChange)}%
                  </span>
                )}
              </div>
              
              <div className="price-meta">
                {item.original_price && (
                  <div className="meta-item">
                    <span className="meta-label">Original</span>
                    <span className="meta-value">£{item.original_price.toFixed(2)}</span>
                  </div>
                )}
                {item.lowest_price && (
                  <div className="meta-item">
                    <span className="meta-label">Lowest</span>
                    <span className="meta-value lowest">£{item.lowest_price.toFixed(2)}</span>
                  </div>
                )}
                {savings && (
                  <div className="meta-item savings">
                    <span className="meta-label">You save</span>
                    <span className="meta-value">£{savings}</span>
                  </div>
                )}
              </div>
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
    </div>
  );
}

