/// <reference types="node" />
import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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

describe('yasal metinler', () => {
  it('yer tutucular dışında doldurulmamış alan kalmaz', () => {
    for (const id of ['privacy', 'kvkk', 'terms'] as const) expect(text(id)).not.toMatch(/\{\{\w+\}\}/);
  });

  it('KVKK aydınlatma metni zorunlu unsurları içerir (m.10 + Tebliğ)', () => {
    const t = text('kvkk');
    for (const must of ['Veri sorumlusu', 'İşleme amaçları ve hukuki sebepler', 'Toplama yöntemi', 'Aktarım', '11. maddesi', 'Başvuru', 'm.5/2-c', 'yurt dışına aktarım', 'standart sözleşme'])
      expect(t).toContain(must);
    // 11. madde: 9 hak
    expect(legalDoc('kvkk').sections.find((s) => s.id === 'haklar')!.blocks[0]).toMatchObject({ ul: expect.arrayContaining([expect.any(String)]) });
    expect((legalDoc('kvkk').sections.find((s) => s.id === 'haklar')!.blocks[0] as { ul: string[] }).ul).toHaveLength(9);
    expect(t).toMatch(/onay istenmez/);
  });

  it('gizlilik politikası mağaza kurallarını karşılar: hesap silme bölümü, uygulama adı, saklama, paylaşım', () => {
    const p = legalDoc('privacy');
    const del = p.sections.find((s) => s.id === 'hesap-silme')!;
    expect(del.heading).toMatch(/silme/);
    const delText = del.blocks.map((b) => ('p' in b ? b.p : b.ul.join(' '))).join(' ');
    expect(delText).toContain('PayFlow');
    expect(delText).toContain('Ayarlar › Hesabımı sil');
    expect(delText).toMatch(/e-posta/);
    for (const id of ['veriler', 'amaclar', 'saklama', 'sure', 'haklar', 'cocuklar']) expect(p.sections.some((s) => s.id === id)).toBe(true);
    expect(legalUrl('privacy', 'hesap-silme')).toBe('https://ertan88.github.io/antigravity-web-design-skills/payflow/gizlilik.html#hesap-silme');
  });

  it('web sayfaları JSON kaynağıyla güncel', () => {
    const root = join(__dirname, '..', '..', '..');
    const before = readFileSync(join(root, '..', 'docs', 'payflow', 'gizlilik.html'), 'utf8');
    execFileSync('node', [join(root, 'scripts', 'build-legal.mjs')]);
    const after = readFileSync(join(root, '..', 'docs', 'payflow', 'gizlilik.html'), 'utf8');
    expect(after).toBe(before); // fark varsa: npm run legal çalıştırıp commit et
    expect(after).toContain('id="hesap-silme"');
    const del = readFileSync(join(root, '..', 'docs', 'payflow', 'hesap-silme.html'), 'utf8');
    expect(del).toContain('PayFlow — hesap ve veri silme');
  });

  it('uygulama içi ekran metni gösterir', async () => {
    mockParams.doc = 'kvkk';
    await render(
      <ThemeProvider>
        <LegalScreen />
      </ThemeProvider>,
    );
    expect(screen.getByText('KVKK Aydınlatma Metni')).toBeTruthy();
    expect(screen.getByText('6. Kanun\'un 11. maddesi kapsamındaki hakların')).toBeTruthy();
    expect(screen.getByText(/Taslak: veri sorumlusu/)).toBeTruthy();
  });
});
