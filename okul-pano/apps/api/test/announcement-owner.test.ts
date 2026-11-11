import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, createTestApp, expectStatus, login, SUPER, type TestCtx } from './helpers.ts';

/* Başkasının duyurusunu yalnızca onay yetkisi olan değiştirir (sentetik okul) */
let t: TestCtx;
let a: ReturnType<typeof client>;
let b: ReturnType<typeof client>;
let approver: ReturnType<typeof client>;
let schoolId: string;
const path = (p = '') => `/api/schools/${schoolId}/announcements${p}`;
const body = (title: string) => ({ kind: 'text', title, body: 'Örnek metin' });

beforeAll(async () => {
  t = await createTestApp();
  const root = client(t.app, (await login(t.app, SUPER.email, SUPER.password)).token);
  const res = await root.post('/api/platform/schools', { name: 'Duyuru Okulu', slug: 'duyuru-okulu', ownerEmail: 'mudur@duyuru.test', ownerName: 'Müdür', ownerPassword: 'MudurDY123!' });
  expectStatus(res, 201);
  schoolId = res.json().id;
  const owner = client(t.app, (await login(t.app, 'mudur@duyuru.test', 'MudurDY123!')).token);
  const member = async (email: string, permissions: string[]) => {
    expectStatus(await owner.post(`/api/schools/${schoolId}/members`, { email, fullName: `Örnek ${email.split('@')[0]}`, password: 'GizliSifre42', role: 'editor', permissions }), 201);
    return client(t.app, (await login(t.app, email, 'GizliSifre42')).token);
  };
  a = await member('a@duyuru.test', ['announcements.manage']);
  b = await member('b@duyuru.test', ['announcements.manage']);
  approver = await member('onay@duyuru.test', ['announcements.manage', 'announcements.approve']);
});

afterAll(async () => {
  await t.app.close();
  await t.database.close();
});

describe('başkasının duyurusu', () => {
  it('yetkili başkasının duyurusunu görür ama değiştiremez; kendi duyurusunu ve onaylayıcı her duyuruyu değiştirir', async () => {
    const created = await a.post(path(), body('A duyurusu'));
    expectStatus(created, 201);
    const id = created.json().id as string;
    // B listede görür
    expect(((await b.get(path())).json() as { id: string }[]).map((x) => x.id)).toContain(id);
    // B değiştiremez, yayından kaldıramaz, silemez
    expect((await b.put(path(`/${id}`), body('Değişti'))).statusCode).toBe(403);
    expect((await b.patch(path(`/${id}`), { isActive: false })).statusCode).toBe(403);
    expect((await b.del(path(`/${id}`))).statusCode).toBe(403);
    expect((await b.post(path('/bulk-delete'), { ids: [id] })).json()).toEqual({ deleted: 0 });
    // A kendi duyurusunu değiştirir
    expectStatus(await a.put(path(`/${id}`), body('A duyurusu (güncel)')), 200);
    // Onaylayıcı her duyuruyu yayından kaldırır ve siler
    expectStatus(await approver.patch(path(`/${id}`), { isActive: false }), 200);
    expect((await approver.del(path(`/${id}`))).statusCode).toBe(204);
  });
});
