import type { AppState } from '../core/model';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  provider: 'password' | 'google';
}

export interface CloudBackup {
  state: AppState;
  updatedAt: number; // epoch ms
}

/**
 * Kimlik doğrulama + bulut yedek sözleşmesi. Uygulama yalnızca bu arayüzü tanır;
 * Firebase uygulaması `firebaseService.ts`'te, testler sahte bir uygulama kullanır.
 */
export interface AuthService {
  onAuthChange(cb: (user: AuthUser | null) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  register(name: string, email: string, password: string): Promise<void>;
  resetPassword(email: string): Promise<void>;
  signInWithGoogleIdToken(idToken: string): Promise<void>;
  signOut(): Promise<void>;
  /**
   * Hesabı kalıcı olarak siler: önce buluttaki yedek, sonra kimlik.
   * E-posta hesaplarında güvenlik için şifre yeniden doğrulanır.
   */
  deleteAccount(password?: string): Promise<void>;
  loadBackup(uid: string): Promise<CloudBackup | null>;
  saveBackup(uid: string, state: AppState): Promise<number>;
}

/** Kullanıcıya gösterilecek Türkçe hata. */
export class AuthError extends Error {
  constructor(
    message: string,
    public field?: 'email' | 'password' | 'name',
  ) {
    super(message);
  }
}
