/**
 * Require a stable per-device user id (UUID v4) from the client.
 * The frontend stores this in localStorage and sends it on every request.
 */
const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requireUserId(req, res, next) {
  // optionalAuth resolves valid JWTs before route-level middleware runs.
  // Accept that resolved identity instead of incorrectly requiring an
  // X-User-Id header from signed-in users.
  if (typeof req.userId === 'string' && UUID_V4_RE.test(req.userId)) {
    req.userId = req.userId.trim().toLowerCase();
    return next();
  }

  const raw = req.headers['x-user-id'];
  if (!raw || typeof raw !== 'string') {
    return res.status(401).json({
      error: 'Missing X-User-Id header. The app should send a UUID for your device.',
    });
  }
  const id = raw.trim().toLowerCase();
  if (!UUID_V4_RE.test(id)) {
    return res.status(401).json({
      error: 'Invalid X-User-Id — must be a UUID v4.',
    });
  }
  req.userId = id;
  next();
}
