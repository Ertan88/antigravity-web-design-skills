import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createMemberSchema } from './index.ts';

/* Doğrulama mesajları Türkçe; şemadaki özel mesajlar önceliklidir */
const msgs = (schema: z.ZodType, value: unknown) => schema.safeParse(value).error?.issues.map((i) => i.message) ?? [];

describe('Türkçe doğrulama mesajları', () => {
  it('varsayılan kurallar Türkçe', () => {
    const s = z.object({ a: z.string().min(3), b: z.email(), c: z.uuid(), d: z.number().int().max(5), e: z.enum(['x', 'y']), f: z.array(z.string()).max(1), g: z.iso.date(), h: z.string().min(1) });
    expect(msgs(s, { a: 'x', b: 'q', c: '1', d: 9, e: 'z', f: ['a', 'b'], g: '2020', h: '' })).toEqual([
      'En az 3 karakter olmalı.',
      'Geçerli bir e-posta adresi yazın.',
      'Geçerli bir kayıt seçin.',
      'En fazla 5 olabilir.',
      'Listedeki seçeneklerden birini seçin.',
      'En fazla 1 seçim yapılabilir.',
      'Geçerli bir tarih girin.',
      'Bu alan boş bırakılamaz.',
    ]);
    expect(msgs(s, {})[0]).toBe('Bu alan zorunlu.');
    expect(msgs(z.number(), 'abc')).toEqual(['Bir sayı girin.']);
  });

  it('özel mesajlar korunur ve hiçbir mesaj İngilizce değildir', () => {
    expect(msgs(z.string().min(2, 'Ad en az 2 harf'), 'a')).toEqual(['Ad en az 2 harf']);
    const all = msgs(createMemberSchema, { email: 'x', fullName: '', role: 'yok', permissions: 'x' });
    expect(all.length).toBeGreaterThan(0);
    for (const m of all) expect(m).not.toMatch(/invalid|expected|received|too (small|big)|must/i);
  });
});
