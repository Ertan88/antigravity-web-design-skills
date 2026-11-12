import '@fontsource-variable/inter';
import '@fontsource-variable/plus-jakarta-sans';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import '@okulpano/slides/slides.css';
import './styles.css';

// Çevrimdışı kopya (public/sw.js): internet ya da okul ağı koptuğunda pano saklanan kopyadan açılır.
// Panelin önizlemesinde (geçici, ?preview=) ve geliştirmede kurulmaz.
if (import.meta.env.PROD && 'serviceWorker' in navigator && !new URLSearchParams(location.search).has('preview')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/display/sw.js', { scope: '/display/' }).catch(() => undefined);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
