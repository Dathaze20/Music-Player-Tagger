import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dathaze.muzioai',
  appName: 'Muzio AI',
  webDir: 'out',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    Filesystem: {
      readExternalStorage: true,
      writeExternalStorage: true,
    },
  },
};

export default config;
