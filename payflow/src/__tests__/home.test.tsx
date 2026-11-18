import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ReactNode } from 'react';
import { Alert, AlertButton } from 'react-native';
import AddScreen from '../app/add';
import CardNewScreen from '../app/card-new';
import HomeScreen from '../app/(tabs)/index';
import { AppState } from '../core/model';
import { demoState } from '../store/demoSeed';
import { initialState } from '../store/reducer';
import { StoreProvider, useStore } from '../store/StoreProvider';
import { ThemeProvider } from '../theme/ThemeProvider';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const mockParams: { tab?: string } = {};
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), navigate: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));

let latest: AppState = initialState;
function Probe() {
  latest = useStore().state;
  return null;
}

async function renderWith(ui: ReactNode, state: AppState = initialState) {
  await render(
    <ThemeProvider>
      <StoreProvider initial={state}>
        {ui}
        <Probe />
      </StoreProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  delete mockParams.tab;
});

describe('Ana Sayfa', () => {
  it('boşken kurulum adımlarını gösterir, örnek veriyle dolar', async () => {
    await renderWith(<HomeScreen />);
    expect(screen.getByText('Akışını kuralım')).toBeTruthy();
    await fireEvent.press(screen.getByText('Örnek verilerle dene'));
    expect(screen.getByText('Yaklaşan ödemeler')).toBeTruthy();
    // 12.000 devir + 390 faiz + 117 vergi + 9.426,80 harcama + 1.450 taksit
    expect(screen.getByLabelText(/Maaş Kartım, ₺23\.383,80, 11 gün/)).toBeTruthy();
    expect(screen.getByText('₺507,00')).toBeTruthy();
    expect(screen.getByText('₺386,40')).toBeTruthy();
  });

  it('faturaya basıp "Ödedim" deyince sonraki aya geçer', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    await renderWith(<HomeScreen />, demoState(new Date()));
    await fireEvent.press(screen.getByLabelText(/^Elektrik, ₺845,30, 2 gün/));
    const buttons = alert.mock.calls[0][2] as AlertButton[];
    await act(async () => buttons.find((b) => b.text === 'Ödedim')!.onPress!());
    const ele = latest.bills.find((b) => b.id === 'demo-ele')!;
    expect(ele.paidPeriods).toHaveLength(1);
    expect(screen.queryByLabelText(/^Elektrik, ₺845,30, 2 gün/)).toBeNull();
  });
});

describe('Hızlı ekle', () => {
  it('günlük harcama: tuş takımı + kategori + kaydet', async () => {
    await renderWith(<AddScreen />);
    for (const k of ['2', '1', '4', 'Virgül', '5']) await fireEvent.press(screen.getByLabelText(k));
    await fireEvent.press(screen.getByLabelText('Kafe'));
    await fireEvent.press(screen.getByText('Kaydet'));
    expect(latest.expenses).toHaveLength(1);
    expect(latest.expenses[0]).toMatchObject({ amount: 21_450, categoryId: 'cafe', source: { type: 'cash' }, installments: 1 });
  });

  it('tutarsız kaydetmez', async () => {
    await renderWith(<AddScreen />);
    await fireEvent.press(screen.getByText('Kaydet'));
    expect(screen.getByText('Tutar gir')).toBeTruthy();
    expect(latest.expenses).toHaveLength(0);
  });

  it('kart harcaması: taksitli', async () => {
    mockParams.tab = 'card';
    await renderWith(<AddScreen />, demoState(new Date()));
    for (const k of ['1', '2', '0', '0', '0']) await fireEvent.press(screen.getByLabelText(k));
    await fireEvent.press(screen.getByText('6 taksit'));
    expect(screen.getByText(/6 × ≈ ₺2\.000,00/)).toBeTruthy();
    const before = latest.expenses.length;
    await fireEvent.press(screen.getByText('Kaydet'));
    expect(latest.expenses).toHaveLength(before + 1);
    expect(latest.expenses[before]).toMatchObject({ amount: 1_200_000, installments: 6, source: { type: 'card', cardId: 'demo-card' } });
  });

  it('fatura: tür, tutar, hatırlatma ve doğrulama', async () => {
    mockParams.tab = 'bill';
    await renderWith(<AddScreen />);
    await fireEvent.press(screen.getByLabelText('Doğalgaz'));
    await fireEvent.press(screen.getByText('Faturayı kaydet'));
    expect(screen.getByText(/Geçerli bir tutar gir/)).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Tutar (₺)'), '1.940,50');
    await fireEvent.press(screen.getByText('3 gün önce')); // kapat
    await fireEvent.press(screen.getByText('Faturayı kaydet'));
    expect(latest.bills).toHaveLength(1);
    expect(latest.bills[0]).toMatchObject({ typeId: 'gas', title: 'Doğalgaz', amount: 194_050, recurrence: { type: 'monthly' } });
    expect(latest.bills[0].reminders.offsets).toEqual(['D-1', 'D0']);
  });
});

describe('Kart ekle', () => {
  it('zorunlu alanları doğrular ve devreden borçla kaydeder', async () => {
    await renderWith(<CardNewScreen />);
    await fireEvent.press(screen.getByText('Kartı kaydet'));
    expect(screen.getByText(/Karta bir ad ver/)).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Kart adı'), 'Bonus');
    await fireEvent.changeText(screen.getByLabelText('Son 4 hane'), '12a34');
    await fireEvent.changeText(screen.getByLabelText('Limit (₺)'), '45.000');
    await fireEvent.changeText(screen.getByLabelText('Son ekstre borcu (₺)'), '20.000');
    await fireEvent.changeText(screen.getByLabelText('O ekstreye ödediğin (₺)'), '8.000');
    await fireEvent.changeText(screen.getByLabelText('Bankanın aylık akdi faizi (%)'), '3,11');
    await fireEvent.press(screen.getByText('Kartı kaydet'));
    expect(latest.cards).toHaveLength(1);
    expect(latest.cards[0]).toMatchObject({
      name: 'Bonus', last4: '1234', limit: 4_500_000, openingStatementTotal: 2_000_000, openingPaid: 800_000,
      rateOverride: { contractual: 0.0311 },
    });
  });
});
