import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, createTestApp, expectStatus, login, multipartBody, SUPER, type TestCtx } from './helpers.ts';

let t: TestCtx;
let schoolId: string;
let ownerToken: string;
let owner: ReturnType<typeof client>;
const path = (p: string) => `/api/schools/${schoolId}/${p}`;

async function xlsx(rows: ExcelJS.CellValue[][], sheetName = 'Sayfa1'): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function preview(resource: 'students' | 'duties', buf: Buffer, token = ownerToken) {
  const body = multipartBody('file', 'liste.xlsx', buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  return t.app.inject({
    method: 'POST',
    url: path(`${resource}/import/preview`),
    headers: { ...body.headers, authorization: `Bearer ${token}` },
    payload: body.payload,
  });
}

async function readSheet(payload: Buffer, name: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(payload as unknown as ArrayBuffer);
  return { wb, ws: wb.getWorksheet(name)! };
}

beforeAll(async () => {
  t = await createTestApp();
  const root = client(t.app, (await login(t.app, SUPER.email, SUPER.password)).token);
  const res = await root.post('/api/platform/schools', {
    name: 'Yunus Emre Ortaokulu',
    slug: 'yunus-emre',
    ownerEmail: 'mudur@ye.local',
    ownerName: 'Müdür',
    ownerPassword: 'MudurYE123!',
  });
  expectStatus(res, 201);
  schoolId = res.json().id;
  ownerToken = (await login(t.app, 'mudur@ye.local', 'MudurYE123!')).token;
  owner = client(t.app, ownerToken);
  expectStatus(await owner.post(path('classes'), { name: '7-A' }), 201);
  for (const fullName of ['Ayşe Demir', 'Ali Kaya', 'Fatma Aydın', 'Mehmet Öztürk']) {
    expectStatus(await owner.post(path('teachers'), { fullName }), 201);
  }
});

afterAll(async () => {
  await t.app.close();
  await t.database.close();
});

describe('öğrenci Excel', () => {
  it('e-Okul biçimini okur: ayrı ad/soyad ve sınıf/şube sütunları, farklı tarih yazımları', async () => {
    const buf = await xlsx([
      ['T.C. Yunus Emre Ortaokulu', null, null, null, null, null],
      ['Okul No', 'Adı', 'Soyadı', 'Sınıfı', 'Şubesi', 'Doğum Tarihi'],
      [101, 'Elif', 'Yılmaz', 7, 'a', new Date(Date.UTC(2013, 2, 14))],
      [102, 'Can', 'Demir', 7, 'B', '02.11.2012'],
      [103, 'Deniz', 'Ak', 7, 'A', 41500],
      [104, 'Ece', 'Sarı', 7, 'A', '31.02.2013'],
      [105, 'Kerem', 'Uçar', 7, 'A', null],
      [106, 'Zeynep', 'Koç', 7, 'A', '01.01.1950'],
      [107, 'elif', 'YILMAZ', 7, 'A', '14/03/2013'],
    ]);
    const res = await preview('students', buf);
    expectStatus(res, 200);
    const body = res.json();
    expect(body.rows.map((r: { fullName: string; className: string; birthDate: string; status: string }) => `${r.fullName}|${r.className}|${r.birthDate}|${r.status}`)).toEqual([
      'Elif Yılmaz|7-A|2013-03-14|new',
      'Can Demir|7-B|2012-11-02|new',
      'Deniz Ak|7-A|2013-08-14|new',
    ]);
    expect(body.issues.map((i: { row: number }) => i.row)).toEqual([6, 7, 8, 9]);
    expect(body.issues[0].message).toMatch(/okunamadı/);
    expect(body.issues[1].message).toMatch(/boş/);
    expect(body.issues[2].message).toMatch(/1950/);
    expect(body.issues[3].message).toMatch(/iki kez/);
    expect(body.additions).toEqual([{ label: 'Oluşturulacak sınıflar', values: ['7-B'] }]);
    expect(body.totals).toEqual({ new: 3, update: 0, unchanged: 0, skipped: 4 });
  });

  it('içe aktarır; tekrar yüklemek çift kayıt açmaz, sınıf değişikliğini günceller', async () => {
    const rows = [
      { fullName: 'Elif Yılmaz', className: '7-A', birthDate: '2013-03-14' },
      { fullName: 'Can Demir', className: '7-B', birthDate: '2012-11-02' },
    ];
    expect((await owner.post(path('students/import'), { rows })).json()).toEqual({ created: 2, updated: 0, unchanged: 0, classesCreated: 1 });
    const again = await owner.post(path('students/import'), { rows: [{ ...rows[0], className: '8/a' }, rows[1]] });
    expect(again.json()).toEqual({ created: 0, updated: 1, unchanged: 1, classesCreated: 1 });
    // Aynı isimli ama farklı doğum tarihli öğrenci ayrı kişidir
    const twin = await owner.post(path('students/import'), { rows: [{ fullName: 'Elif Yılmaz', className: '7-A', birthDate: '2013-05-01' }] });
    expect(twin.json().created).toBe(1);
    const list = (await owner.get(path('students'))).json() as { fullName: string }[];
    expect(list.filter((s) => s.fullName === 'Elif Yılmaz')).toHaveLength(2);
  });

  it('şablon sınıf listesi ve tarih doğrulamasıyla gelir; dışa aktarma sınıfa göre sıralı ve geri yüklenebilir', async () => {
    const tpl = await owner.get(path('students/template'));
    expectStatus(tpl, 200);
    expect(tpl.headers['content-disposition']).toContain('ogrenci-sablonu.xlsx');
    const { wb, ws } = await readSheet(tpl.rawPayload, 'Öğrenciler');
    expect(ws.getRow(1).values).toEqual([undefined, 'Ad Soyad', 'Sınıf', 'Doğum Tarihi']);
    expect(ws.getCell('B2').dataValidation).toMatchObject({ type: 'list' });
    expect(ws.getCell('C2').dataValidation).toMatchObject({ type: 'date' });
    expect(wb.getWorksheet('Listeler')!.getColumn(1).values.filter(Boolean)).toEqual(['7-A', '7-B', '8-A']);

    const exp = await owner.get(path('students/export'));
    expect(exp.headers['content-disposition']).toMatch(/ogrenciler-yunus-emre-ortaokulu-\d{4}-\d{2}-\d{2}\.xlsx/);
    const sheet = (await readSheet(exp.rawPayload, 'Öğrenciler')).ws;
    const names = sheet.getSheetValues().slice(2).map((r) => (r as ExcelJS.CellValue[]).slice(1, 3).join(' '));
    expect(names).toEqual(['Elif Yılmaz 7-A', 'Can Demir 7-B', 'Elif Yılmaz 8-A']);
    expect(sheet.getCell('C2').value).toBeInstanceOf(Date);
    expect(sheet.getCell('C2').numFmt).toBe('dd.mm.yyyy');

    const roundtrip = await preview('students', exp.rawPayload);
    expect(roundtrip.json().totals).toEqual({ new: 0, update: 0, unchanged: 3, skipped: 0 });
  });
});

describe('nöbet çizelgesi Excel', () => {
  it('çizelge biçimini okur: çoklu öğretmen, yanlış yazılan isme öneri, boş yer', async () => {
    const buf = await xlsx([
      ['Nöbet Yeri', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'],
      ['Bahçe', 'Ayşe Demir', 'Ali Kaya, Fatma Aydın', null, null, 'Ayse Demır'],
      ['1. Kat', null, 'Mehmet Öztürk', null, 'Hasan Yok', null],
      [null, 'Ali Kaya', null, null, null, null],
      ['bahçe', 'ayşe demir', null, null, null, null],
    ]);
    const res = await preview('duties', buf);
    expectStatus(res, 200);
    const body = res.json();
    expect(body.layout).toBe('matrix');
    expect(body.weekdays).toEqual([1, 2, 3, 4, 5]);
    expect(body.rows.map((r: { day: string; area: string; teacherName: string }) => `${r.day}|${r.area}|${r.teacherName}`)).toEqual([
      'Pazartesi|Bahçe|Ayşe Demir',
      'Salı|Bahçe|Ali Kaya',
      'Salı|Bahçe|Fatma Aydın',
      'Salı|1. Kat|Mehmet Öztürk',
    ]);
    expect(body.issues).toEqual([
      { row: 2, message: '"Ayse Demır" kadroda yok (Ayşe Demir mi?)' },
      { row: 3, message: expect.stringMatching(/"Hasan Yok" kadroda yok; önce Öğretmen Kadrosu/) },
      { row: 4, message: expect.stringMatching(/Nöbet yeri boş/) },
    ]);
    expect(body.additions).toEqual([{ label: 'Yeni nöbet yerleri', values: ['Bahçe', '1. Kat'] }]);
    expect(body.totals).toMatchObject({ new: 4, unchanged: 0, removed: 0 });
  });

  it('"değiştir" dosyadaki günleri yeniler, dosyada olmayan günlere dokunmaz; "ekle" yalnızca eksikleri ekler', async () => {
    const teachers = (await owner.get(path('teachers'))).json() as { id: string; fullName: string }[];
    const ali = teachers.find((x) => x.fullName === 'Ali Kaya')!;
    expectStatus(await owner.post(path('duties'), { weekday: 6, area: 'Pansiyon', teacherId: ali.id }), 201);
    expectStatus(await owner.post(path('duties'), { weekday: 1, area: 'Kantin', teacherId: ali.id }), 201);

    const rows = [
      { weekday: 1, area: 'Bahçe', teacherName: 'Ayşe Demir' },
      { weekday: 2, area: 'Bahçe', teacherName: 'ali kaya' },
      { weekday: 2, area: '1. Kat', teacherName: 'Mehmet Öztürk' },
      { weekday: 3, area: 'Bahçe', teacherName: 'Bilinmeyen Kişi' },
    ];
    const replaced = await owner.post(path('duties/import'), { mode: 'replace', weekdays: [1, 2, 3, 4, 5], rows });
    expect(replaced.json()).toEqual({ created: 3, removed: 1, unchanged: 0, skipped: 1, supervisors: 0 });
    let list = (await owner.get(path('duties'))).json() as { weekday: number; area: string; sortOrder: number }[];
    expect(list.map((d) => `${d.weekday}|${d.area}`).sort()).toEqual(['1|Bahçe', '2|1. Kat', '2|Bahçe', '6|Pansiyon']);
    // Yerler dosyadaki sırayla dizilir
    expect(list.find((d) => d.weekday === 2 && d.area === 'Bahçe')!.sortOrder).toBe(0);
    expect(list.find((d) => d.weekday === 2 && d.area === '1. Kat')!.sortOrder).toBe(1);

    const merged = await owner.post(path('duties/import'), {
      mode: 'merge',
      weekdays: [1],
      rows: [
        { weekday: 1, area: 'bahçe', teacherName: 'Ayşe Demir' },
        { weekday: 1, area: 'Kantin', teacherName: 'Fatma Aydın' },
      ],
    });
    expect(merged.json()).toEqual({ created: 1, removed: 0, unchanged: 1, skipped: 0, supervisors: 0 });
    list = (await owner.get(path('duties'))).json();
    expect(list).toHaveLength(5);
  });

  it('dışa aktarma okulun aylık çizelge düzenindedir, hafta sonu nöbetini de içerir ve geri yüklenince değişiklik çıkmaz', async () => {
    const res = await owner.get(path('duties/export?month=2026-09'));
    expectStatus(res, 200);
    expect(res.headers['content-disposition']).toMatch(/nobet-cizelgesi-yunus-emre-ortaokulu-/);
    const { ws } = await readSheet(res.rawPayload, 'Nöbet Çizelgesi');
    expect(ws.getCell('A1').value).toBe('ÖĞRETMEN NÖBET ÇİZELGESİ');
    expect(ws.getCell('A2').value).toBe('AİT OLDUĞU AY: EYLÜL 2026');
    expect(ws.getCell('E4').value).toBe('TARİH');
    // Pazartesi bloğu: Eylül 2026'da 4 pazartesi var; 2 nöbet satırı + 2 yalnızca tarihli satır
    expect([5, 6, 7, 8].map((r) => ws.getCell(r, 1).value)).toEqual(['PAZARTESİ', 'PAZARTESİ', 'PAZARTESİ', 'PAZARTESİ']);
    expect([ws.getCell('B5').value, ws.getCell('C5').value, ws.getCell('D5').value]).toEqual([1, 'Ayşe Demir', 'Bahçe']);
    expect([ws.getCell('C6').value, ws.getCell('D6').value]).toEqual(['Fatma Aydın', 'Kantin']);
    expect(ws.getCell('E5').value).toBe('07.09.2026');
    expect(ws.getCell('E8').value).toBe('28.09.2026');
    expect(ws.getCell('A9').value).toBe('SALI');
    expect(ws.pageSetup.orientation).toBe('landscape');
    expect(ws.getCell('C5').dataValidation).toMatchObject({ type: 'list' });
    const lastDay = [...Array(ws.rowCount).keys()].map((i) => ws.getCell(i + 1, 1).value).filter(Boolean).pop();
    expect(lastDay).toBe('CUMARTESİ');

    const roundtrip = (await preview('duties', res.rawPayload)).json();
    expect(roundtrip.layout).toBe('monthly');
    expect(roundtrip.weekdays).toEqual([1, 2, 6]);
    expect(roundtrip.issues).toEqual([]);
    expect(roundtrip.totals).toMatchObject({ new: 0, unchanged: 5, removed: 0, skipped: 0, supervisors: 0 });
  });

  it('okulun aylık çizelgesini okur: birleşik gün blokları, sıra no, tarih ve nöbetçi müdür yardımcısı', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Worksheet');
    ws.mergeCells('A1:F1');
    ws.getCell('A1').value = 'ÖĞRETMEN NÖBET ÇİZELGESİ';
    ws.mergeCells('A2:F2');
    ws.getCell('A2').value = 'AİT OLDUĞU AY: EKİM';
    ws.mergeCells('A3:A4');
    ws.getCell('A3').value = 'GÜNLER';
    ws.mergeCells('B3:C4');
    ws.getCell('B3').value = 'NÖBETÇİ ÖĞRETMENİN\nADI VE SOYADI';
    ws.mergeCells('D3:D4');
    ws.getCell('D3').value = 'NÖBET YERİ';
    ws.mergeCells('E3:F3');
    ws.getCell('E3').value = 'NÖBETÇİ MÜDÜR YARD. VE\nNÖBET GÜNLERİ';
    ws.getCell('E4').value = 'TARİH';
    ws.getCell('F4').value = 'NÖBETÇİ MÜDÜR YARD. ';
    const rows: [string, number, string, string, string | null, string | null][] = [
      ['PAZARTESİ', 1, 'MEHMET ÖZTÜRK', 'TESİSAT VE MOTOR ATÖLYELERİ ÖNÜ', '05.10.2026', 'MUSTAFA AKKAYA'],
      ['PAZARTESİ', 2, 'Ali KAYA', 'EK BİNA KAT 1', '12.10.2026', 'ÜMİT KILIÇ'],
      ['PAZARTESİ', 3, '', 'ÖN BAHÇE', null, null],
      ['SALI', 1, 'Fatma AYDIN', 'EK BİNA KAT 1-2', '06.10.2026', 'M.AKKAYA'],
      ['SALI', 2, 'Hasan Yok', 'SPOR SAHASI', '31.02.2026', 'ÜMİT KILIÇ'],
    ];
    rows.forEach((r, i) => ws.getRow(5 + i).values = r);
    ws.mergeCells('A5:A7');
    ws.mergeCells('A8:A9');
    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    const res = await preview('duties', buf);
    expectStatus(res, 200);
    const body = res.json();
    expect(body.layout).toBe('monthly');
    expect(body.weekdays).toEqual([1, 2]);
    expect(body.rows.map((r: { day: string; area: string; teacherName: string }) => `${r.day}|${r.area}|${r.teacherName}`)).toEqual([
      'Pazartesi|TESİSAT VE MOTOR ATÖLYELERİ ÖNÜ|Mehmet Öztürk',
      'Pazartesi|EK BİNA KAT 1|Ali Kaya',
      'Salı|EK BİNA KAT 1-2|Fatma Aydın',
    ]);
    expect(body.supervisors).toEqual([
      { date: '2026-10-05', name: 'MUSTAFA AKKAYA', status: 'new' },
      { date: '2026-10-06', name: 'M.AKKAYA', status: 'new' },
      { date: '2026-10-12', name: 'ÜMİT KILIÇ', status: 'new' },
    ]);
    expect(body.issues).toEqual([
      { row: 9, message: 'Tarih anlaşılamadı: "31.02.2026"' },
      { row: 9, message: expect.stringMatching(/"Hasan Yok" kadroda yok/) },
    ]);

    const saved = await owner.post(path('duties/import'), {
      mode: 'merge',
      weekdays: body.weekdays,
      rows: body.rows.map(({ weekday, area, teacherName }: { weekday: number; area: string; teacherName: string }) => ({ weekday, area, teacherName })),
      supervisors: body.supervisors.map(({ date, name }: { date: string; name: string }) => ({ date, name })),
    });
    expect(saved.json()).toMatchObject({ created: 3, supervisors: 3 });
    const october = (await owner.get(path('duty-supervisors?month=2026-10'))).json() as { date: string; name: string }[];
    expect(october.map((x) => `${x.date} ${x.name}`)).toEqual(['2026-10-05 MUSTAFA AKKAYA', '2026-10-06 M.AKKAYA', '2026-10-12 ÜMİT KILIÇ']);

    // Aynı tarihe ikinci kayıt eklenemez; düzeltme ise yeniden yüklemeyle güncellenir
    expect((await owner.post(path('duty-supervisors'), { date: '2026-10-05', name: 'Başka Biri' })).statusCode).toBe(409);
    const again = (await preview('duties', buf)).json();
    expect(again.supervisors.map((x: { status: string }) => x.status)).toEqual(['unchanged', 'unchanged', 'unchanged']);

    // "Değiştir": dosyadaki ayda dosyada olmayan tarih silinir
    expectStatus(await owner.post(path('duty-supervisors'), { date: '2026-10-20', name: 'Ümit Kılıç' }), 201);
    await owner.post(path('duties/import'), { mode: 'replace', weekdays: [7], rows: [], supervisors: [{ date: '2026-10-05', name: 'Mustafa Akkaya' }] });
    const after = (await owner.get(path('duty-supervisors?month=2026-10'))).json() as { date: string; name: string }[];
    expect(after.map((x) => `${x.date} ${x.name}`)).toEqual(['2026-10-05 Mustafa Akkaya']);
  });

  it('uzun liste biçimini de okur (Gün | Nöbet Yeri | Öğretmen)', async () => {
    const buf = await xlsx([
      ['Gün', 'Nöbet Yeri', 'Nöbetçi Öğretmen'],
      ['Pzt', 'Bahçe', 'Ayşe Demir'],
      ['Perşembe', 'Kantin', 'Ali Kaya'],
      ['Bayram', 'Kantin', 'Ali Kaya'],
    ]);
    const body = (await preview('duties', buf)).json();
    expect(body.layout).toBe('list');
    expect(body.weekdays).toEqual([1, 4]);
    expect(body.rows.map((r: { status: string }) => r.status)).toEqual(['unchanged', 'new']);
    expect(body.issues).toEqual([{ row: 4, message: 'Gün anlaşılamadı: "Bayram"' }]);
  });

  it('şablon kadrodaki öğretmenlerle, okulun nöbet yerleriyle ve ayın tarihleriyle gelir', async () => {
    const res = await owner.get(path('duties/template?month=2026-11'));
    const { wb, ws } = await readSheet(res.rawPayload, 'Nöbet Çizelgesi');
    expect(ws.getCell('A2').value).toBe('AİT OLDUĞU AY: KASIM 2026');
    expect(ws.getCell('C5').value).toBeFalsy();
    expect(ws.getCell('E5').value).toBe('02.11.2026');
    expect(ws.getCell('F5').value).toBeFalsy();
    expect(wb.getWorksheet('Listeler')!.getColumn(1).values.filter(Boolean)).toEqual(['Ali Kaya', 'Ayşe Demir', 'Fatma Aydın', 'Mehmet Öztürk']);
    const areas = wb.getWorksheet('Listeler')!.getColumn(2).values.filter(Boolean);
    expect(areas).toContain('Pansiyon');
    expect(areas).toContain('Bahçe');
    // Boş şablon geri yüklenirse hiçbir şey değişmez, hata da çıkmaz
    const body = (await preview('duties', res.rawPayload)).json();
    expect(body.issues).toEqual([]);
    expect(body.rows).toEqual([]);
    expect((await owner.get(path('duties/template?month=2026-13'))).statusCode).toBe(400);
  });

  it('nöbet yetkisi olmayan editör çizelge yükleyemez', async () => {
    expectStatus(
      await owner.post(path('members'), {
        email: 'ogr@ye.local',
        fullName: 'Öğrenci İşleri',
        password: 'Ogrenci123!',
        role: 'editor',
        permissions: ['students.manage'],
      }),
      201,
    );
    const token = (await login(t.app, 'ogr@ye.local', 'Ogrenci123!')).token;
    const buf = await xlsx([['Nöbet Yeri', 'Pazartesi', 'Salı'], ['Bahçe', 'Ayşe Demir', null]]);
    expect((await preview('duties', buf, token)).statusCode).toBe(403);
    expect((await client(t.app, token).post(path('duties/import'), { mode: 'merge', weekdays: [1], rows: [] })).statusCode).toBe(403);
    expect((await preview('students', await xlsx([['Ad Soyad', 'Doğum Tarihi'], ['X Y', '01.01.2012']]), token)).statusCode).toBe(200);
  });
});
