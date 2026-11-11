import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { screens } from '../src/db/schema.ts';
import { sentPushes } from '../src/lib/push.ts';
import { runScreenOfflineAlerts } from '../src/lib/screenOffline.ts';
import { client, createTestApp, expectStatus, login, SUPER, type TestCtx } from './helpers.ts';

/*
 * Pano bağlantısı koptu bildirimi (sentetik okul): ders saatleri 08:30–12:30 (Europe/Istanbul, UTC+3), hafta içi.
 * Bildirim yalnızca okul günü 08:15–12:30 arasında, kesinti başına bir kez; pano geri gelince "yeniden bağlandı".
 */
let t: TestCtx;
let schoolId: string;
let owner: ReturnType<typeof client>;
let screen: { id: string; token: string };
const path = (p: string) => `/api/schools/${schoolId}/${p}`;
const OWNER_TOKEN = 'ExponentPushToken[mudur-telefonu]';
const run = (iso: string) => runScreenOfflineAlerts(t.app.deps, new Date(iso), { startedAt: 0 });
const setSeen = (iso: string) => t.app.deps.db.update(screens).set({ lastSeenAt: new Date(iso), offlineAlertAt: null }).where(eq(screens.id, screen.id));
const pushes = () => sentPushes.filter((p) => p.to.includes(OWNER_TOKEN)).map((p) => `${p.message.title}: ${p.message.body}`);
const flush = () => new Promise((r) => setTimeout(r, 30));

beforeAll(async () => {
  t = await createTestApp({ PUSH_URL: 'memory' });
  const root = client(t.app, (await login(t.app, SUPER.email, SUPER.password)).token);
  const res = await root.post('/api/platform/schools', { name: 'Kopma Okulu', slug: 'kopma-okulu', ownerEmail: 'mudur@kopma.local', ownerName: 'Müdür', ownerPassword: 'MudurKP123!' });
  expectStatus(res, 201);
  schoolId = res.json().id;
  owner = client(t.app, (await login(t.app, 'mudur@kopma.local', 'MudurKP123!')).token);
  const periods = [
    { no: 1, start: '08:30', end: '09:10' },
    { no: 2, start: '09:20', end: '10:00' },
    { no: 3, start: '10:10', end: '10:50' },
    { no: 4, start: '11:00', end: '11:40' },
    { no: 5, start: '11:50', end: '12:30' },
  ];
  expectStatus(await owner.post(path('bell-schedules'), { name: 'Hafta içi', weekdays: [1, 2, 3, 4, 5], periods }), 201);
  const s = (await owner.post(path('screens'), { name: 'Giriş holü' })).json() as { screen: { id: string }; token: string };
  screen = { id: s.screen.id, token: s.token };
  expectStatus(await owner.post('/api/me/push-tokens', { token: OWNER_TOKEN, platform: 'ios' }), 204);
});

afterAll(async () => {
  await t.app.close();
  await t.database.close();
});

describe('pano bağlantısı koptu bildirimi', () => {
  it('ders saatinde 10 dakika görünmeyen pano bir kez bildirilir; geri gelince "yeniden bağlandı"', async () => {
    await setSeen('2026-12-02T06:45:00Z'); // Çarşamba 09:45
    expect(await run('2026-12-02T06:50:00Z')).toBe(0); // 5 dakika: henüz değil
    expect(await run('2026-12-02T07:00:00Z')).toBe(1);
    expect(await run('2026-12-02T07:05:00Z')).toBe(0); // kesinti başına bir kez
    await flush();
    expect(pushes().at(-1)).toBe('Pano bağlantısı koptu: "Giriş holü" panosu 15 dakikadır bağlı değil. TV\'yi ve internet bağlantısını kontrol edin.');

    // Pano yeniden istek yapınca bildirim sıfırlanır
    const r = await t.app.inject({ method: 'GET', url: '/api/display/state', headers: { authorization: `Bearer ${screen.token}` } });
    expectStatus(r, 200);
    await flush();
    expect(pushes().at(-1)).toBe('Pano yeniden bağlandı: "Giriş holü" panosu yeniden çevrimiçi.');
    const [row] = await t.app.deps.db.select().from(screens).where(eq(screens.id, screen.id));
    expect(row!.offlineAlertAt).toBeNull();
  });

  it('ders saatleri dışında, hafta sonu ve tatilde bildirim gitmez', async () => {
    await setSeen('2026-12-02T13:00:00Z'); // 16:00
    expect(await run('2026-12-02T17:00:00Z')).toBe(0); // 20:00
    await setSeen('2026-12-04T13:00:00Z');
    expect(await run('2026-12-05T07:00:00Z')).toBe(0); // Cumartesi 10:00
    expectStatus(await owner.post(path('holidays'), { date: '2026-12-10', name: 'Ara tatil' }), 201);
    await setSeen('2026-12-09T13:00:00Z');
    expect(await run('2026-12-10T07:00:00Z')).toBe(0);
  });

  it('sabah açılmayan pano: ilk dersten 15 dakika önce "bugün henüz bağlanmadı"', async () => {
    await setSeen('2026-11-23T13:00:00Z'); // Pazartesi 16:00'da kapatıldı
    expect(await run('2026-11-24T05:10:00Z')).toBe(0); // Salı 08:10: daha erken
    expect(await run('2026-11-24T05:16:00Z')).toBe(1); // 08:16
    await flush();
    expect(pushes().at(-1)).toContain('"Giriş holü" panosu bugün henüz bağlanmadı');
  });

  it('sunucu yeni açıldıysa (uykudan uyandı) panoların bağlanması beklenir', async () => {
    await setSeen('2026-12-02T06:00:00Z');
    const now = new Date('2026-12-02T07:00:00Z');
    expect(await runScreenOfflineAlerts(t.app.deps, now, { startedAt: now.getTime() - 5 * 60_000 })).toBe(0);
    expect(await runScreenOfflineAlerts(t.app.deps, now, { startedAt: now.getTime() - 11 * 60_000 })).toBe(1);
  });

  it('açık bağlantısı olan pano kopmuş sayılmaz', async () => {
    await setSeen('2026-12-02T06:00:00Z');
    const off = t.app.deps.bus.screenConnected(screen.id);
    expect(await run('2026-12-02T07:00:00Z')).toBe(0);
    off();
    expect(await run('2026-12-02T07:00:00Z')).toBe(1);
  });
});
