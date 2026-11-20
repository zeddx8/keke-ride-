import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import apiClient from '../api/client';

export async function registerRiderPushToken(): Promise<void> {
  try {
    await FirebaseMessaging.createChannel({
      id: 'ride_requests',
      name: 'Ride requests',
      description: 'Incoming Keke Ride requests assigned to you',
      importance: 5,
      vibration: true,
      visibility: 1,
    });

    const permission = await FirebaseMessaging.requestPermissions();
    if (permission.receive !== 'granted') {
      return;
    }

    const { token } = await FirebaseMessaging.getToken();
    if (token) {
      await apiClient.put('/rider/device-token', { token });
    }

    await FirebaseMessaging.addListener('tokenReceived', async ({ token: newToken }) => {
      if (newToken) {
        await apiClient.put('/rider/device-token', { token: newToken });
      }
    });

    await FirebaseMessaging.addListener('notificationReceived', (event) => {
      window.dispatchEvent(new CustomEvent('keke:trip-notification', {
        detail: event.notification.data,
      }));
    });
    await FirebaseMessaging.addListener('notificationActionPerformed', (event) => {
      window.dispatchEvent(new CustomEvent('keke:trip-notification', {
        detail: event.notification.data,
      }));
    });
  } catch {
    // Push registration is optional; REST dispatch polling remains available.
  }
}

export async function removeRiderPushToken(): Promise<void> {
  try {
    await apiClient.put('/rider/device-token', { token: null });
    await FirebaseMessaging.deleteToken();
    await FirebaseMessaging.removeAllListeners();
  } catch {
    // Token cleanup is best-effort.
  }
}
