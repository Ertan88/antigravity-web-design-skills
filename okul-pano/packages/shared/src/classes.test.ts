import { describe, expect, it } from 'vitest';
import { normalizeClassName } from './classes.ts';

describe('normalizeClassName', () => {
  it.each([
    ['9-A', '9-A'],
    ['9/a', '9-A'],
    ['9 a', '9-A'],
    ['9a', '9-A'],
    ['10.B', '10-B'],
    ['9. Sınıf / A Şubesi', '9-A'],
    ['11. SINIF Ç ŞUBESİ', '11-Ç'],
    ['  anasınıfı  ', 'ANASINIFI'],
  ])('%s -> %s', (raw, expected) => {
    expect(normalizeClassName(raw)).toBe(expected);
  });
});
