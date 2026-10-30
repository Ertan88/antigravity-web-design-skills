import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schools, signups } from '../src/db/schema.ts';
import { sha256 } from '../src/lib/crypto.ts';
import { runTrialReminders } from '../src/routes/signup.ts';
import { client, createTestApp, expectStatus, login, SUPER, type TestCtx } from './helpers.ts';

let t: TestCtx;
let root: ReturnType<typeof client>;

const form = (over: Record<string, unknown> = {}) => ({
  schoolName: 'Yıldız Ortaokulu',
  city: 'Kayseri',
  district: 'Melikgazi',
  schoolType: 'Ortaokulu',
  ownerName: 'Aylin Kara',
  email: 'aylin@yildiz.test',
  phone: '0532 111 22 33',
  password: 'GuvenliSifre9',
  kvkk: true,
  ...over,
});

/** E-postadaki bağlantının yerine: başvurunun anahtarını bilinen bir değere çevirir */
async function knownToken(email: string): Promise<string> {
  const token = `sgn_test_${email.replace(/\W/g, '')}_0123456789`;
  await t.database.db.update(signups).set({ tokenHash: sha256(token) }).where(eq(signups.email, email));
  return token;
}

/** Giriş hız sınırına takılmamak için her hesapla bir kez giriş yapılır */
const sessionsByEmail = new Map<string, ReturnType<typeof client>>();
async function as(email: string, password = 'GuvenliSifre9') {
  if (!sessionsByEmail.has(email)) sessionsByEmail.set(email, client(t.app, (await login(t.app, email, password)).token));
  return sessionsByEmail.get(email)!;
}

beforeAll(async () => {
  t = await createTestApp();
  root = client(t.app, (await login(t.app, SUPER.email, SUPER.password)).token);
});

afterAll(async () => {
  await t.app.close();
  await t.database.close();
});

describe('web kaydı', () => {
  it('kayıt, e-posta doğrulanınca deneme paketiyle okulu açar; sahip kendi şifresiyle girer', async () => {
    expect((await t.app.inject({ method: 'GET', url: '/api/signup/config' })).json()).toEqual({ mode: 'open', trialDays: 30, trialScreens: 2 });
    const res = await t.app.inject({ method: 'POST', url: '/api/signup', payload: form() });
    expectStatus(res, 202);
    // SMTP yok: e-posta gitmedi, başvuru platform yöneticisinin listesine düşer
    expect(res.json()).toEqual({ emailed: false });
    // Doğrulanmadan giriş yapılamaz
    expect((await t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'aylin@yildiz.test', password: 'GuvenliSifre9' } })).statusCode).toBe(401);

    const token = await knownToken('aylin@yildiz.test');
    const verified = await t.app.inject({ method: 'POST', url: '/api/signup/verify', payload: { token } });
    expectStatus(verified, 200);
    expect(verified.json()).toMatchObject({ schoolName: 'Yıldız Ortaokulu', pendingApproval: false });
    // Aynı bağlantı ikinci kez açılırsa hata vermez
    expect((await t.app.inject({ method: 'POST', url: '/api/signup/verify', payload: { token } })).json()).toMatchObject({ alreadyVerified: true });

    const owner = client(t.app, (await login(t.app, 'aylin@yildiz.test', 'GuvenliSifre9')).token);
    const me = (await owner.get('/api/me')).json();
    expect(me.schools).toHaveLength(1);
    expect(me.schools[0]).toMatchObject({ role: 'owner', name: 'Yıldız Ortaokulu' });
    const school = (await owner.get(`/api/schools/${me.schools[0].id}`)).json();
    expect(school).toMatchObject({ plan: 'trial', maxScreens: 2, city: 'Kayseri', slug: 'yildiz-ortaokulu' });
    expect(Date.parse(school.trialEndsAt) - Date.now()).toBeGreaterThan(29 * 86400_000);
  });

  it('kayıtlı e-posta, eksik onay ve bot tuzağı', async () => {
    expect((await t.app.inject({ method: 'POST', url: '/api/signup', payload: form() })).statusCode).toBe(409);
    const noKvkk = await t.app.inject({ method: 'POST', url: '/api/signup', payload: form({ email: 'yeni@x.test', kvkk: false }) });
    expect(noKvkk.statusCode).toBe(400);
    const bot = await t.app.inject({ method: 'POST', url: '/api/signup', payload: form({ email: 'bot@x.test', website: 'http://spam' }) });
    expect(bot.statusCode).toBe(202);
    const [row] = await t.database.db.select().from(signups).where(eq(signups.email, 'bot@x.test'));
    expect(row).toBeUndefined();
  });

  it('e-posta ulaşmazsa platform yöneticisi başvuruyu onaylar', async () => {
    expectStatus(await t.app.inject({ method: 'POST', url: '/api/signup', payload: form({ email: 'mehmet@gunes.test', schoolName: 'Güneş İlkokulu', ownerName: 'Mehmet Er' }) }), 202);
    const list = (await root.get('/api/platform/signups')).json() as { id: string; email: string; phone: string }[];
    const item = list.find((x) => x.email === 'mehmet@gunes.test')!;
    expect(item.phone).toBe('05321112233');
    expect(item).not.toHaveProperty('passwordHash');
    expectStatus(await root.post(`/api/platform/signups/${item.id}/approve`), 200);
    expect((await root.get('/api/platform/signups')).json().some((x: { email: string }) => x.email === 'mehmet@gunes.test')).toBe(false);
    await login(t.app, 'mehmet@gunes.test', 'GuvenliSifre9');
    const owner = client(t.app, (await login(t.app, 'aylin@yildiz.test', 'GuvenliSifre9')).token);
    expect((await owner.get('/api/platform/signups')).statusCode).toBe(403);
  });
});

describe('ilk giriş: örnek veri', () => {
  it('okul sahibi örnek verilerle başlar, sonra yalnızca örnekleri temizler', async () => {
    const owner = await as('aylin@yildiz.test');
    const schoolId = (await owner.get('/api/me')).json().schools[0].id as string;
    expect((await owner.get(`/api/schools/${schoolId}`)).json()).toMatchObject({ onboarding: 'pending', hasSampleData: false });

    const seeded = await owner.post(`/api/schools/${schoolId}/onboarding`, { sample: true });
    expectStatus(seeded, 200);
    expect(seeded.json()).toMatchObject({ onboarding: 'sample', hasSampleData: true });
    // Soru bir kez cevaplanır; ikinci istek veri eklemez
    expect((await owner.post(`/api/schools/${schoolId}/onboarding`, { sample: true })).statusCode).toBe(409);

    const sampleTeachers = (await owner.get(`/api/schools/${schoolId}/teachers`)).json() as unknown[];
    expect(sampleTeachers.length).toBeGreaterThan(5);
    expect((await owner.get(`/api/schools/${schoolId}/ticker`)).json().length).toBeGreaterThan(0);
    // Okulun kendi eklediği kayıt temizlikte silinmez
    expectStatus(await owner.post(`/api/schools/${schoolId}/teachers`, { fullName: 'Kendi Öğretmenimiz' }), 201);

    const cleared = await owner.post(`/api/schools/${schoolId}/sample-data/clear`);
    expectStatus(cleared, 200);
    expect(cleared.json()).toMatchObject({ hasSampleData: false });
    const left = (await owner.get(`/api/schools/${schoolId}/teachers`)).json() as { fullName: string }[];
    expect(left.map((x) => x.fullName)).toEqual(['Kendi Öğretmenimiz']);
    expect((await owner.get(`/api/schools/${schoolId}/ticker`)).json()).toEqual([]);
  });

  it('boş başlamak veri eklemez; mevcut okullara soru sorulmaz', async () => {
    const owner = await as('mehmet@gunes.test');
    const schoolId = (await owner.get('/api/me')).json().schools[0].id as string;
    expect((await owner.post(`/api/schools/${schoolId}/onboarding`, { sample: false })).json()).toMatchObject({ onboarding: 'empty', hasSampleData: false });
    expect((await owner.get(`/api/schools/${schoolId}/teachers`)).json()).toEqual([]);
    const demo = (await root.get('/api/platform/schools')).json() as { onboarding: string | null; name: string }[];
    expect(demo.find((s) => s.name !== 'Yıldız Ortaokulu' && s.name !== 'Güneş İlkokulu')?.onboarding ?? null).toBeNull();
  });
});

describe('deneme süresi', () => {
  it('süre dolunca panel salt okunur; platform yöneticisi uzatınca açılır', async () => {
    const owner = await as('aylin@yildiz.test');
    const schoolId = (await owner.get('/api/me')).json().schools[0].id as string;
    await t.database.db.update(schools).set({ trialEndsAt: new Date(Date.now() - 1000) }).where(eq(schools.id, schoolId));

    expectStatus(await owner.get(`/api/schools/${schoolId}/teachers`), 200);
    const blocked = await owner.post(`/api/schools/${schoolId}/teachers`, { fullName: 'Ali Veli' });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().message).toMatch(/Deneme süreniz doldu/);
    // KVKK: platform yöneticisi üyesi olmadığı okulun verilerini göremez; okul süreli destek erişimi verince görür
    expect((await root.get(`/api/schools/${schoolId}/teachers`)).statusCode).toBe(403);
    expect((await root.get('/api/me')).json().schools.some((s: { id: string }) => s.id === schoolId)).toBe(false);
    expect((await root.post(`/api/schools/${schoolId}/support-access`, { hours: 24 })).statusCode).toBe(403);
    expectStatus(await owner.post(`/api/schools/${schoolId}/support-access`, { hours: 24 }), 200);
    expect((await root.get('/api/me')).json().schools.some((s: { id: string }) => s.id === schoolId)).toBe(true);
    // Platform yöneticisine bildirim düşer (panel bunu yoklayıp okul listesini kendiliğinden yeniler)
    const inbox = (await root.get('/api/me/inbox')).json() as { items: { id: string; kind: string; schoolId?: string; readAt: string | null }[]; unread: number };
    const granted = inbox.items.find((n) => n.kind === 'support-access' && n.schoolId === schoolId)!;
    expect(granted.readAt).toBeNull();
    expect((await owner.get('/api/me/inbox')).json().items).toEqual([]);
    // KVKK: destek erişimindeyken okulun bildirimleri platform yöneticisinin kutusuna yazılmaz
    const supportBox = (await root.get(`/api/schools/${schoolId}/inbox`)).json() as { items: { kind: string }[] };
    expect(supportBox.items.every((n) => n.kind.startsWith('support-'))).toBe(true);
    // Okunan bildirim kutuda kalır; okunmadı yapılabilir, silinebilir
    expect((await root.post('/api/me/inbox/read', { ids: [granted.id] })).statusCode).toBe(204);
    const afterRead = (await root.get('/api/me/inbox?filter=read')).json() as { items: { id: string; readAt: string | null }[]; unread: number };
    expect(afterRead.items.find((n) => n.id === granted.id)?.readAt).not.toBeNull();
    expect(((await root.get('/api/me/inbox?filter=unread')).json() as { items: { id: string }[] }).items.some((n) => n.id === granted.id)).toBe(false);
    expect((await root.post(`/api/me/inbox/${granted.id}/unread`)).statusCode).toBe(204);
    expect((await owner.post(`/api/me/inbox/${granted.id}/unread`)).statusCode).toBe(404);
    expectStatus(await root.post(`/api/schools/${schoolId}/teachers`, { fullName: 'Destek Kaydı' }), 201);
    // Destek erişimindeki platform yöneticisi süreyi kendisi uzatamaz
    expect((await root.post(`/api/schools/${schoolId}/support-access`, { hours: 168 })).statusCode).toBe(403);
    const log = (await owner.get(`/api/schools/${schoolId}/audit`)).json() as { entity: string }[];
    expect(log.some((x) => x.entity === 'Destek erişimi')).toBe(true);
    expectStatus(await owner.post(`/api/schools/${schoolId}/support-access`, { hours: 0 }), 200);
    expect((await root.get(`/api/schools/${schoolId}/teachers`)).statusCode).toBe(403);
    // Erişim kapatılınca da bildirim düşer; "verildi" bildirimi geçmişte kalır
    const kinds = ((await root.get('/api/me/inbox')).json() as { items: { kind: string }[] }).items.map((n) => n.kind);
    expect(kinds).toEqual(expect.arrayContaining(['support-revoked', 'support-access']));
    expect(kinds.indexOf('support-revoked')).toBeLessThan(kinds.indexOf('support-access'));

    expectStatus(await root.patch(`/api/platform/schools/${schoolId}`, { extendTrialDays: 14 }), 200);
    expectStatus(await owner.post(`/api/schools/${schoolId}/teachers`, { fullName: 'Ali Veli' }), 201);
    // Ücretli pakete geçince deneme bitişi kalkar
    const paid = (await root.patch(`/api/platform/schools/${schoolId}`, { plan: 'basic' })).json();
    expect(paid.trialEndsAt).toBeNull();
  });

  it('hatırlatmalar 7, 3, 1 gün kala ve bitince birer kez gider', async () => {
    const [s] = await t.database.db.select().from(schools).where(eq(schools.name, 'Güneş İlkokulu'));
    const day = 86400_000;
    await t.database.db.update(schools).set({ trialEndsAt: new Date(Date.now() + 6.5 * day), trialNotice: null }).where(eq(schools.id, s!.id));
    expect(await runTrialReminders(t.app.deps)).toBe(1);
    expect(await runTrialReminders(t.app.deps)).toBe(0);
    expect(await runTrialReminders(t.app.deps, Date.now() + 4 * day)).toBe(1);
    expect(await runTrialReminders(t.app.deps, Date.now() + 8 * day)).toBe(1);
    const [after] = await t.database.db.select({ n: schools.trialNotice }).from(schools).where(eq(schools.id, s!.id));
    expect(after!.n).toBe(0);
  });
});

describe('kullanıcı daveti', () => {
  it('davetle eklenen kişi şifresini bağlantıdan belirler; bağlantı tek kullanımlık', async () => {
    const owner = await as('mehmet@gunes.test');
    const schoolId = (await owner.get('/api/me')).json().schools[0].id as string;
    const res = await owner.post(`/api/schools/${schoolId}/members`, { email: 'ogretmen@gunes.test', fullName: 'Zeynep Ak', role: 'editor', invite: true });
    expectStatus(res, 201);
    const { invite } = res.json();
    expect(invite.emailed).toBe(false);
    const token = new URL(invite.inviteUrl).searchParams.get('token')!;

    const members = (await owner.get(`/api/schools/${schoolId}/members`)).json() as { email: string; invitePending: boolean }[];
    expect(members.find((m) => m.email === 'ogretmen@gunes.test')!.invitePending).toBe(true);
    expect((await t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'ogretmen@gunes.test', password: 'davet-bekliyor' } })).statusCode).toBe(401);

    expect((await t.app.inject({ method: 'GET', url: `/api/invites/${token}` })).json()).toEqual({ email: 'ogretmen@gunes.test', fullName: 'Zeynep Ak', schoolName: 'Güneş İlkokulu' });
    expect((await t.app.inject({ method: 'POST', url: '/api/invites/accept', payload: { token, password: 'kisa' } })).statusCode).toBe(400);
    expectStatus(await t.app.inject({ method: 'POST', url: '/api/invites/accept', payload: { token, password: 'ZeynepSifre42' } }), 200);
    await login(t.app, 'ogretmen@gunes.test', 'ZeynepSifre42');
    expect((await t.app.inject({ method: 'POST', url: '/api/invites/accept', payload: { token, password: 'BaskaSifre42' } })).statusCode).toBe(404);
  });
});

describe('son açılan okul', () => {
  it('seçilen okul hatırlanır; başka cihazdan girişte o açılır', async () => {
    const gunes = await as('mehmet@gunes.test');
    const gunesId = (await gunes.get('/api/me')).json().schools[0].id as string;
    expectStatus(await gunes.post(`/api/schools/${gunesId}/support-access`, { hours: 24 }), 200);
    const schools = (await root.get('/api/me')).json().schools as { id: string; name: string }[];
    const target = schools.find((s) => s.name === 'Güneş İlkokulu')!;
    expect((await root.put('/api/me/school', { schoolId: target.id })).statusCode).toBe(204);
    expect((await root.get('/api/me')).json().lastSchoolId).toBe(target.id);
    // Üyesi olmadığı okulu seçemez
    const owner = await as('aylin@yildiz.test');
    expect((await owner.put('/api/me/school', { schoolId: target.id })).statusCode).toBe(404);
  });
});

describe('kayıt kapalı', () => {
  it('SIGNUP_MODE=closed iken kayıt alınmaz; approval iken okul onay bekler', async () => {
    const closed = await createTestApp({ SIGNUP_MODE: 'closed' });
    expect((await closed.app.inject({ method: 'POST', url: '/api/signup', payload: form() })).statusCode).toBe(403);
    await closed.app.close();
    await closed.database.close();

    const approval = await createTestApp({ SIGNUP_MODE: 'approval' });
    const prev = t;
    t = approval;
    expectStatus(await approval.app.inject({ method: 'POST', url: '/api/signup', payload: form() }), 202);
    const token = await knownToken('aylin@yildiz.test');
    expect((await approval.app.inject({ method: 'POST', url: '/api/signup/verify', payload: { token } })).json()).toMatchObject({ pendingApproval: true });
    const owner = client(approval.app, (await login(approval.app, 'aylin@yildiz.test', 'GuvenliSifre9')).token);
    const schoolId = (await owner.get('/api/me')).json().schools[0].id as string;
    expect((await owner.get(`/api/schools/${schoolId}/teachers`)).statusCode).toBe(403);
    t = prev;
    await approval.app.close();
    await approval.database.close();
  });
});
