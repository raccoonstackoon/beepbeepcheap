import { Link } from 'react-router-dom';
import { TrendingDown, Check } from 'lucide-react';
import './AlertBanner.css';
import { apiFetch } from '../apiConfig.js';
import { formatMoney } from '../money.js';

function formatAlertDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function AlertBanner({ alert, apiBase, onDismiss }) {
  const savings = (alert.old_price - alert.new_price).toFixed(2);
  const percentDrop = ((alert.old_price - alert.new_price) / alert.old_price * 100).toFixed(0);

  const handleDismiss = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    try {
      await apiFetch(apiBase, `/alerts/${alert.id}/read`, { method: 'PUT' });
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
        <div className="alert-top-row">
          <p className="alert-title">
            <strong>{alert.item_name}</strong> dropped {percentDrop}%!
          </p>
          {alert.created_at && (
            <span className="alert-date">{formatAlertDate(alert.created_at)}</span>
          )}
        </div>
        <p className="alert-prices">
          <span className="old-price">{formatMoney(alert.old_price, alert.currency)}</span>
          <span className="arrow">→</span>
          <span className="new-price">{formatMoney(alert.new_price, alert.currency)}</span>
          <span className="savings">Save {formatMoney(savings, alert.currency)}</span>
        </p>
      </div>
      
      <button 
        className="alert-dismiss"
        onClick={handleDismiss}
        title="Dismiss"
      >
        <Check size={16} />
      </button>
    </Link>
  );
}
