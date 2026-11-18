import { AuthError } from './types';

/** Firebase hata kodlarını Türkçe, eyleme dönük mesajlara çevirir. */
export function toAuthError(e: unknown): AuthError {
  if (e instanceof AuthError) return e;
  const code = (e as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-email':
      return new AuthError('E-posta adresi geçersiz görünüyor.', 'email');
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
      return new AuthError('E-posta veya şifre hatalı.', 'password');
    case 'auth/email-already-in-use':
      return new AuthError('Bu e-posta ile zaten bir hesap var. Giriş yapmayı dene.', 'email');
    case 'auth/weak-password':
      return new AuthError('Şifre en az 6 karakter olmalı.', 'password');
    case 'auth/too-many-requests':
      return new AuthError('Çok fazla deneme yapıldı. Biraz bekleyip tekrar dene.');
    case 'auth/network-request-failed':
      return new AuthError('İnternet bağlantısı yok gibi görünüyor.');
    case 'auth/user-disabled':
      return new AuthError('Bu hesap devre dışı bırakılmış.');
    case 'auth/requires-recent-login':
      return new AuthError('Güvenlik için yeniden giriş gerekiyor. Çıkış yapıp tekrar giriş yap, ardından hemen sil.');
    case 'auth/account-exists-with-different-credential':
      return new AuthError('Bu e-posta başka bir giriş yöntemiyle kayıtlı. O yöntemle giriş yap.', 'email');
    default:
      return new AuthError('Bir şeyler ters gitti. Lütfen tekrar dene.');
  }
}

export const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());
