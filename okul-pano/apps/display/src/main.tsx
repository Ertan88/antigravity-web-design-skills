import '@fontsource-variable/inter';
import '@fontsource-variable/plus-jakarta-sans';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import '@okulpano/slides/slides.css';
import './styles.css';

// TV hafif modu: Okul Yayın Pano TV uygulamasında (ya da adreste ?hafif=1) sürekli dönen süs animasyonları ve
// duyuru geçiş efekti kapanır. Zayıf TV işlemcilerinde bunlar her karede yeniden çizim istiyor, kayan yazıyı ve
// videoyu takıltıyordu (ölçüm: işlemci 6 kat yavaşken 30 saniyede ~110 takılan kare → ~8).
if (/OkulYayinPano/.test(navigator.userAgent) || new URLSearchParams(location.search).get('hafif') === '1') {
  document.documentElement.classList.add('tv-lite');
}

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
