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
  ExternalLink,
  Sparkles
} from 'lucide-react';
import ItemCard from '../components/ItemCard';
import AddItemModal from '../components/AddItemModal';
import AlertBanner from '../components/AlertBanner';
import { Hyrax, Raccoon } from '../components/PixelMascot';
// Import mascot images
import hyraxImage from '../assets/hyrax.png';
import raccoonImage from '../assets/raccoon.png';
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
    <div className="dashboard-modern">
      {/* Modern Navigation */}
      <nav className="nav-modern">
        <div className="nav-conveyor-belt">
          <div className="nav-conveyor-text">
            BEEP BEEP <span className="conveyor-emoji">🔊</span> CHEEEEEEAP <span className="conveyor-emoji">💰</span> <img src={hyraxImage} alt="hyrax" className="conveyor-mascot" /> BEEP BEEP <span className="conveyor-emoji">🔊</span> CHEEEEEEAP <span className="conveyor-emoji">💰</span> <img src={raccoonImage} alt="raccoon" className="conveyor-mascot" /> BEEP BEEP <span className="conveyor-emoji">🔊</span> CHEEEEEEAP <span className="conveyor-emoji">💰</span> <img src={hyraxImage} alt="hyrax" className="conveyor-mascot" /> BEEP BEEP <span className="conveyor-emoji">🔊</span> CHEEEEEEAP <span className="conveyor-emoji">💰</span> <img src={raccoonImage} alt="raccoon" className="conveyor-mascot" /> BEEP BEEP <span className="conveyor-emoji">🔊</span> CHEEEEEEAP <span className="conveyor-emoji">💰</span>
          </div>
        </div>
        <div className="nav-modern-container">
          <Link to="/" className="nav-modern-logo">
            <Raccoon variant="waving" className="small" useGif={true} gifSrc={raccoonImage} />
          </Link>
          <div className="nav-modern-actions">
            <button 
              className="btn-modern btn-modern-icon"
              onClick={() => setShowAlerts(!showAlerts)}
              aria-label="Alerts"
            >
              <Bell size={16} />
              {alerts.length > 0 && (
                <span className="badge-modern">{alerts.length}</span>
              )}
            </button>
            <button 
              className="btn-modern btn-modern-secondary"
              onClick={handleRefreshAll}
              disabled={refreshing}
            >
              <RefreshCw size={16} className={refreshing ? 'spinning' : ''} />
              <span>Refresh</span>
            </button>
            <button 
              className="btn-modern btn-modern-primary"
              onClick={() => setShowAddModal(true)}
            >
              <Plus size={16} />
              <span>Add Item</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section - Retro Game Menu */}
      <section className="hero-modern">
        <div className="hero-modern-content">
          <div className="hero-badge">
            <span>⭐</span>
            <span>Price Tracking Made Simple</span>
          </div>
          <div className="hero-title-wrapper">
            <Hyrax variant="smiling" className="medium" useGif={hyraxImage !== null} gifSrc={hyraxImage} />
            <h1 className="hero-title-modern">
              Never Miss a<br />
              <span className="gradient-text">Great Deal</span>
            </h1>
            <Raccoon variant="waving" className="medium" useGif={true} gifSrc={raccoonImage} />
          </div>
          <p className="hero-description">
            Track prices, get alerts, and save money on your favorite products.
            Smart shopping starts here.
          </p>
        </div>
      </section>

      {/* Alerts Section */}
      {showAlerts && (
        <div className="alerts-modern fade-in">
          <div className="alerts-modern-header">
            <h3 className="alerts-modern-title">Price Alerts</h3>
            {alerts.length > 0 && (
              <button className="btn-modern btn-modern-ghost" onClick={handleMarkAllRead}>
                <Check size={16} />
                <span>Mark All Read</span>
              </button>
            )}
          </div>
          {alerts.length === 0 ? (
            <div className="alerts-empty-modern">
              <Bell size={48} />
              <p>No new alerts</p>
            </div>
          ) : (
            <div className="alerts-list-modern">
              {alerts.map(alert => (
                <AlertBanner key={alert.id} alert={alert} apiBase={apiBase} onDismiss={onRefresh} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Stats Cards - Glassmorphism */}
      <section className="stats-modern">
        <div className="stats-modern-grid">
          <div className="stat-card-modern">
            <div className="stat-card-icon">
              <Package size={20} />
            </div>
            <div className="stat-card-content">
              <div className="stat-card-value">{totalItems}</div>
              <div className="stat-card-label">Items Tracked</div>
            </div>
          </div>
          <div className="stat-card-modern stat-card-modern-accent">
            <div className="stat-card-icon stat-card-icon-accent">
              <TrendingDown size={20} />
            </div>
            <div className="stat-card-content">
              <div className="stat-card-value">{itemsWithDrops}</div>
              <div className="stat-card-label">Price Drops</div>
            </div>
          </div>
          <div className="stat-card-modern">
            <div className="stat-card-icon stat-card-icon-gold">
              <span className="stat-icon-currency">£</span>
            </div>
            <div className="stat-card-content">
              <div className="stat-card-value">£{totalSavings.toFixed(2)}</div>
              <div className="stat-card-label">Potential Savings</div>
            </div>
          </div>
        </div>
      </section>

      {/* Items Grid */}
      <main className="main-modern">
        <div className="section-header-modern">
          <h2 className="section-title-modern">Your Tracked Items</h2>
          <p className="section-subtitle-modern">Monitor prices and get notified of changes</p>
        </div>
        {items.length === 0 ? (
          <div className="empty-state-modern">
            <div className="empty-state-icon">
              <Hyrax variant="blinking" className="large" />
            </div>
            <h3 className="empty-state-title">Start Tracking Prices</h3>
            <p className="empty-state-text">
              Add your first item to begin monitoring prices and saving money
            </p>
            <button 
              className="btn-modern btn-modern-primary btn-modern-large"
              onClick={() => setShowAddModal(true)}
            >
              <Plus size={16} />
              <span>Add Your First Item</span>
            </button>
          </div>
        ) : (
          <div className="items-grid-modern">
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
