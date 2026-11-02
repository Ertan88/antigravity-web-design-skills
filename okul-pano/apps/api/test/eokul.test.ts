import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildClasses, parseCell, parseEokulPage, teacherDisplayName, titleCase, type PdfItem } from '../src/lib/sheets/eokul.ts';
import { client, createTestApp, expectStatus, login, multipartBody, SUPER, type TestCtx } from './helpers.ts';

/*
 * e-Okul ders programı PDF'i: sayfanın metin parçaları (konum + kalın) elle kurulur. Gerçek bir okulun PDF'i depoya
 * konmaz (öğretmen adları kişisel veri).
 */

const DAY_X = [160, 320, 480, 640, 800];
const DAY_NAMES = ['PAZARTESİ', 'SALI', 'ÇARSAMBA', 'PERŞEMBE', 'CUMA'];
const TIMES = ['08:00-08:40', '08:50-09:30', '09:40-10:20'];

type Cell = { day: number; period: number; subject: string; teachers?: string };
function page(header: string, cells: Cell[]): PdfItem[] {
  const items: PdfItem[] = [
    { str: 'T.C.', x: 400, y: 563, w: 20, bold: true },
    { str: header, x: 290, y: 534, w: 300, bold: true },
    ...DAY_NAMES.map((d, i) => ({ str: d, x: DAY_X[i]! - 20, y: 498, w: 40, bold: true })),
  ];
  TIMES.forEach((t, i) => {
    const y = 477 - i * 29;
    items.push({ str: String(i + 1), x: 31, y, w: 4, bold: false }, { str: t, x: 50, y, w: 45, bold: false });
  });
  for (const c of cells) {
    const y = 477 - (c.period - 1) * 29;
    // Ders adı iki parçaya bölünmüş olabilir (PDF'te harf grupları ayrı gelir)
    const half = Math.ceil(c.subject.length / 2);
    items.push({ str: c.subject.slice(0, half), x: DAY_X[c.day - 1]! - 30, y: y + 5, w: half * 4, bold: true });
    items.push({ str: c.subject.slice(half), x: DAY_X[c.day - 1]! - 30 + half * 4, y: y + 5, w: (c.subject.length - half) * 4, bold: true });
    if (c.teachers) items.push({ str: c.teachers, x: DAY_X[c.day - 1]! - 40, y: y - 4, w: 80, bold: false });
  }
  return items;
}

describe('e-Okul ders programı ayrıştırma', () => {
  it('başlık, günler, ders saatleri ve hücreler', () => {
    const p = parseEokulPage(
      page('ATP - 9. Sınıf / A Şubesi ELEKTRİK-ELEKTRONİK TEKNOLOJİSİ ALANI', [
        { day: 1, period: 1, subject: 'FİZİK', teachers: 'SERHAT GÖKÇEK' },
        { day: 2, period: 1, subject: 'TARİH' },
        { day: 3, period: 2, subject: 'TEMEL ELEKTRİK-ELEKTRONİK', teachers: 'ÇİĞDEM YILMAZ, YASİN CEPECİ' },
        { day: 1, period: 3, subject: 'SEÇMELİ DERS', teachers: 'MEVLÜT AKBAŞ - SEÇMELİ PEYGAMBERİMİZİN HAYATI' },
      ]),
      1,
    )!;
    expect(p).toMatchObject({ program: 'ATP', grade: 9, section: 'A', field: 'ELEKTRİK-ELEKTRONİK TEKNOLOJİSİ ALANI', branch: null });
    expect(p.times).toEqual({ 1: '08:00-08:40', 2: '08:50-09:30', 3: '09:40-10:20' });
    expect(p.entries).toEqual([
      { weekday: 1, periodNo: 1, subject: 'Fizik', teachers: ['SERHAT GÖKÇEK'] },
      { weekday: 2, periodNo: 1, subject: 'Tarih', teachers: [] },
      { weekday: 3, periodNo: 2, subject: 'Temel Elektrik-Elektronik', teachers: ['ÇİĞDEM YILMAZ', 'YASİN CEPECİ'] },
      { weekday: 1, periodNo: 3, subject: 'Peygamberimizin Hayatı (Seçmeli)', teachers: ['MEVLÜT AKBAŞ'] },
    ]);
    expect(parseEokulPage([{ str: 'Başka bir belge', x: 10, y: 10, w: 50, bold: false }], 2)).toBeNull();
  });

  it('seçmeli hücrede birden çok ders, adların yazımı', () => {
    expect(parseCell('SEÇMELİ DERS', 'AYŞE KAYA - SEÇMELİ SPOR EĞİTİMİ, ALİ CAN - SEÇMELİ TEMEL MATEMATİK')).toEqual([
      { subject: 'Spor Eğitimi (Seçmeli)', teachers: ['AYŞE KAYA'] },
      { subject: 'Temel Matematik (Seçmeli)', teachers: ['ALİ CAN'] },
    ]);
    expect(titleCase('DİN KÜLTÜRÜ VE AHLÂK BİLGİSİ')).toBe('Din Kültürü ve Ahlâk Bilgisi');
    expect(titleCase('BEDEN EĞİTİMİ VE SPOR/GÖRSEL SANATLAR/MÜZİK')).toBe('Beden Eğitimi ve Spor/Görsel Sanatlar/Müzik');
    expect(titleCase('T.C. İNKILÂP TARİHİ')).toBe('T.C. İnkılâp Tarihi');
    expect(titleCase('BİLGİSAYAR KONTROLLÜ ÜRETİM (CNC/CAM)')).toBe('Bilgisayar Kontrollü Üretim (CNC/CAM)');
    expect(teacherDisplayName('YASEMİN EMLEK HAKVERDİ')).toBe('Yasemin Emlek HAKVERDİ');
    expect(teacherDisplayName('Seda Sencer')).toBe('Seda SENCER');
  });

  it('dallar tek sınıfta birleşir; aynı adı kullanan programlar önek alır', () => {
    const parse = (header: string, cells: Cell[], n: number) => parseEokulPage(page(header, cells), n)!;
    const classes = buildClasses([
      parse('AMP - 11. Sınıf / A Şubesi MAKİNE ALANI (Makine Bakım Onarım Dalı)', [
        { day: 1, period: 1, subject: 'TARİH', teachers: 'AYŞE KAYA' },
        { day: 1, period: 2, subject: 'BAKIM ATÖLYESİ', teachers: 'ALİ CAN' },
      ], 1),
      parse('AMP - 11. Sınıf / A Şubesi MAKİNE ALANI (Bilgisayarlı Makine İmalatı Dalı)', [
        { day: 1, period: 1, subject: 'TARİH', teachers: 'AYŞE KAYA' },
        { day: 1, period: 2, subject: 'CNC ATÖLYESİ', teachers: 'VELİ ER' },
      ], 2),
      parse('ATP - 11. Sınıf / A Şubesi ELEKTRİK ALANI', [{ day: 2, period: 1, subject: 'FİZİK', teachers: 'AYŞE KAYA' }], 3),
      parse('AMP - 11. Sınıf / B Şubesi BİLİŞİM ALANI', [{ day: 2, period: 1, subject: 'FİZİK' }], 4),
    ]);
    expect(classes.map((c) => c.name)).toEqual(['AMP 11-A', 'ATP 11-A', '11-B']);
    const amp = classes[0]!;
    expect(amp.groups).toEqual(['Makine Bakım Onarım', 'Bilgisayarlı Makine İmalatı']);
    // Ortak ders bir kez, dal dersleri dal adıyla
    expect(amp.entries).toEqual([
      { weekday: 1, periodNo: 1, subject: 'Tarih', teachers: ['AYŞE KAYA'], group: null },
      { weekday: 1, periodNo: 2, subject: 'Bakım Atölyesi', teachers: ['ALİ CAN'], group: 'Makine Bakım Onarım' },
      { weekday: 1, periodNo: 2, subject: 'CNC Atölyesi', teachers: ['VELİ ER'], group: 'Bilgisayarlı Makine İmalatı' },
    ]);
  });
});

describe('e-Okul ders programı yükleme', () => {
  let t: TestCtx;
  let owner: ReturnType<typeof client>;
  let ownerToken: string;
  let base: string;

  beforeAll(async () => {
    t = await createTestApp();
    const root = client(t.app, (await login(t.app, SUPER.email, SUPER.password)).token);
    const res = await root.post('/api/platform/schools', { name: 'Program Lisesi', slug: 'program-lisesi', ownerEmail: 'mudur@program.test', ownerName: 'Müdür', ownerPassword: 'MudurSifre42' });
    expectStatus(res, 201);
    base = `/api/schools/${res.json().id}`;
    ownerToken = (await login(t.app, 'mudur@program.test', 'MudurSifre42')).token;
    owner = client(t.app, ownerToken);
    expectStatus(await owner.post(`${base}/teachers`, { fullName: 'Ayşe KAYA' }), 201);
  });

  afterAll(async () => {
    await t.app.close();
    await t.database.close();
  });

  it('PDF olmayan dosya reddedilir', async () => {
    const body = multipartBody('file', 'program.txt', Buffer.from('merhaba'), 'text/plain');
    const res = await t.app.inject({ method: 'POST', url: `${base}/timetable/import/eokul/preview`, headers: { ...body.headers, authorization: `Bearer ${ownerToken}` }, payload: body.payload });
    expect(res.statusCode).toBe(400);
  });

  it('uygula: sınıflar ve öğretmenler eklenir, bölünmüş derste iki öğretmen, dal dersleri dal adıyla', async () => {
    const res = await owner.post(`${base}/timetable/import/eokul/apply`, {
      createTeachers: true,
      classes: [
        {
          name: 'AMP 11-A',
          entries: [
            { weekday: 1, periodNo: 1, subject: 'Tarih', teachers: ['AYŞE KAYA'], group: null },
            { weekday: 1, periodNo: 2, subject: 'Temel Elektrik', teachers: ['ÇİĞDEM YILMAZ', 'YASİN CEPECİ'], group: null },
            { weekday: 1, periodNo: 3, subject: 'Bakım Atölyesi', teachers: ['ALİ CAN'], group: 'Makine Bakım Onarım' },
            { weekday: 1, periodNo: 3, subject: 'CNC Atölyesi', teachers: ['VELİ ER'], group: 'Bilgisayarlı Makine İmalatı' },
            { weekday: 2, periodNo: 1, subject: 'Rehberlik', teachers: [], group: null },
          ],
        },
      ],
    });
    expectStatus(res, 200);
    // Ayşe KAYA kadroda; dört öğretmen eklenir
    expect(res.json()).toEqual({ classesCreated: 1, teachersCreated: 4, entries: 6 });
    const staff = (await owner.get(`${base}/teachers`)).json() as { fullName: string }[];
    expect(staff.map((s) => s.fullName).sort()).toEqual(['Ali CAN', 'Ayşe KAYA', 'Veli ER', 'Yasin CEPECİ', 'Çiğdem YILMAZ'].sort());
    const tt = (await owner.get(`${base}/timetable`)).json() as { periodNo: number; weekday: number; groupLabel: string | null }[];
    expect(tt.filter((e) => e.weekday === 1 && e.periodNo === 2)).toHaveLength(2);
    expect(tt.filter((e) => e.groupLabel).map((e) => e.groupLabel).sort()).toEqual(['Bilgisayarlı Makine İmalatı', 'Makine Bakım Onarım']);

    // Yeniden yüklemek programı değiştirir (eklenmez); öğretmen eklenmesin denirse öğretmensiz yazılır
    const again = await owner.post(`${base}/timetable/import/eokul/apply`, {
      createTeachers: false,
      classes: [{ name: 'AMP 11-A', entries: [{ weekday: 3, periodNo: 1, subject: 'Fizik', teachers: ['YENİ ÖĞRETMEN'], group: null }] }],
    });
    expect(again.json()).toEqual({ classesCreated: 0, teachersCreated: 0, entries: 1 });
    const after = (await owner.get(`${base}/timetable`)).json() as { teacherId: string | null; subject: string }[];
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ subject: 'Fizik', teacherId: null });
  });

  it('elle hücre: bölünmüş sınıfta iki öğretmen; hücre bütünüyle değişir', async () => {
    const classes = (await owner.get(`${base}/classes`)).json() as { id: string; name: string }[];
    const staff = (await owner.get(`${base}/teachers`)).json() as { id: string; fullName: string }[];
    const id = (n: string) => staff.find((s) => s.fullName === n)!.id;
    const cls = classes.find((c) => c.name === 'AMP 11-A')!;
    expectStatus(
      await owner.put(`${base}/timetable/cell`, { weekday: 4, periodNo: 1, classGroupId: cls.id, subject: 'Teknik Resim', teacherId: id('Çiğdem YILMAZ'), extraTeacherIds: [id('Yasin CEPECİ')] }),
      200,
    );
    let cell = ((await owner.get(`${base}/timetable`)).json() as { weekday: number; teacherId: string }[]).filter((e) => e.weekday === 4);
    expect(cell.map((e) => e.teacherId).sort()).toEqual([id('Çiğdem YILMAZ'), id('Yasin CEPECİ')].sort());
    expectStatus(await owner.put(`${base}/timetable/cell`, { weekday: 4, periodNo: 1, classGroupId: cls.id, subject: 'Teknik Resim', teacherId: id('Ali CAN') }), 200);
    cell = ((await owner.get(`${base}/timetable`)).json() as { weekday: number; teacherId: string }[]).filter((e) => e.weekday === 4);
    expect(cell.map((e) => e.teacherId)).toEqual([id('Ali CAN')]);
  });
});
