import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { runMebCalendarJob, scanMebCalendar } from '../src/lib/mebCalendar.ts';
import { client, createTestApp, expectStatus, login, SUPER, type TestCtx } from './helpers.ts';

let t: TestCtx;
let schoolId: string;
let owner: ReturnType<typeof client>;
let root: ReturnType<typeof client>;
const path = (p: string) => `/api/schools/${schoolId}/${p}`;

/** MEB sitesinin sahtesi: ana sayfada duyuru bağlantısı, duyuruda takvim metni */
function fakeMeb(pages: Record<string, string>) {
  return (async (url: string | URL | Request) => {
    const body = pages[String(url)];
    return new Response(body ?? 'yok', { status: body ? 200 : 404 });
  }) as typeof fetch;
}
const INDEX = 'https://www.meb.gov.tr/';
const NEWS = 'https://www.meb.gov.tr/20272028egitimogretimyilitakvimiaciklandi/haber/50000/tr';
const page = (lessonsStart: string) => `<html><head><script>var x = "1 Eylül 2027";</script></head><body>
  <h1>2027-2028 EĞİTİM ÖĞRETİM YILI TAKVİMİ AÇIKLANDI</h1>
  <p>Öğretmenlerin mesleki çalışmaları 1 Eylül 2027 Çarşamba günü başlayacak.</p>
  <p>Okullarda dersler ${lessonsStart} Eyl&uuml;l 2027 Pazartesi g&uuml;n&uuml; başlayacak. Birinci dönem ara tatili 15-19 Kasım 2027 tarihleri arasında yapılacak.</p>
  <p>Birinci dönem 21 Ocak 2028 Cuma günü sona erecek. Yarıyıl tatili 24 Ocak-4 Şubat 2028 tarihleri arasında olacak.</p>
  <p>İkinci dönem ara tatili 13-17 Mart 2028 tarihlerinde yapılacak. Ders yılı 23 Haziran 2028 Cuma günü sona erecek.</p>
</body></html>`;
const index = `<html><body><a href="/20272028egitimogretimyilitakvimiaciklandi/haber/50000/tr">2027-2028 Eğitim Öğretim Yılı Takvimi Açıklandı</a>
  <a href="/baska/haber/1/tr">Bakan Tekin okulları ziyaret etti</a></body></html>`;

beforeAll(async () => {
  t = await createTestApp();
  root = client(t.app, (await login(t.app, SUPER.email, SUPER.password)).token);
  const res = await root.post('/api/platform/schools', { name: 'Takvim Ortaokulu', slug: 'takvim', ownerEmail: 'mudur@takvim.local', ownerName: 'Müdür', ownerPassword: 'Takvim2026!' });
  expectStatus(res, 201);
  schoolId = res.json().id;
  owner = client(t.app, (await login(t.app, 'mudur@takvim.local', 'Takvim2026!')).token);
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await t.app.close();
  await t.database.close();
});

type Holiday = { date: string; name: string; source: string };

describe('MEB çalışma takvimi', () => {
  it('ara tatil, yarıyıl ve yaz tatili okulun tatillerinde; arife ara tatile düşerse tam gün kalır', async () => {
    const nov = (await owner.get(path('holidays?month=2026-11'))).json() as Holiday[];
    expect(nov.filter((h) => h.source === 'meb').map((h) => h.date)).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20']);
    expect(nov.find((h) => h.date === '2026-11-16')?.name).toBe('Birinci Dönem Ara Tatili');
    const mar = (await owner.get(path('holidays?month=2027-03'))).json() as Holiday[];
    expect(mar.find((h) => h.date === '2027-03-08')).toMatchObject({ name: 'İkinci Dönem Ara Tatili', source: 'meb' });
    expect(mar.find((h) => h.date === '2027-03-09')).toMatchObject({ name: 'Ramazan Bayramı 1. Gün', source: 'official' });
    const feb = (await owner.get(path('holidays?month=2027-02'))).json() as Holiday[];
    expect(feb.find((h) => h.date === '2027-02-05')?.name).toBe('Yarıyıl Tatili');
    expect(feb.some((h) => h.date === '2027-02-08')).toBe(false);
    // Okulun takvim bilgisi
    const cal = (await owner.get(path('academic-calendar'))).json();
    expect(cal.years[0]).toMatchObject({ startYear: 2026, label: '2026-2027', source: 'builtin' });
  });

  it('okul MEB takvimini kapatabilir', async () => {
    expectStatus(await owner.patch(`/api/schools/${schoolId}`, { settings: { followMebCalendar: false } }), 200);
    const nov = (await owner.get(path('holidays?month=2026-11'))).json() as Holiday[];
    expect(nov.some((h) => h.source === 'meb')).toBe(false);
    expectStatus(await owner.patch(`/api/schools/${schoolId}`, { settings: { followMebCalendar: true } }), 200);
  });

  it('tarama: duyuruyu bulur, okur, uygular; aynıysa doğrular, farklıysa onaya bırakır', async () => {
    const first = await scanMebCalendar(t.app.deps, 2027, { fetchFn: fakeMeb({ [INDEX]: index, [NEWS]: page('13') }) });
    expect(first).toMatchObject({ outcome: 'saved', url: NEWS });
    expect(first.data).toMatchObject({ lessonsStart: '2027-09-13', term1End: '2028-01-21', term2Start: '2028-02-07', lessonsEnd: '2028-06-23' });
    // Platform yöneticisine bildirim
    const inbox = (await root.get('/api/me/inbox')).json() as { items: { kind: string; title: string }[] };
    expect(inbox.items.some((n) => n.kind === 'meb-calendar' && n.title.includes('2027-2028'))).toBe(true);

    expect((await scanMebCalendar(t.app.deps, 2027, { fetchFn: fakeMeb({ [INDEX]: index, [NEWS]: page('13') }) })).outcome).toBe('confirmed');
    const changed = await scanMebCalendar(t.app.deps, 2027, { fetchFn: fakeMeb({ [INDEX]: index, [NEWS]: page('14') }) });
    expect(changed.outcome).toBe('review');
    let list = (await root.get('/api/platform/academic-calendars')).json() as { startYear: number; status: string; data: { lessonsStart: string }; pending: unknown }[];
    expect(list.find((r) => r.startYear === 2027)).toMatchObject({ status: 'review', data: { lessonsStart: '2027-09-13' }, pending: expect.anything() });
    expectStatus(await root.post('/api/platform/academic-calendars/2027/accept'), 200);
    list = (await root.get('/api/platform/academic-calendars')).json();
    expect(list.find((r) => r.startYear === 2027)).toMatchObject({ status: 'confirmed', data: { lessonsStart: '2027-09-14' }, pending: null });
    // Yaz tatili sonraki yılın derslerine kadar uzar
    const sep = (await owner.get(path('holidays?month=2027-09'))).json() as Holiday[];
    expect(sep.find((h) => h.date === '2027-09-10')?.name).toBe('Yaz Tatili');
    expect(sep.some((h) => h.date === '2027-09-14')).toBe(false);

    expect((await scanMebCalendar(t.app.deps, 2028, { fetchFn: fakeMeb({ [INDEX]: index }) })).outcome).toBe('not-found');
  });

  it('elle giriş: doğrulanır, yalnızca platform yöneticisi', async () => {
    const good = { lessonsStart: '2028-09-11', term1End: '2029-01-19', term2Start: '2029-02-05', lessonsEnd: '2029-06-22', breaks: [] };
    expect((await owner.put('/api/platform/academic-calendars/2028', good)).statusCode).toBe(403);
    expect((await root.put('/api/platform/academic-calendars/2028', { ...good, term1End: '2028-09-01' })).statusCode).toBe(400);
    expect((await root.put('/api/platform/academic-calendars/2028', good)).json()).toMatchObject({ source: 'manual', status: 'confirmed' });
  });

  it('günlük iş: haziranda gelecek yılı ve kurulumla gelen yılı tarar, günde bir kez', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', (async (url: string | URL | Request) => {
      calls.push(String(url));
      return new Response('<html></html>', { status: 200 });
    }) as typeof fetch);
    await runMebCalendarJob(t.app.deps, new Date('2027-06-20T09:00:00Z'));
    // 2026 (kurulumla gelen) taranır; 2027 MEB'den onaylı olduğu için taranmaz
    expect(calls.length).toBeGreaterThan(0);
    const n = calls.length;
    await runMebCalendarJob(t.app.deps, new Date('2027-06-20T15:00:00Z'));
    expect(calls.length).toBe(n);
    vi.unstubAllGlobals();
  });
});
