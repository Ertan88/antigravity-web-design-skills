import type { AuthService } from './types';

/**
 * Bulut hizmetinin bağlandığı tek yer.
 *
 * Sürüm 1.0 yalnızca cihazda çalışır; Firebase uygulamaya HİÇ dâhil edilmez (APK ~2 MB küçük).
 * Bulutu açmak için: src/config/env.ts › CLOUD_ENABLED = true, ardından bu fonksiyonu
 *
 *   import { createFirebaseService } from './firebaseService';
 *   export function createCloudService(): AuthService | null { return createFirebaseService(); }
 *
 * olarak değiştir (firebaseService.ts hazır ve testli).
 */
export function createCloudService(): AuthService | null {
  return null;
}
