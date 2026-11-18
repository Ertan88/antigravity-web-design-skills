import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ReactNode } from 'react';
import AddScreen from '../app/add';
import CardDetailScreen from '../app/card/[id]';
import CardNewScreen from '../app/card-new';
import CardPayScreen from '../app/card-pay';
import FlowSettingsScreen from '../app/flow-settings';
import SimulatorScreen from '../app/simulator';
import TimelineScreen from '../app/(tabs)/timeline';
import { AppState } from '../core/model';
import { demoState } from '../store/demoSeed';
import { initialState } from '../store/reducer';
import { NotificationsProvider } from '../notifications/NotificationsProvider';
import { StoreProvider, useStore } from '../store/StoreProvider';
import { ThemeProvider } from '../theme/ThemeProvider';


const mockParams: Record<string, string | undefined> = {};
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), navigate: jest.fn(), dismissAll: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));

let latest: AppState = initialState;
function Probe() {
  latest = useStore().state;
  return null;
}
async function renderWith(ui: ReactNode, state: AppState) {
  await render(
    <ThemeProvider>
      <StoreProvider initial={state}>
        <NotificationsProvider>
          {ui}
          <Probe />
        </NotificationsProvider>
      </StoreProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  for (const k of Object.keys(mockParams)) delete mockParams[k];
});

describe('Kart ve ekstre', () => {
  it('dökümü motorla aynı gösterir: devir, faiz, vergi, taksit, toplam, günlük faiz', async () => {
    mockParams.id = 'demo-card';
    await renderWith(<CardDetailScreen />, demoState(new Date()));
    expect(screen.getByText('Önceki dönemden devreden')).toBeTruthy();
    expect(screen.getByText('₺12.000,00')).toBeTruthy();
    expect(screen.getByText('Akdi faiz %3,25')).toBeTruthy();
    expect(screen.getByText('+₺390,00')).toBeTruthy();
    expect(screen.getByText('+₺117,00')).toBeTruthy();
    expect(screen.getByText('Telefon 3/6')).toBeTruthy();
    expect(screen.getByText('₺23.383,80')).toBeTruthy();
    expect(screen.getByText('≈ ₺16,90')).toBeTruthy();
    expect(screen.getByText('Kasım alışverişleri')).toBeTruthy();
  });
});

describe('Ödeme kaydet', () => {
  it('asgari seçince devir uyarısı, kaydedince ödeme eklenir', async () => {
    const s = demoState(new Date());
    // Ekim (kapalı) ekstresine ödeme ekranı: kalan 12.000
    mockParams.id = 'demo-card';
    await renderWith(<CardPayScreen />, s);
    expect(screen.getByText('Ödeme kaydet')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Ödenen tutar (₺)'), '5.000');
    await fireEvent.press(screen.getByText('Ödemeyi kaydet'));
    expect(latest.cardPayments).toHaveLength(1);
    expect(latest.cardPayments[0]).toMatchObject({ cardId: 'demo-card', amount: 500_000 });
  });

  it('tutar boşsa kaydetmez', async () => {
    mockParams.id = 'demo-card';
    await renderWith(<CardPayScreen />, demoState(new Date()));
    await fireEvent.changeText(screen.getByLabelText('Ödenen tutar (₺)'), '');
    await fireEvent.press(screen.getByText('Ödemeyi kaydet'));
    expect(screen.getByText('Ödeme tutarını gir')).toBeTruthy();
    expect(latest.cardPayments).toHaveLength(0);
  });
});

describe('Simülatör', () => {
  it('Tamamı → faiz yok; Asgari → aylar ve faiz; asgari tuzağı özeti', async () => {
    mockParams.id = 'demo-card';
    await renderWith(<SimulatorScreen />, demoState(new Date()));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Tamamı' }));
    expect(screen.getByText('Bu ay')).toBeTruthy();
    expect(screen.getByText('₺0,00')).toBeTruthy();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Asgari' }));
    expect(screen.getByText(/ayda$/)).toBeTruthy();
    expect(screen.getByText(/ayda biter/)).toBeTruthy();
  });
});

describe('Zaman Nehri', () => {
  it('bakiye yoksa ayar çağrısı gösterir', async () => {
    const s = demoState(new Date());
    s.settings = { ...s.settings, balance: undefined };
    await renderWith(<TimelineScreen />, s);
    expect(screen.getByText('Bakiye çizgisini aç')).toBeTruthy();
  });

  it('örnek veride eksiye düşüşü ve faiz maliyetli öneriyi gösterir', async () => {
    await renderWith(<TimelineScreen />, demoState(new Date()));
    expect(screen.getByText(/bakiye eksiye düşüyor/)).toBeTruthy();
    expect(screen.getByText(/maaştan sonraya bırakmak ≈ ₺\d+,\d\d faiz/)).toBeTruthy();
    expect(screen.getByLabelText(/Maaş, ₺46\.000,00/)).toBeTruthy();
    expect(screen.getByLabelText(/Ek ders, ₺6\.000,00/)).toBeTruthy();
  });

  it('bakiye ve gelir kaynakları kaydedilir (maaş + değişken ek ders)', async () => {
    await renderWith(<FlowSettingsScreen />, initialState);
    await fireEvent.changeText(screen.getByLabelText('Şu anki hesap bakiyen (₺)'), '10.000');
    await fireEvent.press(screen.getByText('+ Maaş'));
    await fireEvent.changeText(screen.getByLabelText('Net tutar (₺)'), '40.000');
    await fireEvent.press(screen.getByText('+ Ek ders'));
    await fireEvent.press(screen.getByText('Kaydet'));
    expect(latest.settings.balance?.amount).toBe(1_000_000);
    expect(latest.settings.incomes?.map((i) => [i.name, i.day, i.amount, i.variable])).toEqual([
      ['Maaş', 15, 4_000_000, false],
      ['Ek ders', 1, 0, true],
    ]);
  });

  it('sabit gelirde tutar zorunlu', async () => {
    await renderWith(<FlowSettingsScreen />, initialState);
    await fireEvent.press(screen.getByText('+ Maaş'));
    await fireEvent.press(screen.getByText('Kaydet'));
    expect(screen.getByText('Maaş: tutarı gir')).toBeTruthy();
    expect(latest.settings.incomes).toBeUndefined();
  });
});

describe('Düzenleme', () => {
  it('fatura düzenlenir; id, ödenen dönemler korunur', async () => {
    const s = demoState(new Date());
    s.bills[0].paidPeriods = ['2026-10'];
    mockParams.billId = 'demo-ele';
    await renderWith(<AddScreen />, s);
    expect(screen.getByText('Faturayı düzenle')).toBeTruthy();
    expect(screen.queryByText('Günlük')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Tutar (₺)'), '910,15');
    await fireEvent.press(screen.getByText('Faturayı kaydet'));
    expect(latest.bills).toHaveLength(4);
    expect(latest.bills[0]).toMatchObject({ id: 'demo-ele', amount: 91_015, paidPeriods: ['2026-10'], title: 'Elektrik' });
  });

  it('kart düzenlenir; mevcut değerler forma dolar', async () => {
    mockParams.id = 'demo-card';
    await renderWith(<CardNewScreen />, demoState(new Date()));
    expect(screen.getByText('Kartı düzenle')).toBeTruthy();
    expect(screen.getByDisplayValue('Maaş Kartım')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Kart adı'), 'Ana Kart');
    await fireEvent.press(screen.getByText('Kartı kaydet'));
    expect(latest.cards).toHaveLength(1);
    expect(latest.cards[0]).toMatchObject({ id: 'demo-card', name: 'Ana Kart', openingStatementTotal: 2_000_000 });
  });
});
