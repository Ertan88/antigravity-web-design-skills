import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, createTestApp, expectStatus, login, SUPER, type TestCtx } from './helpers.ts';

/* Yönetici atamayı yalnızca müdür yapar; yönetici "Yönetici yapılsın" önerisi gönderir, müdür onaylar */

let t: TestCtx;
let schoolId: string;
let owner: ReturnType<typeof client>;
const path = (p: string) => `/api/schools/${schoolId}/${p}`;

beforeAll(async () => {
  t = await createTestApp({ SMTP_HOST: 'json' });
  const root = client(t.app, (await login(t.app, SUPER.email, SUPER.password)).token);
  const res = await root.post('/api/platform/schools', { name: 'Öneri Okulu', slug: 'oneri-okulu', ownerEmail: 'mudur@oneri.local', ownerName: 'Müdür', ownerPassword: 'MudurSF123!' });
  expectStatus(res, 201);
  schoolId = res.json().id;
  owner = client(t.app, (await login(t.app, 'mudur@oneri.local', 'MudurSF123!')).token);
});

afterAll(async () => {
  await t.app.close();
  await t.database.close();
});

describe('yönetici önerisi', () => {
  it('yönetici önerir, müdür onaylar; yönetici doğrudan Yönetici yapamaz; müdür reddedebilir', async () => {
    expectStatus(await owner.post(path('members'), { email: 'yonetici@oneri.local', fullName: 'Yönetici Kişi', password: 'YoneticiSifre42', role: 'admin', permissions: [] }), 201);
    expectStatus(await owner.post(path('members'), { email: 'editor1@oneri.local', fullName: 'Editör Bir', password: 'EditorSifre42', role: 'editor', permissions: [] }), 201);
    expectStatus(await owner.post(path('members'), { email: 'editor2@oneri.local', fullName: 'Editör İki', password: 'EditorSifre42', role: 'editor', permissions: [] }), 201);
    const admin = client(t.app, (await login(t.app, 'yonetici@oneri.local', 'YoneticiSifre42')).token);
    type M = { id: string; email: string; role: string; promotionRequest: { byName: string } | null };
    const list = async () => (await owner.get(path('members'))).json() as M[];
    const e1 = (await list()).find((m) => m.email === 'editor1@oneri.local')!;
    const e2 = (await list()).find((m) => m.email === 'editor2@oneri.local')!;

    expect((await admin.patch(path(`members/${e1.id}`), { role: 'admin', permissions: [] })).statusCode).toBe(403);
    expectStatus(await admin.post(path(`members/${e1.id}/promotion-request`), {}), 200);
    expect((await admin.post(path(`members/${e1.id}/promotion-request`), {})).statusCode).toBe(409);
    expect((await list()).find((m) => m.id === e1.id)?.promotionRequest?.byName).toBe('Yönetici Kişi');
    // Onayı yalnızca müdür verir
    expect((await admin.post(path(`members/${e1.id}/promotion-request/approve`), {})).statusCode).toBe(403);
    expectStatus(await owner.post(path(`members/${e1.id}/promotion-request/approve`), {}), 200);
    expect((await list()).find((m) => m.id === e1.id)).toMatchObject({ role: 'admin', promotionRequest: null });

    expectStatus(await admin.post(path(`members/${e2.id}/promotion-request`), {}), 200);
    expectStatus(await owner.del(path(`members/${e2.id}/promotion-request`)), 204);
    expect((await list()).find((m) => m.id === e2.id)).toMatchObject({ role: 'editor', promotionRequest: null });
  });
});
