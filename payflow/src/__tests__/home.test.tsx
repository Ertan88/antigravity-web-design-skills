import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import HomeScreen from '../app/(tabs)/index';
import { ThemeProvider } from '../theme/ThemeProvider';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

describe('Ana Sayfa', () => {
  it('finans motorundan gelen tutarları ve yaklaşan ödemeleri gösterir', async () => {
    await render(
      <ThemeProvider>
        <HomeScreen />
      </ThemeProvider>,
    );
    // Kart ekstresi (motor): ₺24.243,80 ; faiz + vergiler: ₺507,00
    expect(screen.getByLabelText(/Maaş Kartım, ₺24\.243,80, 11 gün/)).toBeTruthy();
    expect(screen.getByText('₺507,00')).toBeTruthy();
    expect(screen.getByLabelText(/Elektrik, ₺845,30, 2 gün/)).toBeTruthy();
    expect(screen.getByLabelText(/Kira, ₺7\.500,00, 12 gün/)).toBeTruthy();
    // Bu ay toplam = kart 24.243,80 + faturalar 6.826,57 + kira 7.500 = 38.570,37
    expect(screen.getByLabelText('Bu ay ödenecek ₺38.570,37')).toBeTruthy();
    expect(screen.getByText('₺386,40')).toBeTruthy();
    expect(screen.getByText('Yaklaşan ödemeler')).toBeTruthy();
  });
});
