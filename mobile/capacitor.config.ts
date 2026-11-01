import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kekeride.app',
  appName: 'Keke Ride',
  webDir: 'dist',
  server: {
    // Allows local HTTP traffic to your Laravel API backend during development
    cleartext: true,
    androidScheme: 'http'
  }
};

export default config;