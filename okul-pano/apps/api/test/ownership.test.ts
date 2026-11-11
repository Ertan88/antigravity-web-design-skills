import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, createTestApp, expectStatus, login, SUPER, type TestCtx } from './helpers.ts';

/* Okul müdürlüğü devri: müdürün kendisi ya da platform yöneticisi; okulda her zaman tek müdür kalır */

let t: TestCtx;
let root: ReturnType<typeof client>;
let base: string;
let schoolId: string;

beforeAll(async () => {
  t = await createTestApp({ SMTP_HOST: 'json' });
  root = client(t.app, (await login(t.app, SUPER.email, SUPER.password)).token);
  const res = await root.post('/api/platform/schools', { name: 'Devir Lisesi', slug: 'devir-lisesi', ownerEmail: 'eski@devir.test', ownerName: 'Eski Müdür', ownerPassword: 'EskiSifre42' });
  expectStatus(res, 201);
  schoolId = res.json().id;
  base = `/api/schools/${schoolId}`;
});
afterAll(async () => {
  await t.app.close();
  await t.database.close();
});

type Member = { id: string; email: string; role: string };
const members = async (c: ReturnType<typeof client>) => (await c.get(`${base}/members`)).json() as Member[];

describe('müdürlük devri', () => {
  it('müdür okuldaki bir yöneticiye devreder ve yönetici olarak kalır', async () => {
    const eski = client(t.app, (await login(t.app, 'eski@devir.test', 'EskiSifre42')).token);
    expectStatus(await eski.post(`${base}/members`, { email: 'yeni@devir.test', fullName: 'Yeni Müdür', password: 'YeniSifre42', role: 'admin', permissions: [] }), 201);
    const yeni = (await members(eski)).find((m) => m.email === 'yeni@devir.test')!;
    // Yönetici devredemez
    const yeniC = client(t.app, (await login(t.app, 'yeni@devir.test', 'YeniSifre42')).token);
    expectStatus(await yeniC.post(`${base}/transfer-ownership`, { memberId: yeni.id }), 403);
    const res = await eski.post(`${base}/transfer-ownership`, { memberId: yeni.id, keep: 'admin' });
    expectStatus(res, 200);
    expect(res.json().invite).toBeNull();
    const list = await members(yeniC);
    expect(list.filter((m) => m.role === 'owner').map((m) => m.email)).toEqual(['yeni@devir.test']);
    expect(list.find((m) => m.email === 'eski@devir.test')?.role).toBe('admin');
  });

  it('platform yöneticisi müdürü e-postayla değiştirir; eski müdür okuldan çıkar, hesabı silinir; yeni kişiye davet gider', async () => {
    const res = await root.put(`/api/platform/schools/${schoolId}/owner`, { email: 'Ucuncu@Devir.test', fullName: 'Üçüncü Müdür', keep: 'leave' });
    expectStatus(res, 200);
    expect(res.json().invite.inviteUrl).toContain('/admin/davet?token=');
    const list = (await root.get('/api/platform/schools')).json() as { id: string; owner: { email: string } | null }[];
    expect(list.find((s) => s.id === schoolId)?.owner?.email).toBe('ucuncu@devir.test');
    // Eski müdür (yeni@) başka okulda kaydı olmadığı için hesabıyla birlikte silindi
    expect((await t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'yeni@devir.test', password: 'YeniSifre42' } })).statusCode).toBe(401);
    // Platformdan listeden seçim yapılamaz (kullanıcı listesi KVKK gereği kapalı)
    expectStatus(await root.put(`/api/platform/schools/${schoolId}/owner`, { memberId: '00000000-0000-4000-8000-000000000000' }), 400);
  });
});
