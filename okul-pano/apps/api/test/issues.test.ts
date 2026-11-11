import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sentPushes } from '../src/lib/push.ts';
import { client, createTestApp, expectStatus, login, SUPER, type TestCtx } from './helpers.ts';

/* Okul sorunları (öğretmen → idare) ve destek talepleri (müdür / yönetici → platform) */

let t: TestCtx;
let root: ReturnType<typeof client>;
let owner: ReturnType<typeof client>;
let vp: ReturnType<typeof client>;
let teacher: ReturnType<typeof client>;
let base: string;
let vpId: string;
const TOK = { owner: 'ExponentPushToken[mudur]', vp: 'ExponentPushToken[mdy]', teacher: 'ExponentPushToken[ogretmen]', root: 'ExponentPushToken[platform]' };
const to = (tok: string) => sentPushes.filter((p) => p.to.includes(tok));

beforeAll(async () => {
  t = await createTestApp({ PUSH_URL: 'memory' });
  root = client(t.app, (await login(t.app, SUPER.email, SUPER.password)).token);
  expectStatus(await root.post('/api/me/push-tokens', { token: TOK.root, platform: 'android' }), 204);
  const res = await root.post('/api/platform/schools', { name: 'Sorun Lisesi', slug: 'sorun-lisesi', ownerEmail: 'mudur@sorun.test', ownerName: 'Müdür Bey', ownerPassword: 'MudurSifre42' });
  base = `/api/schools/${res.json().id}`;
  owner = client(t.app, (await login(t.app, 'mudur@sorun.test', 'MudurSifre42')).token);
  expectStatus(await owner.post('/api/me/push-tokens', { token: TOK.owner, platform: 'android' }), 204);
  expectStatus(await owner.post(`${base}/members`, { email: 'mdy@sorun.test', fullName: 'Müdür Yardımcısı', password: 'GizliSifre42', role: 'admin', permissions: [] }), 201);
  expectStatus(await owner.post(`${base}/members`, { email: 'ogr@sorun.test', fullName: 'Ayşe Öğretmen', password: 'GizliSifre42', role: 'editor', permissions: [] }), 201);
  vp = client(t.app, (await login(t.app, 'mdy@sorun.test', 'GizliSifre42')).token);
  teacher = client(t.app, (await login(t.app, 'ogr@sorun.test', 'GizliSifre42')).token);
  expectStatus(await vp.post('/api/me/push-tokens', { token: TOK.vp, platform: 'android' }), 204);
  expectStatus(await teacher.post('/api/me/push-tokens', { token: TOK.teacher, platform: 'android' }), 204);
  vpId = (await vp.get('/api/me')).json().user.id;
});

afterAll(async () => {
  await t.app.close();
  await t.database.close();
});

describe('okul sorunları', () => {
  let issueId: string;
  it('öğretmen bildirir; sorumlu yoksa bütün idarecilere gider', async () => {
    sentPushes.length = 0;
    const res = await teacher.post(`${base}/issues`, { category: 'heating', location: '2. kat koridor', description: 'Kalorifer peteği soğuk', urgent: true });
    expectStatus(res, 201);
    issueId = res.json().id;
    expect(res.json()).toMatchObject({ status: 'new', mine: true, reporterName: 'Ayşe Öğretmen' });
    expect(to(TOK.owner)).toHaveLength(1);
    expect(to(TOK.vp)).toHaveLength(1);
    expect(to(TOK.owner)[0]!.message.title).toContain('ACİL');
    const inbox = (await owner.get(`${base}/inbox`)).json();
    expect(JSON.stringify(inbox)).toContain('Yeni sorun');
  });

  it('kategori sorumlusu seçiliyse yalnızca ona gider', async () => {
    expectStatus(await owner.patch(base, { settings: { issueOwners: { cleaning: vpId } } }), 200);
    sentPushes.length = 0;
    expectStatus(await teacher.post(`${base}/issues`, { category: 'cleaning', location: 'Kantin', description: 'Zemin ıslak' }), 201);
    expect(to(TOK.vp)).toHaveLength(1);
    expect(to(TOK.owner)).toHaveLength(0);
  });

  it('öğretmen yalnızca kendi bildirimlerini görür, bütün listeyi göremez', async () => {
    expect((await teacher.get(`${base}/issues?scope=all`)).statusCode).toBe(403);
    expect((await teacher.get(`${base}/issues`)).json()).toHaveLength(2);
    expect((await owner.get(`${base}/issues?scope=all`)).json()).toHaveLength(2);
    expect((await teacher.patch(`${base}/issues/${issueId}`, { status: 'resolved' })).statusCode).toBe(403);
  });

  it('idare işleme alır ve yanıtlar; öğretmene her adımda bildirim gider', async () => {
    sentPushes.length = 0;
    const up = await owner.patch(`${base}/issues/${issueId}`, { status: 'in_progress', assigneeUserId: vpId });
    expectStatus(up, 200);
    expect(up.json()).toMatchObject({ status: 'in_progress', assigneeName: 'Müdür Yardımcısı' });
    expect(to(TOK.teacher)[0]!.message.title).toBe('Bildiriminiz işleme alındı');
    expect(to(TOK.vp)[0]!.message.title).toBe('Size bir sorun atandı');
    sentPushes.length = 0;
    expectStatus(await vp.post(`${base}/issues/${issueId}/messages`, { body: 'Kaloriferci öğleden sonra bakacak.' }), 201);
    expect(to(TOK.teacher)).toHaveLength(1);
    sentPushes.length = 0;
    expectStatus(await teacher.post(`${base}/issues/${issueId}/messages`, { body: 'Teşekkürler' }), 201);
    expect(to(TOK.vp)).toHaveLength(1);
    const detail = (await teacher.get(`${base}/issues/${issueId}`)).json();
    expect(detail.messages.filter((m: { system: boolean }) => !m.system)).toHaveLength(2);
    expect((await owner.patch(`${base}/issues/${issueId}`, { status: 'resolved' })).json().resolvedAt).toBeTruthy();
  });
});

describe('destek talepleri', () => {
  let ticketId: string;
  it('yalnızca müdür, müdür yardımcıları ve "Platforma yazar" yetkisi verilenler yazabilir', async () => {
    expect((await teacher.post(`${base}/support`, { kind: 'problem', subject: 'Deneme konu', body: 'Açıklama metni' })).statusCode).toBe(403);
    expect((await teacher.get(`${base}/support`)).statusCode).toBe(403);
    expectStatus(await owner.post(`${base}/members`, { email: 'yetkili@sorun.test', fullName: 'Yetkili Öğretmen', password: 'GizliSifre42', role: 'editor', permissions: ['support.contact'] }), 201);
    const allowed = client(t.app, (await login(t.app, 'yetkili@sorun.test', 'GizliSifre42')).token);
    expectStatus(await allowed.get(`${base}/support`), 200);
  });

  it('müdür yazar, platform yöneticisine bildirim gider; yanıt müdüre döner', async () => {
    sentPushes.length = 0;
    const res = await owner.post(`${base}/support`, { kind: 'suggestion', area: 'board', subject: 'Nöbet çizelgesi yazdırma', body: 'Nöbet çizelgesini yazdırabilmek istiyoruz.' });
    expectStatus(res, 201);
    ticketId = res.json().id;
    expect(to(TOK.root)).toHaveLength(1);
    const list = (await root.get('/api/platform/support')).json();
    expect(list[0]).toMatchObject({ subject: 'Nöbet çizelgesi yazdırma', schoolName: 'Sorun Lisesi', status: 'new' });
    sentPushes.length = 0;
    expect((await root.post(`/api/platform/support/${ticketId}/messages`, { body: 'Bir sonraki sürümde ekleniyor.' })).json().status).toBe('answered');
    expect(to(TOK.owner)).toHaveLength(1);
    expect((await root.patch(`/api/platform/support/${ticketId}`, { status: 'resolved' })).json().status).toBe('resolved');
    const thread = (await owner.get(`${base}/support/${ticketId}`)).json();
    expect(thread.messages.at(-1).system).toBe(true);
    expect((await owner.get('/api/platform/support')).statusCode).toBe(403);
  });
});

describe('kategori ek sorumlusu', () => {
  it('bildirim idareciyle birlikte ek sorumluya da gider; ek sorumlu durumu değiştirir ama sorumlu atayamaz', async () => {
    const teacherId = (await teacher.get('/api/me')).json().user.id;
    expectStatus(await owner.patch(base, { settings: { issueOwners: { electric: vpId }, issueHelpers: { electric: [teacherId] } } }), 200);
    sentPushes.length = 0;
    const res = await owner.post(`${base}/issues`, { category: 'electric', location: 'Atölye', description: 'Priz kıvılcım çıkarıyor' });
    expectStatus(res, 201);
    expect(to(TOK.vp)).toHaveLength(1);
    expect(to(TOK.teacher)).toHaveLength(1);
    const id = res.json().id;
    // Ek sorumlu kendi listesinde görür ve durumu değiştirebilir
    const list = (await teacher.get(`${base}/issues`)).json() as { id: string; canUpdate: boolean }[];
    expect(list.find((x) => x.id === id)?.canUpdate).toBe(true);
    sentPushes.length = 0;
    const upd = await teacher.patch(`${base}/issues/${id}`, { status: 'in_progress' });
    expectStatus(upd, 200);
    expect(upd.json().status).toBe('in_progress');
    expect(to(TOK.vp)).toHaveLength(1);
    expectStatus(await teacher.patch(`${base}/issues/${id}`, { assigneeUserId: vpId }), 403);
    // İdareci ek sorumluyu sorumlu atayabilir
    const managersList = (await owner.get(`${base}/issues/managers?category=electric`)).json() as { id: string; helper: boolean }[];
    expect(managersList.find((m) => m.id === teacherId)?.helper).toBe(true);
    expectStatus(await owner.patch(`${base}/issues/${id}`, { assigneeUserId: teacherId }), 200);
  });

  it('başka kategorideki bildirimi göremez', async () => {
    const other = await owner.post(`${base}/issues`, { category: 'water', location: 'Spor salonu', description: 'Musluk akıtıyor' });
    expectStatus(await teacher.get(`${base}/issues/${other.json().id}`), 404);
    expectStatus(await teacher.patch(`${base}/issues/${other.json().id}`, { status: 'resolved' }), 404);
  });
});
