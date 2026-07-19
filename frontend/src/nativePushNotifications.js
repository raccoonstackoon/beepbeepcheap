import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { apiFetch, getApiBase } from './apiConfig.js';

let listenersAttached = false;

async function attachListeners() {
  if (listenersAttached) return;
  listenersAttached = true;
  await PushNotifications.addListener('registration', async ({ value }) => {
    try {
      const response = await apiFetch(getApiBase(), '/push/native/subscribe', {
        method: 'POST',
        body: JSON.stringify({ token: value, platform: 'ios' }),
      });
      if (!response.ok) throw new Error('Could not save the iPhone notification token');
      console.log('Native push notifications enabled');
    } catch (error) {
      console.error('Native push subscription failed:', error);
    }
  });
  await PushNotifications.addListener('registrationError', (error) => {
    console.error('Native push registration failed:', error);
  });
  await PushNotifications.addListener('pushNotificationActionPerformed', (event) => {
    const url = event.notification.data?.url;
    if (url) window.location.assign(url);
  });
}

export async function enableNativePushNotifications() {
  if (!Capacitor.isNativePlatform()) return null;
  await attachListeners();
  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== 'granted') return { status: permission.receive === 'denied' ? 'denied' : 'ready' };
  await PushNotifications.register();
  return { status: 'enabled' };
}

export async function syncNativePushNotifications() {
  if (!Capacitor.isNativePlatform()) return null;
  await attachListeners();
  const permission = await PushNotifications.checkPermissions();
  if (permission.receive === 'granted') await PushNotifications.register();
  return { status: permission.receive === 'granted' ? 'enabled' : 'ready' };
}
