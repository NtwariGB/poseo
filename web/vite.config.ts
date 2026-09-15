import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

/**
 * UI-301 : l'API NestJS n'a pas de préfixe global, le proxy retire donc `/api`.
 * Le port 5173 est celui autorisé par le CORS de l'API (UI-309).
 */
export default defineConfig({
  plugins: [svelte({ preprocess: vitePreprocess() })],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
