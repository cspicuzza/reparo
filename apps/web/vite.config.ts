import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
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
