import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const pwaShell = {
  name: 'nfcompra-pwa-shell',
  apply: 'build' as const,
  generateBundle(_options: unknown, bundle: Record<string, { fileName: string; type: string }>) {
    const shellFiles = Object.values(bundle)
      .filter((entry) => entry.type === 'asset' || entry.type === 'chunk')
      .map((entry) => `/${entry.fileName}`);

    this.emitFile({
      type: 'asset',
      fileName: 'sw.js',
      source: `const cacheName = 'nfcompra-shell-v1';
const shell = ['/', '/index.html', '/manifest.webmanifest', ${shellFiles.map((file) => `'${file}'`).join(', ')}];
self.addEventListener('install', (event) => event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(shell))));
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request))));`
    });
  }
};

export default defineConfig({
  plugins: [react(), pwaShell],
  test: {
    environment: 'jsdom'
  }
});
