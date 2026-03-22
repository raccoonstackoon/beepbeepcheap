const STORAGE_KEY = 'beepbeep_user_id';

/**
 * Stable anonymous id for this browser profile (UUID v4).
 * Each phone / browser / “private” session gets its own list on the server.
 */
export function getOrCreateUserId() {
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (id && isUuidV4(id)) {
      return id.trim().toLowerCase();
    }
    id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
    return id.toLowerCase();
  } catch {
    // localStorage blocked (rare) — stable for this page session only
    if (typeof window !== 'undefined') {
      if (!window.__beepbeepSessionUserId) {
        window.__beepbeepSessionUserId = crypto.randomUUID();
      }
      return window.__beepbeepSessionUserId.toLowerCase();
    }
    return crypto.randomUUID().toLowerCase();
  }
}

function isUuidV4(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(s).trim()
  );
}
