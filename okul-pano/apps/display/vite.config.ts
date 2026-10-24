import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const api = process.env.VITE_API_PROXY ?? 'http://localhost:3000';

export default defineConfig({
  base: '/display/',
  plugins: [react()],
  server: {
    port: 5174,
    host: true,
    proxy: {
      '/api': { target: api, changeOrigin: true },
      '/uploads': { target: api, changeOrigin: true },
    },
  },
  build: {
    target: 'es2020',
  },
});
