import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, createTestApp, expectStatus, login, multipartBody, SUPER, type TestCtx } from './helpers.ts';

let t: TestCtx;
let schoolId: string;
let owner: ReturnType<typeof client>;
let ownerToken: string;
const path = (p: string) => `/api/schools/${schoolId}/${p}`;

async function xlsx(rows: (string | null)[][], sheetName = 'Liste'): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function upload(buf: Buffer, filename = 'ogretmenler.xlsx') {
  const body = multipartBody('file', filename, buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  return t.app.inject({
    method: 'POST',
    url: path('teachers/import/preview'),
    headers: { ...body.headers, authorization: `Bearer ${ownerToken}` },
    payload: body.payload,
  });
}

async function readWorkbook(payload: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(payload as unknown as ArrayBuffer);
  return wb;
}

beforeAll(async () => {
  t = await createTestApp();
  const root = client(t.app, (await login(t.app, SUPER.email, SUPER.password)).token);
  const res = await root.post('/api/platform/schools', {
    name: 'Gazi Ortaokulu',
    slug: 'gazi-ortaokulu',
    ownerEmail: 'mudur@gazi.local',
    ownerName: 'Müdür',
    ownerPassword: 'MudurGazi1!',
  });
  expectStatus(res, 201);
  schoolId = res.json().id;
  ownerToken = (await login(t.app, 'mudur@gazi.local', 'MudurGazi1!')).token;
  owner = client(t.app, ownerToken);
});

afterAll(async () => {
  await t.app.close();
  await t.database.close();
});

describe('branş ve ünvan listeleri', () => {
  it('yeni okul önerilen listelerle açılır', async () => {
    const branches = (await owner.get(path('teacher-branches'))).json();
    const titles = (await owner.get(path('teacher-titles'))).json();
    expect(branches.map((b: { name: string }) => b.name)).toContain('Matematik');
    expect(titles.map((b: { name: string }) => b.name)).toEqual(expect.arrayContaining(['Öğretmen', 'Uzman Öğretmen', 'Başöğretmen']));
    expect(branches[0]).toMatchObject({ teacherCount: 0 });
  });

  it('aynı branşı büyük/küçük harf farkıyla iki kez eklemez', async () => {
    const dup = await owner.post(path('teacher-branches'), { name: '  matematik ' });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().message).toMatch(/zaten listede/);
    expectStatus(await owner.post(path('teacher-branches'), { name: 'Robotik ve Kodlama' }), 201);
  });

  it('önerilen listeyi tekrar eklemek çift kayıt oluşturmaz', async () => {
    const res = await owner.post(path('teacher-catalog/defaults'));
    expect(res.json()).toEqual({ branchesAdded: 0, titlesAdded: 0 });
  });
});

describe('öğretmen kaydı', () => {
  it('branş ve ünvanla ekler, listede adlarıyla döner', async () => {
    const branches = (await owner.get(path('teacher-branches'))).json() as { id: string; name: string }[];
    const titles = (await owner.get(path('teacher-titles'))).json() as { id: string; name: string }[];
    const fizik = branches.find((b) => b.name === 'Fizik')!;
    const uzman = titles.find((b) => b.name === 'Uzman Öğretmen')!;
    const res = await owner.post(path('teachers'), { fullName: '  Zehra   Çınar ', branchId: fizik.id, titleId: uzman.id });
    expectStatus(res, 201);
    expect(res.json().fullName).toBe('Zehra Çınar');
    const list = (await owner.get(path('teachers'))).json();
    expect(list[0]).toMatchObject({ fullName: 'Zehra Çınar', branch: 'Fizik', title: 'Uzman Öğretmen' });

    const counts = (await owner.get(path('teacher-branches'))).json();
    expect(counts.find((b: { name: string }) => b.name === 'Fizik').teacherCount).toBe(1);
  });

  it('branş adı değişince öğretmende de değişir, branş silinince öğretmen kalır', async () => {
    const created = (await owner.post(path('teacher-branches'), { name: 'Astronomi' })).json();
    const teacher = (await owner.post(path('teachers'), { fullName: 'Cem Yıldırım', branchId: created.id })).json();
    expectStatus(await owner.put(path(`teacher-branches/${created.id}`), { name: 'Gökbilim' }), 200);
    let list = (await owner.get(path('teachers'))).json();
    expect(list.find((x: { id: string }) => x.id === teacher.id).branch).toBe('Gökbilim');
    expectStatus(await owner.del(path(`teacher-branches/${created.id}`)), 204);
    list = (await owner.get(path('teachers'))).json();
    expect(list.find((x: { id: string }) => x.id === teacher.id)).toMatchObject({ branch: null, branchId: null });
  });
});

describe('Excel', () => {
  it('şablon okulun listeleriyle açılır menülü gelir', async () => {
    const res = await owner.get(path('teachers/template'));
    expectStatus(res, 200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['content-disposition']).toContain('ogretmen-sablonu.xlsx');
    const wb = await readWorkbook(res.rawPayload);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Öğretmenler', 'Listeler', 'Açıklama']);
    const sheet = wb.getWorksheet('Öğretmenler')!;
    expect(sheet.getRow(1).values).toEqual([undefined, 'Ad Soyad', 'Branş', 'Ünvan']);
    expect(sheet.getCell('B2').dataValidation).toMatchObject({ type: 'list' });
    const lists = wb.getWorksheet('Listeler')!;
    expect(lists.state).toBe('veryHidden');
    const branchNames = lists.getColumn(1).values.filter(Boolean);
    expect(branchNames).toContain('Matematik');
    expect(branchNames).toContain('Robotik ve Kodlama');
  });

  it('ayrı Adı/Soyadı sütunlu listeyi okur, hataları ve tekrarları satır numarasıyla bildirir', async () => {
    const buf = await xlsx([
      ['T.C. Gazi Ortaokulu Personel Listesi'],
      ['ADI', 'SOYADI', 'BRANŞI', 'ÜNVANI'],
      ['Kemal', 'Tunç', 'Matematik', 'Öğretmen'],
      ['Deniz', 'Ak', 'Drama', 'Uzman Öğretmen'],
      [null, null, 'Fizik', null],
      ['kemal', 'TUNÇ', 'Matematik', null],
      ['Zehra', 'Çınar', 'Kimya', null],
      [],
    ]);
    const res = await upload(buf);
    expectStatus(res, 200);
    const body = res.json();
    expect(body.rows.map((r: { fullName: string; status: string }) => `${r.fullName}:${r.status}`)).toEqual([
      'Kemal Tunç:new',
      'Deniz Ak:new',
      'Zehra Çınar:update',
    ]);
    expect(body.issues).toEqual([
      { row: 5, message: 'Ad soyad boş' },
      { row: 6, message: expect.stringMatching(/iki kez var \(ilk: 3\. satır\)/) },
    ]);
    expect(body.newBranches).toEqual(['Drama']);
    expect(body.newTitles).toEqual([]);
    expect(body.totals).toEqual({ new: 2, update: 1, unchanged: 0, skipped: 2 });
  });

  it('eski .xls ve bozuk dosyayı anlaşılır mesajla reddeder', async () => {
    const xls = await upload(Buffer.from('eski'), 'liste.xls');
    expect(xls.statusCode).toBe(400);
    expect(xls.json().message).toMatch(/\.xlsx/);
    const broken = await upload(Buffer.from('bu bir excel değil'));
    expect(broken.statusCode).toBe(400);
    expect(broken.json().message).toMatch(/okunamadı/);
  });

  it('içe aktarır; aynı dosyayı tekrar yüklemek çift kayıt oluşturmaz', async () => {
    const rows = [
      { fullName: 'Kemal Tunç', branch: 'Matematik', title: 'Öğretmen' },
      { fullName: 'Deniz Ak', branch: 'Drama', title: 'Uzman Öğretmen' },
      { fullName: 'Zehra Çınar', branch: 'Kimya', title: null },
    ];
    const first = await owner.post(path('teachers/import'), { rows });
    expectStatus(first, 200);
    expect(first.json()).toEqual({ created: 2, updated: 1, unchanged: 0, branchesCreated: 1, titlesCreated: 0 });

    const again = await owner.post(path('teachers/import'), { rows });
    expect(again.json()).toMatchObject({ created: 0, updated: 0, unchanged: 3 });

    const list = (await owner.get(path('teachers'))).json() as { fullName: string; branch: string; title: string }[];
    expect(list.filter((x) => x.fullName === 'Kemal Tunç')).toHaveLength(1);
    // Boş ünvan hücresi mevcut ünvanı silmez
    expect(list.find((x) => x.fullName === 'Zehra Çınar')).toMatchObject({ branch: 'Kimya', title: 'Uzman Öğretmen' });
  });

  it('dışa aktarılan dosya Türkçe alfabeye göre sıralıdır ve geri yüklenebilir', async () => {
    const res = await owner.get(path('teachers/export'));
    expectStatus(res, 200);
    expect(res.headers['content-disposition']).toMatch(/filename\*=UTF-8''ogretmenler-gazi-ortaokulu-/);
    const wb = await readWorkbook(res.rawPayload);
    const sheet = wb.getWorksheet('Öğretmenler')!;
    const names = sheet.getColumn(1).values.slice(2) as string[];
    expect(names).toEqual(['Cem Yıldırım', 'Deniz Ak', 'Kemal Tunç', 'Zehra Çınar']);
    expect(sheet.getRow(1).values).toEqual([undefined, 'Ad Soyad', 'Branş', 'Ünvan', 'Durum']);
    expect(sheet.getCell('D2').value).toBe('Aktif');

    const roundtrip = await upload(res.rawPayload);
    expect(roundtrip.json().totals).toEqual({ new: 0, update: 0, unchanged: 4, skipped: 0 });
  });

  it('dışa aktarma dosya adı Türkçe karakter içermez', async () => {
    expectStatus(await owner.patch(`/api/schools/${schoolId}`, { name: 'Şehit Öğretmen Çağrı İlkokulu' }), 200);
    const res = await owner.get(path('teachers/export'));
    expect(res.headers['content-disposition']).toMatch(/filename="ogretmenler-sehit-ogretmen-cagri-ilkokulu-\d{4}-\d{2}-\d{2}\.xlsx"/);
    expectStatus(await owner.patch(`/api/schools/${schoolId}`, { name: 'Gazi Ortaokulu' }), 200);
  });

  it('yetkisi olmayan editör içe aktaramaz', async () => {
    expectStatus(
      await owner.post(path('members'), {
        email: 'duyuru@gazi.local',
        fullName: 'Duyuru Editörü',
        password: 'Duyuru123!',
        role: 'editor',
        permissions: ['announcements.manage'],
      }),
      201,
    );
    const editor = client(t.app, (await login(t.app, 'duyuru@gazi.local', 'Duyuru123!')).token);
    expect((await editor.post(path('teachers/import'), { rows: [{ fullName: 'X Y' }] })).statusCode).toBe(403);
    expect((await editor.get(path('teachers/export'))).statusCode).toBe(200);
  });
});

describe('tüm listeyi silme', () => {
  it('onay ister; silince nöbetleri de kaldırır ve sayıları bildirir', async () => {
    const list = (await owner.get(path('teachers'))).json() as { id: string }[];
    expectStatus(await owner.post(path('duties'), { weekday: 1, area: 'Bahçe', teacherId: list[0]!.id }), 201);
    expect((await owner.get(path('teachers/usage'))).json()).toMatchObject({ teachers: 4, duties: 1 });

    expect((await owner.post(path('teachers/delete-all'), {})).statusCode).toBe(400);
    const res = await owner.post(path('teachers/delete-all'), { confirm: 'delete-all' });
    expectStatus(res, 200);
    expect(res.json()).toMatchObject({ deleted: 4, duties: 1 });
    expect((await owner.get(path('teachers/usage'))).json()).toMatchObject({ teachers: 0, duties: 0 });
    // Branş listesi korunur
    expect((await owner.get(path('teacher-branches'))).json().length).toBeGreaterThan(20);
  });
});
