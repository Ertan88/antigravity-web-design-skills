import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.ts';
import { mailConfigured } from '../src/lib/mailer.ts';
import { client, createTestApp, expectStatus, login, SUPER, type TestCtx } from './helpers.ts';

/* Platform paneli: e-posta ayarı (sunucuya erişmeden, ör. Render). Anahtar şifreli saklanır, geri gösterilmez. */

let t: TestCtx;
let root: ReturnType<typeof client>;
const sent: { key: string; to: string; from: string }[] = [];

beforeAll(async () => {
  t = await createTestApp({ BREVO_API_URL: 'https://brevo.test/send' });
  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (String(input) === 'https://brevo.test/send') {
      const key = (init?.headers as Record<string, string>)['api-key']!;
      const body = JSON.parse(String(init?.body)) as { to: { email: string }[]; sender: { email: string } };
      if (key === 'yanlis') return new Response('{"message":"Key not found"}', { status: 401 });
      sent.push({ key, to: body.to[0]!.email, from: body.sender.email });
      return new Response('{}', { status: 201 });
    }
    return realFetch(input, init);
  });
  root = client(t.app, (await login(t.app, SUPER.email, SUPER.password)).token);
});

afterAll(async () => {
  vi.restoreAllMocks();
  await t.app.close();
  await t.database.close();
});

describe('platform e-posta ayarı', () => {
  it('başta ayarsız; okul yöneticisi erişemez', async () => {
    const res = await root.get('/api/platform/mail');
    expectStatus(res, 200);
    expect(res.json()).toMatchObject({ source: null, keyMask: null });
    expect(mailConfigured(t.app.deps.env)).toBe(false);
    const created = await root.post('/api/platform/schools', { name: 'Ayar Lisesi', slug: 'ayar-lisesi', ownerEmail: 'mudur@ayar.test', ownerName: 'Müdür', ownerPassword: 'MudurSifre42' });
    expectStatus(created, 201);
    const owner = client(t.app, (await login(t.app, 'mudur@ayar.test', 'MudurSifre42')).token);
    expectStatus(await owner.get('/api/platform/mail'), 403);
  });

  it('yanlış anahtarla deneme hatayı gösterir', async () => {
    const res = await root.post('/api/platform/mail/test', { brevoApiKey: 'yanlis', from: 'Okul <okul.bildirim@gmail.com>' });
    expectStatus(res, 400);
    expect(res.json().message).toContain('401');
  });

  it('kaydedilir, anahtar maskelenir ve şifreli saklanır; gönderimler bu ayarla gider', async () => {
    const res = await root.put('/api/platform/mail', { brevoApiKey: 'xkeysib-gizli-anahtar-1234', from: 'Okulyayın <okul.bildirim@gmail.com>' });
    expectStatus(res, 200);
    expect(res.json()).toMatchObject({ source: 'panel', keyMask: '••••1234', from: 'Okulyayın <okul.bildirim@gmail.com>' });
    expect(JSON.stringify(res.json())).not.toContain('gizli');
    const raw = await t.database.db.query.platformSettings.findFirst();
    expect(JSON.stringify(raw)).not.toContain('gizli');
    expect(mailConfigured(t.app.deps.env)).toBe(true);
    // Deneme platform yöneticisinin kendi adresine gider
    const test = await root.post('/api/platform/mail/test', {});
    expectStatus(test, 200);
    expect(sent.at(-1)).toEqual({ key: 'xkeysib-gizli-anahtar-1234', to: SUPER.email, from: 'okul.bildirim@gmail.com' });
  });

  it('anahtar boş bırakılırsa korunur; yeniden açılışta yüklenir', async () => {
    expectStatus(await root.put('/api/platform/mail', { from: 'Yeni Ad <okul.bildirim@gmail.com>' }), 200);
    const again = await buildApp({ database: t.database, logger: false, env: { ...t.app.deps.env } as never });
    expect(mailConfigured(again.deps.env)).toBe(true);
    await again.close();
    expectStatus(await root.post('/api/platform/mail/test', {}), 200);
    expect(sent.at(-1)?.key).toBe('xkeysib-gizli-anahtar-1234');
  });

  it('silinince gönderim kapanır', async () => {
    expectStatus(await root.del('/api/platform/mail'), 204);
    expect(mailConfigured(t.app.deps.env)).toBe(false);
  });
});
