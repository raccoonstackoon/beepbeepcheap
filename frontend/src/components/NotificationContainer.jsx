import { useState, useEffect, useRef } from 'react';
import NotificationToast from './NotificationToast';
import { getWebSocketUrl } from '../apiConfig.js';

// Play notification sound using Web Audio API
const playNotificationSound = () => {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 880; // A5 note
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch {
    // Audio not supported or blocked
  }
};

export default function NotificationContainer({ apiBase, onNewAlert }) {
  const [notifications, setNotifications] = useState([]);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const connectFnRef = useRef(null);

  useEffect(() => {
    const connectWebSocket = () => {
      // Prevent duplicate connections (React StrictMode runs effects twice)
      if (wsRef.current && (wsRef.current.readyState === WebSocket.CONNECTING || wsRef.current.readyState === WebSocket.OPEN)) {
        console.log('🔌 WebSocket already connected/connecting, skipping...');
        return;
      }
      
      // Split deploy (e.g. Vercel + Render): WS must hit the API host, not the static site
      const wsUrl = getWebSocketUrl(apiBase);

      console.log('🔌 Connecting to WebSocket:', wsUrl);

      try {
        wsRef.current = new WebSocket(wsUrl);

        wsRef.current.onopen = () => {
          console.log('✅ WebSocket connected!');
        };

        wsRef.current.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('📨 WebSocket message:', data);

            if (data.type === 'price_drop' && data.alert) {
              // Add notification with unique ID
              const notification = {
                ...data.alert,
                _notificationId: Date.now() + Math.random()
              };
              
              setNotifications(prev => [...prev, notification]);
              
              // Vibrate on mobile if supported
              if (navigator.vibrate) {
                navigator.vibrate([100, 50, 100]);
              }
              
              // Play notification sound (optional)
              playNotificationSound();
              
              // Notify parent component to refresh data
              if (onNewAlert) {
                onNewAlert();
              }
            }
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
          }
        };

        wsRef.current.onclose = () => {
          console.log('🔌 WebSocket disconnected, reconnecting in 3s...');
          // Reconnect after 3 seconds
          reconnectTimeoutRef.current = setTimeout(() => {
            if (connectFnRef.current) connectFnRef.current();
          }, 3000);
        };

        wsRef.current.onerror = (err) => {
          console.error('WebSocket error:', err);
        };
      } catch (err) {
        console.error('Failed to create WebSocket:', err);
        // Retry connection
        reconnectTimeoutRef.current = setTimeout(() => {
          if (connectFnRef.current) connectFnRef.current();
        }, 5000);
      }
    };

    // Store the function in a ref so callbacks can access it
    connectFnRef.current = connectWebSocket;
    connectWebSocket();

    return () => {
      connectFnRef.current = null;
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [apiBase, onNewAlert]);

  const dismissNotification = (notificationId) => {
    setNotifications(prev => 
      prev.filter(n => n._notificationId !== notificationId)
    );
  };

  return (
    <div className="notification-container">
      {notifications.map((notification, index) => (
        <NotificationToast
          key={notification._notificationId}
          alert={notification}
          apiBase={apiBase}
          onDismiss={() => dismissNotification(notification._notificationId)}
          style={{ 
            zIndex: 10000 - index,
            top: `${12 + (index * 10)}px`
          }}
        />
      ))}
    </div>
  );
}


