import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Разрешаем открывать dev-сервер через туннель (cloudflared / ngrok) для теста в Telegram.
    allowedHosts: true,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
