import { useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  Plus, 
  Bell, 
  RefreshCw, 
  TrendingDown, 
  TrendingUp, 
  Minus,
  Link as LinkIcon,
  Camera,
  Package,
  X,
  Check,
  ExternalLink
} from 'lucide-react';
import ItemCard from '../components/ItemCard';
import AddItemModal from '../components/AddItemModal';
import AlertBanner from '../components/AlertBanner';
import './Dashboard.css';

export default function Dashboard({ items, alerts, onRefresh, apiBase }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefreshAll = async () => {
    setRefreshing(true);
    try {
      // Refresh each item sequentially
      for (const item of items.filter(i => i.url)) {
        await fetch(`${apiBase}/items/${item.id}/refresh`, { method: 'POST' });
      }
      onRefresh();
    } catch (error) {
      console.error('Failed to refresh:', error);
    }
    setRefreshing(false);
  };

  const handleMarkAllRead = async () => {
    try {
      await fetch(`${apiBase}/alerts/read-all`, { method: 'PUT' });
      onRefresh();
    } catch (error) {
      console.error('Failed to mark alerts as read:', error);
    }
  };

  // Calculate stats
  const totalItems = items.length;
  const itemsWithDrops = items.filter(i => i.current_price && i.original_price && i.current_price < i.original_price).length;
  const totalSavings = items.reduce((sum, item) => {
    if (item.current_price && item.original_price && item.current_price < item.original_price) {
      return sum + (item.original_price - item.current_price);
    }
    return sum;
  }, 0);

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-left">
          <h1><span className="logo-emoji">🚗</span> beepbeep.cheap</h1>
          <p className="subtitle">Honk if you love deals! 📣</p>
        </div>
        <div className="header-actions">
          <button 
            className="btn btn-ghost btn-icon alert-btn"
            onClick={() => setShowAlerts(!showAlerts)}
          >
            <Bell size={20} />
            {alerts.length > 0 && (
              <span className="alert-count">{alerts.length}</span>
            )}
          </button>
          <button 
            className="btn btn-secondary"
            onClick={handleRefreshAll}
            disabled={refreshing}
          >
            <RefreshCw size={18} className={refreshing ? 'spinning' : ''} />
            {refreshing ? 'Checking...' : 'Check Prices'}
          </button>
          <button 
            className="btn btn-primary"
            onClick={() => setShowAddModal(true)}
          >
            <Plus size={18} />
            Add Item
          </button>
        </div>
      </header>

      {/* Alert dropdown */}
      {showAlerts && (
        <div className="alerts-dropdown fade-in">
          <div className="alerts-header">
            <h3>Price Alerts</h3>
            {alerts.length > 0 && (
              <button className="btn btn-ghost" onClick={handleMarkAllRead}>
                <Check size={16} />
                Mark all read
              </button>
            )}
          </div>
          {alerts.length === 0 ? (
            <p className="alerts-empty">No new alerts</p>
          ) : (
            <div className="alerts-list">
              {alerts.map(alert => (
                <AlertBanner key={alert.id} alert={alert} apiBase={apiBase} onDismiss={onRefresh} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Stats bar */}
      <div className="stats-bar">
        <div className="stat-card">
          <Package size={24} className="stat-icon" />
          <div className="stat-content">
            <span className="stat-value">{totalItems}</span>
            <span className="stat-label">Items Tracked</span>
          </div>
        </div>
        <div className="stat-card">
          <TrendingDown size={24} className="stat-icon mint" />
          <div className="stat-content">
            <span className="stat-value">{itemsWithDrops}</span>
            <span className="stat-label">Price Drops</span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon-text">£</span>
          <div className="stat-content">
            <span className="stat-value">£{totalSavings.toFixed(2)}</span>
            <span className="stat-label">Potential Savings</span>
          </div>
        </div>
      </div>

      {/* Items grid */}
      <main className="dashboard-main">
        {items.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <Package size={64} />
            </div>
            <h2>No items yet</h2>
            <p>Start tracking prices by adding your first item</p>
            <div className="empty-actions">
              <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                <Plus size={18} />
                Add Your First Item
              </button>
            </div>
          </div>
        ) : (
          <div className="items-grid">
            {items.map((item, index) => (
              <ItemCard 
                key={item.id} 
                item={item} 
                apiBase={apiBase}
                onRefresh={onRefresh}
                style={{ animationDelay: `${index * 0.05}s` }}
              />
            ))}
          </div>
        )}
      </main>

      {/* Add Item Modal */}
      {showAddModal && (
        <AddItemModal 
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            onRefresh();
          }}
          apiBase={apiBase}
        />
      )}
    </div>
  );
}

