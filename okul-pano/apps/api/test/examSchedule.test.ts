import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sentPushes } from '../src/lib/push.ts';
import { client, createTestApp, expectStatus, login, multipartBody, SUPER, type TestCtx } from './helpers.ts';

/* Sınav takvimi: saat zilden, gözetmen ders programından, dersin öğretmeni, bildirimler ve Excel içe aktarma */

let t: TestCtx;
let owner: ReturnType<typeof client>;
let editor: ReturnType<typeof client>;
let base: string;
const T: Record<string, string> = {};
const C: Record<string, string> = {};
// 14 Nisan 2027 Çarşamba (resmi tatil değil); 12 Nisan Pazartesi
const WED = '2027-04-14';
const TOKENS = { math: 'ExponentPushToken[matematik]', phys: 'ExponentPushToken[fizik]', chem: 'ExponentPushToken[kimya]' };
const pushesTo = (token: string) => sentPushes.filter((p) => p.to.includes(token));

beforeAll(async () => {
  t = await createTestApp({ PUSH_URL: 'memory' });
  const root = client(t.app, (await login(t.app, SUPER.email, SUPER.password)).token);
  const res = await root.post('/api/platform/schools', { name: 'Sınav Lisesi', slug: 'sinav-lisesi', ownerEmail: 'mudur@sinav.test', ownerName: 'Müdür', ownerPassword: 'MudurSifre42' });
  expectStatus(res, 201);
  base = `/api/schools/${res.json().id}`;
  owner = client(t.app, (await login(t.app, 'mudur@sinav.test', 'MudurSifre42')).token);

  for (const [k, name] of [['math', 'Ayşe Matematik'], ['phys', 'Burak Fizik'], ['chem', 'Cem Kimya']] as const) {
    T[k] = (await owner.post(`${base}/teachers`, { fullName: name })).json().id;
    const email = `${k}@sinav.test`;
    expectStatus(await owner.post(`${base}/members`, { email, fullName: name, password: 'GizliSifre42', role: 'editor', permissions: [], teacherId: T[k] }), 201);
    const c = client(t.app, (await login(t.app, email, 'GizliSifre42')).token);
    expectStatus(await c.post('/api/me/push-tokens', { token: TOKENS[k], platform: 'android' }), 204);
    if (k === 'math') editor = c;
  }
  for (const name of ['10-A', '10-B']) C[name] = (await owner.post(`${base}/classes`, { name })).json().id;

  const periods = [
    { no: 1, start: '08:30', end: '09:10' },
    { no: 2, start: '09:20', end: '10:00' },
    { no: 3, start: '10:10', end: '10:50' },
    { no: 4, start: '11:00', end: '11:40' },
    { no: 5, start: '12:30', end: '13:10' },
  ];
  expectStatus(await owner.post(`${base}/bell-schedules`, { name: 'Hafta içi', weekdays: [1, 2, 3, 4, 5], periods }), 201);
  // 10-A çarşamba: 1. Kimya (Cem), 2. Fizik (Burak), 3. Matematik (Ayşe), 4-5 Matematik
  const cell = (weekday: number, periodNo: number, cls: string, teacher: string, subject: string) =>
    owner.put(`${base}/timetable/cell`, { weekday, periodNo, classGroupId: C[cls], teacherId: T[teacher], subject });
  for (const [p, tch, subj] of [[1, 'chem', 'Kimya'], [2, 'phys', 'Fizik'], [3, 'math', 'Matematik'], [4, 'math', 'Matematik'], [5, 'math', 'Matematik']] as const) expectStatus(await cell(3, p, '10-A', tch, subj), 200);
  for (const [p, tch, subj] of [[1, 'math', 'Matematik'], [2, 'chem', 'Kimya']] as const) expectStatus(await cell(3, p, '10-B', tch, subj), 200);
});

afterAll(async () => {
  await t.app.close();
  await t.database.close();
});

describe('sınav takvimi', () => {
  it('3. derste sınav: saat zilden, hatırlatma önceki teneffüs, gözetmen ve dersin öğretmeni aynı kişi', async () => {
    sentPushes.length = 0;
    const res = await owner.post(`${base}/exam-schedule`, { date: WED, periodNo: 3, classGroupId: C['10-A'], subject: 'Matematik', kind: 'common' });
    expectStatus(res, 201);
    const e = res.json();
    expect(e).toMatchObject({ className: '10-A', start: '10:10', end: '10:50', notifyKind: 'break', notifyAt: '2027-04-14T07:00:00.000Z', warnings: [] });
    expect(e.proctors.map((p: { fullName: string }) => p.fullName)).toEqual(['Ayşe Matematik']);
    expect(e.subjectTeachers.map((p: { fullName: string }) => p.fullName)).toEqual(['Ayşe Matematik']);
    // Değişiklik bildirimi: yalnızca ilgili öğretmene, bir kez
    expect(pushesTo(TOKENS.math)).toHaveLength(1);
    expect(pushesTo(TOKENS.phys)).toHaveLength(0);
  });

  it('1. derste Fizik sınavı: hatırlatma ilk zilden 15 dk önce; gözetmen (Kimya) ve dersin öğretmeni (Fizik) ayrı', async () => {
    sentPushes.length = 0;
    const e = (await owner.post(`${base}/exam-schedule`, { date: WED, periodNo: 1, classGroupId: C['10-A'], subject: 'fizik' })).json();
    expect(e).toMatchObject({ start: '08:30', notifyKind: 'first', notifyAt: '2027-04-14T05:15:00.000Z', kind: 'written' });
    expect(e.proctors.map((p: { fullName: string }) => p.fullName)).toEqual(['Cem Kimya']);
    expect(e.subjectTeachers.map((p: { fullName: string }) => p.fullName)).toEqual(['Burak Fizik']);
    expect(pushesTo(TOKENS.chem)).toHaveLength(1);
    expect(pushesTo(TOKENS.phys)).toHaveLength(1);
  });

  it('aynı sınıf, gün ve ders saatine ikinci sınav eklenemez', async () => {
    const res = await owner.post(`${base}/exam-schedule`, { date: WED, periodNo: 3, classGroupId: C['10-A'], subject: 'Matematik' });
    expect(res.statusCode).toBe(400);
  });

  it('gözetmen izinliyse uyarı verir; olmayan ders saati ve tatil uyarısı', async () => {
    expectStatus(await owner.post(`${base}/leaves`, { teacherId: T.chem, startDate: WED, endDate: WED }), 201);
    const list = (await owner.get(`${base}/exam-schedule?from=${WED}&to=${WED}`)).json();
    const phys = list.exams.find((x: { subject: string }) => x.subject === 'fizik');
    expect(phys.proctors[0].onLeave).toBe(true);
    expect(phys.warnings.join(' ')).toMatch(/izinli/);
    const late = (await owner.post(`${base}/exam-schedule`, { date: WED, periodNo: 8, classGroupId: C['10-B'], subject: 'Kimya' })).json();
    expect(late.start).toBeNull();
    expect(late.warnings.join(' ')).toMatch(/8\. ders yok/);
    const holiday = (await owner.post(`${base}/exam-schedule`, { date: '2027-04-23', periodNo: 2, classGroupId: C['10-B'], subject: 'Kimya' })).json();
    expect(holiday.warnings.join(' ')).toMatch(/tatil/);
  });

  it('okuma bütün üyelere açık, yazma "Sınav takvimi" yetkisi ister', async () => {
    expectStatus(await editor.get(`${base}/exam-schedule?from=${WED}&to=${WED}`), 200);
    expect((await editor.post(`${base}/exam-schedule`, { date: WED, periodNo: 4, classGroupId: C['10-A'], subject: 'Matematik' })).statusCode).toBe(403);
  });

  it('Excel: şablon iner; önizleme sınıf ve ders adlarını eşler, hatalı satırları ayırır; içe aktarma ekler ve günceller', async () => {
    const tpl = await owner.get(`${base}/exam-schedule/template`);
    expectStatus(tpl, 200);
    expect(tpl.headers['content-type']).toContain('spreadsheetml');

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sınavlar');
    ws.addRow(['Tarih', 'Ders Saati', 'Sınıf', 'Ders Adı', 'Tür', 'Gözetmen (isteğe bağlı)', 'Not']);
    ws.addRow(['GG.AA.YYYY', '1–10 arası sayı', 'listeden', 'listeden', '', '', '']);
    ws.addRow(['14.04.2027', 2, '10/b', 'Kim.', 'Yazılı', '', '']); // sınıf ve ders tahmini
    ws.addRow(['14.04.2027', 3, '10-A', 'Matematik', 'Ortak', 'Burak Fizik', 'güncelleme']); // var olan kayıt
    ws.addRow(['14.04.2027', 2, '10-B', 'Kimya', 'Yazılı', '', '']); // dosyada ikinci kez
    ws.addRow(['14.04.2027', 4, '9-Z', 'Tarih', '', '', '']); // sınıf yok
    ws.addRow(['32.04.2027', 1, '10-A', 'Kimya', '', '', '']); // tarih hatalı
    const body = multipartBody('file', 'sinav.xlsx', Buffer.from(await wb.xlsx.writeBuffer()), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const prev = await t.app.inject({ method: 'POST', url: `${base}/exam-schedule/import/preview`, headers: { ...body.headers, authorization: `Bearer ${(await login(t.app, 'mudur@sinav.test', 'MudurSifre42')).token}` }, payload: body.payload });
    expectStatus(prev, 200);
    const p = prev.json();
    expect(p.rows).toHaveLength(2);
    expect(p.errors).toHaveLength(3);
    const guess = p.rows[0];
    expect(guess).toMatchObject({ classLabel: '10-B', subject: 'Kimya', status: 'warn', start: '09:20' });
    expect(guess.messages.join(' ')).toMatch(/10-B/);
    const upd = p.rows[1];
    expect(upd).toMatchObject({ exists: true, proctorTeacherId: T.phys });

    sentPushes.length = 0;
    const imp = await owner.post(`${base}/exam-schedule/import`, {
      rows: p.rows.map((r: Record<string, unknown>) => ({ date: r.date, periodNo: r.periodNo, classGroupId: r.classGroupId, subject: r.subject, kind: r.kind, proctorTeacherId: r.proctorTeacherId, note: r.note })),
    });
    expectStatus(imp, 200);
    expect(imp.json()).toEqual({ created: 1, updated: 1 });
    const list = (await owner.get(`${base}/exam-schedule?from=${WED}&to=${WED}`)).json();
    const math = list.exams.find((x: { periodNo: number; className: string }) => x.periodNo === 3 && x.className === '10-A');
    expect(math).toMatchObject({ kind: 'common', note: 'güncelleme' });
    expect(math.proctors[0]).toMatchObject({ fullName: 'Burak Fizik', manual: true });
    // Elle seçilen gözetmen o saatte başka sınıfta derste değil (10-B 3. ders boş): uyarı yok
    expect(math.warnings.join(' ')).not.toMatch(/derste/);
    // Burak artık gözetmen: bildirim alır; Ayşe hâlâ dersin öğretmeni
    expect(pushesTo(TOKENS.phys).length).toBeGreaterThan(0);
    expect(pushesTo(TOKENS.math).length).toBeGreaterThan(0);
  });

  it('silme ilgili öğretmene bildirilir', async () => {
    const list = (await owner.get(`${base}/exam-schedule?from=${WED}&to=${WED}`)).json();
    const kimya = list.exams.find((x: { className: string; periodNo: number }) => x.className === '10-B' && x.periodNo === 2);
    sentPushes.length = 0;
    expectStatus(await owner.del(`${base}/exam-schedule/${kimya.id}`), 204);
    expect(pushesTo(TOKENS.chem).length).toBe(1);
  });
});
