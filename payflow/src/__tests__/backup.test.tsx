import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Alert, AlertButton } from 'react-native';
import SettingsScreen from '../app/settings';
import { AuthProvider } from '../auth/AuthProvider';
import { CloudSync } from '../auth/CloudSync';
import { backupFileName, makeBackup, parseBackup } from '../core/backup';
import { AppState } from '../core/model';
import { NotificationsProvider } from '../notifications/NotificationsProvider';
import { demoState } from '../store/demoSeed';
import { initialState } from '../store/reducer';
import { StoreProvider, useStore } from '../store/StoreProvider';
import { ThemeProvider } from '../theme/ThemeProvider';

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() }, useLocalSearchParams: () => ({}) }));
jest.mock('expo-document-picker', () => {
  const { jest: j } = require('@jest/globals');
  return { getDocumentAsync: j.fn() };
});

const now = new Date(2026, 10, 18, 12);

describe('yedek dosyası', () => {
  it('yedekle → geri yükle aynı veriyi verir', () => {
    const s = demoState(now);
    const { state, exportedAt } = parseBackup(makeBackup(s, now));
    expect(state).toEqual(JSON.parse(JSON.stringify(s)));
    expect(exportedAt).toEqual(now);
    expect(backupFileName(now)).toBe('PayFlow-yedek-2026-11-18.json');
  });

  it('yanlış dosyaları Türkçe hatayla reddeder', () => {
    expect(() => parseBackup('merhaba')).toThrow(/okunamadı/);
    expect(() => parseBackup('{"app":"baska","state":{}}')).toThrow(/PayFlow yedek dosyası değil/);
    expect(() => parseBackup('{"app":"payflow","format":9,"state":{"version":1}}')).toThrow(/daha yeni bir sürümüyle/);
    expect(() => parseBackup('{"app":"payflow","format":1,"state":{"version":7}}')).toThrow(/bozuk/);
  });
});

let latest: AppState = initialState;
function Probe() {
  latest = useStore().state;
  return null;
}
const renderSettings = (state: AppState) =>
  render(
    <ThemeProvider>
      <StoreProvider initial={state}>
        <AuthProvider>
          <CloudSync>
            <NotificationsProvider>
              <SettingsScreen />
              <Probe />
            </NotificationsProvider>
          </CloudSync>
        </AuthProvider>
      </StoreProvider>
    </ThemeProvider>,
  );

describe('Ayarlar › Verilerin (yalnızca cihaz modu)', () => {
  it('hesap bölümü yok; Yedekle dosya yazıp paylaşır', async () => {
    await renderSettings(demoState(now));
    expect(screen.getByText(/yalnızca bu telefonda saklanır/)).toBeTruthy();
    expect(screen.queryByText('Hesapsız kullanıyorsun')).toBeNull();
    expect(screen.queryByText('Hesabımı sil')).toBeNull();
    expect(screen.queryByText('KVKK Aydınlatma Metni')).toBeNull();

    await fireEvent.press(screen.getByText('Yedekle'));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalled());
    const [uri, content] = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls.at(-1) as [string, string];
    expect(uri).toMatch(/PayFlow-yedek-\d{4}-\d{2}-\d{2}\.json$/);
    expect(parseBackup(content).state.cards).toHaveLength(1);
  });

  it('Geri yükle: dosya seç → onay → veriler değişir', async () => {
    const backup = demoState(now);
    backup.bills = backup.bills.slice(0, 1);
    (DocumentPicker.getDocumentAsync as jest.Mock).mockImplementation(async () => ({ canceled: false, assets: [{ uri: 'file:///yedek.json' }] }));
    (FileSystem.readAsStringAsync as jest.Mock).mockImplementation((async () => makeBackup(backup, now)) as never);
    const alert = jest.spyOn(Alert, 'alert');
    await renderSettings(initialState);
    await fireEvent.press(screen.getByText('Geri yükle'));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(alert.mock.calls.at(-1)![1]).toMatch(/1 kart, 1 fatura/);
    await act(async () => (alert.mock.calls.at(-1)![2] as AlertButton[]).find((b) => b.text === 'Geri yükle')!.onPress!());
    expect(latest.bills).toHaveLength(1);
    expect(latest.cards).toHaveLength(1);
  });
});
