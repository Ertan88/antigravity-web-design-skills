import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schools } from '../src/db/schema.ts';
import { sentPushes } from '../src/lib/push.ts';
import { activeCoverDate, teacherCovers } from '../src/routes/covers.ts';
import { client, createTestApp, expectStatus, login, SUPER, type TestCtx } from './helpers.ts';

/*
 * İzinli öğretmen yerine ders görevlendirmesi (sentetik okul). Çarşamba 2 Aralık 2026:
 * Ayşe izinli: 2. ve 3. ders 10-A Matematik, 4. ders 10-A işletmede mesleki eğitim (boş ders sayılmaz).
 * Burak o gün nöbetçi, dersi yok (nöbet için okulda); Cem 2. derste 10-B'de; Deniz 1. ve 4. derste 10-B'de (2-3. ders boş);
 * Emre yalnız 5. derste 10-B'de (2-3. derste henüz okulda değil); Fatma'nın o gün dersi yok (okulda değil).
 */
let t: TestCtx;
let owner: ReturnType<typeof client>;
let burak: ReturnType<typeof client>;
let schoolId: string;
const T: Record<string, string> = {};
const C: Record<string, string> = {};
const DATE = '2026-12-02';
const BURAK_TOKEN = 'ExponentPushToken[burak-telefonu]';
const path = (p: string) => `/api/schools/${schoolId}/${p}`;
type Day = {
  lessons: { periodNo: number; className: string; subject: string; absentName: string; cover: { id: string; teacherId: string } | null; candidates: { fullName: string; onDuty: boolean }[] }[];
  duties: { area: string; candidates: { fullName: string; onDuty: boolean }[] }[];
};
const day = async () => (await owner.get(path(`cover-day?date=${DATE}`))).json() as Day;

beforeAll(async () => {
  t = await createTestApp({ PUSH_URL: 'memory' });
  const root = client(t.app, (await login(t.app, SUPER.email, SUPER.password)).token);
  const res = await root.post('/api/platform/schools', { name: 'Görev Okulu', slug: 'gorev-okulu', ownerEmail: 'mudur@gorev.test', ownerName: 'Müdür', ownerPassword: 'MudurGV123!' });
  expectStatus(res, 201);
  schoolId = res.json().id;
  owner = client(t.app, (await login(t.app, 'mudur@gorev.test', 'MudurGV123!')).token);
  const periods = [1, 2, 3, 4, 5, 6].map((no) => ({ no, start: `0${7 + no}:30`.slice(-5), end: `0${8 + no}:10`.slice(-5) }));
  expectStatus(await owner.post(path('bell-schedules'), { name: 'Hafta içi', weekdays: [1, 2, 3, 4, 5], periods }), 201);
  for (const name of ['Ayşe Yılmaz', 'Burak Demir', 'Cem Kaya', 'Deniz Ak', 'Emre Su', 'Fatma Kar']) T[name.split(' ')[0]!] = (await owner.post(path('teachers'), { fullName: name })).json().id;
  for (const name of ['10-A', '10-B']) C[name] = (await owner.post(path('classes'), { name })).json().id;
  const cell = (periodNo: number, cls: string, teacher: string, subject: string) =>
    owner.put(path('timetable/cell'), { weekday: 3, periodNo, classGroupId: C[cls], teacherId: T[teacher], subject });
  expectStatus(await cell(2, '10-A', 'Ayşe', 'Matematik'), 200);
  expectStatus(await cell(3, '10-A', 'Ayşe', 'Matematik'), 200);
  expectStatus(await cell(4, '10-A', 'Ayşe', 'İşletmelerde Mesleki Eğitim'), 200);
  expectStatus(await cell(2, '10-B', 'Cem', 'Fizik'), 200);
  expectStatus(await cell(1, '10-B', 'Deniz', 'Kimya'), 200);
  expectStatus(await cell(4, '10-B', 'Deniz', 'Kimya'), 200);
  expectStatus(await cell(5, '10-B', 'Emre', 'Biyoloji'), 200);
  expectStatus(await owner.post(path('duties'), { month: '2026-12', weekday: 3, area: 'Bahçe', teacherId: T.Ayşe }), 201);
  expectStatus(await owner.post(path('duties'), { month: '2026-12', weekday: 3, area: 'Kantin', teacherId: T.Burak }), 201);
  expectStatus(await owner.post(path('leaves'), { teacherId: T.Ayşe, startDate: DATE, endDate: DATE }), 201);
  expectStatus(await owner.post(path('members'), { email: 'burak@gorev.test', fullName: 'Burak Demir', password: 'GizliSifre42', role: 'editor', permissions: [], teacherId: T.Burak }), 201);
  burak = client(t.app, (await login(t.app, 'burak@gorev.test', 'GizliSifre42')).token);
  expectStatus(await burak.post('/api/me/push-tokens', { token: BURAK_TOKEN, platform: 'android' }), 204);
});

afterAll(async () => {
  await t.app.close();
  await t.database.close();
});

describe('izinli öğretmen yerine görevlendirme', () => {
  it('boş dersler (işletme dersi hariç) ve adaylar: o gün okulda olup o saatte boş olanlar, nöbetçiler önce', async () => {
    const d = await day();
    expect(d.lessons.map((l) => `${l.periodNo}|${l.className}|${l.subject}|${l.absentName}`)).toEqual(['2|10-A|Matematik|Ayşe Yılmaz', '3|10-A|Matematik|Ayşe Yılmaz']);
    // 2. ders: nöbetçi Burak, ilk ve son dersi arasında boş olan Deniz. Cem o saatte derste, Emre henüz okulda değil,
    // Fatma'nın o gün dersi yok, Ayşe izinli.
    expect(d.lessons[0]!.candidates.map((c) => `${c.fullName}|${c.onDuty}`)).toEqual(['Burak Demir|true', 'Deniz Ak|false']);
    expect(d.lessons[1]!.candidates.map((c) => c.fullName)).toEqual(['Burak Demir', 'Deniz Ak']);
    // İzinli öğretmenin nöbet yeri: yalnızca o günün nöbetçileri; dersi boş olan Deniz önerilmez
    expect(d.duties.map((x) => x.area)).toEqual(['Bahçe']);
    expect(d.duties[0]!.candidates.map((c) => `${c.fullName}|${c.onDuty}`)).toEqual(['Burak Demir|true']);
  });

  it('dersi olan öğretmen gönderilemez; boş öğretmen atanır ve bildirim alır', async () => {
    expect((await owner.post(path('covers'), { date: DATE, periodNo: 2, classGroupId: C['10-A'], teacherId: T.Cem })).statusCode).toBe(400);
    sentPushes.length = 0;
    expectStatus(await owner.post(path('covers'), { date: DATE, periodNo: 2, classGroupId: C['10-A'], teacherId: T.Burak }), 201);
    expectStatus(await owner.post(path('covers'), { date: DATE, periodNo: 3, classGroupId: C['10-A'], teacherId: T.Burak }), 201);
    await new Promise((r) => setTimeout(r, 30));
    expect(sentPushes.filter((p) => p.to.includes(BURAK_TOKEN)).map((p) => p.message.title)).toEqual(['Derse görevlendirildiniz', 'Derse görevlendirildiniz']);
    const d = await day();
    expect(d.lessons.every((l) => l.cover?.teacherId === T.Burak)).toBe(true);
    // Öğretmenin bildirim kutusunda da görünür
    const inbox = (await burak.get(path('inbox'))).json() as { items: { kind: string }[] };
    expect(inbox.items.filter((i) => i.kind === 'lesson-cover')).toHaveLength(2);
  });

  it('öğretmen kendi görevlerini ve sayılarını görür; istatistik ve sınıf geçmişi', async () => {
    const mine = (await burak.get(path('my-covers?month=2026-12'))).json();
    expect(mine).toMatchObject({ monthCount: 2, total: 2 });
    expect(mine.items.map((i: { periodNo: number; className: string; absentName: string }) => `${i.periodNo}|${i.className}|${i.absentName}`)).toEqual(['2|10-A|Ayşe Yılmaz', '3|10-A|Ayşe Yılmaz']);
    const stats = (await owner.get(path('cover-stats?month=2026-12'))).json() as { rows: Record<string, unknown>[] };
    expect(stats.rows[0]).toEqual({ teacherId: T.Burak, fullName: 'Burak Demir', month: 2, total: 2, isActive: true }); // taşımalı yok
    const hist = (await owner.get(path('cover-history'))).json() as { classes: { className: string; n: number }[] };
    expect(hist.classes).toEqual([{ classGroupId: C['10-A'], className: '10-A', n: 2 }]);
    const items = (await owner.get(path(`cover-history?classId=${C['10-A']}`))).json().items as { teacherName: string }[];
    expect(items).toHaveLength(2);
    // Yetkisi olmayan öğretmen günü ve istatistiği göremez
    expect((await burak.get(path(`cover-day?date=${DATE}`))).statusCode).toBe(403);
    expect((await burak.get(path('cover-stats'))).statusCode).toBe(403);
  });

  it('gün sonu: son zilden sonra sonraki okul günü; öğretmenin görev dersleri tarihleriyle', async () => {
    const [school] = await t.database.db.select().from(schools).where(eq(schools.id, schoolId));
    // Son ders (6.) 14:10'da biter; İstanbul saati UTC+3
    expect(await activeCoverDate(t.database.db, school!, new Date('2026-12-02T10:00:00Z'))).toEqual({ today: DATE, date: DATE });
    expect(await activeCoverDate(t.database.db, school!, new Date('2026-12-02T11:30:00Z'))).toEqual({ today: DATE, date: '2026-12-03' });
    // Cuma akşamı ve hafta sonu: Pazartesi
    expect((await activeCoverDate(t.database.db, school!, new Date('2026-12-04T15:00:00Z'))).date).toBe('2026-12-07');
    expect((await activeCoverDate(t.database.db, school!, new Date('2026-12-05T08:00:00Z'))).date).toBe('2026-12-07');
    const mine = await teacherCovers(t.database.db, schoolId, T.Burak!, DATE, DATE);
    expect(mine.map((c) => `${c.date}|${c.periodNo}|${c.className}|${c.subject}|${c.absentName}`)).toEqual([`${DATE}|2|10-A|Matematik|Ayşe Yılmaz`, `${DATE}|3|10-A|Matematik|Ayşe Yılmaz`]);
  });

  it('görevli değiştirilir ve silinir', async () => {
    expectStatus(await owner.post(path('covers'), { date: DATE, periodNo: 2, classGroupId: C['10-A'], teacherId: T.Deniz }), 201);
    expect((await burak.get(path('my-covers?month=2026-12'))).json().monthCount).toBe(1);
    const id = (await day()).lessons[0]!.cover!.id;
    expectStatus(await owner.del(path(`covers/${id}`)), 200);
    expect((await day()).lessons[0]!.cover).toBeNull();
  });
});
