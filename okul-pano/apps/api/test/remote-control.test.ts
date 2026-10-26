import { officialHolidays, zonedParts } from '@okulpano/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sentPushes } from '../src/lib/push.ts';
import { client, createTestApp, expectStatus, login, SUPER, type TestCtx } from './helpers.ts';

let t: TestCtx;
let schoolId: string;
let owner: ReturnType<typeof client>;
let teacherUser: ReturnType<typeof client>;
let plain: ReturnType<typeof client>;
let screen: { id: string; token: string };
const teacherIds: Record<string, string> = {};
let dutyId = '';
const path = (p: string) => `/api/schools/${schoolId}/${p}`;
const today = zonedParts(new Date(), 'Europe/Istanbul');
const weekday = today.weekday;
// Resmî tatilde nöbet boşluğu hesaplanmaz: o gün bu bölüm atlanır
const holidayName = new Map(officialHolidays(today.year)).get(today.isoDate);
const holidayToday = Boolean(holidayName && !holidayName.endsWith('Arifesi'));
const state = () =>
  t.app.inject({ method: 'GET', url: '/api/display/state', headers: { authorization: `Bearer ${screen.token}` } }).then((r) => r.json());
const PUSH_TOKEN = 'ExponentPushToken[ogretmen-telefonu]';
const OWNER_TOKEN = 'ExponentPushToken[mudur-telefonu]';

beforeAll(async () => {
  t = await createTestApp({ PUSH_URL: 'memory' });
  const root = client(t.app, (await login(t.app, SUPER.email, SUPER.password)).token);
  const res = await root.post('/api/platform/schools', {
    name: 'Kumanda Okulu',
    slug: 'kumanda-okulu',
    ownerEmail: 'mudur@kumanda.local',
    ownerName: 'Müdür',
    ownerPassword: 'MudurKM123!',
  });
  expectStatus(res, 201);
  schoolId = res.json().id;
  owner = client(t.app, (await login(t.app, 'mudur@kumanda.local', 'MudurKM123!')).token);

  for (const name of ['Ayşe Demir', 'Mehmet Kaya', 'Selin Ak', 'Ali Can']) {
    const r = await owner.post(path('teachers'), { fullName: name });
    expectStatus(r, 201);
    teacherIds[name] = r.json().id;
  }
  const month = today.isoDate.slice(0, 7);
  const d = await owner.post(path('duties'), { month, weekday, area: 'Bahçe', teacherId: teacherIds['Ayşe Demir'] });
  expectStatus(d, 201);
  dutyId = d.json().id;
  expectStatus(await owner.post(path('duties'), { month, weekday, area: 'Bahçe', teacherId: teacherIds['Mehmet Kaya'] }), 201);

  // Ayşe Demir'in hesabı öğretmen kaydına bağlı; ek yetkisi yok
  const m = await owner.post(path('members'), {
    email: 'ayse@kumanda.local',
    fullName: 'Ayşe Demir',
    password: 'Ayse12345!',
    role: 'editor',
    permissions: [],
    teacherId: teacherIds['Ayşe Demir'],
  });
  expectStatus(m, 201);
  teacherUser = client(t.app, (await login(t.app, 'ayse@kumanda.local', 'Ayse12345!')).token);
  expectStatus(await owner.post(path('members'), { email: 'editor@kumanda.local', fullName: 'Editör', password: 'Editor123!', role: 'editor', permissions: ['announcements.manage'] }), 201);
  plain = client(t.app, (await login(t.app, 'editor@kumanda.local', 'Editor123!')).token);

  const s = (await owner.post(path('screens'), { name: 'Giriş holü' })).json() as { screen: { id: string }; token: string };
  screen = { id: s.screen.id, token: s.token };

  expectStatus(await teacherUser.post('/api/me/push-tokens', { token: PUSH_TOKEN, platform: 'android' }), 204);
  expectStatus(await owner.post('/api/me/push-tokens', { token: OWNER_TOKEN, platform: 'ios' }), 204);
});

afterAll(async () => {
  await t.app.close();
  await t.database.close();
});

const pushesTo = (token: string) => sentPushes.filter((p) => p.to.includes(token)).map((p) => p.message.title);
const flushPushes = () => new Promise((r) => setTimeout(r, 30));

describe('panoya anlık mesaj', () => {
  it('yayınlanır, panoda görünür ve kaldırılabilir', async () => {
    const endsAt = new Date(Date.now() + 30 * 60_000).toISOString();
    const res = await owner.post(path('flash'), { text: '10-B konferans salonuna', style: 'banner', endsAt });
    expectStatus(res, 201);
    const flash = (await state()).flash as { id: string; text: string; style: string }[];
    expect(flash.map((f) => f.text)).toEqual(['10-B konferans salonuna']);

    const list = (await owner.get(path('flash'))).json();
    expect(list.active).toHaveLength(1);
    expect(list.presets).toContain('10-B konferans salonuna');

    expectStatus(await owner.del(path(`flash/${res.json().id}`)), 204);
    expect((await state()).flash).toEqual([]);
    // Geçmişteki metin hazır mesaj olarak kalır
    expect((await owner.get(path('flash'))).json().presets).toContain('10-B konferans salonuna');
  });

  it('geçmiş bir bitiş zamanı ve yetkisiz kullanıcı reddedilir', async () => {
    expectStatus(await owner.post(path('flash'), { text: 'Eski', endsAt: new Date(Date.now() - 1000).toISOString() }), 400);
    expectStatus(await plain.post(path('flash'), { text: 'Yetkisiz', endsAt: new Date(Date.now() + 60_000).toISOString() }), 403);
  });
});

describe('günün modu ve zil kaydırma', () => {
  it('kısaltılmış gün ve zil kaydırma panoya gider, normale dönülebilir', async () => {
    const put = await owner.put(path('day-plan'), { mode: 'short', lessonMin: 30, note: 'Veli toplantısı' });
    expectStatus(put, 200);
    expect(put.json()).toMatchObject({ date: today.isoDate, mode: 'short', lessonMin: 30 });

    const shift = await owner.post(path('day-plan/shift'), { minutes: 10 });
    expectStatus(shift, 200);
    expect(shift.json().shifts).toHaveLength(1);
    expect(shift.json().mode).toBe('short');

    const plans = (await state()).dayPlans as { date: string; mode: string; shifts: unknown[] }[];
    expect(plans.find((p) => p.date === today.isoDate)).toMatchObject({ mode: 'short' });

    expectStatus(await owner.del(path('day-plan')), 200);
    expect((await owner.get(path('day-plan'))).json()).toMatchObject({ mode: 'normal', shifts: [] });
  });

  it('okul tatil yapılınca pano o günü tatil sayar', async () => {
    const tomorrow = new Date(Date.parse(`${today.isoDate}T12:00:00Z`) + 86400_000).toISOString().slice(0, 10);
    expectStatus(await owner.put(path('day-plan'), { date: tomorrow, mode: 'holiday', note: 'Kar tatili' }), 200);
    expect((await state()).holidays).toContainEqual({ date: tomorrow, name: 'Kar tatili' });
    expectStatus(await owner.del(path(`day-plan?date=${tomorrow}`)), 200);
  });

  it('zil kaydırma 0 dakika olamaz, yetki gerekir', async () => {
    expectStatus(await owner.post(path('day-plan/shift'), { minutes: 0 }), 400);
    expectStatus(await plain.post(path('day-plan/shift'), { minutes: 5 }), 403);
  });
});

describe.skipIf(holidayToday)('izin bildirimi ve boş nöbet', () => {
  let leaveId = '';

  it('öğretmen izin bildirir: onay bekler, panoda görünmez, yöneticiye bildirim gider', async () => {
    const res = await teacherUser.post(path('me/leaves'), { startDate: today.isoDate, endDate: today.isoDate, note: 'Hastane' });
    expectStatus(res, 201);
    leaveId = res.json().id;
    expect(res.json().approvalStatus).toBe('pending');
    expect((await state()).leaves).toEqual([]);
    await flushPushes();
    expect(pushesTo(OWNER_TOKEN)).toContain('İzin bildirimi');
    const notes = (await owner.get(path('notifications'))).json() as { kind: string }[];
    expect(notes.map((n) => n.kind)).toContain('leave-request');
  });

  it('hesabı öğretmene bağlı olmayan izin bildiremez', async () => {
    expectStatus(await plain.post(path('me/leaves'), { startDate: today.isoDate, endDate: today.isoDate }), 400);
  });

  it('onaylanınca panoda izinli görünür, nöbet yeri boş kalır ve öneri gelir', async () => {
    expectStatus(await owner.post(path(`leaves/${leaveId}/approve`), {}), 200);
    expect(((await state()).leaves as { teacherName: string }[]).map((l) => l.teacherName)).toEqual(['Ayşe Demir']);
    await flushPushes();
    expect(pushesTo(PUSH_TOKEN)).toContain('İzniniz onaylandı');

    const day = (await owner.get(path('duty-day'))).json();
    expect(day.gaps).toEqual([dutyId]);
    const names = (day.candidates as { fullName: string }[]).map((c) => c.fullName);
    // Nöbeti olan ve izinli olan önerilmez
    expect(names).toEqual(['Ali Can', 'Selin Ak']);

    const center = (await owner.get(path('control-center'))).json();
    expect(center.dutyGaps).toEqual([{ dutyId, area: 'Bahçe', teacherName: 'Ayşe Demir' }]);
  });

  it('yerine görevlendirilen öğretmen panoda görünür ve boşluk kapanır', async () => {
    const res = await owner.post(path('duty-substitutions'), { date: today.isoDate, dutyId, teacherId: teacherIds['Selin Ak'] });
    expectStatus(res, 201);
    expect((await state()).dutySubstitutions).toEqual([{ date: today.isoDate, dutyId, teacherName: 'Selin Ak' }]);
    const day = (await owner.get(path('duty-day'))).json();
    expect(day.gaps).toEqual([]);
    expect(day.entries.find((e: { dutyId: string }) => e.dutyId === dutyId).substitute.teacherName).toBe('Selin Ak');
    expect((await owner.get(path('control-center'))).json().dutyGaps).toEqual([]);
  });

  it('öğretmenin günü: nöbetini başkası tutuyor, ortağı görünür', async () => {
    const me = (await teacherUser.get(path('me/today'))).json();
    expect(me.teacher.fullName).toBe('Ayşe Demir');
    const todayEntry = me.week.find((d: { date: string }) => d.date === today.isoDate);
    expect(todayEntry.duties).toEqual([{ dutyId, area: 'Bahçe', partners: ['Mehmet Kaya'], substituteFor: null, coveredBy: 'Selin Ak' }]);
    expect(me.leaves[0]).toMatchObject({ status: 'approved' });
  });
});

describe('uzaktan kumanda', () => {
  it('komutlar ve ekran modu', async () => {
    const res = await owner.post(path(`screens/${screen.id}/command`), { command: 'next' });
    expectStatus(res, 200);
    expect(res.json()).toEqual({ ok: true, delivered: false });
    expectStatus(await owner.post(path(`screens/${screen.id}/command`), { command: 'format' }), 400);
    expectStatus(await plain.post(path(`screens/${screen.id}/command`), { command: 'next' }), 403);

    const mode = await owner.post(path(`screens/${screen.id}/mode`), { mode: 'clock' });
    expectStatus(mode, 200);
    expect((await state()).display.mode).toBe('clock');
    expectStatus(await owner.post(path(`screens/${screen.id}/mode`), { mode: 'board' }), 200);
  });

  it('panonun bildirdiği durum bağlıyken görünür', async () => {
    const off = t.app.deps.bus.screenConnected(screen.id);
    const status = { slideIndex: 2, slideCount: 8, slideTitle: 'Veli toplantısı', paused: true, sleeping: false, mode: 'board' };
    const r = await t.app.inject({
      method: 'POST',
      url: '/api/display/status',
      headers: { authorization: `Bearer ${screen.token}` },
      payload: status,
    });
    expectStatus(r, 204);
    const list = (await owner.get(path('screens'))).json() as { id: string; online: boolean; live: unknown }[];
    expect(list.find((s) => s.id === screen.id)).toMatchObject({ online: true, live: status });
    expect((await owner.get(path('control-center'))).json().screens).toMatchObject({ total: 1, online: 1 });
    off();
    expect(((await owner.get(path('screens'))).json() as { live: unknown }[])[0]!.live).toBeNull();
  });
});

describe('telefon bildirimleri', () => {
  it('onay bekleyen duyuru ve acil durum bildirimi gider', async () => {
    expectStatus(await owner.patch(`/api/schools/${schoolId}`, { settings: { requireApproval: true } }), 200);
    expectStatus(await plain.post(path('announcements'), { kind: 'text', title: 'Kermes' }), 201);
    expectStatus(await owner.post(path('emergency'), { type: 'earthquake', sound: false }), 200);
    await flushPushes();
    expect(pushesTo(OWNER_TOKEN)).toContain('Onay bekleyen duyuru');
    expect(pushesTo(PUSH_TOKEN).some((title) => title.startsWith('ACİL DURUM'))).toBe(true);
    // Uyarıyı başlatan kendine bildirim almaz
    expect(pushesTo(OWNER_TOKEN).some((title) => title.startsWith('ACİL DURUM'))).toBe(false);
    expectStatus(await owner.del(path('emergency')), 200);
  });

  it('geçersiz anahtar reddedilir, çıkışta silinir', async () => {
    expectStatus(await teacherUser.post('/api/me/push-tokens', { token: 'herhangi-bir-sey' }), 400);
    expectStatus(await teacherUser.del('/api/me/push-tokens', { token: PUSH_TOKEN }), 204);
  });
});

describe('kullanıcı ve öğretmen eşleşmesi', () => {
  it('okul sahibi kendini de öğretmen kaydına bağlayabilir; /api/me eşleşmeyi döner', async () => {
    const members = (await owner.get(path('members'))).json() as { id: string; email: string; teacherName: string | null }[];
    expect(members.find((m) => m.email === 'ayse@kumanda.local')!.teacherName).toBe('Ayşe Demir');
    const me = members.find((m) => m.email === 'mudur@kumanda.local')!;
    expectStatus(await owner.put(path(`members/${me.id}/teacher`), { teacherId: teacherIds['Ali Can'] }), 200);
    const profile = (await owner.get('/api/me')).json();
    expect(profile.schools[0].teacherId).toBe(teacherIds['Ali Can']);
  });
});
