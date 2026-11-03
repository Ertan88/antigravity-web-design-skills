import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { sentPushes } from '../src/lib/push.ts';
import { client, createTestApp, expectStatus, login, SUPER, type TestCtx } from './helpers.ts';

/* İşletmelerde mesleki eğitim: işletmeler, aylık devam çizelgesi, koordinatör müdür yardımcısına bildirim */

let t: TestCtx;
let owner: ReturnType<typeof client>;
let base: string;
let coord: ReturnType<typeof client>;
let other: ReturnType<typeof client>;
let vp: ReturnType<typeof client>;
let vpId: string;
let coordTeacherId: string;
let classId: string;
const ids: Record<string, string> = {};
const biz: Record<string, string> = {};
const VP_TOKEN = 'ExponentPushToken[mudur-yardimcisi]';

beforeAll(async () => {
  t = await createTestApp({ PUSH_URL: 'memory' });
  const root = client(t.app, (await login(t.app, SUPER.email, SUPER.password)).token);
  const res = await root.post('/api/platform/schools', { name: 'Meslek Lisesi', slug: 'meslek-lisesi', ownerEmail: 'mudur@meslek.test', ownerName: 'Müdür', ownerPassword: 'MudurSifre42' });
  expectStatus(res, 201);
  base = `/api/schools/${res.json().id}`;
  owner = client(t.app, (await login(t.app, 'mudur@meslek.test', 'MudurSifre42')).token);

  const mk = async (email: string, name: string, extra: Record<string, unknown>) => {
    expectStatus(await owner.post(`${base}/members`, { email, fullName: name, password: 'GizliSifre42', role: 'editor', permissions: [], ...extra }), 201);
    return client(t.app, (await login(t.app, email, 'GizliSifre42')).token);
  };
  coordTeacherId = (await owner.post(`${base}/teachers`, { fullName: 'Koordinatör Öğretmen' })).json().id;
  const otherTeacher = (await owner.post(`${base}/teachers`, { fullName: 'Başka Öğretmen' })).json().id;
  coord = await mk('koord@meslek.test', 'Koordinatör Öğretmen', { teacherId: coordTeacherId });
  other = await mk('baska@meslek.test', 'Başka Öğretmen', { teacherId: otherTeacher });
  expectStatus(await owner.post(`${base}/members`, { email: 'mdy@meslek.test', fullName: 'Müdür Yardımcısı', password: 'GizliSifre42', role: 'admin', permissions: [] }), 201);
  vp = client(t.app, (await login(t.app, 'mdy@meslek.test', 'GizliSifre42')).token);
  vpId = (await vp.get('/api/me')).json().user?.id ?? (await vp.get('/api/me')).json().id;
  expectStatus(await vp.post('/api/me/push-tokens', { token: VP_TOKEN, platform: 'android' }), 204);

  expectStatus(
    await owner.post(`${base}/students/import`, {
      rows: [
        { schoolNo: '112', fullName: 'Arda Kaya', className: '12-A', birthDate: '2008-03-14' },
        { schoolNo: '118', fullName: 'Elif Demir', className: '12-A', birthDate: '2008-11-02' },
        { schoolNo: '121', fullName: 'Burak Şahin', className: '12-A', birthDate: '2008-05-20' },
      ],
    }),
    200,
  );
  const list = (await owner.get(`${base}/students`)).json() as { id: string; fullName: string; classGroupId: string }[];
  for (const s of list) ids[s.fullName] = s.id;
  classId = list[0]!.classGroupId;
  // 12-A pazartesi ve salı okulda; e-Okul programında işletme günleri "İşletmelerde Mesleki Eğitim" dersiyle dolu
  for (const weekday of [1, 2, 3])
    for (let periodNo = 1; periodNo <= 6; periodNo++) {
      const subject = weekday === 3 ? 'İşletmelerde Mesleki Eğitim' : 'Mesleki Gelişim';
      expectStatus(await owner.put(`${base}/timetable/cell`, { weekday, periodNo, classGroupId: classId, teacherId: null, subject }), 200);
    }
});

afterAll(async () => {
  await t.app.close();
  await t.database.close();
});

describe('işletmelerde mesleki eğitim', () => {
  it('modül kapalıyken erişilemez; açılınca menüde görünür', async () => {
    expect((await owner.get(`${base}/internship/sheet`)).statusCode).toBe(403);
    expect((await owner.get(`${base}/internship/access`)).json().enabled).toBe(false);
    expectStatus(await owner.patch(base, { settings: { internshipEnabled: true, internshipManagerUserId: vpId } }), 200);
    expect((await owner.get(`${base}/internship/access`)).json()).toMatchObject({ enabled: true, all: true, manage: true });
  });

  it('işletmeler ve öğrenci ataması (idare); koordinatör yalnızca kendi işletmesini görür', async () => {
    const a = await owner.post(`${base}/internship/businesses`, { name: 'Usta Mobilya', coordinatorTeacherId: coordTeacherId });
    expectStatus(a, 200);
    biz.usta = a.json().id;
    biz.kent = (await owner.post(`${base}/internship/businesses`, { name: 'Kent Dekorasyon' })).json().id;
    expectStatus(await owner.put(`${base}/internship/businesses/${biz.usta}/students`, { studentIds: [ids['Arda Kaya'], ids['Elif Demir']] }), 200);
    expectStatus(await owner.put(`${base}/internship/businesses/${biz.kent}/students`, { studentIds: [ids['Burak Şahin']] }), 200);
    expect((await coord.post(`${base}/internship/businesses`, { name: 'X' })).statusCode).toBe(403);

    expect((await coord.get(`${base}/internship/access`)).json()).toMatchObject({ coordinator: true, all: false });
    const mine = (await coord.get(`${base}/internship/businesses`)).json();
    expect(mine.map((b: { name: string; students: number }) => [b.name, b.students])).toEqual([['Usta Mobilya', 2]]);
    expect((await other.get(`${base}/internship/sheet`)).statusCode).toBe(403);
  });

  it('çizelge: okul günleri O, hafta sonu, arife ve bayram T, işletme günleri X', async () => {
    const sheet = (await owner.get(`${base}/internship/sheet?month=2026-10`)).json();
    expect(sheet.days).toHaveLength(31);
    expect(sheet.students.map((s: { fullName: string }) => s.fullName)).toEqual(['Arda Kaya', 'Elif Demir', 'Burak Şahin']);
    const arda = sheet.students[0];
    expect(arda.cells[0]).toEqual(['X', 'X']); // 1 Ekim Perşembe
    expect(arda.cells[2]).toEqual(['W', 'W']);
    expect(arda.cells[4]).toEqual(['O', 'O']); // 5 Ekim Pazartesi
    expect(arda.cells[6]).toEqual(['X', 'X']); // 7 Ekim Çarşamba: programda yalnızca işletme dersi
    expect(arda.cells[27]).toEqual(['X', 'TA']); // 28 Ekim arife
    expect(arda.cells[28]).toEqual(['TA', 'TA']); // 29 Ekim
    // Koordinatör yalnızca kendi işletmesindeki öğrencileri görür
    const mine = (await coord.get(`${base}/internship/sheet?month=2026-10`)).json();
    expect(mine.students.map((s: { fullName: string }) => s.fullName)).toEqual(['Arda Kaya', 'Elif Demir']);
  });

  it('D ve R kaydedilir, toplamlara özürsüz / özürlü geçer ve müdür yardımcısına bildirilir', async () => {
    const r = await coord.post(`${base}/internship/marks`, {
      date: '2026-10-08',
      items: [
        { studentId: ids['Arda Kaya'], half: 'am', code: 'D' },
        { studentId: ids['Arda Kaya'], half: 'pm', code: 'D' },
        { studentId: ids['Elif Demir'], half: 'pm', code: 'R' },
      ],
    });
    expectStatus(r, 200);
    expect(r.json()).toMatchObject({ changed: 3, notified: 2 });
    await vi.waitFor(() => expect(sentPushes.filter((p) => p.to.includes(VP_TOKEN))).toHaveLength(1));
    const push = sentPushes.find((p) => p.to.includes(VP_TOKEN))!.message;
    expect(push.title).toBe('İşletmede devamsızlık ve rapor');
    expect(push.body).toContain('Arda Kaya (12-A): tam gün devamsız (özürsüz)');
    expect(push.body).toContain('Elif Demir (12-A): öğleden sonra raporlu (özürlü)');
    const inbox = (await vp.get(`${base}/inbox`)).json();
    expect(JSON.stringify(inbox)).toContain('İşletmede devamsızlık ve rapor');

    const sheet = (await owner.get(`${base}/internship/sheet?month=2026-10`)).json();
    expect(sheet.students[0].cells[7]).toEqual(['D', 'D']);
    expect(sheet.students[0].totals).toMatchObject({ unexcused: 1, excused: 0 });
    expect(sheet.students[1].totals).toMatchObject({ unexcused: 0, excused: 0.5 });

    // Aynı işaret yeniden kaydedilince bildirim tekrarlanmaz
    expect((await coord.post(`${base}/internship/marks`, { date: '2026-10-08', items: [{ studentId: ids['Arda Kaya'], half: 'am', code: 'D' }] })).json().changed).toBe(0);
  });

  it('koordinatör başka işletmenin öğrencisini işaretleyemez; okul günü ve tatil işaretlenemez', async () => {
    expect((await coord.post(`${base}/internship/marks`, { date: '2026-10-08', items: [{ studentId: ids['Burak Şahin'], half: 'am', code: 'D' }] })).statusCode).toBe(403);
    expect((await coord.post(`${base}/internship/marks`, { date: '2026-10-05', items: [{ studentId: ids['Arda Kaya'], half: 'am', code: 'D' }] })).statusCode).toBe(400);
    expect((await coord.post(`${base}/internship/marks`, { date: '2026-10-28', items: [{ studentId: ids['Arda Kaya'], half: 'pm', code: 'D' }] })).statusCode).toBe(400);
  });

  it('K işletmedeki bütün öğrencilere, T bütün öğrencilere uygulanır ve aynı kapsamdan kalkar', async () => {
    expectStatus(await coord.post(`${base}/internship/marks`, { date: '2026-10-16', items: [{ studentId: ids['Arda Kaya'], half: 'am', code: 'K' }] }), 200);
    let s = (await owner.get(`${base}/internship/sheet?month=2026-10`)).json().students;
    expect(s.map((x: { cells: string[][] }) => x.cells[15]![0])).toEqual(['K', 'K', 'X']);

    expectStatus(await coord.post(`${base}/internship/marks`, { date: '2026-10-22', items: [{ studentId: ids['Elif Demir'], half: 'pm', code: 'T' }] }), 200);
    s = (await owner.get(`${base}/internship/sheet?month=2026-10`)).json().students;
    expect(s.map((x: { cells: string[][] }) => x.cells[21]![1])).toEqual(['T', 'T', 'T']);

    expectStatus(await owner.post(`${base}/internship/marks`, { date: '2026-10-22', items: [{ studentId: ids['Burak Şahin'], half: 'pm', code: 'X' }] }), 200);
    expectStatus(await coord.post(`${base}/internship/marks`, { date: '2026-10-16', items: [{ studentId: ids['Elif Demir'], half: 'am', code: 'X' }] }), 200);
    s = (await owner.get(`${base}/internship/sheet?month=2026-10`)).json().students;
    expect(s.map((x: { cells: string[][] }) => x.cells[21]![1])).toEqual(['X', 'X', 'X']);
    expect(s.map((x: { cells: string[][] }) => x.cells[15]![0])).toEqual(['X', 'X', 'X']);
  });

  it('ziyaret günü (mobil): kendi işletmeleri önce, iki bölüm ayrı', async () => {
    const day = (await vp.get(`${base}/internship/day?date=2026-10-08`)).json();
    expect(day.businesses.map((b: { name: string }) => b.name)).toEqual(['Kent Dekorasyon', 'Usta Mobilya']);
    const mine = (await coord.get(`${base}/internship/day?date=2026-10-08`)).json();
    expect(mine.businesses).toHaveLength(1);
    expect(mine.businesses[0].students[0]).toMatchObject({ fullName: 'Arda Kaya', am: 'D', pm: 'D', editable: true });
  });
});
