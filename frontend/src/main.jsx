import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { syncExistingPushSubscription } from './pushNotifications.js'

// Register service worker for PWA support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      .then((registration) => {
        console.log('🚗 beepbeep.cheap PWA ready!', registration.scope);
        // Do not request notification permission here. iOS only accepts it
        // after a direct user interaction; Dashboard exposes that action.
        syncExistingPushSubscription().catch((error) => {
          console.warn('Push subscription sync failed:', error);
        });
        // Pick up new sw.js soon after deploy (Safari can be lazy otherwise)
        registration.update().catch(() => {});
      })
      .catch((error) => {
        console.log('Service worker registration failed:', error);
      });
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
