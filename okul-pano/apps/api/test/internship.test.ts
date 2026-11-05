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
/** Koordinatörün gönderilmemiş devamsızlıklarını müdür yardımcısına gönder; gönderilen sayı */
const sendAll = async (c = coord, note?: string) => {
  const pending = (await c.get(`${base}/internship/pending`)).json() as { id: string }[];
  if (pending.length) expectStatus(await c.post(`${base}/internship/send`, { ids: pending.map((x) => x.id), note }), 200);
  return pending.length;
};

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

    expect((await coord.get(`${base}/internship/access`)).json()).toMatchObject({ coordinator: true, all: false });
    const mine = (await coord.get(`${base}/internship/businesses`)).json();
    expect(mine.map((b: { name: string; students: number }) => [b.name, b.students])).toEqual([['Usta Mobilya', 2]]);
    expect((await other.get(`${base}/internship/sheet`)).statusCode).toBe(403);
  });

  it('çizelge: okul günleri O, hafta sonu, arife ve bayram T, işaretsiz işletme günleri ? (kontrol edilmedi)', async () => {
    const sheet = (await owner.get(`${base}/internship/sheet?month=2026-10`)).json();
    expect(sheet.days).toHaveLength(31);
    expect(sheet.students.map((s: { fullName: string }) => s.fullName)).toEqual(['Arda Kaya', 'Elif Demir', 'Burak Şahin']);
    const arda = sheet.students[0];
    expect(arda.cells[0]).toEqual(['?', '?']); // 1 Ekim Perşembe: kendiliğinden işletmede sayılmaz
    expect(arda.cells[2]).toEqual(['W', 'W']);
    expect(arda.cells[4]).toEqual(['O', 'O']); // 5 Ekim Pazartesi
    expect(arda.cells[6]).toEqual(['?', '?']); // 7 Ekim Çarşamba: programda yalnızca işletme dersi
    expect(arda.cells[27]).toEqual(['?', 'TA']); // 28 Ekim arife
    expect(arda.totals).toMatchObject({ business: 0 });
    expect(arda.totals.unchecked).toBeGreaterThan(0);
    expect(arda.cells[28]).toEqual(['TA', 'TA']); // 29 Ekim
    // Koordinatör yalnızca kendi işletmesindeki öğrencileri görür
    // 30 günlük ay
    expect((await owner.get(`${base}/internship/sheet?month=2026-11`)).json().days).toHaveLength(30);
    expectStatus(await coord.get(`${base}/internship/day?date=2026-11-30`), 200);
    const mine = (await coord.get(`${base}/internship/sheet?month=2026-10`)).json();
    expect(mine.students.map((s: { fullName: string }) => s.fullName)).toEqual(['Arda Kaya', 'Elif Demir']);
  });

  it('D ve R kaydedilir, toplamlara özürsüz / özürlü geçer; koordinatör "Gönder" deyince müdür yardımcısına bildirilir', async () => {
    const r = await coord.post(`${base}/internship/marks`, {
      date: '2026-10-08',
      items: [
        { studentId: ids['Arda Kaya'], half: 'am', code: 'D' },
        { studentId: ids['Arda Kaya'], half: 'pm', code: 'D' },
        { studentId: ids['Elif Demir'], half: 'pm', code: 'R' },
        // Yanlışlıkla girilip silinen işaret gönderilmez
        { studentId: ids['Elif Demir'], half: 'am', code: 'H' },
      ],
    });
    expectStatus(r, 200);
    expect(r.json()).toMatchObject({ changed: 4, pending: 4 });
    expectStatus(await coord.post(`${base}/internship/marks`, { date: '2026-10-08', items: [{ studentId: ids['Elif Demir'], half: 'am', code: '-' }] }), 200);
    // Gönder denmeden müdür yardımcısına hiçbir şey gitmez; çizelgede gönderilmemiş olarak görünür
    await new Promise((res) => setTimeout(res, 50));
    expect(sentPushes.filter((p) => p.to.includes(VP_TOKEN))).toHaveLength(0);
    const before = (await coord.get(`${base}/internship/sheet?month=2026-10`)).json();
    expect(before.students[0].unsent).toEqual(['2026-10-08|am', '2026-10-08|pm']);
    const pending = (await coord.get(`${base}/internship/pending`)).json();
    expect(pending).toHaveLength(3);
    // Başka koordinatör bu öğrencileri gönderemez
    expect((await other.post(`${base}/internship/send`, { ids: pending.map((x: { id: string }) => x.id) })).statusCode).toBe(403);
    expect(await sendAll(coord, 'Veli ile görüşüldü')).toBe(3);
    expect(await sendAll()).toBe(0);
    expect((await coord.get(`${base}/internship/sheet?month=2026-10`)).json().students[0].unsent).toEqual([]);
    await vi.waitFor(() => expect(sentPushes.filter((p) => p.to.includes(VP_TOKEN))).toHaveLength(1));
    const push = sentPushes.find((p) => p.to.includes(VP_TOKEN))!.message;
    expect(push.title).toBe('İşletmede devamsızlık ve rapor/izin');
    // Kilit ekranında ad ve rapor bilgisi yazmaz; ayrıntı uygulamanın bildirim kutusunda
    expect(push.body).toBe('2 öğrenci için devamsızlık ve rapor/izin bildirildi. Ayrıntı uygulamada.');
    const inbox = JSON.stringify((await vp.get(`${base}/inbox`)).json());
    expect(inbox).not.toContain('hasta sevkli');
    expect(inbox).toContain('Arda Kaya (12-A): 8 Ekim tam gün devamsız (özürsüz)');
    expect(inbox).toContain('Elif Demir (12-A): 8 Ekim öğleden sonra raporlu (özürlü)');
    expect(inbox).toContain('Not: Veli ile görüşüldü');

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
    expect(s.map((x: { cells: string[][] }) => x.cells[15]![0])).toEqual(['K', 'K', '?']);

    expectStatus(await coord.post(`${base}/internship/marks`, { date: '2026-10-22', items: [{ studentId: ids['Elif Demir'], half: 'pm', code: 'T' }] }), 200);
    s = (await owner.get(`${base}/internship/sheet?month=2026-10`)).json().students;
    expect(s.map((x: { cells: string[][] }) => x.cells[21]![1])).toEqual(['T', 'T', 'T']);

    expectStatus(await owner.post(`${base}/internship/marks`, { date: '2026-10-22', items: [{ studentId: ids['Burak Şahin'], half: 'pm', code: '-' }] }), 200);
    expectStatus(await coord.post(`${base}/internship/marks`, { date: '2026-10-16', items: [{ studentId: ids['Elif Demir'], half: 'am', code: '-' }] }), 200);
    s = (await owner.get(`${base}/internship/sheet?month=2026-10`)).json().students;
    expect(s.map((x: { cells: string[][] }) => x.cells[21]![1])).toEqual(['?', '?', '?']);
    expect(s.map((x: { cells: string[][] }) => x.cells[15]![0])).toEqual(['?', '?', '?']);
  });

  it('İşletmede (X) elle konur ve silinir; toplu doldurma yalnızca işaretsiz günleri X yapar', async () => {
    expectStatus(await coord.post(`${base}/internship/marks`, { date: '2026-10-09', items: [{ studentId: ids['Arda Kaya'], half: 'am', code: 'X' }] }), 200);
    let arda = (await coord.get(`${base}/internship/sheet?month=2026-10`)).json().students[0];
    expect(arda.cells[8]).toEqual(['X', '?']);
    expectStatus(await coord.post(`${base}/internship/marks`, { date: '2026-10-09', items: [{ studentId: ids['Arda Kaya'], half: 'am', code: '-' }] }), 200);
    arda = (await coord.get(`${base}/internship/sheet?month=2026-10`)).json().students[0];
    expect(arda.cells[8]).toEqual(['?', '?']);
    // 7–9 Ekim, yalnız koordinatörün işletmesi: D (8 Ekim) olduğu gibi kalır
    const r = await coord.post(`${base}/internship/marks/fill`, { from: '2026-10-07', until: '2026-10-09', businessId: biz.usta });
    expectStatus(r, 200);
    const s = (await coord.get(`${base}/internship/sheet?month=2026-10`)).json().students;
    expect(s[0].cells.slice(6, 9)).toEqual([['X', 'X'], ['D', 'D'], ['X', 'X']]);
    expect(s[1].cells[7]).toEqual(['X', 'R']); // silinen sabah işaretsizdi, R olduğu gibi kaldı
    expect(s[0].totals.business).toBe(2);
    // Başka işletmenin öğrencisine dokunulmaz
    const burak = (await owner.get(`${base}/internship/sheet?month=2026-10`)).json().students[2];
    expect(burak.cells[6]).toEqual(['?', '?']);
    // İleri tarihe X konmaz
    expect((await coord.post(`${base}/internship/marks`, { date: '2030-01-07', items: [{ studentId: ids['Arda Kaya'], half: 'am', code: 'X' }] })).statusCode).toBe(400);
  });

  it('ziyaret günü (mobil): kendi işletmeleri önce, iki bölüm ayrı', async () => {
    const day = (await vp.get(`${base}/internship/day?date=2026-10-08`)).json();
    expect(day.businesses.map((b: { name: string }) => b.name)).toEqual(['Kent Dekorasyon', 'Usta Mobilya']);
    const mine = (await coord.get(`${base}/internship/day?date=2026-10-08`)).json();
    expect(mine.businesses).toHaveLength(1);
    expect(mine.businesses[0].students[0]).toMatchObject({ fullName: 'Arda Kaya', am: 'D', pm: 'D', editable: true });
  });

  it('ileri tarihli rapor aralığı: okul günleri ve tatiller atlanır; ileri tarihe D girilemez', async () => {
    const r = await coord.post(`${base}/internship/marks`, {
      date: '2027-05-05',
      until: '2027-05-11',
      items: [
        { studentId: ids['Elif Demir'], half: 'am', code: 'R' },
        { studentId: ids['Elif Demir'], half: 'pm', code: 'R' },
      ],
    });
    expectStatus(r, 200);
    // 5–7 Mayıs (Çar–Cum) işletme günü; hafta sonu ve 10–11 Mayıs (Pzt–Sal, okulda) atlanır
    expect(r.json().changed).toBe(6);
    const sheet = (await owner.get(`${base}/internship/sheet?month=2027-05`)).json();
    const elif = sheet.students.find((x: { fullName: string }) => x.fullName === 'Elif Demir');
    expect(elif.cells.slice(4, 11)).toEqual([['R', 'R'], ['R', 'R'], ['R', 'R'], ['W', 'W'], ['W', 'W'], ['O', 'O'], ['O', 'O']]);
    expect(elif.totals.excused).toBe(3);
    expect(await sendAll()).toBe(6);
    const inbox = JSON.stringify((await vp.get(`${base}/inbox`)).json());
    expect(inbox).toContain('Elif Demir (12-A): 5 Mayıs – 7 Mayıs, 3 gün raporlu (özürlü)');
    expect((await coord.post(`${base}/internship/marks`, { date: '2027-05-12', items: [{ studentId: ids['Elif Demir'], half: 'am', code: 'D' }] })).statusCode).toBe(400);
  });

  it('işletme bilgileri: koordinatör kendi işletmesini düzenler, ziyaret ekranında görünür', async () => {
    const info = { contactName: 'Hasan Usta', trainerName: 'Mehmet Kalfa', email: 'usta@mobilya.test', field: 'Mobilya', notes: 'Sabah 08.00 giriş' };
    expectStatus(await coord.patch(`${base}/internship/businesses/${biz.usta}/info`, info), 200);
    expect((await coord.patch(`${base}/internship/businesses/${biz.kent}/info`, { notes: 'x' })).statusCode).toBe(403);
    expect((await coord.patch(`${base}/internship/businesses/${biz.usta}/info`, { email: 'yanlis' })).statusCode).toBe(400);
    const day = (await coord.get(`${base}/internship/day?date=2026-10-08`)).json();
    expect(day.businesses[0]).toMatchObject({ name: 'Usta Mobilya', editable: true, info });
  });

  it('İ ve H özürlü sayılır', async () => {
    expectStatus(
      await coord.post(`${base}/internship/marks`, {
        date: '2026-10-15',
        items: [
          { studentId: ids['Arda Kaya'], half: 'am', code: 'İ' },
          { studentId: ids['Arda Kaya'], half: 'pm', code: 'H' },
        ],
      }),
      200,
    );
    const arda = (await owner.get(`${base}/internship/sheet?month=2026-10`)).json().students[0];
    expect(arda.cells[14]).toEqual(['İ', 'H']);
    expect(arda.totals).toMatchObject({ permitted: 0.5, referred: 0.5 });
    await sendAll();
  });

  it('alanlar branştan: MEB alan adları tanınır, okul açıp kapatabilir; koordinatör adayları branşa göre', async () => {
    const tchs = (await owner.get(`${base}/teachers`)).json() as { id: string; fullName: string }[];
    const mob = tchs.find((x) => x.fullName === 'Başka Öğretmen')!.id;
    // Henüz meslek branşlı öğretmen yok: bütün öğretmenler
    expect((await owner.get(`${base}/internship/coordinator-candidates`)).json().fallback).toBe(true);
    expectStatus(await owner.put(`${base}/internship/teachers/${mob}/branch`, { newBranch: 'Mobilya ve İç Mekân Tasarımı' }), 200);
    const math = (await owner.post(`${base}/teachers`, { fullName: 'Matematik Hoca' })).json().id;
    expectStatus(await owner.put(`${base}/internship/teachers/${math}/branch`, { newBranch: 'Matematik' }), 200);
    const areas = (await owner.get(`${base}/internship/areas`)).json();
    const areaNames = areas.areas.map((a: { name: string }) => a.name);
    expect(areaNames).toContain('Mobilya ve İç Mekân Tasarımı');
    expect(areaNames).not.toContain('Matematik');
    expect(areas.unbranched.map((u: { fullName: string }) => u.fullName)).toContain('Koordinatör Öğretmen');
    const cands = (await owner.get(`${base}/internship/coordinator-candidates`)).json();
    expect(cands.fallback).toBe(false);
    // Meslek branşlı öğretmen ve şu anki koordinatör; matematik öğretmeni yok
    expect(cands.teachers.map((x: { fullName: string }) => x.fullName).sort()).toEqual(['Başka Öğretmen', 'Koordinatör Öğretmen']);
    // Okul matematik branşını meslek alanı yapabilir (ör. yanlış tanınan ad)
    const mathBranch = areas.branches.find((b: { name: string }) => b.name === 'Matematik').id;
    expectStatus(await owner.patch(`${base}/internship/areas/${mathBranch}`, { vocational: true }), 200);
    expect((await owner.get(`${base}/internship/areas`)).json().areas).toHaveLength(areaNames.length + 1);
    expectStatus(await owner.patch(`${base}/internship/areas/${mathBranch}`, { vocational: null }), 200);
    expect((await coord.patch(`${base}/internship/areas/${mathBranch}`, { vocational: true })).statusCode).toBe(403);
  });

  it('öğretmen işletme ekler (alanı branşından, koordinatörü kendisi); yalnızca kendi işletmelerini görür', async () => {
    const created = await other.post(`${base}/internship/businesses`, { name: 'Ahşap Atölyesi', coordinatorTeacherId: coordTeacherId });
    expectStatus(created, 200);
    const b = created.json();
    const areas = (await owner.get(`${base}/internship/areas`)).json();
    expect(b.areaId).toBe(areas.areas.find((a: { name: string }) => a.name === 'Mobilya ve İç Mekân Tasarımı').id);
    expect(b.coordinatorTeacherId).not.toBe(coordTeacherId);
    // Başka öğretmen yalnızca kendi eklediğini görür; koordinatör öğretmen bunu görmez
    expect((await other.get(`${base}/internship/businesses`)).json().map((x: { name: string }) => x.name)).toEqual(['Ahşap Atölyesi']);
    expect((await coord.get(`${base}/internship/businesses`)).json().map((x: { name: string }) => x.name)).toEqual(['Usta Mobilya']);
    // Öğrenci listesi yalnızca işletme sınıflarından; başka işletmedeki öğrencinin işletme adı gizli
    const st = (await other.get(`${base}/internship/students`)).json();
    expect(st.classes.map((c: { name: string }) => c.name)).toEqual(['12-A']);
    expect(st.students.find((x: { fullName: string }) => x.fullName === 'Arda Kaya').businessId).toBe('other');
    // Başka işletmedeki öğrenciyi alamaz, boştakini alır
    expect((await other.put(`${base}/internship/businesses/${b.id}/students`, { studentIds: [ids['Arda Kaya']] })).statusCode).toBe(403);
    const free = (await owner.post(`${base}/students/import`, { rows: [{ schoolNo: '130', fullName: 'Can Ak', className: '12-A', birthDate: '2008-01-01' }] }));
    expectStatus(free, 200);
    const can = ((await owner.get(`${base}/students`)).json() as { id: string; fullName: string }[]).find((x) => x.fullName === 'Can Ak')!.id;
    expectStatus(await other.put(`${base}/internship/businesses/${b.id}/students`, { studentIds: [can] }), 200);
    // Silme ve koordinatör değiştirme idarede
    expect((await other.del(`${base}/internship/businesses/${b.id}`)).statusCode).toBe(403);
    expect((await other.patch(`${base}/internship/businesses/${b.id}`, { coordinatorTeacherId: coordTeacherId })).statusCode).toBe(403);
  });

  it('öğrenci listesi: işletme dersi olmayan alt sınıflar listelenmez', async () => {
    expectStatus(await owner.post(`${base}/students/import`, { rows: [{ schoolNo: '901', fullName: 'Dokuzuncu Sınıf', className: '9-A', birthDate: '2011-01-01' }] }), 200);
    const st = (await owner.get(`${base}/internship/students`)).json();
    expect(st.students.some((x: { fullName: string }) => x.fullName === 'Dokuzuncu Sınıf')).toBe(false);
    const nine = ((await owner.get(`${base}/students`)).json() as { id: string; fullName: string }[]).find((x) => x.fullName === 'Dokuzuncu Sınıf')!.id;
    expect((await owner.put(`${base}/internship/businesses/${biz.kent}/students`, { studentIds: [ids['Burak Şahin'], nine] })).statusCode).toBe(400);
  });

  it('mesleki eğitim öğretmen tarafı yalnızca meslek öğretmenine açılır; /api/me ünvanı kadrodan verir', async () => {
    const titles = (await owner.get(`${base}/teacher-titles`)).json() as { id: string; name: string }[];
    const title = titles.find((x) => /Uzman/.test(x.name)) ?? titles[0];
    const tid = (await owner.post(`${base}/teachers`, { fullName: 'Kültür Öğretmeni', ...(title ? { titleId: title.id } : {}) })).json().id as string;
    const user = await (async () => {
      expectStatus(await owner.post(`${base}/members`, { email: 'kultur@meslek.test', fullName: 'Kültür Öğretmeni', password: 'GizliSifre42', role: 'editor', permissions: [], teacherId: tid }), 201);
      return client(t.app, (await login(t.app, 'kultur@meslek.test', 'GizliSifre42')).token);
    })();
    expectStatus(await owner.put(`${base}/internship/teachers/${tid}/branch`, { newBranch: 'Tarih' }), 200);
    expect((await user.get(`${base}/internship/access`)).json().teacher).toBe(false);
    let school = (await user.get('/api/me')).json().schools[0];
    expect(school.vocational).toBe(false);
    if (title) expect(school.teacherTitle).toBe(title.name);
    expectStatus(await owner.put(`${base}/internship/teachers/${tid}/branch`, { newBranch: 'Elektrik-Elektronik Teknolojisi' }), 200);
    expect((await user.get(`${base}/internship/access`)).json().teacher).toBe(true);
    school = (await user.get('/api/me')).json().schools[0];
    expect(school.vocational).toBe(true);
  });
});
