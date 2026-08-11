import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  return {
    server: {
      proxy: {
        '/v1': {
          target: env.VITE_API_PROXY_TARGET ?? 'http://localhost:8787',
          changeOrigin: true,
          secure: true,
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
  };
});
