/**
 * Hafif giriş noktası: doğrulama şemaları (zod) olmadan. Pano gibi yalnızca okuma yapan,
 * düşük güçlü cihazlarda çalışan istemciler bunu kullanır.
 */
export * from './bell.ts';
export * from './display.ts';
export * from './permissions.ts';
export * from './time.ts';
export * from './youtube.ts';
export type { SchoolSettings } from './schemas.ts';
