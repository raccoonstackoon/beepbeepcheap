import webpush from 'web-push';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAllPushSubscriptions, removePushSubscription } from '../database/queries.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VAPID_PATH = process.env.VAPID_PATH || path.join(__dirname, '../../data/vapid-keys.json');

let vapidKeys = null;

/**
 * Load or generate VAPID keys (used to identify the server to push services).
 * Keys are persisted to disk so subscriptions survive server restarts.
 */
export function initPush() {
  try {
    if (fs.existsSync(VAPID_PATH)) {
      vapidKeys = JSON.parse(fs.readFileSync(VAPID_PATH, 'utf-8'));
    }
  } catch (e) {
    console.warn('⚠️ Could not read VAPID keys, generating new ones');
  }

  if (!vapidKeys) {
    vapidKeys = webpush.generateVAPIDKeys();
    const dir = path.dirname(VAPID_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(VAPID_PATH, JSON.stringify(vapidKeys, null, 2));
    console.log('🔑 Generated new VAPID keys');
  }

  webpush.setVapidDetails(
    'mailto:hello@beepbeep.cheap',
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );

  console.log('🔔 Push notifications ready');
}

export function getPublicVapidKey() {
  return vapidKeys?.publicKey || null;
}

/**
 * Send a push notification to every saved subscription.
 * Automatically removes subscriptions that are no longer valid (expired / unsubscribed).
 */
export async function sendPushToAll(payload) {
  const subscriptions = getAllPushSubscriptions();
  if (subscriptions.length === 0) return;

  const body = JSON.stringify(payload);

  const results = await Promise.allSettled(
    subscriptions.map(sub => {
      const pushSub = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth }
      };
      return webpush.sendNotification(pushSub, body);
    })
  );

  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      const statusCode = result.reason?.statusCode;
      // 404 or 410 means the subscription is gone — clean it up
      if (statusCode === 404 || statusCode === 410) {
        removePushSubscription(subscriptions[i].endpoint);
        console.log('🗑️ Removed expired push subscription');
      } else {
        console.error('Push send failed:', result.reason?.message || result.reason);
      }
    }
  });

  console.log(`📨 Push sent to ${subscriptions.length} subscriber(s)`);
}
