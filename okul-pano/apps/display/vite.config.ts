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
      // Geliştirmede panel ve pano ayrı portlarda; tek adres gibi davranmaları için birbirine yönlendirilir
      '/admin': { target: 'http://localhost:5173', changeOrigin: true },
    },
  },
  build: {
    target: 'es2020',
  },
});
