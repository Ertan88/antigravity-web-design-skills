import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, createTestApp, expectStatus, login, SUPER, type TestCtx } from './helpers.ts';

/** KVKK: aydınlatma metni, verileri dışa aktarma, okulu bütün verileriyle silme */
let t: TestCtx;
let root: ReturnType<typeof client>;
let owner: ReturnType<typeof client>;
let editor: ReturnType<typeof client>;
let schoolId: string;
let otherSchoolId: string;
const path = (p: string) => `/api/schools/${schoolId}/${p}`;

async function createSchool(slug: string, ownerEmail: string) {
  const res = await root.post('/api/platform/schools', { name: `${slug} Lisesi`, slug, ownerEmail, ownerName: 'Müdür', ownerPassword: 'MudurKV123!' });
  expectStatus(res, 201);
  return res.json().id as string;
}

beforeAll(async () => {
  t = await createTestApp({ DATA_REGION: 'Türkiye' });
  root = client(t.app, (await login(t.app, SUPER.email, SUPER.password)).token);
  schoolId = await createSchool('kvkk-okulu', 'mudur@kvkk.local');
  otherSchoolId = await createSchool('diger-okul', 'mudur@diger.local');
  owner = client(t.app, (await login(t.app, 'mudur@kvkk.local', 'MudurKV123!')).token);
  expectStatus(await owner.post(path('members'), { email: 'editor@kvkk.local', fullName: 'Editör', password: 'EditorKV123!', role: 'editor', permissions: ['announcements.manage'] }), 201);
  editor = client(t.app, (await login(t.app, 'editor@kvkk.local', 'EditorKV123!')).token);
  // Editör başka bir okulda da çalışıyor: o okul silinse de hesabı kalmalı
  const other = client(t.app, (await login(t.app, 'mudur@diger.local', 'MudurKV123!')).token);
  expectStatus(await other.post(`/api/schools/${otherSchoolId}/members`, { email: 'editor@kvkk.local', fullName: 'Editör', role: 'editor', permissions: [] }), 201);
  expectStatus(await owner.post(path('teachers'), { fullName: 'Ayşe Demir' }), 201);
});

afterAll(async () => {
  await t.app.close();
  await t.database.close();
});

describe('aydınlatma metni', () => {
  it('şablon okulun adını ve verinin saklandığı yeri içerir', async () => {
    const res = await owner.get(path('privacy-template'));
    expectStatus(res, 200);
    expect(res.json().text).toContain('kvkk-okulu Lisesi');
    expect(res.json().text).toContain('Türkiye sunucularında');
    expectStatus(await editor.get(path('privacy-template')), 403);
  });

  it('yayınlanan metin herkese açık sayfada görünür, HTML kaçışlıdır', async () => {
    expectStatus(await t.app.inject({ method: 'GET', url: '/aydinlatma/kvkk-okulu' }), 404);
    const notice = '# Başlık\nVeri sorumlusu okulumuzdur <script>alert(1)</script>\n- madde bir';
    expectStatus(await owner.patch(`/api/schools/${schoolId}`, { settings: { privacyNotice: notice } }), 200);
    const page = await t.app.inject({ method: 'GET', url: '/aydinlatma/kvkk-okulu' });
    expectStatus(page, 200);
    expect(page.headers['content-type']).toContain('text/html');
    expect(page.body).toContain('<h2>Başlık</h2>');
    expect(page.body).toContain('<li>madde bir</li>');
    expect(page.body).toContain('&lt;script&gt;');
    expect(page.body).not.toContain('<script>');
    expectStatus(await t.app.inject({ method: 'GET', url: '/aydinlatma/olmayan-okul' }), 404);
  });
});

describe('verileri dışa aktarma', () => {
  it('okul sahibi bütün verileri indirir; şifre ve anahtar özetleri yoktur', async () => {
    const res = await owner.get(path('export'));
    expectStatus(res, 200);
    expect(res.headers['content-disposition']).toContain('okul-pano-kvkk-okulu');
    const data = res.json();
    expect(data.okul.slug).toBe('kvkk-okulu');
    expect(data.ogretmenler.map((x: { fullName: string }) => x.fullName)).toEqual(['Ayşe Demir']);
    expect(data.kullanicilar.map((u: { email: string }) => u.email).sort()).toEqual(['editor@kvkk.local', 'mudur@kvkk.local']);
    expect(res.body).not.toMatch(/passwordHash|tokenHash|password_hash/);
  });

  it('okul sahibi olmayan indiremez', async () => {
    expectStatus(await editor.get(path('export')), 403);
  });
});

describe('okulu silme', () => {
  it('yalnızca platform yöneticisi, kısa ad yazılarak', async () => {
    expectStatus(await owner.del(`/api/platform/schools/${schoolId}`, { confirmSlug: 'kvkk-okulu' }), 403);
    expectStatus(await root.del(`/api/platform/schools/${schoolId}`, { confirmSlug: 'yanlis' }), 400);
  });

  it('okul ve verileri silinir; başka okulu olmayan hesaplar da silinir', async () => {
    const res = await root.del(`/api/platform/schools/${schoolId}`, { confirmSlug: 'kvkk-okulu' });
    expectStatus(res, 200);
    expect(res.json().removedUsers).toBe(1);
    const list = (await root.get('/api/platform/schools')).json() as { id: string }[];
    expect(list.map((s) => s.id)).not.toContain(schoolId);
    // Okul sahibinin hesabı silindi; editör diğer okulda çalıştığı için hesabı duruyor
    expectStatus(await t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'mudur@kvkk.local', password: 'MudurKV123!' } }), 401);
    const ed = await login(t.app, 'editor@kvkk.local', 'EditorKV123!');
    const me = (await client(t.app, ed.token).get('/api/me')).json();
    expect(me.schools.map((s: { id: string }) => s.id)).toEqual([otherSchoolId]);
  });
});
