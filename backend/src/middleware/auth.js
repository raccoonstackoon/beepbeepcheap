import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export function extractUserId(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      // JWT authentication
      const token = authHeader.slice(7);
      const decoded = jwt.verify(token, JWT_SECRET);
      req.userId = decoded.userId;
      req.isAuthenticated = true;
    } else {
      // Fall back to X-User-Id header (anonymous user)
      const userId = req.headers['x-user-id'];
      if (userId) {
        req.userId = userId.trim().toLowerCase();
        req.isAuthenticated = false;
      } else {
        return res.status(400).json({ error: 'Missing authentication' });
      }
    }

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ error: 'Invalid authentication' });
  }
}

export function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const xUserId = req.headers['x-user-id'];

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[optionalAuth] ${req.method} ${req.path} - auth: ${authHeader ? 'JWT' : 'none'}, x-user-id: ${xUserId ? 'present' : 'missing'}`);
  }

  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7);
      const decoded = jwt.verify(token, JWT_SECRET);
      req.userId = decoded.userId;
      req.isAuthenticated = true;
      return next();
    } catch (error) {
      // JWT invalid/expired — fall through to X-User-Id so the user's anonymous
      // items remain reachable instead of being silently saved with NULL user_id.
      console.warn('[optionalAuth] JWT verification failed, falling back to X-User-Id:', error.message);
    }
  }

  if (xUserId) {
    req.userId = xUserId.trim().toLowerCase();
    req.isAuthenticated = false;
  }

  next();
}
