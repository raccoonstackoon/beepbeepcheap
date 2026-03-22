/**
 * Where the browser should send API calls and WebSockets.
 *
 * Priority:
 * 1. VITE_API_URL — full API base including /api (e.g. https://host/api)
 * 2. VITE_BACKEND_ORIGIN — origin only (e.g. https://host); we append /api in production
 * 3. Production on beepbeep.cheap / www — use Render API (split deploy: Vercel + Render)
 * 4. Production otherwise — same-origin /api (single server e.g. Docker, Render with static)
 * 5. Development — backend on same hostname, port 3001
 *
 * Change DEFAULT_SPLIT_DEPLOY_BACKEND if your Render service URL changes.
 */
const DEFAULT_SPLIT_DEPLOY_BACKEND = 'https://beepbeep-api.onrender.com';

function trimSlash(s) {
  return String(s).replace(/\/$/, '');
}

/** True when the UI is served from the public beepbeep.cheap domain (typical Vercel + API on Render). */
export function isBeepbeepCheapHost() {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  return h === 'beepbeep.cheap' || h === 'www.beepbeep.cheap';
}

/**
 * @returns {string} API base for fetch(), e.g. "https://api.example.com/api" or "/api"
 */
export function getApiBase() {
  const explicit = import.meta.env.VITE_API_URL;
  if (explicit) return trimSlash(explicit);

  const backendOrigin = import.meta.env.VITE_BACKEND_ORIGIN;
  if (backendOrigin && import.meta.env.PROD) {
    return `${trimSlash(backendOrigin)}/api`;
  }

  if (import.meta.env.PROD) {
    if (isBeepbeepCheapHost()) {
      return `${trimSlash(DEFAULT_SPLIT_DEPLOY_BACKEND)}/api`;
    }
    return '/api';
  }

  const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  return `http://${host}:3001/api`;
}

/**
 * WebSocket URL (no /api path — Express attaches WS on the HTTP server root).
 * @param {string} apiBase — from getApiBase()
 */
export function getWebSocketUrl(apiBase) {
  const explicitWs = import.meta.env.VITE_WS_URL;
  if (explicitWs) return trimSlash(explicitWs);

  if (apiBase.startsWith('http://')) {
    return apiBase.replace('http://', 'ws://').replace(/\/api\/?$/, '');
  }
  if (apiBase.startsWith('https://')) {
    return apiBase.replace('https://', 'wss://').replace(/\/api\/?$/, '');
  }

  const backendOrigin = import.meta.env.VITE_BACKEND_ORIGIN;
  if (backendOrigin && import.meta.env.PROD) {
    const b = trimSlash(backendOrigin);
    return b.startsWith('https://') ? `wss://${b.slice('https://'.length)}` : `ws://${b.slice('http://'.length)}`;
  }

  if (import.meta.env.PROD && isBeepbeepCheapHost()) {
    return `wss://${trimSlash(DEFAULT_SPLIT_DEPLOY_BACKEND).replace(/^https:\/\//, '')}`;
  }

  const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = typeof window !== 'undefined' ? window.location.host : 'localhost:3001';
  return `${protocol}//${host}`;
}
