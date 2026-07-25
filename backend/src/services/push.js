import webpush from 'web-push';
import apn from 'apn';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getPushSubscriptionsForUser,
  removePushSubscription,
  getNativePushSubscriptionsForUser,
  removeNativePushSubscription,
} from '../database/queries.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VAPID_PATH = process.env.VAPID_PATH || path.join(__dirname, '../../data/vapid-keys.json');

let vapidKeys = null;
let apnProvider = null;

function getApnProvider() {
  if (apnProvider) return apnProvider;
  const { APNS_KEY_BASE64, APNS_KEY_ID, APNS_TEAM_ID } = process.env;
  if (!APNS_KEY_BASE64 || !APNS_KEY_ID || !APNS_TEAM_ID) return null;

  apnProvider = new apn.Provider({
    token: {
      key: Buffer.from(APNS_KEY_BASE64, 'base64').toString('utf8'),
      keyId: APNS_KEY_ID,
      teamId: APNS_TEAM_ID,
    },
    production: process.env.APNS_PRODUCTION === 'true',
  });
  return apnProvider;
}

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

async function sendToSubscriptions(subscriptions, payload) {
  if (!subscriptions.length) return;

  const body = JSON.stringify(payload);

  const results = await Promise.allSettled(
    subscriptions.map((sub) => {
      const pushSub = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
      };
      return webpush.sendNotification(pushSub, body);
    })
  );

  let sent = 0;
  let failed = 0;
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      sent++;
      return;
    }

    failed++;
    if (result.status === 'rejected') {
      const statusCode = result.reason?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        removePushSubscription(subscriptions[i].endpoint);
        console.log('🗑️ Removed expired push subscription');
      } else {
        console.error('Push send failed:', result.reason?.message || result.reason);
      }
    }
  });

  console.log(`📨 Web push delivery: ${sent} sent, ${failed} failed`);
}

/**
 * Send a push notification to every saved subscription for one user.
 */
export async function sendPushForUser(userId, payload) {
  if (!userId) return;
  const subscriptions = getPushSubscriptionsForUser(userId);
  await Promise.all([
    sendToSubscriptions(subscriptions, payload),
    sendNativePushForUser(userId, payload),
  ]);
}

async function sendNativePushForUser(userId, payload) {
  const subscriptions = getNativePushSubscriptionsForUser(userId);
  if (!subscriptions.length) return;

  const provider = getApnProvider();
  if (!provider) {
    console.warn('Native push subscription exists, but APNs is not configured');
    return;
  }

  const notification = new apn.Notification();
  notification.topic = process.env.APNS_BUNDLE_ID || 'cheap.beepbeep.app';
  notification.alert = { title: payload.title, body: payload.body };
  notification.sound = 'default';
  notification.payload = { url: payload.url || '/' };

  const result = await provider.send(notification, subscriptions.map((sub) => sub.token));
  for (const failure of result.failed || []) {
    if (['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic'].includes(failure.response?.reason)) {
      removeNativePushSubscription(failure.device);
    }
    console.error('APNs push failed:', failure.response?.reason || failure.error?.message || 'unknown error');
  }
  console.log(`📨 Native push sent to ${result.sent?.length || 0} iPhone(s)`);
}
