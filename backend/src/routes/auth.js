import express from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { createUser, getUserByOAuth, getUserById, migrateGuestData } from '../database/queries.js';

const router = express.Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const TOKEN_EXPIRY = '30d';

function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

function createRandomUserId() {
  // Use random UUID for user IDs
  return randomUUID();
}

// ============ GOOGLE OAUTH ============

router.post('/oauth/google', async (req, res) => {
  try {
    const { token, guestUserId } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Missing token' });
    }

    // Verify the Google ID token
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email } = payload;

    // Check if user already exists
    let user = getUserByOAuth('google', googleId);

    if (!user) {
      const userId = createRandomUserId();
      createUser(userId, email, 'google', googleId);
      user = { id: userId, email, provider: 'google' };
    }

    // Migrate guest data if a guestUserId was provided
    if (guestUserId && guestUserId !== user.id) {
      try {
        migrateGuestData(guestUserId, user.id);
        console.log(`✅ Migrated guest data from ${guestUserId} → ${user.id}`);
      } catch (err) {
        console.error('Migration error (non-fatal):', err);
      }
    }

    const sessionToken = generateToken(user.id);

    res.json({
      success: true,
      token: sessionToken,
      user: {
        id: user.id,
        email: user.email,
        provider: user.provider,
      },
    });
  } catch (error) {
    console.error('Google OAuth error:', error);
    res.status(400).json({ error: 'Invalid token' });
  }
});

// ============ APPLE ID OAUTH ============

router.post('/oauth/apple', async (req, res) => {
  try {
    const { identityToken, user: appleUser } = req.body;
    if (!identityToken) {
      return res.status(400).json({ error: 'Missing identity token' });
    }

    let decoded;
    try {
      // Decode without verification (production should verify signature against Apple's public keys)
      // For now, trust the JWT from Apple
      decoded = jwt.decode(identityToken);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid token' });
    }

    const { sub: appleId, email } = decoded;
    const appleEmail = email || appleUser?.email;

    // Check if user already exists
    let user = getUserByOAuth('apple', appleId);

    if (!user) {
      // Create new user
      const userId = createRandomUserId();
      createUser(userId, appleEmail, 'apple', appleId);
      user = { id: userId, email: appleEmail, provider: 'apple' };
    }

    // Generate session token
    const sessionToken = generateToken(user.id);

    res.json({
      success: true,
      token: sessionToken,
      user: {
        id: user.id,
        email: user.email,
        provider: user.provider,
      },
    });
  } catch (error) {
    console.error('Apple OAuth error:', error);
    res.status(400).json({ error: 'Invalid token' });
  }
});

// ============ GET CURRENT USER ============

router.get('/user', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token' });
    }

    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = getUserById(decoded.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        provider: user.provider,
      },
    });
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
});

export default router;
