import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const api = process.env.VITE_API_PROXY ?? 'http://localhost:3000';

export default defineConfig({
  base: '/admin/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': { target: api, changeOrigin: true },
      '/uploads': { target: api, changeOrigin: true },
      // Geliştirmede panel ve pano ayrı portlarda; tek adres gibi davranmaları için birbirine yönlendirilir
      '/display': { target: 'http://localhost:5174', changeOrigin: true },
    },
  },
});
