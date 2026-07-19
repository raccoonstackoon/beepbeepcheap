import { getApiBase, apiFetch } from './apiConfig.js';
import { Capacitor } from '@capacitor/core';
import { enableNativePushNotifications, syncNativePushNotifications } from './nativePushNotifications.js';

function supported() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

async function saveSubscription(subscription) {
  const response = await apiFetch(getApiBase(), '/push/subscribe', {
    method: 'POST',
    body: JSON.stringify(subscription),
  });
  if (!response.ok) throw new Error('Could not save the notification subscription');
}

/**
 * Re-save a browser subscription without requesting permission. This keeps the
 * subscription associated with the current signed-in user after a login or a
 * backend restart.
 */
export async function syncExistingPushSubscription() {
  if (Capacitor.isNativePlatform()) return syncNativePushNotifications();
  if (!supported()) return { status: 'unavailable' };
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return { status: Notification.permission === 'denied' ? 'denied' : 'ready' };
  await saveSubscription(subscription);
  return { status: 'enabled' };
}

/** Must be called from a user tap: iOS Safari rejects permission prompts on page load. */
export async function enablePushNotifications() {
  if (Capacitor.isNativePlatform()) return enableNativePushNotifications();
  if (!supported()) return { status: 'unavailable' };
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return { status: permission === 'denied' ? 'denied' : 'ready' };

    const keyResponse = await apiFetch(getApiBase(), '/push/vapid-key');
    if (!keyResponse.ok) throw new Error('The notification service is unavailable');
    const { publicKey } = await keyResponse.json();
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  await saveSubscription(subscription);
  return { status: 'enabled' };
}

export function getPushNotificationStatus() {
  if (Capacitor.isNativePlatform()) return 'ready';
  if (!supported()) return 'unavailable';
  if (Notification.permission === 'denied') return 'denied';
  return 'ready';
}
