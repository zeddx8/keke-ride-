import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

declare global {
  interface Window {
    Pusher: typeof Pusher;
  }
}

window.Pusher = Pusher;

const apiBaseUrl = (
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api'
).replace(/\/+$/, '');

const echo = new Echo({
  broadcaster: 'reverb',
  key: import.meta.env.VITE_REVERB_APP_KEY || 'local',
  wsHost: import.meta.env.VITE_REVERB_HOST || '127.0.0.1',
  wsPort: Number(import.meta.env.VITE_REVERB_PORT || 8080),
  wssPort: Number(import.meta.env.VITE_REVERB_PORT || 8080),
  forceTLS: (import.meta.env.VITE_REVERB_SCHEME || 'http') === 'https',
  enabledTransports: ['ws', 'wss'],
  authEndpoint: `${apiBaseUrl}/broadcasting/auth`,
  channelAuthorization: {
    transport: 'ajax',
    endpoint: `${apiBaseUrl}/broadcasting/auth`,
    headersProvider: () => {
      const token = localStorage.getItem('auth_token');
      return {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
    },
  },
});

export default echo;
