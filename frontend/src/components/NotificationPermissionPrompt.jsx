import { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import './NotificationPermissionPrompt.css';

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true;
}

export default function NotificationPermissionPrompt() {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Only show in PWA mode
    if (!isStandalone()) return;

    // Don't show if permission already granted
    if (Notification.permission === 'granted') return;

    // Don't show if user explicitly dismissed it
    const hasDismissed = localStorage.getItem('notification-permission-dismissed');
    if (hasDismissed) return;

    // Show after a short delay
    const timer = setTimeout(() => setVisible(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  const handleEnable = async () => {
    setLoading(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        setVisible(false);
      }
    } catch (err) {
      console.warn('Notification permission failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem('notification-permission-dismissed', 'true');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="notification-prompt">
      <div className="notification-prompt-content">
        <div className="notification-prompt-icon">
          <Bell size={20} />
        </div>
        <div className="notification-prompt-text">
          <h3>Never miss a price drop</h3>
          <p>Get instant alerts when your items get cheaper</p>
        </div>
        <div className="notification-prompt-actions">
          <button
            type="button"
            className="btn-notification btn-notification-primary"
            onClick={handleEnable}
            disabled={loading}
          >
            {loading ? 'Enabling...' : 'Enable'}
          </button>
          <button
            type="button"
            className="btn-notification btn-notification-ghost"
            onClick={handleDismiss}
            aria-label="Dismiss"
          >
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
