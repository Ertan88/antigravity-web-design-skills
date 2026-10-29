import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { conductEntries } from '../src/db/schema.ts';
import { sentPushes } from '../src/lib/push.ts';
import { runConductRetention } from '../src/routes/conduct.ts';
import { client, createTestApp, expectStatus, login, SUPER, type TestCtx } from './helpers.ts';

let t: TestCtx;
let owner: ReturnType<typeof client>;
let base: string;
const teachers: ReturnType<typeof client>[] = [];
let plain: ReturnType<typeof client>;
let counselor: ReturnType<typeof client>;
let classId: string;
const ids: Record<string, string> = {};

beforeAll(async () => {
  t = await createTestApp({ PUSH_URL: 'memory' });
  const root = client(t.app, (await login(t.app, SUPER.email, SUPER.password)).token);
  const res = await root.post('/api/platform/schools', { name: 'Gözlem Lisesi', slug: 'gozlem-lisesi', ownerEmail: 'mudur@gozlem.test', ownerName: 'Müdür Bey', ownerPassword: 'MudurSifre42' });
  expectStatus(res, 201);
  base = `/api/schools/${res.json().id}`;
  owner = client(t.app, (await login(t.app, 'mudur@gozlem.test', 'MudurSifre42')).token);

  // Üç öğretmen (öğretmen kaydına bağlı editörler), öğretmen kaydı olmayan bir editör, bir rehber öğretmen
  for (let i = 1; i <= 3; i++) {
    const teacher = (await owner.post(`${base}/teachers`, { fullName: `Öğretmen ${i}` })).json();
    expectStatus(await owner.post(`${base}/members`, { email: `ogr${i}@gozlem.test`, fullName: `Öğretmen ${i}`, password: 'OgretmenSifre42', role: 'editor', permissions: [], teacherId: teacher.id }), 201);
    teachers.push(client(t.app, (await login(t.app, `ogr${i}@gozlem.test`, 'OgretmenSifre42')).token));
  }
  expectStatus(await owner.post(`${base}/members`, { email: 'sekreter@gozlem.test', fullName: 'Sekreter', password: 'SekreterSifre42', role: 'editor', permissions: ['ticker.manage'] }), 201);
  plain = client(t.app, (await login(t.app, 'sekreter@gozlem.test', 'SekreterSifre42')).token);
  expectStatus(await owner.post(`${base}/members`, { email: 'rehber@gozlem.test', fullName: 'Rehber Hanım', password: 'RehberSifre42', role: 'editor', permissions: ['conduct.counsel'] }), 201);
  counselor = client(t.app, (await login(t.app, 'rehber@gozlem.test', 'RehberSifre42')).token);

  const imp = await owner.post(`${base}/students/import`, {
    rows: [
      { schoolNo: '10', fullName: 'Ada Yılmaz', className: '9-A', birthDate: '2010-03-14' },
      { schoolNo: '2', fullName: 'Can Demir', className: '9-A', birthDate: '2010-11-02' },
      { schoolNo: '33', fullName: 'Ela Kaya', className: '9-A', birthDate: '2010-05-20' },
    ],
  });
  expectStatus(imp, 200);
  const list = (await owner.get(`${base}/students`)).json() as { id: string; fullName: string; classGroupId: string }[];
  for (const s of list) ids[s.fullName] = s.id;
  classId = list[0]!.classGroupId;
});

afterAll(async () => {
  await t.app.close();
  await t.database.close();
});

describe('gözlem', () => {
  let plusId: string;
  let minusId: string;

  it('hazır şablon düzeye göre yüklenir; tekrar yüklemek çift kriter açmaz', async () => {
    expect((await owner.post(`${base}/conduct/criteria/template`, { level: 'high' })).json().added).toBeGreaterThan(5);
    expect((await owner.post(`${base}/conduct/criteria/template`, { level: 'high' })).json().added).toBe(0);
    // Kriterleri yalnızca idare yönetir
    expect((await teachers[0]!.post(`${base}/conduct/criteria/template`, { level: 'middle' })).statusCode).toBe(403);
    const criteria = (await teachers[0]!.get(`${base}/conduct/criteria?level=high`)).json() as { id: string; label: string; points: number; noteRequired: boolean }[];
    plusId = criteria.find((c) => c.label === 'Derse katılım')!.id;
    minusId = criteria.find((c) => c.points < 0 && c.noteRequired)!.id;
    expect((await owner.get(`${base}/conduct/criteria?level=middle`)).json()).toEqual([]);
  });

  it('sınıfın düzeyi adından anlaşılır; hızlı giriş ekranı okul numarası sırasıyla gelir', async () => {
    const classes = (await teachers[0]!.get(`${base}/conduct/classes`)).json();
    expect(classes).toEqual([{ id: classId, name: '9-A', level: 'high', levelSet: false, students: 3 }]);
    const screen = (await teachers[0]!.get(`${base}/conduct/classes/${classId}/students`)).json();
    expect(screen.class.level).toBe('high');
    expect(screen.students.map((s: { schoolNo: string }) => s.schoolNo)).toEqual(['2', '10', '33']);
    expect(screen.criteria.length).toBeGreaterThan(5);
  });

  it('öğretmen kaydı olmayan editör ve destek erişimi gözlemleri göremez', async () => {
    expect((await plain.get(`${base}/conduct/classes`)).statusCode).toBe(403);
    expect((await plain.post(`${base}/conduct/entries`, { studentIds: [ids['Ada Yılmaz']], criterionId: plusId })).statusCode).toBe(403);
  });

  it('puan verilir, eksi puanda not zorunlu, toplu giriş birlikte geri alınır', async () => {
    const [t1, t2, t3] = teachers as [ReturnType<typeof client>, ReturnType<typeof client>, ReturnType<typeof client>];
    const one = await t1.post(`${base}/conduct/entries`, { studentIds: [ids['Ada Yılmaz']], criterionId: plusId });
    expectStatus(one, 200);
    expect(one.json()).toMatchObject({ count: 1, label: 'Derse katılım', points: 2 });
    expect((await t1.post(`${base}/conduct/entries`, { studentIds: [ids['Can Demir']], criterionId: minusId })).statusCode).toBe(400);
    expectStatus(await t1.post(`${base}/conduct/entries`, { studentIds: [ids['Can Demir']], criterionId: minusId, note: 'İkinci kez' }), 200);
    expectStatus(await t2.post(`${base}/conduct/entries`, { studentIds: [ids['Ada Yılmaz']], criterionId: plusId }), 200);
    expectStatus(await t3.post(`${base}/conduct/entries`, { studentIds: [ids['Ada Yılmaz']], criterionId: plusId }), 200);
    // Rehber öğretmen de girebilir
    expectStatus(await counselor.post(`${base}/conduct/entries`, { studentIds: [ids['Ela Kaya']], criterionId: plusId }), 200);

    const bulk = (await t2.post(`${base}/conduct/entries`, { studentIds: Object.values(ids), criterionId: plusId })).json();
    expect(bulk.count).toBe(3);
    // Başkasının toplu girişini öğretmen geri alamaz, giren geri alır
    expect((await t1.del(`${base}/conduct/batches/${bulk.batchId}`)).statusCode).toBe(403);
    expect((await t2.del(`${base}/conduct/batches/${bulk.batchId}`)).json()).toEqual({ deleted: 3 });

    const screen = (await t1.get(`${base}/conduct/classes/${classId}/students`)).json();
    const net = Object.fromEntries(screen.students.map((s: { fullName: string; net: number }) => [s.fullName, s.net]));
    expect(net).toEqual({ 'Ada Yılmaz': 6, 'Can Demir': -1, 'Ela Kaya': 2 });
  });

  it('öğrenci kartı: toplamlar, kriter dağılımı ve kayıtlar', async () => {
    const card = (await teachers[1]!.get(`${base}/conduct/students/${ids['Ada Yılmaz']}`)).json();
    expect(card.student).toMatchObject({ schoolNo: '10', fullName: 'Ada Yılmaz', className: '9-A' });
    expect(card.totals).toMatchObject({ net: 6, plus: 3, minus: 0, teachers: 3 });
    expect(card.byCriterion).toEqual([{ label: 'Derse katılım', group: 'academic', points: 6, count: 3 }]);
    expect(card.entries.filter((e: { mine: boolean }) => e.mine)).toHaveLength(1);
    // Öğretmen başkalarının kaydını görür ama kimin girdiğini göremez
    expect(card.canSeeAuthors).toBe(false);
    for (const e of card.entries as { mine: boolean; userName: string | null }[]) expect(e.userName).toBe(e.mine ? 'Öğretmen 2' : null);
    // İdare ve rehber öğretmen kimin girdiğini görür
    for (const viewer of [owner, counselor]) {
      const full = (await viewer.get(`${base}/conduct/students/${ids['Ada Yılmaz']}`)).json();
      expect(full.canSeeAuthors).toBe(true);
      expect(full.entries.map((e: { userName: string }) => e.userName).sort()).toEqual(['Öğretmen 1', 'Öğretmen 2', 'Öğretmen 3']);
    }
  });

  it('ayın öğrencisi: en az üç öğretmen şartı; idare seçer, panoya başarı olarak gider', async () => {
    expect((await teachers[0]!.get(`${base}/conduct/awards/candidates`)).statusCode).toBe(403);
    const c = (await counselor.get(`${base}/conduct/awards/candidates`)).json();
    expect(c.candidates.map((x: { student: { fullName: string } }) => x.student.fullName)).toEqual(['Ada Yılmaz']);
    expect(c.candidates[0]).toMatchObject({ plus: 6, minus: 0, teachers: 3, balanced: 6, topLabel: 'Derse katılım', awardedIn: [] });
    // Rehber öneriyi görür ama seçemez
    expect((await counselor.post(`${base}/conduct/awards`, { month: c.month, studentId: ids['Ada Yılmaz'] })).statusCode).toBe(403);
    const award = await owner.post(`${base}/conduct/awards`, { month: c.month, studentId: ids['Ada Yılmaz'] });
    expectStatus(award, 200);
    const ach = (await owner.get(`${base}/achievements`)).json() as { id: string; kind: string; name: string; className: string; title: string }[];
    expect(ach.find((a) => a.id === award.json().achievementId)).toMatchObject({ kind: 'month', name: 'Ada Yılmaz', className: '9-A' });
    expect((await owner.post(`${base}/conduct/awards`, { month: c.month, studentId: ids['Ada Yılmaz'] })).statusCode).toBe(400);
    const after = (await owner.get(`${base}/conduct/awards/candidates`)).json();
    expect(after.candidates[0].awardedIn).toEqual([c.month]);
    expect(after.awards).toHaveLength(1);
    // Seçimi geri almak panodaki başarıyı da kaldırır
    expectStatus(await owner.del(`${base}/conduct/awards/${after.awards[0].id}`), 200);
    expect(((await owner.get(`${base}/achievements`)).json() as { id: string }[]).some((a) => a.id === award.json().achievementId)).toBe(false);
  });

  it('dönem göstergesi: bantlar, yalnızca kendi kayıtlarım, Excel', async () => {
    const r = (await teachers[0]!.get(`${base}/conduct/report?classId=${classId}`)).json();
    expect(r.class.name).toBe('9-A');
    const band = (x: { class: { students: { fullName: string; band: string }[] } }) => Object.fromEntries(x.class.students.map((s) => [s.fullName, s.band]));
    expect(band(r)).toEqual({ 'Can Demir': 'low', 'Ada Yılmaz': 'high', 'Ela Kaya': 'mid' });
    expect(r.class.counts).toEqual({ high: 1, mid: 1, low: 1, none: 0 });
    expect(r.class.students.find((s: { fullName: string }) => s.fullName === 'Can Demir')).toMatchObject({ minus: 1, topMinus: expect.any(String) });
    // Kişi adları göstergede yer almaz
    expect(JSON.stringify(r)).not.toMatch(/Öğretmen \d/);
    const mine = (await teachers[0]!.get(`${base}/conduct/report?classId=${classId}&mine=1`)).json();
    expect(band(mine)).toEqual({ 'Can Demir': 'low', 'Ada Yılmaz': 'high', 'Ela Kaya': 'none' });
    const other = (await teachers[0]!.get(`${base}/conduct/report?classId=${classId}&term=${r.term === 1 ? 2 : 1}`)).json();
    expect(other.class.counts.none).toBe(3);
    const xlsx = await teachers[0]!.get(`${base}/conduct/report.xlsx`);
    expectStatus(xlsx, 200);
    expect(xlsx.headers['content-type']).toMatch(/spreadsheetml/);
    expect((await plain.get(`${base}/conduct/report?classId=${classId}`)).statusCode).toBe(403);
  });

  it('rehberlik uyarısı: eşik aşılınca rehbere sessizce bildirilir, görüşülene kadar tekrar açılmaz', async () => {
    const TOKEN = 'ExponentPushToken[rehber-telefonu]';
    expectStatus(await counselor.post('/api/me/push-tokens', { token: TOKEN, platform: 'android' }), 204);
    expectStatus(await owner.patch(base, { settings: { conductAlert: { enabled: true, days: 7, minus: 2 } } }), 200);
    const minus = (await teachers[1]!.get(`${base}/conduct/criteria?level=high`)).json().find((c: { points: number; noteRequired: boolean }) => c.points < 0 && !c.noteRequired)
      ?? { id: minusId, noteRequired: true };
    const give = (who: ReturnType<typeof client>) => who.post(`${base}/conduct/entries`, { studentIds: [ids['Can Demir']], criterionId: minus.id, note: 'Gözlem notu' });
    expectStatus(await give(teachers[1]!), 200);
    await vi.waitFor(() => expect(sentPushes.filter((p) => p.to.includes(TOKEN))).toHaveLength(1));
    const pushed = sentPushes.filter((p) => p.to.includes(TOKEN));
    expect(pushed[0]!.message).toMatchObject({ title: 'Rehberlik uyarısı', url: '/rehberlik' });
    expect(pushed[0]!.message.body).toMatch(/Can Demir \(9-A\) son 7 günde 2 eksi/);
    expectStatus(await give(teachers[2]!), 200);
    await new Promise((r) => setTimeout(r, 100));
    expect(sentPushes.filter((p) => p.to.includes(TOKEN))).toHaveLength(1);

    // Öğretmenler uyarıları göremez
    expect((await teachers[0]!.get(`${base}/conduct/alerts`)).statusCode).toBe(403);
    const list = (await counselor.get(`${base}/conduct/alerts`)).json();
    expect(list.open).toBe(1);
    expect(list.alerts[0]).toMatchObject({ minusCount: 2, windowDays: 7, student: { fullName: 'Can Demir', className: '9-A', schoolNo: '2' } });
    expect((await teachers[0]!.post(`${base}/conduct/alerts/${list.alerts[0].id}/resolve`, {})).statusCode).toBe(403);
    expectStatus(await counselor.post(`${base}/conduct/alerts/${list.alerts[0].id}/resolve`, { note: 'Öğrenciyle görüşüldü' }), 200);
    expect((await counselor.post(`${base}/conduct/alerts/${list.alerts[0].id}/resolve`, {})).statusCode).toBe(404);
    const done = (await owner.get(`${base}/conduct/alerts?status=resolved`)).json();
    expect(done.open).toBe(0);
    expect(done.alerts[0]).toMatchObject({ note: 'Öğrenciyle görüşüldü', resolvedByName: 'Rehber Hanım' });

    // Görüşüldükten sonra eşik yeniden aşılırsa yeni uyarı açılır; kapalıyken açılmaz
    expectStatus(await give(teachers[0]!), 200);
    expect((await counselor.get(`${base}/conduct/alerts`)).json().open).toBe(1);
    expectStatus(await owner.patch(base, { settings: { conductAlert: { enabled: false, days: 7, minus: 2 } } }), 200);
    const open = (await counselor.get(`${base}/conduct/alerts`)).json().alerts[0];
    expectStatus(await counselor.post(`${base}/conduct/alerts/${open.id}/resolve`, {}), 200);
    expectStatus(await give(teachers[0]!), 200);
    expect((await counselor.get(`${base}/conduct/alerts`)).json().open).toBe(0);
  });

  it('okul numarası okul içinde benzersiz', async () => {
    const dup = await owner.post(`${base}/students`, { schoolNo: '10', fullName: 'Başka Öğrenci', birthDate: '2010-01-01' });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().message).toMatch(/okul numarası/);
  });

  it('saklama süresi: önceki öğretim yılının kayıtları silinir', async () => {
    const [student] = Object.values(ids);
    const [any] = await t.database.db.select().from(conductEntries).limit(1);
    await t.database.db.insert(conductEntries).values({ ...any!, id: undefined, studentId: student!, createdAt: new Date('2020-05-01T10:00:00Z') });
    const deleted = await runConductRetention(t.app.deps);
    expect(deleted).toBe(1);
  });
});
