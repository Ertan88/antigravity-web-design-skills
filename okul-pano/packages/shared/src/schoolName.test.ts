import { describe, expect, it } from 'vitest';
import { shortSchoolName, splitSchoolName } from './schoolName.ts';

describe('splitSchoolName', () => {
  it('bilinen okul türünü ayırır (büyük harf ve Türkçe karakterlerle)', () => {
    expect(splitSchoolName('MUAMMER KOCATÜRK MESLEKİ VE TEKNİK ANADOLU LİSESİ')).toEqual({
      name: 'MUAMMER KOCATÜRK',
      type: 'MESLEKİ VE TEKNİK ANADOLU LİSESİ',
    });
    expect(splitSchoolName('Örnek Anadolu Lisesi')).toEqual({ name: 'Örnek', type: 'Anadolu Lisesi' });
    expect(splitSchoolName('Gazi İlkokulu')).toEqual({ name: 'Gazi', type: 'İlkokulu' });
  });

  it('ayarlarda girilen türü kullanır ve adda tekrar ediyorsa çıkarır', () => {
    expect(splitSchoolName('Atatürk Lisesi', 'Fen Lisesi')).toEqual({ name: 'Atatürk Lisesi', type: 'Fen Lisesi' });
    expect(splitSchoolName('Atatürk Fen Lisesi', 'Fen Lisesi')).toEqual({ name: 'Atatürk', type: 'Fen Lisesi' });
  });

  it('tür bulamazsa adı tek satır bırakır', () => {
    expect(splitSchoolName('Kardelen Okulları')).toEqual({ name: 'Kardelen Okulları', type: null });
    expect(splitSchoolName('Lisesi')).toEqual({ name: 'Lisesi', type: null });
  });
  it('kısaltmayı tanır', () => {
    expect(splitSchoolName('Muammer Kocatürk MTAL')).toEqual({ name: 'Muammer Kocatürk', type: 'Mesleki ve Teknik Anadolu Lisesi' });
    expect(splitSchoolName('Atatürk A.İ.H.L.')).toEqual({ name: 'Atatürk', type: 'Anadolu İmam Hatip Lisesi' });
    expect(splitSchoolName('Muammer Kocatürk')).toEqual({ name: 'Muammer Kocatürk', type: null });
  });
});

describe('shortSchoolName', () => {
  it('ayarlardaki türü kısaltır; tür girilmemişse addan ayırır', () => {
    expect(shortSchoolName('Develi', 'Mesleki ve Teknik Anadolu Lisesi')).toBe('Develi MTAL');
    expect(shortSchoolName('DEVELİ', 'MESLEKİ VE TEKNİK ANADOLU LİSESİ')).toBe('DEVELİ MTAL');
    expect(shortSchoolName('Develi Mesleki ve Teknik Anadolu Lisesi Müdürlüğü')).toBe('Develi MTAL');
    expect(shortSchoolName('Gazi İlkokulu')).toBe('Gazi İO');
    expect(shortSchoolName('Kardelen Okulları')).toBe('Kardelen Okulları');
    expect(shortSchoolName('Kardelen', 'Koleji')).toBe('Kardelen Koleji');
  });
});
