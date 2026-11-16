import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { contactRequests } from '../src/db/schema.ts';
import { createTestApp, login, SUPER, type TestCtx } from './helpers.ts';

/* Tanıtım sitesi: kök adreste tanıtım sayfası, yasal sayfalar, iletişim formu ve platform listesi */

let t: TestCtx;
beforeAll(async () => {
  t = await createTestApp({ SELLER_NAME: 'Deneme Satıcı', CONTACT_EMAIL: 'iletisim@ornek.test' });
});
afterAll(async () => {
  await t.app.close();
  await t.database.close();
});

const valid = {
  topic: 'demo',
  name: 'Ayşe Örnek',
  role: 'Müdür',
  school: 'Örnek Anadolu Lisesi',
  city: 'Ankara / Çankaya',
  email: 'ayse@ornek.test',
  phone: '',
  time: 'Hafta içi sabah',
  message: 'Okulumuzda iki pano olacak.',
  consent: true,
  website: '',
};

describe('tanıtım sitesi', () => {
  it('kök adres tanıtım sayfasını, satıcı bilgisini ve CSP başlığını verir; boş bilgi yer tutucu olur', async () => {
    const r = await t.app.inject({ method: 'GET', url: '/' });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toContain('text/html');
    expect(r.headers['content-security-policy']).toContain("script-src 'self'");
    expect(r.body).toContain('Sabah ilk iş');
    expect(r.body).toContain('Deneme Satıcı');
    expect(r.body).toContain('<span class="ph">Adres</span>');
    expect(r.body).not.toMatch(/<script>(?!<\/script>)/);
  });

  it('iletişim ve yasal sayfalar açılır; stil dosyası sunulur', async () => {
    for (const url of ['/iletisim', '/kvkk', '/gizlilik', '/kullanim-kosullari', '/mesafeli-satis', '/on-bilgilendirme']) {
      expect((await t.app.inject({ method: 'GET', url })).statusCode, url).toBe(200);
    }
    const css = await t.app.inject({ method: 'GET', url: '/site/site.css' });
    expect(css.statusCode).toBe(200);
  });

  it('iletişim formu: eksik onay reddedilir, geçerli talep kaydedilir, bot tuzağı kaydetmez', async () => {
    const bad = await t.app.inject({ method: 'POST', url: '/api/contact', payload: { ...valid, consent: false } });
    expect(bad.statusCode).toBe(400);
    const ok = await t.app.inject({ method: 'POST', url: '/api/contact', payload: valid });
    expect(ok.statusCode).toBe(201);
    const bot = await t.app.inject({ method: 'POST', url: '/api/contact', payload: { ...valid, website: 'http://spam.test' } });
    expect(bot.statusCode).toBe(202);
    const rows = await t.database.db.select().from(contactRequests);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ topic: 'demo', phone: null, preferredTime: 'Hafta içi sabah', status: 'new' });
  });

  it('talepleri yalnızca platform yöneticisi görür ve yanıtlandı işaretler', async () => {
    expect((await t.app.inject({ method: 'GET', url: '/api/platform/contact' })).statusCode).toBe(401);
    const { token } = await login(t.app, SUPER.email, SUPER.password);
    const auth = { authorization: `Bearer ${token}` };
    const list = await t.app.inject({ method: 'GET', url: '/api/platform/contact', headers: auth });
    expect(list.statusCode).toBe(200);
    const id = list.json()[0].id as string;
    const done = await t.app.inject({ method: 'PATCH', url: `/api/platform/contact/${id}`, headers: auth, payload: { status: 'done' } });
    expect(done.json()).toMatchObject({ status: 'done' });
    expect((await t.app.inject({ method: 'DELETE', url: `/api/platform/contact/${id}`, headers: auth })).statusCode).toBe(204);
  });
});
