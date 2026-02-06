import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingDown, X } from 'lucide-react';
import './NotificationToast.css';

export default function NotificationToast({ alert, onDismiss, apiBase }) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const navigate = useNavigate();

  const savings = (alert.old_price - alert.new_price).toFixed(2);
  const percentDrop = ((alert.old_price - alert.new_price) / alert.old_price * 100).toFixed(0);

  const handleDismiss = useCallback(async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    setIsLeaving(true);
    
    // Wait for exit animation
    setTimeout(() => {
      // Mark as read in backend
      fetch(`${apiBase}/alerts/${alert.id}/read`, { method: 'PUT' }).catch(() => {});
      onDismiss();
    }, 300);
  }, [apiBase, alert.id, onDismiss]);

  useEffect(() => {
    // Trigger entrance animation
    requestAnimationFrame(() => {
      setIsVisible(true);
    });

    // Auto-dismiss after 8 seconds
    const timer = setTimeout(() => {
      handleDismiss();
    }, 8000);

    return () => clearTimeout(timer);
  }, [handleDismiss]);

  const handleClick = () => {
    // Mark as read and navigate to item
    fetch(`${apiBase}/alerts/${alert.id}/read`, { method: 'PUT' }).catch(() => {});
    navigate(`/item/${alert.item_id}`);
    onDismiss();
  };

  return (
    <div 
      className={`notification-toast ${isVisible ? 'visible' : ''} ${isLeaving ? 'leaving' : ''}`}
      onClick={handleClick}
    >
      {/* iOS-style notch/pill indicator */}
      <div className="notification-pill" />
      
      <div className="notification-content">
        {/* App icon */}
        <div className="notification-app-icon">
          <TrendingDown size={16} />
        </div>
        
        {/* Text content */}
        <div className="notification-text">
          <div className="notification-header">
            <span className="notification-app-name">beepbeep.cheap</span>
            <span className="notification-time">now</span>
          </div>
          <p className="notification-title">🎉 Price Drop Alert!</p>
          <p className="notification-body">
            <strong>{alert.item_name}</strong> dropped {percentDrop}%
          </p>
          <p className="notification-price">
            <span className="old-price">£{alert.old_price.toFixed(2)}</span>
            <span className="arrow">→</span>
            <span className="new-price">£{alert.new_price.toFixed(2)}</span>
            <span className="savings-badge">-£{savings}</span>
          </p>
        </div>
        
        {/* Item thumbnail */}
        {alert.image_url && (
          <div className="notification-thumbnail">
            <img src={alert.image_url} alt="" />
          </div>
        )}
      </div>
      
      {/* Dismiss button */}
      <button 
        className="notification-dismiss"
        onClick={handleDismiss}
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
      
      {/* Progress bar for auto-dismiss */}
      <div className="notification-progress" />
    </div>
  );
}




