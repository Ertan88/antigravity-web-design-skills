import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { ReactNode } from 'react';
import { Alert, AlertButton } from 'react-native';
import ExpensesScreen from '../app/expenses';
import HomeScreen from '../app/(tabs)/index';
import ReportsScreen from '../app/(tabs)/reports';
import { AppState } from '../core/model';
import { tl } from '../core/money';
import { NotificationsProvider } from '../notifications/NotificationsProvider';
import { demoState } from '../store/demoSeed';
import { initialState } from '../store/reducer';
import { StoreProvider, useStore } from '../store/StoreProvider';
import { ThemeProvider } from '../theme/ThemeProvider';

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), navigate: jest.fn() }, useLocalSearchParams: () => ({}) }));

let latest: AppState = initialState;
function Probe() {
  latest = useStore().state;
  return null;
}
const renderWith = (ui: ReactNode, state: AppState) =>
  render(
    <ThemeProvider>
      <StoreProvider initial={state}>
        <NotificationsProvider>
          {ui}
          <Probe />
        </NotificationsProvider>
      </StoreProvider>
    </ThemeProvider>,
  );

/** Örnek veri + geçmiş aylarda tekrar eden bir abonelik + ev bütçesi. */
function richState(): AppState {
  const now = new Date();
  const s = demoState(now);
  for (const back of [1, 2, 3]) {
    s.expenses.push({ id: `sub${back}`, amount: tl(229.99), categoryId: 'education', date: new Date(now.getFullYear(), now.getMonth() - back, 3, 12).toISOString(), source: { type: 'card', cardId: 'demo-card' }, installments: 1, note: 'Video platformu' });
  }
  s.settings = { ...s.settings, household: { members: ['Ayşe'] } };
  return s;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Raporlar', () => {
  it('skor, kategori dağılımı, faiz kalemi ve abonelik dedektörü', async () => {
    await renderWith(<ReportsScreen />, richState());
    expect(screen.getByLabelText(/^Ödeme sağlığı \d+ \/ 100$/)).toBeTruthy();
    expect(screen.getByText('Tam ödenen ekstre')).toBeTruthy();
    expect(screen.getByLabelText(/^Market ₺/)).toBeTruthy();
    expect(screen.getByLabelText('Faiz ve vergiler ₺507,00')).toBeTruthy();
    expect(screen.getByText(/1 abonelik · ayda ₺229,99/)).toBeTruthy();

    const before = latest.bills.length;
    await fireEvent.press(screen.getByLabelText('Video platformu için hatırlatma kur'));
    expect(latest.bills).toHaveLength(before + 1);
    expect(latest.bills[before]).toMatchObject({ typeId: 'subscription', title: 'Video platformu', amount: tl(229.99) });
  });

  it('PDF ve Excel (CSV) paylaşımı', async () => {
    await renderWith(<ReportsScreen />, demoState(new Date()));
    await fireEvent.press(screen.getByText('PDF olarak paylaş'));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///cache/rapor.pdf', expect.objectContaining({ mimeType: 'application/pdf' })));
    const html = (Print.printToFileAsync as jest.Mock).mock.calls[0][0] as { html: string };
    expect(html.html).toContain('raporu');

    await fireEvent.press(screen.getByText('Excel (CSV)'));
    await waitFor(() => expect(FileSystem.writeAsStringAsync).toHaveBeenCalled());
    const [uri, csv] = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls[0] as [string, string];
    expect(uri).toMatch(/^file:\/\/\/cache\/PayFlow-\d{4}-\d{2}\.csv$/);
    expect(csv).toContain('Tarih;Açıklama;Kategori;Kaynak;Tutar (TL)');
  });

  it('önceki aya geçilir', async () => {
    await renderWith(<ReportsScreen />, richState());
    await fireEvent.press(screen.getByLabelText('Önceki ay'));
    expect(screen.getByLabelText(/^Eğitim ₺/)).toBeTruthy();
  });
});

describe('Ev bütçesi', () => {
  it('paylaşılan faturada "Kim ödedi?" sorulur ve raporda dengelenir', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    await renderWith(<HomeScreen />, richState());
    await fireEvent.press(screen.getByLabelText(/^Kira, ₺7\.500,00/));
    const first = alert.mock.calls[0][2] as AlertButton[];
    await act(async () => first.find((b) => b.text === 'Ödedim')!.onPress!());
    const who = alert.mock.calls[1];
    expect(who[0]).toBe('Kim ödedi?');
    await act(async () => (who[2] as AlertButton[]).find((b) => b.text === 'Ayşe')!.onPress!());
    const rent = latest.bills.find((b) => b.id === 'demo-rent')!;
    expect(Object.values(rent.paidBy ?? {})).toEqual(['Ayşe']);
    expect(Object.keys(rent.paidLog ?? {})).toHaveLength(1);
  });
});

describe('Harcamalar', () => {
  it('kaynağa göre süzme ve basılı tutarak silme', async () => {
    await renderWith(<ExpensesScreen />, demoState(new Date()));
    expect(screen.getByLabelText(/alışverişleri/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Nakit' }));
    expect(screen.queryByLabelText(/alışverişleri/)).toBeNull();
    expect(screen.getByLabelText(/^Kafe, ₺92,00, Nakit/)).toBeTruthy();

    const alert = jest.spyOn(Alert, 'alert');
    await fireEvent(screen.getByLabelText(/^Kafe, ₺92,00, Nakit/), 'longPress');
    await act(async () => (alert.mock.calls[0][2] as AlertButton[]).find((b) => b.text === 'Sil')!.onPress!());
    expect(latest.expenses.find((e) => e.id === 'demo-e4')).toBeUndefined();
    expect(screen.getByText('Bu ay için kayıt yok.')).toBeTruthy();
  });
});
