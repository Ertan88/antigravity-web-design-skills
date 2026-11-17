import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { memberships } from '../src/db/schema.ts';
import { client, createTestApp, expectStatus, login, SUPER, type TestCtx } from './helpers.ts';

/*
 * Müdür ve müdür yardımcısı da öğretmendir: hesap, kadrodaki kaydıyla kendiliğinden bağlanır (kişi kendisi bağlayamaz).
 * "Rol ve görev verir" yetkisi: yalnızca kendisindeki görevleri, yalnızca öğretmen / rehber / editörlere verir.
 */

let t: TestCtx;
let schoolId: string;
let owner: ReturnType<typeof client>;
const path = (p: string) => `/api/schools/${schoolId}/${p}`;
const teacherOf = async (memberId: string) => (await t.database.db.select().from(memberships).where(eq(memberships.id, memberId)))[0]!.teacherId;

beforeAll(async () => {
  t = await createTestApp();
  const root = client(t.app, (await login(t.app, SUPER.email, SUPER.password)).token);
  const res = await root.post('/api/platform/schools', { name: 'Bağ Lisesi', slug: 'bag-lisesi', ownerEmail: 'mudur@bag.test', ownerName: 'Kemal Öz', ownerPassword: 'MudurSifre42' });
  expectStatus(res, 201);
  schoolId = res.json().id;
  owner = client(t.app, (await login(t.app, 'mudur@bag.test', 'MudurSifre42')).token);
});
afterAll(async () => {
  await t.app.close();
  await t.database.close();
});

describe('kadrodaki öğretmen kaydıyla kendiliğinden bağlama', () => {
  it('müdür yardımcısı hesabı, adı kadroda tek kayıtla eşleşince bağlanır; kadro sonradan yüklenince de bağlanır', async () => {
    const ayse = (await owner.post(path('teachers'), { fullName: 'Ayşe YILMAZ' })).json().id as string;
    const created = await owner.post(path('members'), { email: 'ayse@bag.test', fullName: 'Ayşe  Yılmaz', password: 'AyseSifre42', role: 'admin', permissions: [] });
    expectStatus(created, 201);
    expect(await teacherOf(created.json().id)).toBe(ayse);

    // Hesap önce açılır, kadro sonra yüklenir: müdürün kendisi de bağlanır
    const ownerMember = ((await owner.get(path('members'))).json() as { id: string; role: string }[]).find((m) => m.role === 'owner')!;
    expect(await teacherOf(ownerMember.id)).toBeNull();
    const kemal = (await owner.post(path('teachers'), { fullName: 'Kemal ÖZ' })).json().id as string;
    expect(await teacherOf(ownerMember.id)).toBe(kemal);
  });

  it('kadroda aynı adda iki kayıt varsa bağlanmaz; yetkilinin kaldırdığı bağ yeniden kurulmaz', async () => {
    await owner.post(path('teachers'), { fullName: 'Ali Koç' });
    await owner.post(path('teachers'), { fullName: 'ALİ KOÇ' });
    const ali = await owner.post(path('members'), { email: 'ali@bag.test', fullName: 'Ali Koç', password: 'AliSifre4242', role: 'editor', permissions: [] });
    expect(await teacherOf(ali.json().id)).toBeNull();

    const zeynep = (await owner.post(path('teachers'), { fullName: 'Zeynep Demir' })).json().id as string;
    const z = await owner.post(path('members'), { email: 'zeynep@bag.test', fullName: 'Zeynep Demir', password: 'ZeynepSifre42', role: 'editor', permissions: [] });
    expect(await teacherOf(z.json().id)).toBe(zeynep);
    expectStatus(await owner.put(path(`members/${z.json().id}/teacher`), { teacherId: null }), 200);
    await owner.post(path('teachers'), { fullName: 'Can Er' });
    expect(await teacherOf(z.json().id)).toBeNull();
  });
});

describe('Rol ve görev verir yetkisi', () => {
  it('yalnızca kendisindeki görevleri verir; müdür yardımcısına, kendine ve bu yetkiye dokunamaz', async () => {
    const giver = await owner.post(path('members'), {
      email: 'veren@bag.test',
      fullName: 'Veren Kişi',
      password: 'VerenSifre42',
      role: 'editor',
      permissions: ['roles.assign', 'announcements.manage', 'ticker.manage'],
    });
    expectStatus(giver, 201);
    const target = await owner.post(path('members'), { email: 'hedef@bag.test', fullName: 'Hedef Kişi', password: 'HedefSifre42', role: 'editor', permissions: ['exams.manage'] });
    const g = client(t.app, (await login(t.app, 'veren@bag.test', 'VerenSifre42')).token);

    const list = await g.get(path('members'));
    expectStatus(list, 200);
    const admin = (list.json() as { id: string; role: string }[]).find((m) => m.role === 'admin')!;

    // Kendinde olan görevi verir; olmayanı (ayarlar) ve bu yetkiyi veremez; hedefin başka görevi (sınavlar) korunur
    expectStatus(await g.patch(path(`members/${target.json().id}`), { permissions: ['announcements.manage', 'settings.manage', 'roles.assign', 'conduct.counsel'] }), 200);
    const after = (await t.database.db.select().from(memberships).where(eq(memberships.id, target.json().id)))[0]!.permissions;
    expect([...after].sort()).toEqual(['announcements.manage', 'conduct.counsel', 'exams.manage']);

    expect((await g.patch(path(`members/${admin.id}`), { permissions: [] })).statusCode).toBe(403);
    expect((await g.patch(path(`members/${target.json().id}`), { role: 'admin' })).statusCode).toBe(403);
    expect((await g.patch(path(`members/${giver.json().id}`), { permissions: ['settings.manage'] })).statusCode).toBe(403);
    // Hesap açamaz, şifre sıfırlayamaz
    expect((await g.post(path('members'), { email: 'yeni@bag.test', fullName: 'Yeni', password: 'YeniSifre4242', role: 'editor', permissions: [] })).statusCode).toBe(403);
    expect((await g.post(path(`members/${target.json().id}/password`), {})).statusCode).toBe(403);
  });
});
