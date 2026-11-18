/// <reference types="node" />
import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import LegalScreen from '../../app/legal/[doc]';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { legalDoc, LegalDocId, legalUrl } from '../index';

const mockParams: { doc?: string } = {};
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() }, useLocalSearchParams: () => mockParams }));

const text = (id: LegalDocId) => {
  const d = legalDoc(id);
  return [d.intro, ...d.sections.flatMap((s) => [s.heading, ...s.blocks.flatMap((b) => ('p' in b ? [b.p] : b.ul))])].join('\n');
};

describe('yasal metinler (yalnızca cihazda çalışan sürüm)', () => {
  it('doldurulmamış şablon alanı kalmaz', () => {
    for (const id of ['privacy', 'terms'] as const) expect(text(id)).not.toMatch(/\{\{\w+\}\}/);
  });

  it('gizlilik politikası mağazaların ve KVKK\'nın istediği konuları kapsar', () => {
    const t = text('privacy');
    for (const must of ['yalnızca cihazında', 'Hesap yok', 'Reklam, analitik veya takip aracı yok', 'Bildirimler', 'Face ID', 'Verilerini silme', 'KVKK', 'aktarım yapılmaz', 'İletişim', 'Çocuklar'])
      expect(t).toContain(must);
    expect(legalUrl('privacy')).toBe('https://ertan88.github.io/antigravity-web-design-skills/payflow/gizlilik.html');
  });

  it('kullanım koşulları tahmin ve yedek sorumluluğunu açıkça yazar', () => {
    const t = text('terms');
    expect(t).toContain('TAHMİNLERDİR');
    expect(t).toContain('Yedekle');
  });

  it('web sayfaları JSON kaynağıyla güncel; hesaplı sürüme ait sayfalar kalmadı', () => {
    const root = join(__dirname, '..', '..', '..');
    const docs = join(root, '..', 'docs', 'payflow');
    const before = readFileSync(join(docs, 'gizlilik.html'), 'utf8');
    execFileSync('node', [join(root, 'scripts', 'build-legal.mjs')]);
    expect(readFileSync(join(docs, 'gizlilik.html'), 'utf8')).toBe(before); // fark varsa: npm run legal
    expect(existsSync(join(docs, 'kosullar.html'))).toBe(true);
    expect(existsSync(join(docs, 'kvkk.html'))).toBe(false);
    expect(existsSync(join(docs, 'hesap-silme.html'))).toBe(false);
  });

  it('uygulama içi ekran metni gösterir', async () => {
    mockParams.doc = 'privacy';
    await render(
      <ThemeProvider>
        <LegalScreen />
      </ThemeProvider>,
    );
    expect(screen.getByText('Gizlilik Politikası')).toBeTruthy();
    expect(screen.getByText('6. Kişisel verilerin korunması (KVKK)')).toBeTruthy();
    expect(screen.getByText(/Taslak: geliştirici bilgileri/)).toBeTruthy();
  });
});
