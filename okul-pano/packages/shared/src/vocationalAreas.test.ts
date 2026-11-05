import { describe, expect, it } from 'vitest';
import { branchIsVocational, isVocationalBranchName } from './vocationalAreas.ts';

describe('meslek alanı branşları', () => {
  it('MEB alan adları ve yazım farkları tanınır', () => {
    for (const n of [
      'Elektrik-Elektronik Teknolojisi',
      'Elektrik Elektronik Tek.',
      'Mobilya ve İç Mekan Tasarımı Öğretmeni',
      'MOBİLYA VE İÇ MEKÂN TASARIMI',
      'Bilişim Teknolojileri',
      'Tesisat Teknolojisi ve İklimlendirme',
      'Motorlu Araçlar Teknolojisi',
      'Kimya Teknolojisi',
      'Elektrik-Elektronik Teknolojisi (Elektrik)',
    ])
      expect(isVocationalBranchName(n), n).toBe(true);
  });
  it('eski ve kısa adlar tanınır', () => {
    for (const n of ['Elektrik', 'Makine', 'Ağaç İşleri', 'Muhasebe', 'Motor', 'Tesisat', 'Bilgisayar']) expect(isVocationalBranchName(n), n).toBe(true);
  });
  it('kültür dersi ve ortaokul branşları meslek alanı sayılmaz', () => {
    for (const n of ['Kimya', 'Matematik', 'Biyoloji', 'Müzik', 'Teknoloji ve Tasarım', 'Türk Dili ve Edebiyatı', 'Rehberlik ve Psikolojik Danışmanlık', 'Bilişim Teknolojileri ve Yazılım', ''])
      expect(isVocationalBranchName(n), n).toBe(false);
  });
  it('okulun ayarı önce gelir', () => {
    expect(branchIsVocational({ name: 'Kimya', vocational: true })).toBe(true);
    expect(branchIsVocational({ name: 'Elektrik', vocational: false })).toBe(false);
    expect(branchIsVocational({ name: 'Elektrik', vocational: null })).toBe(true);
  });
});
