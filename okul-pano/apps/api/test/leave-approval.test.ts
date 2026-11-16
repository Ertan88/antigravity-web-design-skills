import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, createTestApp, expectStatus, login, SUPER, type TestCtx } from './helpers.ts';

/* İzin bildirimi: kişi kendi iznini onaylamaz; onaylayacak başka yetkili varsa onaya düşer ve bildirim kutusuna yazılır */

let t: TestCtx;
let schoolId = '';
const path = (p: string) => `/api/schools/${schoolId}/${p}`;
let owner: ReturnType<typeof client>;
let deputy: ReturnType<typeof client>;
const teacherIds: Record<string, string> = {};
const later = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  t = await createTestApp({ PUSH_URL: 'memory' });
  const root = client(t.app, (await login(t.app, SUPER.email, SUPER.password)).token);
  const res = await root.post('/api/platform/schools', { name: 'İzin Okulu', slug: 'izin-okulu', ownerEmail: 'mudur@izin.local', ownerName: 'Müdür', ownerPassword: 'MudurIZ123!' });
  expectStatus(res, 201);
  schoolId = res.json().id;
  owner = client(t.app, (await login(t.app, 'mudur@izin.local', 'MudurIZ123!')).token);
  for (const name of ['Okul Müdürü', 'Veli Yardımcı']) {
    const r = await owner.post(path('teachers'), { fullName: name });
    expectStatus(r, 201);
    teacherIds[name] = r.json().id;
  }
  const members = (await owner.get(path('members'))).json() as { id: string; email: string }[];
  const me = members.find((m) => m.email === 'mudur@izin.local')!;
  expectStatus(await owner.put(path(`members/${me.id}/teacher`), { teacherId: teacherIds['Okul Müdürü'] }), 200);
});
afterAll(async () => {
  await t.app.close();
  await t.database.close();
});

describe('kendi izni', () => {
  it('onaylayacak başka yetkili yoksa yöneticinin izni doğrudan geçerli olur', async () => {
    const r = await owner.post(path('me/leaves'), { startDate: later(5), endDate: later(5) });
    expectStatus(r, 201);
    expect(r.json().approvalStatus).toBe('approved');
  });

  it('müdür yardımcısı varken müdürün kendi izni onaya düşer ve yardımcının bildirim kutusuna yazılır', async () => {
    expectStatus(await owner.post(path('members'), { email: 'yrd@izin.local', fullName: 'Veli Yardımcı', password: 'Yardimci123!', role: 'admin', teacherId: teacherIds['Veli Yardımcı'] }), 201);
    deputy = client(t.app, (await login(t.app, 'yrd@izin.local', 'Yardimci123!')).token);
    const r = await owner.post(path('me/leaves'), { startDate: later(7), endDate: later(8) });
    expectStatus(r, 201);
    expect(r.json().approvalStatus).toBe('pending');
    const notes = (await deputy.get(path('notifications'))).json() as { kind: string }[];
    expect(notes.map((n) => n.kind)).toContain('leave-request');
    // Müdür kendi bildirimini almaz
    const mine = (await owner.get(path('notifications'))).json() as { kind: string }[];
    expect(mine.map((n) => n.kind)).not.toContain('leave-request');
    // Kendi iznini onaylayamaz; yardımcı onaylar
    expectStatus(await owner.post(path(`leaves/${r.json().id}/approve`), {}), 403);
    expectStatus(await deputy.post(path(`leaves/${r.json().id}/approve`), {}), 200);
  });

  it('görev dağılımında izinlerin sorumlusu seçilince yalnızca ona görünür', async () => {
    expectStatus(await owner.post(path('members'), { email: 'yrd2@izin.local', fullName: 'İkinci Yardımcı', password: 'Yardimci123!', role: 'admin' }), 201);
    const second = client(t.app, (await login(t.app, 'yrd2@izin.local', 'Yardimci123!')).token);
    const members = (await owner.get(path('members'))).json() as { id: string; email: string; userId: string }[];
    const yrd2 = members.find((m) => m.email === 'yrd2@izin.local')!;
    expectStatus(await owner.patch(`/api/schools/${schoolId}`, { settings: { responsibilities: { leaves: [yrd2.userId] } } }), 200);
    const r = await owner.post(path('me/leaves'), { startDate: later(20), endDate: later(20) });
    expectStatus(r, 201);
    const kinds = async (c: ReturnType<typeof client>) => ((await c.get(path('notifications'))).json() as { kind: string; key: string }[]).filter((n) => n.key === `leave-request:${r.json().id}`).length;
    expect(await kinds(second)).toBe(1);
    expect(await kinds(deputy)).toBe(0);
  });
});
