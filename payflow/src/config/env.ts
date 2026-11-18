/**
 * Ortam yapılandırması. Değerler `payflow/.env` dosyasından gelir (bkz. `.env.example`).
 * EXPO_PUBLIC_ önekli değişkenler derleme sırasında uygulamaya gömülür; bunlar gizli
 * anahtar DEĞİLDİR (Firebase web yapılandırması ve OAuth istemci kimlikleri herkese açıktır).
 * Güvenlik Firestore kurallarıyla sağlanır (firestore.rules).
 */
export const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
};

export const googleClientIds = {
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '',
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '',
};

export const isFirebaseConfigured = () => !!(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
export const isGoogleConfigured = () => !!(googleClientIds.webClientId && (googleClientIds.iosClientId || googleClientIds.androidClientId));
