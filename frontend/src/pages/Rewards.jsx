import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  Target, 
  Flame, 
  Calendar,
  Trophy,
  Sparkles,
  Check,
  Lock
} from 'lucide-react';
import { Raccoon } from '../components/PixelMascot';
import raccoonImage from '../assets/raccoon.png';
import './Rewards.css';

function Rewards({ apiBase }) {
  const [rewards, setRewards] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRewards = async () => {
      try {
        const res = await fetch(`${apiBase}/rewards`);
        const data = await res.json();
        setRewards(data);
      } catch (error) {
        console.error('Failed to fetch rewards:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchRewards();
  }, [apiBase]);

  if (loading) {
    return (
      <div className="rewards-page">
        <div className="rewards-loading">
          <Raccoon variant="waving" className="medium" useGif={true} gifSrc={raccoonImage} />
          <p>Loading rewards...</p>
        </div>
      </div>
    );
  }

  if (!rewards) {
    return (
      <div className="rewards-page">
        <div className="rewards-error">
          <p>Failed to load rewards</p>
          <Link to="/" className="btn-back">Go Back</Link>
        </div>
      </div>
    );
  }

  // Calculate points breakdown
  const breakdown = [
    {
      id: 'daily',
      icon: Calendar,
      label: 'Daily Check-ins',
      description: 'Earn 1 coin every day you visit',
      earned: rewards.streak_best, // Approximate based on best streak
      color: 'var(--pixel-teal)'
    },
    {
      id: 'giants',
      icon: Target,
      label: 'Giant Mascots Caught',
      description: `${rewards.giants_caught} caught × 1 coin each`,
      earned: rewards.giants_caught * 1,
      color: '#9b7bb8'
    },
    {
      id: 'first_item',
      icon: Sparkles,
      label: 'First Item Tracked',
      description: 'One-time bonus for your first tracked item',
      earned: rewards.first_item_claimed ? 10 : 0,
      claimed: rewards.first_item_claimed,
      color: 'var(--pixel-sky-blue)'
    },
    {
      id: 'savings_10',
      icon: Trophy,
      label: '£10 Savings Milestone',
      description: 'Save £10 total across all items',
      earned: rewards.savings_10_claimed ? 10 : 0,
      claimed: rewards.savings_10_claimed,
      color: 'var(--pixel-yellow)'
    },
    {
      id: 'savings_50',
      icon: Trophy,
      label: '£50 Savings Milestone',
      description: 'Save £50 total across all items',
      earned: rewards.savings_50_claimed ? 25 : 0,
      claimed: rewards.savings_50_claimed,
      color: 'var(--pixel-sky-blue)'
    },
    {
      id: 'savings_100',
      icon: Trophy,
      label: '£100 Savings Milestone',
      description: 'Save £100 total across all items',
      earned: rewards.savings_100_claimed ? 50 : 0,
      claimed: rewards.savings_100_claimed,
      color: 'var(--pixel-lavender)'
    }
  ];

  return (
    <div className="rewards-page">
      {/* Header */}
      <header className="rewards-header">
        <Link to="/" className="btn-back">
          <ArrowLeft size={20} />
          <span>Back</span>
        </Link>
        <h1 className="rewards-title">My Rewards</h1>
      </header>

      {/* Total Coins Card */}
      <div className="total-coins-card">
        <div className="total-coins-icon">
          <div className="pixel-coin">
            <span>$</span>
          </div>
        </div>
        <div className="total-coins-info">
          <span className="total-coins-value">{rewards.coins}</span>
          <span className="total-coins-label">Total Coins</span>
        </div>
        <Raccoon variant="happy" className="large" useGif={true} gifSrc={raccoonImage} />
      </div>

      {/* Streak Card */}
      <div className="streak-card">
        <div className="streak-icon">
          <Flame size={32} />
        </div>
        <div className="streak-info">
          <div className="streak-current">
            <span className="streak-number">{rewards.streak_current}</span>
            <span className="streak-label">Day Streak</span>
          </div>
          <div className="streak-best">
            Best: {rewards.streak_best} days
          </div>
        </div>
      </div>

      {/* Points Breakdown */}
      <section className="breakdown-section">
        <h2 className="breakdown-title">How You Earned Coins</h2>
        
        <div className="breakdown-list">
          {breakdown.map((item) => {
            const Icon = item.icon;
            const isLocked = item.claimed !== undefined && !item.claimed;
            
            return (
              <div 
                key={item.id} 
                className={`breakdown-item ${isLocked ? 'locked' : ''}`}
              >
                <div 
                  className="breakdown-icon"
                  style={{ background: isLocked ? 'var(--bg-secondary)' : item.color }}
                >
                  {isLocked ? <Lock size={20} /> : <Icon size={20} />}
                </div>
                <div className="breakdown-info">
                  <span className="breakdown-label">{item.label}</span>
                  <span className="breakdown-description">{item.description}</span>
                </div>
                <div className="breakdown-earned">
                  {isLocked ? (
                    <span className="not-earned">—</span>
                  ) : (
                    <>
                      <Check size={14} className="earned-check" />
                      <span>+{item.earned}</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Tips */}
      <section className="tips-section">
        <h3 className="tips-title">💡 Earn More Coins</h3>
        <ul className="tips-list">
          <li>Visit daily to build your streak</li>
          <li>Catch the giant falling mascots (they glow gold!)</li>
          <li>Track more items and save money</li>
        </ul>
      </section>
    </div>
  );
}

export default Rewards;

