import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PdfItem } from '../src/lib/sheets/eokul.ts';
import { parseClassListPage, studentDisplayName } from '../src/lib/sheets/eokulStudents.ts';
import { client, createTestApp, expectStatus, login, SUPER, type TestCtx } from './helpers.ts';

/*
 * e-Okul sınıf listesi PDF'i: sayfanın metin parçaları elle kurulur. Gerçek bir okulun listesi depoya konmaz
 * (öğrenci adları ve doğum tarihleri kişisel veri).
 */
const COLS = [22, 64, 136, 252, 378, 443, 530];
const HEAD = ['S.No', 'Öğrenci No', 'Adı', 'Soyadı', 'Cinsiyeti', 'Doğum Tarihi', 'Yaşı'];
function page(header: string, teacher: string, rows: [number, string, string, string, string][]): PdfItem[] {
  const items: PdfItem[] = [
    { str: 'T.C.', x: 293, y: 810, w: 20, bold: true },
    // Başlık PDF'teki gibi harf gruplarına bölünmüş gelir
    ...header.split(/(?<=ı)/).reduce<PdfItem[]>((acc, part) => {
      const x = acc.length ? acc[acc.length - 1]!.x + acc[acc.length - 1]!.w : 157;
      return [...acc, { str: part, x, y: 770, w: part.length * 4, bold: false }];
    }, []),
    { str: `Sınıf Öğretmeni: ${teacher}`, x: 24, y: 741, w: 120, bold: false },
    { str: 'Sınıf Başkanı:', x: 305, y: 741, w: 40, bold: false },
    ...HEAD.map((h, i) => ({ str: h, x: COLS[i]!, y: 706, w: h.length * 5, bold: true })),
  ];
  rows.forEach(([seq, no, first, last, birth], i) => {
    const y = 693 - i * 12;
    const cells = [String(seq), no, first, last, 'Erkek', birth, '14'];
    cells.forEach((c, j) => items.push({ str: c, x: COLS[j]! + (j === 0 ? 12 : 4), y, w: c.length * 5, bold: false }));
  });
  items.push({ str: '02/11/2026', x: 580, y: 40, w: 40, bold: false });
  return items;
}

describe('e-Okul sınıf listesi', () => {
  it('sınıf adı (program önekiyle), sınıf öğretmeni, S.No, okul no, ad soyad, doğum tarihi', () => {
    const r = parseClassListPage(
      page('AMP - 9. Sınıf / A Şubesi (MAKİNE VE TASARIM TEKNOLOJİSİ ALANI) Sınıf Listesi', 'AYŞE KAYA', [
        [1, '47', 'ALİ CAN', 'DEMİR', '14/06/2012'],
        [2, '187', 'İSMAİL', 'ŞAHİN', '27/12/2012'],
      ]),
      1,
    )!;
    expect(r.className).toBe('AMP 9-A');
    expect(r.teacher).toBe('AYŞE KAYA');
    expect(r.students).toEqual([
      { listNo: 1, schoolNo: '47', fullName: 'Ali Can DEMİR', birthDate: '2012-06-14', className: 'AMP 9-A', page: 1 },
      { listNo: 2, schoolNo: '187', fullName: 'İsmail ŞAHİN', birthDate: '2012-12-27', className: 'AMP 9-A', page: 1 },
    ]);
  });

  it('özel eğitim ve akademik destek başlıkları; öneksiz başlık', () => {
    const rows: [number, string, string, string, string][] = [[1, '5', 'EMRE', 'KOÇ', '01/01/2011']];
    expect(parseClassListPage(page('AMP - 10. Sınıf-Otistik Hafif / OŞubesi (HAFİF OTİSTİK ENGELLİLER) Sınıf Listesi', '', rows), 1)!.className).toBe('AMP 10-O');
    expect(parseClassListPage(page('ATP - 12. Akademik Destek (Sayısal) / AŞubesi (ELEKTRİK) Sınıf Listesi', '', rows), 1)!.className).toBe('ATP 12-A');
    expect(parseClassListPage(page('5. Sınıf / B Şubesi Sınıf Listesi', '', rows), 1)!.className).toBe('5-B');
    expect(parseClassListPage(page('AMP - 9. Sınıf / F Şubesi Sınıf Listesi', '', rows), 1)!.teacher).toBeNull();
  });

  it('ad yazımı', () => {
    expect(studentDisplayName('MUHAMMET EMİR', 'ŞANALAN')).toBe('Muhammet Emir ŞANALAN');
  });
});

describe('öğrenci içe aktarma: sıra no', () => {
  let t: TestCtx;
  let base: string;
  let owner: ReturnType<typeof client>;
  beforeAll(async () => {
    t = await createTestApp();
    const root = client(t.app, (await login(t.app, SUPER.email, SUPER.password)).token);
    const res = await root.post('/api/platform/schools', { name: 'Liste Lisesi', slug: 'liste-lisesi', ownerEmail: 'mudur@liste.test', ownerName: 'Müdür', ownerPassword: 'MudurSifre42' });
    expectStatus(res, 201);
    base = `/api/schools/${res.json().id}`;
    owner = client(t.app, (await login(t.app, 'mudur@liste.test', 'MudurSifre42')).token);
  });
  afterAll(async () => {
    await t.app.close();
    await t.database.close();
  });

  it('S.No kaydedilir ve sınıf değişince güncellenir', async () => {
    const row = { schoolNo: '47', fullName: 'Ali Can DEMİR', className: 'AMP 9-A', birthDate: '2012-06-14', listNo: 3 };
    expect((await owner.post(`${base}/students/import`, { rows: [row] })).json()).toMatchObject({ created: 1, classesCreated: 1 });
    let list = (await owner.get(`${base}/students`)).json() as { listNo: number | null }[];
    expect(list[0]!.listNo).toBe(3);
    expect((await owner.post(`${base}/students/import`, { rows: [{ ...row, className: 'AMP 10-A', listNo: 7 }], updateExisting: true })).json()).toMatchObject({ updated: 1 });
    list = (await owner.get(`${base}/students`)).json() as { listNo: number | null }[];
    expect(list[0]!.listNo).toBe(7);
  });
});
