import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { client, createTestApp, expectStatus, login, multipartBody, SUPER, type TestCtx } from './helpers.ts';

let t: TestCtx;
let schoolId: string;
let owner: ReturnType<typeof client>;
let ownerToken: string;
const path = (p: string) => `/api/schools/${schoolId}/${p}`;
const ids: Record<string, string> = {};

beforeAll(async () => {
  t = await createTestApp();
  const root = client(t.app, (await login(t.app, SUPER.email, SUPER.password)).token);
  const res = await root.post('/api/platform/schools', {
    name: 'Develi Lisesi',
    slug: 'develi-lisesi',
    ownerEmail: 'mudur@develi.local',
    ownerName: 'Müdür',
    ownerPassword: 'MudurDV123!',
  });
  expectStatus(res, 201);
  schoolId = res.json().id;
  ownerToken = (await login(t.app, 'mudur@develi.local', 'MudurDV123!')).token;
  owner = client(t.app, ownerToken);
  for (const fullName of ['Ayşe Demir', 'Ali Kaya', 'Fatma Aydın', 'Mehmet Öztürk', 'Zeynep Arslan']) {
    const r = await owner.post(path('teachers'), { fullName });
    expectStatus(r, 201);
    ids[fullName] = r.json().id;
  }
  // Pazartesi üç, Salı iki nöbetçi; diğer günler nöbet yok
  for (const [weekday, name, area] of [
    [1, 'Ayşe Demir', 'Bahçe'],
    [1, 'Ali Kaya', 'Kantin'],
    [1, 'Fatma Aydın', '1. Kat'],
    [2, 'Mehmet Öztürk', 'Bahçe'],
    [2, 'Zeynep Arslan', 'Kantin'],
  ] as const) {
    expectStatus(await owner.post(path('duties'), { month: '2026-11', weekday, area, teacherId: ids[name] }), 201);
  }
  // Ali Kaya 9 Kasım'da izinli
  expectStatus(await owner.post(path('leaves'), { teacherId: ids['Ali Kaya'], startDate: '2026-11-09', endDate: '2026-11-09' }), 201);
});

afterAll(async () => {
  await t.app.close();
  await t.database.close();
});


async function upload(buf: Buffer) {
  const body = multipartBody('file', 'servis.xlsx', buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  return t.app.inject({
    method: 'POST',
    url: path('transport-duties/import/preview'),
    headers: { ...body.headers, authorization: `Bearer ${ownerToken}` },
    payload: body.payload,
  });
}

/** Okulun servis nöbet çizelgesi düzeni: başlık, ay satırı, Nöbet Tarihi | Nöbet Günü | Nöbetçi Öğretmen 1 | 2 */
async function schoolSheet(rows: (string | null)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Worksheet');
  ws.mergeCells('A1:D1');
  ws.getCell('A1').value = 'ÖĞRETMEN SERVİS NÖBET ÇİZELGESİ';
  ws.mergeCells('A2:D2');
  ws.getCell('A2').value = 'AİT OLDUĞU AY: KASIM';
  ws.getRow(3).values = ['Nöbet Tarihi', 'Nöbet Günü', 'Nöbetçi Öğretmen 1', 'Nöbetçi Öğretmen 2'];
  rows.forEach((r, i) => (ws.getRow(4 + i).values = r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

type Day = { date: string; teachers: { id: string; fullName: string }[] };

describe('taşımalı öğrenci (servis) görevlileri', () => {
  it('okulun çizelgesini okur: büyük harf, Türkçe karakter hatası ve kısaltmalı isimler kadroyla eşleşir', async () => {
    expectStatus(await owner.post(path('teachers'), { fullName: 'Yasemin Emlek Hakverdi' }), 201);
    const buf = await schoolSheet([
      ['02.11.2026', 'PAZARTESİ', 'AYŞE DEMİR', 'ALI KAYA'],
      ['03.11.2026', 'SALI', 'YASEMİN E.HAKVERDİ', 'M. ÖZTÜRK'],
      ['04.11.2026', 'ÇARŞAMBA', 'Hasan Yok', 'Zeynep Arslan'],
      ['31.11.2026', 'PERŞEMBE', 'Fatma Aydın', null],
    ]);
    const res = await upload(buf);
    expectStatus(res, 200);
    const body = res.json();
    expect(body.rows.map((r: { date: string; teachers: { fullName: string }[] }) => `${r.date} ${r.teachers.map((x) => x.fullName).join(', ')}`)).toEqual([
      '2026-11-02 Ayşe Demir, Ali Kaya',
      '2026-11-03 Yasemin Emlek Hakverdi, Mehmet Öztürk',
      '2026-11-04 Zeynep Arslan',
    ]);
    expect(body.issues).toEqual([
      { row: 6, message: expect.stringMatching(/"Hasan Yok" kadroda yok/) },
      { row: 7, message: 'Tarih anlaşılamadı: "31.11.2026"' },
    ]);
    expect(body.totals).toMatchObject({ new: 3, update: 0, unchanged: 0 });

    const saved = await owner.post(path('transport-duties/import'), {
      days: body.rows.map((r: { date: string; teachers: { id: string }[] }) => ({ date: r.date, teacherIds: r.teachers.map((x) => x.id) })),
    });
    expect(saved.json()).toEqual({ days: 3 });
    const days = (await owner.get(path('transport-duties?month=2026-11'))).json() as Day[];
    expect(days.map((d) => `${d.date}:${d.teachers.length}`)).toEqual(['2026-11-02:2', '2026-11-03:2', '2026-11-04:1']);

    // Aynı dosya tekrar yüklenirse değişiklik yok
    expect((await upload(buf)).json().totals).toMatchObject({ new: 0, update: 0, unchanged: 3 });
  });

  it('dışa aktarma okulun düzenindedir ve geri yüklenince değişiklik çıkmaz; şablon yalnızca hafta içi tarihleri içerir', async () => {
    const res = await owner.get(path('transport-duties/export?month=2026-11'));
    expectStatus(res, 200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.rawPayload as unknown as ArrayBuffer);
    const ws = wb.getWorksheet('Servis Nöbet Çizelgesi')!;
    expect(ws.getCell('A1').value).toBe('ÖĞRETMEN SERVİS NÖBET ÇİZELGESİ');
    expect(ws.getCell('A2').value).toBe('AİT OLDUĞU AY: KASIM 2026');
    expect(ws.getRow(3).values).toEqual([undefined, 'Nöbet Tarihi', 'Nöbet Günü', 'Nöbetçi Öğretmen 1', 'Nöbetçi Öğretmen 2']);
    expect(ws.getRow(4).values).toEqual([undefined, '02.11.2026', 'PAZARTESİ', 'Ayşe Demir', 'Ali Kaya']);
    // Kasım 2026: 21 iş günü
    expect(ws.getCell(24, 1).value).toBe('30.11.2026');
    expect(ws.getCell(25, 1).value).toBeFalsy();
    expect((await upload(res.rawPayload)).json().totals).toMatchObject({ new: 0, update: 0, unchanged: 3, skipped: 0 });

    const tpl = await owner.get(path('transport-duties/template?month=2026-11'));
    const twb = new ExcelJS.Workbook();
    await twb.xlsx.load(tpl.rawPayload as unknown as ArrayBuffer);
    expect(twb.getWorksheet('Servis Nöbet Çizelgesi')!.getCell('C4').value).toBeFalsy();
  });

  it('başlıktaki ay esas alınır: eski aydan kalan tarihler o aya taşınır; tatil yazısı hata değil tatildir', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Worksheet');
    ws.getCell('A1').value = 'ÖĞRETMEN SERVİS NÖBET ÇİZELGESİ';
    ws.getCell('A2').value = 'AİT OLDUĞU AY: ARALIK';
    ws.getRow(3).values = ['Nöbet Tarihi', 'Nöbet Günü', 'Nöbetçi Öğretmen 1', 'Nöbetçi Öğretmen 2'];
    ws.getRow(4).values = ['02.11.2026', 'PAZARTESİ', 'Ayşe Demir', 'Ali Kaya'];
    ws.getRow(5).values = ['03.11.2026', 'SALI', 'YARIYIL TATİLİ', null];
    const res = await upload(Buffer.from(await wb.xlsx.writeBuffer()));
    const body = res.json();
    expect(body.month).toMatchObject({ month: '2026-12', titleMonth: '2026-12', datesMonth: '2026-11', conflict: true });
    // Kasım'ın 1. pazartesi / salısı -> Aralık'ın 1. pazartesi / salısı
    expect(body.rows.map((r: { date: string; from: string }) => `${r.date}<${r.from}`)).toEqual(['2026-12-07<2026-11-02']);
    expect(body.holidays).toEqual([{ date: '2026-12-01', name: 'Yarıyıl Tatili' }]);
    expect(body.issues).toEqual([]);
  });

  it('çizelge ayın tamamıdır: dosyada olmayan günler temizlenir, resmî tatilde görevli yazılmaz', async () => {
    // 29 Ekim'de (Cumhuriyet Bayramı) önceden kalmış bir kayıt var
    expectStatus(await owner.put(path('transport-duties/2026-10-29'), { teacherIds: [ids['Ali Kaya']] }), 200);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Worksheet');
    ws.getCell('A1').value = 'ÖĞRETMEN SERVİS NÖBET ÇİZELGESİ';
    ws.getCell('A2').value = 'AİT OLDUĞU AY: EKİM';
    ws.getRow(3).values = ['Nöbet Tarihi', 'Nöbet Günü', 'Nöbetçi Öğretmen 1', 'Nöbetçi Öğretmen 2'];
    ws.getRow(4).values = ['28.10.2026', 'ÇARŞAMBA', 'Ayşe Demir', null];
    ws.getRow(5).values = ['30.10.2026', 'CUMA', 'Ali Kaya', null];
    const body = (await upload(Buffer.from(await wb.xlsx.writeBuffer()))).json();
    const oct29 = body.rows.find((r: { date: string }) => r.date === '2026-10-29');
    expect(oct29).toMatchObject({ cleared: true, missing: true, holiday: 'Cumhuriyet Bayramı', teachers: [] });

    // Dosyada tatil gününe isim yazılmışsa alınmaz, uyarı verilir
    ws.getRow(6).values = ['29.10.2026', 'PERŞEMBE', 'Ayşe Demir', null];
    const again = (await upload(Buffer.from(await wb.xlsx.writeBuffer()))).json();
    expect(again.rows.find((r: { date: string }) => r.date === '2026-10-29')).toMatchObject({ cleared: true, teachers: [] });
    expect(again.issues).toEqual([{ row: 6, message: '29.10.2026 tatil (Cumhuriyet Bayramı); görevli yazılmadı' }]);

    const saved = await owner.post(path('transport-duties/import'), {
      days: again.rows.map((r: { date: string; teachers: { id: string }[] }) => ({ date: r.date, teacherIds: r.teachers.map((x) => x.id) })),
    });
    expectStatus(saved, 200);
    const days = (await owner.get(path('transport-duties?month=2026-10'))).json() as Day[];
    expect(days.map((d) => d.date)).toEqual(['2026-10-28', '2026-10-30']);
  });

  it('bir ayın tüm servis nöbetleri temizlenir', async () => {
    expectStatus(await owner.put(path('transport-duties/2026-12-07'), { teacherIds: [ids['Ali Kaya']] }), 200);
    expect((await owner.post(path('transport-duties/clear'), { month: '2026-12' })).json()).toEqual({ removed: 1 });
  });

  it('elle düzenleme günü değiştirir, boş liste kaldırır; geçersiz istekler reddedilir', async () => {
    expectStatus(await owner.put(path('transport-duties/2026-11-02'), { teacherIds: [ids['Zeynep Arslan'], ids['Ayşe Demir']] }), 200);
    expectStatus(await owner.put(path('transport-duties/2026-11-04'), { teacherIds: [] }), 200);
    const days = (await owner.get(path('transport-duties?month=2026-11'))).json() as Day[];
    expect(days.find((d) => d.date === '2026-11-02')!.teachers.map((x) => x.fullName)).toEqual(['Zeynep Arslan', 'Ayşe Demir']);
    expect(days.find((d) => d.date === '2026-11-04')).toBeUndefined();

    expect((await owner.put(path('transport-duties/2026-13-45'), { teacherIds: [] })).statusCode).toBe(400);
    expect((await owner.get(path('transport-duties?month=2026-1'))).statusCode).toBe(400);
    expect((await owner.put(path('transport-duties/2026-11-05'), { teacherIds: ['6f1c1f3e-0000-4000-8000-000000000000'] })).statusCode).toBe(400);
  });
});
