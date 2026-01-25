import { Link } from 'react-router-dom';
import { TrendingDown, X } from 'lucide-react';
import './AlertBanner.css';

export default function AlertBanner({ alert, apiBase, onDismiss }) {
  const savings = (alert.old_price - alert.new_price).toFixed(2);
  const percentDrop = ((alert.old_price - alert.new_price) / alert.old_price * 100).toFixed(0);

  const handleDismiss = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    try {
      await fetch(`${apiBase}/alerts/${alert.id}/read`, { method: 'PUT' });
      onDismiss();
    } catch (error) {
      console.error('Failed to dismiss alert:', error);
    }
  };

  return (
    <Link to={`/item/${alert.item_id}`} className="alert-banner">
      <div className="alert-icon">
        <TrendingDown size={20} />
      </div>
      
      <div className="alert-content">
        <p className="alert-title">
          <strong>{alert.item_name}</strong> dropped {percentDrop}%!
        </p>
        <p className="alert-prices">
          <span className="old-price">£{alert.old_price.toFixed(2)}</span>
          <span className="arrow">→</span>
          <span className="new-price">£{alert.new_price.toFixed(2)}</span>
          <span className="savings">Save £{savings}</span>
        </p>
      </div>
      
      <button 
        className="alert-dismiss"
        onClick={handleDismiss}
        title="Dismiss"
      >
        <X size={16} />
      </button>
    </Link>
  );
}

