import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { getApiBase, apiFetch } from './apiConfig.js'

async function subscribeToPush(registration) {
  try {
    if (!('PushManager' in window)) return;

    const existing = await registration.pushManager.getSubscription();
    if (existing) return;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const apiBase = getApiBase();
    const res = await apiFetch(apiBase, '/push/vapid-key');
    if (!res.ok) return;
    const { publicKey } = await res.json();

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });

    await apiFetch(apiBase, '/push/subscribe', {
      method: 'POST',
      body: JSON.stringify(subscription),
    });

    console.log('🔔 Push notifications enabled');
  } catch (err) {
    console.warn('Push subscription failed:', err);
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

// Register service worker for PWA support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      .then((registration) => {
        console.log('🚗 beepbeep.cheap PWA ready!', registration.scope);
        subscribeToPush(registration);
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
