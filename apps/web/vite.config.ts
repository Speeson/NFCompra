import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: {
    proxy: {
      '/v1': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'NFCompra',
        short_name: 'NFCompra',
        start_url: '/',
        display: 'standalone',
        background_color: '#f6f7fb',
        theme_color: '#255bd9',
        icons: [
          { src: '/icons/nfcompra-logo.png', sizes: 'any', type: 'image/png' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,webmanifest}']
      }
    })
  ],
  test: {
    environment: 'jsdom'
  }
});
