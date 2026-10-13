import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // One .env at the repo root serves web and api (Vite's envDir defaults to apps/web).
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
  plugins: [
    // Router plugin before React (https://tanstack.com/router/latest/docs/framework/react/routing/installation-with-vite)
    TanStackRouterVite({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    // Local API runs on tRPC's standalone adapter (packages/api/src/dev.ts); Vercel serves it from api/.
    proxy: { '/api': `http://127.0.0.1:${process.env['API_PORT'] ?? 3001}` },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
