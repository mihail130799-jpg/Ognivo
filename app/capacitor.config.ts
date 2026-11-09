import type { CapacitorConfig } from '@capacitor/cli';

// Android-приложение Ognivo: тот же интерфейс, что и Mini App, собранный внутрь APK.
// Данные — на сервере Ognivo (адрес задаётся при сборке, см. .env.android).
const config: CapacitorConfig = {
  appId: 'app.ognivo.tracker',
  appName: 'Ognivo',
  webDir: 'dist',
  backgroundColor: '#16141A',
  android: {
    // Только https: обычный http к серверу не пускаем
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: '#020102',
      showSpinner: false,
    },
  },
};

export default config;
