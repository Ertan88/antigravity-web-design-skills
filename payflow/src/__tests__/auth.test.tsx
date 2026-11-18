import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ReactNode } from 'react';
import { Alert, AlertButton, Text } from 'react-native';
import ForgotScreen from '../app/(auth)/forgot';
import LoginScreen from '../app/(auth)/login';
import RegisterScreen from '../app/(auth)/register';
import SettingsScreen from '../app/settings';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { CloudSync } from '../auth/CloudSync';
import { toAuthError } from '../auth/errors';
import { AuthService, AuthUser, CloudBackup } from '../auth/types';
import { AppState } from '../core/model';
import { passwordStrength } from '../core/password';
import { NotificationsProvider } from '../notifications/NotificationsProvider';
import { demoState } from '../store/demoSeed';
import { initialState } from '../store/reducer';
import { StoreProvider, useStore } from '../store/StoreProvider';
import { ThemeProvider } from '../theme/ThemeProvider';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  Link: ({ children }: { children: ReactNode }) => children,
  useLocalSearchParams: () => ({}),
}));

/** Bellek içi sahte Firebase. */
function fakeService(opts: { backup?: CloudBackup | null } = {}) {
  let current: AuthUser | null = null;
  const listeners = new Set<(u: AuthUser | null) => void>();
  const emit = () => listeners.forEach((l) => l(current));
  const calls = { register: [] as string[][], reset: [] as string[], saved: [] as AppState[], signOut: 0 };
  const svc: AuthService = {
    onAuthChange: (cb) => {
      listeners.add(cb);
      cb(current);
      return () => listeners.delete(cb);
    },
    signIn: async (email, password) => {
      if (password !== 'Dogru-Sifre1') throw toAuthError({ code: 'auth/invalid-credential' });
      current = { uid: 'u1', email, displayName: 'Ertan', provider: 'password' };
      emit();
    },
    register: async (name, email, password) => {
      if (email === 'var@ornek.com') throw toAuthError({ code: 'auth/email-already-in-use' });
      calls.register.push([name, email, password]);
      current = { uid: 'u2', email, displayName: name, provider: 'password' };
      emit();
    },
    resetPassword: async (email) => void calls.reset.push(email),
    signInWithGoogleIdToken: async () => {},
    signOut: async () => {
      calls.signOut++;
      current = null;
      emit();
    },
    loadBackup: async () => opts.backup ?? null,
    saveBackup: async (_uid, state) => {
      calls.saved.push(state);
      return Date.now();
    },
  };
  return { svc, calls, login: (u: AuthUser) => ((current = u), emit()) };
}

let auth: ReturnType<typeof useAuth>;
let store: AppState = initialState;
function Probe() {
  auth = useAuth();
  store = useStore().state;
  return <Text testID="status">{auth.status}</Text>;
}

async function renderWith(ui: ReactNode, service: AuthService | null, state: AppState = initialState) {
  await render(
    <ThemeProvider>
      <StoreProvider initial={state}>
        <AuthProvider service={service}>
          <CloudSync debounceMs={10}>
            <NotificationsProvider>
              {ui}
              <Probe />
            </NotificationsProvider>
          </CloudSync>
        </AuthProvider>
      </StoreProvider>
    </ThemeProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('status').props.children).not.toBe('loading'));
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('şifre gücü ve hata mesajları', () => {
  it('puanlar ve ipuçları', () => {
    expect(passwordStrength('').score).toBe(0);
    expect(passwordStrength('123456789').label).toBe('Çok zayıf');
    expect(passwordStrength('akis2026').label).toBe('Orta güçte');
    expect(passwordStrength('akis2026').hint).toBe('Bir sembol ekle (ör. !) → güçlü şifre');
    expect(passwordStrength('Akis-2026!').score).toBe(3);
    expect(passwordStrength('Akış-Ödeme-2026').score).toBe(4);
  });
  it('Firebase kodları Türkçe', () => {
    expect(toAuthError({ code: 'auth/invalid-credential' })).toMatchObject({ message: 'E-posta veya şifre hatalı.', field: 'password' });
    expect(toAuthError({ code: 'auth/network-request-failed' }).message).toMatch(/İnternet/);
    expect(toAuthError(new Error('x')).message).toMatch(/tekrar dene/);
  });
});

describe('Giriş', () => {
  it('doğrulama, hatalı şifre ve başarılı giriş', async () => {
    const f = fakeService();
    await renderWith(<LoginScreen />, f.svc);
    expect(auth.status).toBe('signedOut');
    await fireEvent.press(screen.getByText('Giriş yap'));
    expect(screen.getByText('Geçerli bir e-posta gir')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('E-posta'), 'ertan@ornek.com');
    await fireEvent.changeText(screen.getByLabelText('Şifre'), 'yanlis');
    await fireEvent.press(screen.getByText('Giriş yap'));
    expect(await screen.findByText('E-posta veya şifre hatalı.')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Şifre'), 'Dogru-Sifre1');
    await fireEvent.press(screen.getByText('Giriş yap'));
    await waitFor(() => expect(auth.status).toBe('signedIn'));
    expect(auth.user?.email).toBe('ertan@ornek.com');
  });

  it('Firebase yokken hesapsız devam edilir', async () => {
    await renderWith(<LoginScreen />, null);
    expect(screen.getByText('Hesap sistemi henüz bağlanmadı')).toBeTruthy();
    await fireEvent.press(screen.getByText('Hesapsız devam et'));
    expect(auth.status).toBe('guest');
  });
});

describe('Kayıt', () => {
  it('KVKK ve şifre kuralları; kayıtlı e-posta; başarılı kayıt', async () => {
    const f = fakeService();
    await renderWith(<RegisterScreen />, f.svc);
    await fireEvent.changeText(screen.getByLabelText('Ad Soyad'), 'Ertan');
    await fireEvent.changeText(screen.getByLabelText('E-posta'), 'var@ornek.com');
    await fireEvent.changeText(screen.getByLabelText('Şifre'), 'Akis-2026!');
    expect(screen.getByLabelText('Şifre gücü: İyi')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Şifre tekrar'), 'Akis-2026?');
    await fireEvent.press(screen.getByText('Hesabı oluştur'));
    expect(screen.getByText('Şifreler eşleşmiyor')).toBeTruthy();
    expect(screen.getByText(/KVKK metnini onaylamalısın/)).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Şifre tekrar'), 'Akis-2026!');
    await fireEvent(screen.getByLabelText("KVKK Aydınlatma Metni'ni okudum, kabul ediyorum"), 'valueChange', true);
    await fireEvent.press(screen.getByText('Hesabı oluştur'));
    expect(await screen.findByText(/zaten bir hesap var/)).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('E-posta'), 'yeni@ornek.com');
    await fireEvent.press(screen.getByText('Hesabı oluştur'));
    await waitFor(() => expect(auth.status).toBe('signedIn'));
    expect(f.calls.register).toEqual([['Ertan', 'yeni@ornek.com', 'Akis-2026!']]);
  });
});

describe('Şifre sıfırlama', () => {
  it('bağlantı gönderir', async () => {
    const f = fakeService();
    await renderWith(<ForgotScreen />, f.svc);
    await fireEvent.changeText(screen.getByLabelText('E-posta'), 'ertan@ornek.com');
    await fireEvent.press(screen.getByText('Bağlantı gönder'));
    expect(await screen.findByText('Bağlantı gönderildi')).toBeTruthy();
    expect(f.calls.reset).toEqual(['ertan@ornek.com']);
  });
});

describe('Bulut yedek', () => {
  const user: AuthUser = { uid: 'u1', email: 'e@o.com', displayName: 'E', provider: 'password' };

  it('cihaz boşsa buluttaki yedeği yükler', async () => {
    const remote = demoState(new Date());
    const f = fakeService({ backup: { state: remote, updatedAt: 1 } });
    await renderWith(null, f.svc);
    await act(async () => f.login(user));
    await waitFor(() => expect(store.cards).toHaveLength(1));
    expect(store.bills).toHaveLength(4);
  });

  it('değişiklikleri buluta yazar', async () => {
    const f = fakeService();
    await renderWith(null, f.svc);
    await act(async () => f.login(user));
    await waitFor(() => expect(f.calls.saved.length).toBeGreaterThan(0));
  });

  it('iki tarafta da veri varsa sorar; "Buluttakini" seçilince yükler', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    const remote = demoState(new Date());
    remote.bills = remote.bills.slice(0, 2);
    const f = fakeService({ backup: { state: remote, updatedAt: Date.now() } });
    await renderWith(null, f.svc, demoState(new Date()));
    await act(async () => f.login(user));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    const buttons = alert.mock.calls[0][2] as AlertButton[];
    await act(async () => buttons.find((b) => b.text === 'Buluttakini')!.onPress!());
    await waitFor(() => expect(store.bills).toHaveLength(2));
  });
});

describe('Ayarlar', () => {
  it('misafir hesabı ve çıkış', async () => {
    const f = fakeService();
    await renderWith(<SettingsScreen />, f.svc);
    await act(async () => auth.continueAsGuest());
    expect(screen.getByText('Hesapsız kullanıyorsun')).toBeTruthy();

    await act(async () => f.login({ uid: 'u1', email: 'e@o.com', displayName: 'Ertan', provider: 'google' }));
    expect(await screen.findByText('e@o.com · Google')).toBeTruthy();
    const alert = jest.spyOn(Alert, 'alert');
    await fireEvent.press(screen.getByText('Çıkış yap'));
    const buttons = alert.mock.calls[0][2] as AlertButton[];
    await act(async () => buttons.find((b) => b.text === 'Verileri tut')!.onPress!());
    expect(f.calls.signOut).toBe(1);
    expect(auth.status).toBe('signedOut');
  });
});

