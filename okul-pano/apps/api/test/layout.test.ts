import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, createTestApp, expectStatus, login, SUPER, type TestCtx } from './helpers.ts';

let t: TestCtx;
let schoolId: string;
let owner: ReturnType<typeof client>;
const path = (p: string) => `/api/schools/${schoolId}/${p}`;

beforeAll(async () => {
  t = await createTestApp();
  const root = client(t.app, (await login(t.app, SUPER.email, SUPER.password)).token);
  const res = await root.post('/api/platform/schools', {
    name: 'Düzen Okulu',
    slug: 'duzen-okulu',
    ownerEmail: 'mudur@duzen.local',
    ownerName: 'Müdür',
    ownerPassword: 'MudurDZ123!',
  });
  expectStatus(res, 201);
  schoolId = res.json().id;
  owner = client(t.app, (await login(t.app, 'mudur@duzen.local', 'MudurDZ123!')).token);
});

afterAll(async () => {
  await t.app.close();
  await t.database.close();
});

const state = (token: string) =>
  t.app.inject({ method: 'GET', url: '/api/display/state', headers: { authorization: `Bearer ${token}` } }).then((r) => r.json());

describe('pano düzeni', () => {
  it('okul düzeni, eski göster/gizle ayarları ve panoya özel düzen', async () => {
    const created = await owner.post(path('screens'), { name: 'Kantin' });
    expectStatus(created, 201);
    const { screen, token } = created.json() as { screen: { id: string }; token: string };

    // Varsayılan
    expect((await state(token)).layout).toEqual({ left: ['exams', 'duties', 'leaves', 'birthdays'], right: ['bell', 'lessons'] });

    // Eski ayar: doğum günleri gizli -> düzende yok
    expectStatus(await owner.patch(`/api/schools/${schoolId}`, { settings: { showBirthdays: false } }), 200);
    expect((await state(token)).layout.left).toEqual(['exams', 'duties', 'leaves']);

    // Okul düzeni
    expectStatus(await owner.patch(`/api/schools/${schoolId}`, { settings: { layout: { left: ['bell', 'lessons'], right: ['duties', 'exams'] } } }), 200);
    expect((await state(token)).layout).toEqual({ left: ['bell', 'lessons'], right: ['duties', 'exams'] });

    // Panoya özel düzen okulun düzenini ezer; null ile okul düzenine döner
    expectStatus(await owner.put(path(`screens/${screen.id}`), { name: 'Kantin', layout: { left: [], right: ['bell'] } }), 200);
    expect((await state(token)).layout).toEqual({ left: [], right: ['bell'] });
    expectStatus(await owner.put(path(`screens/${screen.id}`), { name: 'Kantin', layout: null }), 200);
    expect((await state(token)).layout.left).toEqual(['bell', 'lessons']);

    // Aynı kart iki yerde olamaz
    expect((await owner.put(path(`screens/${screen.id}`), { name: 'Kantin', layout: { left: ['bell'], right: ['bell'] } })).statusCode).toBe(400);
  });
});
