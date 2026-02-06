import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Plus, 
  Bell, 
  RefreshCw, 
  TrendingUp, 
  Minus,
  Link as LinkIcon,
  Camera,
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
  const [fallingMascots, setFallingMascots] = useState([]);
  
  // Rewards state
  const [rewards, setRewards] = useState(null);
  const [rewardToast, setRewardToast] = useState(null); // { message, coins }

  // Calculate stats (moved up so they can be used in effects)
  const totalItems = items.length;
  const itemsWithDrops = items.filter(i => i.current_price && i.original_price && i.current_price < i.original_price).length;
  const totalSavings = items.reduce((sum, item) => {
    if (item.current_price && item.original_price && item.current_price < item.original_price) {
      return sum + (item.original_price - item.current_price);
    }
    return sum;
  }, 0);

  // Show reward toast notification (moved up so it can be used in effects)
  const showRewardToast = (message, coins) => {
    setRewardToast({ message, coins });
    setTimeout(() => setRewardToast(null), 3000);
  };

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

  // Create falling mascots randomly
  useEffect(() => {
    const createFallingMascot = (isGiant = false) => {
      const mascotType = Math.random() > 0.5 ? 'hyrax' : 'raccoon';
      const leftPosition = Math.random() * 100; // Random horizontal position (0-100%)
      const delay = Math.random() * 2; // Random delay (0-2s)
      
      // Giant mascots are HUGE and fall slower for dramatic effect
      const duration = isGiant ? 6 + Math.random() * 2 : 3 + Math.random() * 2;
      const size = isGiant ? 250 + Math.random() * 100 : 60 + Math.random() * 50;
      
      const mascot = {
        id: Date.now() + Math.random(),
        type: mascotType,
        left: isGiant ? 20 + Math.random() * 60 : leftPosition, // Giants stay more centered
        delay,
        duration,
        size,
        isGiant
      };
      
      setFallingMascots(prev => [...prev, mascot]);
      
      // Remove mascot after animation completes
      setTimeout(() => {
        setFallingMascots(prev => prev.filter(m => m.id !== mascot.id));
      }, (delay + duration) * 1000);
    };

    // Create a regular mascot every 2-5 seconds
    const interval = setInterval(() => {
      if (Math.random() > 0.3) { // 70% chance to create a mascot
        createFallingMascot(false);
      }
    }, 2000 + Math.random() * 3000);
    
    // Create a GIANT mascot roughly every 45-75 seconds
    const giantInterval = setInterval(() => {
      createFallingMascot(true);
    }, 45000 + Math.random() * 30000);

    return () => {
      clearInterval(interval);
      clearInterval(giantInterval);
    };
  }, []);

  // Fetch rewards and do daily check-in on load
  useEffect(() => {
    const initRewards = async () => {
      try {
        // Fetch current rewards
        const res = await fetch(`${apiBase}/rewards`);
        const data = await res.json();
        setRewards(data);
        
        // Do daily check-in
        const checkinRes = await fetch(`${apiBase}/rewards/checkin`, { method: 'POST' });
        const checkinData = await checkinRes.json();
        
        if (checkinData.streakUpdated && checkinData.coinsEarned > 0) {
          setRewards(checkinData.rewards);
          showRewardToast(`Daily streak! Day ${checkinData.newStreak}`, checkinData.coinsEarned);
        }
      } catch (error) {
        console.error('Failed to init rewards:', error);
      }
    };
    
    initRewards();
  }, [apiBase]);

  // Check for claimable milestones when items or savings change
  useEffect(() => {
    if (!rewards || !items.length) return;
    
    const checkMilestones = async () => {
      // Check first item milestone
      if (items.length >= 1 && !rewards.first_item_claimed) {
        const res = await fetch(`${apiBase}/rewards/claim/first_item`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          setRewards(data.rewards);
          showRewardToast('First item tracked!', data.coinsEarned);
        }
      }
      
      // Check savings milestones
      if (totalSavings >= 10 && !rewards.savings_10_claimed) {
        const res = await fetch(`${apiBase}/rewards/claim/savings_10`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          setRewards(data.rewards);
          showRewardToast('£10 saved milestone!', data.coinsEarned);
        }
      }
      
      if (totalSavings >= 50 && !rewards.savings_50_claimed) {
        const res = await fetch(`${apiBase}/rewards/claim/savings_50`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          setRewards(data.rewards);
          showRewardToast('£50 saved milestone!', data.coinsEarned);
        }
      }
      
      if (totalSavings >= 100 && !rewards.savings_100_claimed) {
        const res = await fetch(`${apiBase}/rewards/claim/savings_100`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          setRewards(data.rewards);
          showRewardToast('£100 saved milestone!', data.coinsEarned);
        }
      }
    };
    
    checkMilestones();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, rewards?.first_item_claimed, rewards?.savings_10_claimed, rewards?.savings_50_claimed, rewards?.savings_100_claimed, apiBase]);

  // Handle clicking a giant mascot
  const handleGiantClick = async (mascotId) => {
    try {
      const res = await fetch(`${apiBase}/rewards/catch`, { method: 'POST' });
      const data = await res.json();
      
      setRewards(data.rewards);
      showRewardToast('Giant mascot caught!', data.coinsEarned);
      
      // Remove the caught mascot immediately
      setFallingMascots(prev => prev.filter(m => m.id !== mascotId));
    } catch (error) {
      console.error('Failed to catch mascot:', error);
    }
  };

  return (
    <div className="dashboard-modern">
      {/* Reward Toast */}
      {rewardToast && (
        <div className="reward-toast">
          <div className="reward-toast-content">
            <img src={raccoonImage} alt="coin" className="reward-toast-icon" />
            <div className="reward-toast-text">
              <span className="reward-toast-message">{rewardToast.message}</span>
              <span className="reward-toast-coins">+{rewardToast.coins} coins!</span>
            </div>
          </div>
        </div>
      )}

      {/* Falling Mascots */}
      {fallingMascots.map(mascot => (
        <div
          key={mascot.id}
          className={`falling-mascot ${mascot.isGiant ? 'falling-mascot-giant falling-mascot-clickable' : ''}`}
          style={{
            left: `${mascot.left}%`,
            animationDelay: `${mascot.delay}s`,
            animationDuration: `${mascot.duration}s`,
            width: `${mascot.size}px`,
            height: `${mascot.size}px`
          }}
          onClick={mascot.isGiant ? () => handleGiantClick(mascot.id) : undefined}
        >
          <img
            src={mascot.type === 'hyrax' ? hyraxImage : raccoonImage}
            alt={mascot.type}
            className="falling-mascot-img"
          />
        </div>
      ))}
      
      {/* Modern Navigation */}
      <nav className="nav-modern">
        <div className="nav-conveyor-belt">
          <div className="nav-conveyor-text">
            MONITOR PRICES AND GET BEEP BEEP WHEN CHEAP <img src={hyraxImage} alt="hyrax" className="conveyor-mascot" /> MONITOR PRICES AND GET BEEP BEEP WHEN CHEAP <img src={raccoonImage} alt="raccoon" className="conveyor-mascot" /> MONITOR PRICES AND GET BEEP BEEP WHEN CHEAP <img src={hyraxImage} alt="hyrax" className="conveyor-mascot" /> MONITOR PRICES AND GET BEEP BEEP WHEN CHEAP <img src={raccoonImage} alt="raccoon" className="conveyor-mascot" /> MONITOR PRICES AND GET BEEP BEEP WHEN CHEAP <img src={hyraxImage} alt="hyrax" className="conveyor-mascot" /> MONITOR PRICES AND GET BEEP BEEP WHEN CHEAP <img src={raccoonImage} alt="raccoon" className="conveyor-mascot" /> MONITOR PRICES AND GET BEEP BEEP WHEN CHEAP <img src={hyraxImage} alt="hyrax" className="conveyor-mascot" /> MONITOR PRICES AND GET BEEP BEEP WHEN CHEAP <img src={raccoonImage} alt="raccoon" className="conveyor-mascot" />
          </div>
        </div>
        <div className="nav-modern-container">
          <Link to="/" className="nav-modern-logo">
            <Raccoon variant="waving" className="small" useGif={true} gifSrc={raccoonImage} />
          </Link>
          
          <div className="nav-modern-actions">
            {/* Coins Display - Links to Rewards Page */}
            {rewards && (
              <Link to="/rewards" className="reward-stat reward-coins" aria-label="View rewards">
                <img src={raccoonImage} alt="coins" className="coin-icon" />
                <span className="reward-value">{rewards.coins}</span>
              </Link>
            )}
            
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
            <div className="stat-card-content">
              <div className="stat-card-value">{totalItems}</div>
              <div className="stat-card-label">ITEMS</div>
            </div>
          </div>
          <div className="stat-card-modern stat-card-modern-accent">
            <div className="stat-card-content">
              <div className="stat-card-value">{itemsWithDrops}</div>
              <div className="stat-card-label">DROPS</div>
            </div>
          </div>
          <div className="stat-card-modern">
            <div className="stat-card-content">
              <div className="stat-card-value">£{totalSavings.toFixed(2)}</div>
              <div className="stat-card-label">SAVINGS</div>
            </div>
          </div>
        </div>
      </section>

      {/* Items Grid */}
      <main className="main-modern">
        {/* Only show CTA banner when there are items */}
        {items.length > 0 && (
          <div className="cta-banner">
            <button 
              className="btn-rainbow"
              onClick={() => setShowAddModal(true)}
            >
              <Sparkles size={16} />
              <span>Track a New Item</span>
            </button>
          </div>
        )}
        {items.length === 0 ? (
          <div className="empty-state-modern">
            <div className="empty-state-icon">
              <Hyrax variant="blinking" className="large" />
              <Raccoon variant="waving" className="large" useGif={true} gifSrc={raccoonImage} />
            </div>
            <h3 className="empty-state-title">Start Tracking Prices</h3>
            <p className="empty-state-text">
              Add your first item to begin monitoring prices and saving money
            </p>
            <button 
              className="btn-rainbow btn-rainbow-large"
              onClick={() => setShowAddModal(true)}
            >
              <Sparkles size={16} />
              <span>Track a New Item</span>
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
