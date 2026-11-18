import { describe, expect, it } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import path from 'path';

/**
 * Uygulamanın gerçek yönlendirmesiyle açılış: ilk kurulumdaki "Unmatched Route" hatası
 * (payflow:/// hiçbir ekrana eşlenmiyordu) bir daha yaşanmasın.
 */
describe('açılış yönlendirmesi', () => {
  it('ana adres ilk kurulum ekranına gider', async () => {
    await renderRouter(path.join(__dirname, '..', 'app'), { initialUrl: '/' });
    await waitFor(() => expect(screen.getByText('Akışını kuralım')).toBeTruthy(), { timeout: 5000 });
    expect(screen.queryByText(/Unmatched Route/)).toBeNull();
  });
});
