import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        app: resolve(__dirname, 'app.html'),
        dashboard: resolve(__dirname, 'dashboard.html'),
        salud: resolve(__dirname, 'salud.html')
      }
    }
  },
  server: {
    port: 3000,
    open: true
  }
});
