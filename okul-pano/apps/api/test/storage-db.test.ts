import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, createTestApp, expectStatus, login, multipartBody, PNG_1PX, SUPER, type TestCtx } from './helpers.ts';

/** Kalıcı diski olmayan ücretsiz barındırmalar için: görseller veritabanında (FILE_STORAGE=db) */
let t: TestCtx;
let schoolId: string;

beforeAll(async () => {
  t = await createTestApp({ FILE_STORAGE: 'db' });
  const root = client(t.app, (await login(t.app, SUPER.email, SUPER.password)).token);
  const res = await root.post('/api/platform/schools', {
    name: 'Bulut Okulu',
    slug: 'bulut-okulu',
    ownerEmail: 'mudur@bulut.local',
    ownerName: 'Müdür',
    ownerPassword: 'MudurBL123!',
  });
  expectStatus(res, 201);
  schoolId = res.json().id;
});

afterAll(async () => {
  await t.app.close();
  await t.database.close();
});

describe('veritabanında görsel saklama', () => {
  it('yüklenen görsel aynı adresten sunulur', async () => {
    const { token } = await login(t.app, 'mudur@bulut.local', 'MudurBL123!');
    const body = multipartBody('file', 'logo.png', PNG_1PX, 'image/png');
    const up = await t.app.inject({ method: 'POST', url: `/api/schools/${schoolId}/uploads`, headers: { authorization: `Bearer ${token}`, ...body.headers }, payload: body.payload });
    expectStatus(up, 201);
    const url = up.json().url as string;
    expect(url).toMatch(new RegExp(`^/uploads/${schoolId}/[0-9a-f-]{36}\\.png$`));

    const file = await t.app.inject({ method: 'GET', url });
    expectStatus(file, 200);
    expect(file.headers['content-type']).toBe('image/png');
    expect(file.headers['cache-control']).toContain('immutable');
    expect(Buffer.compare(file.rawPayload, PNG_1PX)).toBe(0);
  });

  it('olmayan ya da geçersiz adres 404', async () => {
    expectStatus(await t.app.inject({ method: 'GET', url: `/uploads/${schoolId}/00000000-0000-0000-0000-000000000000.png` }), 404);
    expectStatus(await t.app.inject({ method: 'GET', url: `/uploads/${schoolId}/../../etc/passwd` }), 404);
  });
});
