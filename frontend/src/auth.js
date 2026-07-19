const JWT_STORAGE_KEY = 'beepbeep_jwt';
const USER_ID_STORAGE_KEY = 'beepbeep_user_id';

export function getAuthToken() {
  try {
    return localStorage.getItem(JWT_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token) {
  try {
    localStorage.setItem(JWT_STORAGE_KEY, token);
  } catch {
    // localStorage might be blocked
  }
}

export function clearAuthToken() {
  try {
    localStorage.removeItem(JWT_STORAGE_KEY);
  } catch {
    // localStorage might be blocked
  }
}

export function isAuthenticated() {
  const token = getAuthToken();
  if (!token) return false;

  try {
    // Decode JWT to check expiration
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    const payload = JSON.parse(atob(parts[1]));
    const expiresAt = payload.exp * 1000; // Convert to milliseconds

    return Date.now() < expiresAt;
  } catch {
    return false;
  }
}

export function getAuthHeaders() {
  const token = getAuthToken();
  if (token) {
    return {
      Authorization: `Bearer ${token}`,
    };
  }
  return {};
}
