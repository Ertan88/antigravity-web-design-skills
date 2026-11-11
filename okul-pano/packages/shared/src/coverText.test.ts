import { describe, expect, it } from 'vitest';
import { coverBandText, trNameList } from './coverText.ts';

describe('izinli öğretmen bandı (devrik cümle yok)', () => {
  it('ders ve nöbet yeri', () => {
    expect(coverBandText(['Ayşe Yılmaz'], 2, 1)).toEqual({ title: 'Bugün: Ayşe Yılmaz izinli.', detail: '2 dersi ve 1 nöbet yeri boş.' });
  });
  it('yalnız ders ya da yalnız nöbet', () => {
    expect(coverBandText(['Ayşe Yılmaz'], 2, 0).detail).toBe('2 dersi boş.');
    expect(coverBandText(['Ayşe Yılmaz'], 0, 1).detail).toBe('1 nöbet yeri boş.');
  });
  it('birden çok izinli', () => {
    expect(trNameList(['A', 'B'])).toBe('A ve B');
    expect(trNameList(['A', 'B', 'C'])).toBe('A, B ve C');
    expect(trNameList(['A', 'B', 'C', 'D', 'E'])).toBe('A, B ve 3 kişi daha');
    expect(coverBandText(['A', 'B'], 3, 1).title).toBe('Bugün: A ve B izinli.');
  });
});
