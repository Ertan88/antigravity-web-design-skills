import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  getReactNativePersistence,
  GoogleAuthProvider,
  initializeAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type Auth,
  type User,
} from 'firebase/auth';
import { doc, getDoc, getFirestore, setDoc } from 'firebase/firestore';
import { firebaseConfig } from '../config/env';
import { migrate } from '../store/reducer';
import { toAuthError } from './errors';
import { AuthService, AuthUser } from './types';

/**
 * Firebase uygulaması.
 *  - Oturum cihazda AsyncStorage ile kalıcı (uygulama kapanınca çıkış yapılmaz).
 *  - Yedek: users/{uid} belgesinde tek alan olarak JSON (Firestore kuralları: firestore.rules).
 */
let authInstance: Auth | null = null;

function init() {
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  if (!authInstance) {
    try {
      authInstance = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
    } catch {
      authInstance = getAuth(app); // hızlı yenilemede ikinci kez başlatılırsa
    }
  }
  return { app, auth: authInstance, db: getFirestore(app) };
}

const toUser = (u: User): AuthUser => ({
  uid: u.uid,
  email: u.email,
  displayName: u.displayName,
  provider: u.providerData.some((p) => p.providerId === 'google.com') ? 'google' : 'password',
});

const wrap = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (e) {
    throw toAuthError(e);
  }
};

export function createFirebaseService(): AuthService {
  const { auth, db } = init();
  return {
    onAuthChange: (cb) => onAuthStateChanged(auth, (u) => cb(u ? toUser(u) : null)),
    signIn: (email, password) => wrap(async () => void (await signInWithEmailAndPassword(auth, email.trim(), password))),
    register: (name, email, password) =>
      wrap(async () => {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() });
      }),
    resetPassword: (email) => wrap(() => sendPasswordResetEmail(auth, email.trim())),
    signInWithGoogleIdToken: (idToken) => wrap(async () => void (await signInWithCredential(auth, GoogleAuthProvider.credential(idToken)))),
    signOut: () => wrap(() => signOut(auth)),
    loadBackup: async (uid) => {
      const snap = await getDoc(doc(db, 'users', uid));
      if (!snap.exists()) return null;
      const d = snap.data() as { state?: string; updatedAt?: number };
      if (!d.state) return null;
      return { state: migrate(JSON.parse(d.state)), updatedAt: d.updatedAt ?? 0 };
    },
    saveBackup: async (uid, state) => {
      const updatedAt = Date.now();
      await setDoc(doc(db, 'users', uid), { state: JSON.stringify(state), updatedAt, schema: state.version });
      return updatedAt;
    },
  };
}
