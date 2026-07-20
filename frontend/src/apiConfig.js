import { getOrCreateUserId } from './userId.js';
import { getAuthToken } from './auth.js';
import { Capacitor } from '@capacitor/core';

/**
 * JSON/API fetch with X-User-Id and optional JWT auth (skips Content-Type for FormData).
 * @param {string} apiBase - from getApiBase(), no trailing slash
 * @param {string} path - e.g. "/items" or "items"
 */
export function apiFetch(apiBase, path, options = {}) {
  const p = path.startsWith('/') ? path : `/${path}`;
  const url = `${trimSlash(apiBase)}${p}`;

  const headers = new Headers();
  if (options.headers) {
    if (options.headers instanceof Headers) {
      options.headers.forEach((v, k) => headers.set(k, v));
    } else {
      Object.entries(options.headers).forEach(([k, v]) => {
        if (v != null) headers.set(k, String(v));
      });
    }
  }

  // Always include the stable device ID. It scopes anonymous access and gives
  // the server a safe fallback when an expired JWT is encountered.
  const userId = getOrCreateUserId();
  headers.set('X-User-Id', userId);

  // Add JWT token when available; the server gives a valid JWT precedence.
  const token = getAuthToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (options.body && typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (options.body instanceof FormData) {
    headers.delete('Content-Type');
  }

  return fetch(url, { ...options, headers });
}

/** Append ?userId= for WebSocket auth (must match API header). */
export function withWebSocketUserId(wsUrl) {
  const id = getOrCreateUserId();
  const join = wsUrl.includes('?') ? '&' : '?';
  return `${wsUrl}${join}userId=${encodeURIComponent(id)}`;
}

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

function isNativeApp() {
  return Capacitor.isNativePlatform();
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
    // Capacitor serves the bundled UI from https://localhost, not from the
    // public domain, so native builds must use the real API explicitly.
    if (isNativeApp() || isBeepbeepCheapHost()) {
      return `${trimSlash(DEFAULT_SPLIT_DEPLOY_BACKEND)}/api`;
    }
    return '/api';
  }

  const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  return `http://${host}:3001/api`;
}

/**
 * WebSocket URL (no /api path) + ?userId= so the server only sends your price-drop toasts.
 * @param {string} apiBase — from getApiBase()
 */
export function getWebSocketUrl(apiBase) {
  let base;
  const explicitWs = import.meta.env.VITE_WS_URL;
  if (explicitWs) {
    base = trimSlash(explicitWs);
  } else if (apiBase.startsWith('http://')) {
    base = apiBase.replace('http://', 'ws://').replace(/\/api\/?$/, '');
  } else if (apiBase.startsWith('https://')) {
    base = apiBase.replace('https://', 'wss://').replace(/\/api\/?$/, '');
  } else if (import.meta.env.VITE_BACKEND_ORIGIN && import.meta.env.PROD) {
    const b = trimSlash(import.meta.env.VITE_BACKEND_ORIGIN);
    base = b.startsWith('https://')
      ? `wss://${b.slice('https://'.length)}`
      : `ws://${b.slice('http://'.length)}`;
  } else if (import.meta.env.PROD && (isNativeApp() || isBeepbeepCheapHost())) {
    base = `wss://${trimSlash(DEFAULT_SPLIT_DEPLOY_BACKEND).replace(/^https:\/\//, '')}`;
  } else {
    const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = typeof window !== 'undefined' ? window.location.host : 'localhost:3001';
    base = `${protocol}//${host}`;
  }
  return withWebSocketUserId(base);
}
