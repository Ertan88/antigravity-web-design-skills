import { eq } from 'drizzle-orm';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schools } from '../src/db/schema.ts';
import { client, createTestApp, expectStatus, login, multipartBody, PNG_1PX, SUPER, type TestCtx } from './helpers.ts';

/** Okul yedeği: ücretli sürümde ZIP olarak alınır ve aynı okula geri yüklenir; denemede kilitli */
let t: TestCtx;
let root: ReturnType<typeof client>;
let owner: ReturnType<typeof client>;
let editor: ReturnType<typeof client>;
const tokens = new Map<ReturnType<typeof client>, string>();
const as = async (email: string) => {
  const token = (await login(t.app, email, email.startsWith('editor') ? 'EditorYD123!' : 'MudurYD123!')).token;
  const c = client(t.app, token);
  tokens.set(c, `Bearer ${token}`);
  return c;
};
let schoolId: string;
let otherId: string;
const path = (p: string) => `/api/schools/${schoolId}/${p}`;

async function createSchool(slug: string, ownerEmail: string) {
  const res = await root.post('/api/platform/schools', { name: `${slug} Lisesi`, slug, ownerEmail, ownerName: 'Müdür', ownerPassword: 'MudurYD123!' });
  expectStatus(res, 201);
  return res.json().id as string;
}

async function download(c: ReturnType<typeof client>) {
  return t.app.inject({ method: 'GET', url: path('backup.zip'), headers: { authorization: tokens.get(c)! } });
}

beforeAll(async () => {
  t = await createTestApp();
  root = client(t.app, (await login(t.app, SUPER.email, SUPER.password)).token);
  schoolId = await createSchool('yedek-okulu', 'mudur@yedek.local');
  otherId = await createSchool('baska-okul', 'mudur@baska.local');
  owner = await as('mudur@yedek.local');
  expectStatus(await owner.post(path('members'), { email: 'editor@yedek.local', fullName: 'Editör', password: 'EditorYD123!', role: 'editor', permissions: ['announcements.manage'] }), 201);
  editor = await as('editor@yedek.local');
  expectStatus(await owner.post(path('teachers'), { fullName: 'Ayşe Demir' }), 201);
});

afterAll(async () => {
  await t.app.close();
  await t.database.close();
});

describe('okul yedeği', () => {
  it('ücretsiz denemede kilitli; durum bilgisi kilidi söyler', async () => {
    const st = (await owner.get(path('backup'))).json();
    expect(st).toMatchObject({ allowed: true, locked: true, lastBackupAt: null });
    expectStatus(await download(owner), 403);
  });

  it('ücretli okulda müdür yedek alır, geri yükleyince silinen kayıt ve görsel geri gelir', async () => {
    await t.database.db.update(schools).set({ plan: 'pro' }).where(eq(schools.id, schoolId));
    expectStatus(await download(editor), 403);

    const up = multipartBody('file', 'logo.png', PNG_1PX, 'image/png');
    const img = await t.app.inject({ method: 'POST', url: path('uploads'), headers: { ...up.headers, authorization: tokens.get(owner)! }, payload: up.payload });
    expectStatus(img, 201);
    const res = await download(owner);
    expectStatus(res, 200);
    expect(res.headers['content-type']).toContain('application/zip');
    const zip = await JSZip.loadAsync(res.rawPayload);
    const manifest = JSON.parse(await zip.file('yedek.json')!.async('string'));
    expect(manifest).toMatchObject({ format: 'okulyayin-okul-yedegi', schoolId, images: 1 });
    expect(JSON.parse(await zip.file('veri/ogretmenler.json')!.async('string'))).toHaveLength(1);
    expect((await owner.get(path('backup'))).json().lastBackupAt).not.toBeNull();

    // Yedekten sonra: öğretmen silinir, yenisi eklenir
    const teachers = (await owner.get(path('teachers'))).json() as { id: string; fullName: string }[];
    expectStatus(await owner.del(path(`teachers/${teachers[0]!.id}`)), 204);
    expectStatus(await owner.post(path('teachers'), { fullName: 'Sonradan Eklenen' }), 201);

    const auth = tokens.get(owner)!;
    const body = multipartBody('file', 'yedek.zip', res.rawPayload, 'application/zip');
    // Onay olmadan ya da yanlış onayla geri yüklenmez
    expectStatus(await t.app.inject({ method: 'POST', url: path('backup/restore?confirm=yanlis'), headers: { ...body.headers, authorization: auth }, payload: body.payload }), 400);
    const ok = await t.app.inject({ method: 'POST', url: path('backup/restore?confirm=yedek-okulu'), headers: { ...body.headers, authorization: auth }, payload: body.payload });
    expectStatus(ok, 200);
    expect(ok.json().images).toBe(1);
    const after = (await owner.get(path('teachers'))).json() as { fullName: string }[];
    expect(after.map((x) => x.fullName)).toEqual(['Ayşe Demir']);
    // Hesaplar ve üyelikler değişmez
    expectStatus(await editor.get(path('backup')), 200);
  });

  it('başka okulun yedeği ya da yedek olmayan dosya geri yüklenmez', async () => {
    await t.database.db.update(schools).set({ plan: 'pro' }).where(eq(schools.id, otherId));
    const other = await as('mudur@baska.local');
    const otherAuth = tokens.get(other)!;
    const foreign = await t.app.inject({ method: 'GET', url: `/api/schools/${otherId}/backup.zip`, headers: { authorization: otherAuth } });
    expectStatus(foreign, 200);
    const auth = tokens.get(owner)!;
    const body = multipartBody('file', 'yedek.zip', foreign.rawPayload, 'application/zip');
    const res = await t.app.inject({ method: 'POST', url: path('backup/restore?confirm=yedek-okulu'), headers: { ...body.headers, authorization: auth }, payload: body.payload });
    expectStatus(res, 400);
    expect(res.json().message).toContain('başka bir okula');
    const junk = multipartBody('file', 'yedek.zip', Buffer.from('zip değil'), 'application/zip');
    expectStatus(await t.app.inject({ method: 'POST', url: path('backup/restore?confirm=yedek-okulu'), headers: { ...junk.headers, authorization: auth }, payload: junk.payload }), 400);
  });
});
