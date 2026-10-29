import type { DisplayState } from '@okulpano/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { clearWeatherCache } from '../src/lib/weather.ts';
import { seedDemo } from '../src/seed-data.ts';
import { client, createTestApp, expectStatus, login, multipartBody, PNG_1PX, SUPER, type TestCtx } from './helpers.ts';

let t: TestCtx;
let rootToken: string;
let schoolA: string;
let schoolB: string;
let ownerToken: string;

beforeAll(async () => {
  t = await createTestApp();
  rootToken = (await login(t.app, SUPER.email, SUPER.password)).token;
  const root = client(t.app, rootToken);

  const a = await root.post('/api/platform/schools', {
    name: 'Atatürk Ortaokulu',
    slug: 'ataturk-ortaokulu',
    ownerEmail: 'mudur@a.local',
    ownerName: 'Müdür A',
    ownerPassword: 'MudurA123!',
    maxScreens: 2,
  });
  expectStatus(a, 201);
  schoolA = a.json().id;

  const b = await root.post('/api/platform/schools', {
    name: 'Fatih İlkokulu',
    slug: 'fatih-ilkokulu',
    ownerEmail: 'mudur@b.local',
    ownerName: 'Müdür B',
    ownerPassword: 'MudurB123!',
  });
  expectStatus(b, 201);
  schoolB = b.json().id;

  ownerToken = (await login(t.app, 'mudur@a.local', 'MudurA123!')).token;
});

afterAll(async () => {
  await t.app.close();
  await t.database.close();
});

describe('kimlik doğrulama', () => {
  it('hatalı şifreyi reddeder', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: SUPER.email, password: 'yanlis' } });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toMatch(/hatalı/);
  });

  it('korumalı uç noktalar anahtarsız erişime kapalıdır', async () => {
    expect((await t.app.inject({ method: 'GET', url: '/api/me' })).statusCode).toBe(401);
    expect((await t.app.inject({ method: 'GET', url: `/api/schools/${schoolA}/announcements` })).statusCode).toBe(401);
  });

  it('okul sahibi yalnızca kendi okulunu görür', async () => {
    const me = await client(t.app, ownerToken).get('/api/me');
    expectStatus(me, 200);
    expect(me.json().schools).toHaveLength(1);
    expect(me.json().schools[0]).toMatchObject({ id: schoolA, role: 'owner' });
    expect(me.json().schools[0].permissions).toContain('users.manage');
  });

  it('yenileme anahtarı tek kullanımlıktır (rotation)', async () => {
    const { refreshCookie } = await login(t.app, 'mudur@a.local', 'MudurA123!');
    const first = await t.app.inject({ method: 'POST', url: '/api/auth/refresh', cookies: { op_refresh: refreshCookie } });
    expectStatus(first, 200);
    expect(first.json().accessToken).toBeTruthy();
    const replay = await t.app.inject({ method: 'POST', url: '/api/auth/refresh', cookies: { op_refresh: refreshCookie } });
    expect(replay.statusCode).toBe(401);
  });

  it('mobil istemci yenileme anahtarını gövdede alır', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'mudur@a.local', password: 'MudurA123!', client: 'mobile' },
    });
    const { refreshToken } = res.json();
    expect(refreshToken).toMatch(/^rt_/);
    const refreshed = await t.app.inject({ method: 'POST', url: '/api/auth/refresh', payload: { refreshToken } });
    expect(refreshed.json().refreshToken).toMatch(/^rt_/);
  });

  it('platform uç noktaları yalnızca platform yöneticisine açıktır', async () => {
    expect((await client(t.app, ownerToken).get('/api/platform/schools')).statusCode).toBe(403);
    expect((await client(t.app, rootToken).get('/api/platform/schools')).json()).toHaveLength(2);
  });
});

describe('yetkiler ve okul izolasyonu', () => {
  let editorToken: string;

  beforeAll(async () => {
    const res = await client(t.app, ownerToken).post(`/api/schools/${schoolA}/members`, {
      email: 'editor@a.local',
      fullName: 'Editör Öğretmen',
      password: 'Editor123!',
      role: 'editor',
      permissions: ['announcements.manage', 'users.manage'],
    });
    expectStatus(res, 201);
    editorToken = (await login(t.app, 'editor@a.local', 'Editor123!')).token;
  });

  it('editör verilen yetkiyle duyuru ekleyebilir', async () => {
    const res = await client(t.app, editorToken).post(`/api/schools/${schoolA}/announcements`, {
      title: 'Kermes Cumartesi',
      kind: 'text',
      body: 'Tüm velilerimiz davetlidir.',
    });
    expectStatus(res, 201);
    expect(res.json()).toMatchObject({ title: 'Kermes Cumartesi', isActive: true });
  });

  it('editör yetkisi olmayan alanda yazamaz ama okuyabilir', async () => {
    const e = client(t.app, editorToken);
    expect((await e.post(`/api/schools/${schoolA}/ticker`, { text: 'Deneme' })).statusCode).toBe(403);
    expect((await e.get(`/api/schools/${schoolA}/ticker`)).statusCode).toBe(200);
  });

  it('editöre verilen kullanıcı yönetimi yetkisi etkisizdir (yetki yükseltme engeli)', async () => {
    expect((await client(t.app, editorToken).get(`/api/schools/${schoolA}/members`)).statusCode).toBe(403);
  });

  it('bir okulun kullanıcısı başka okula erişemez', async () => {
    const res = await client(t.app, ownerToken).get(`/api/schools/${schoolB}/announcements`);
    expect(res.statusCode).toBe(403);
  });

  it('başka okulun öğretmeni nöbete atanamaz', async () => {
    const ownerB = (await login(t.app, 'mudur@b.local', 'MudurB123!')).token;
    const teacherB = await client(t.app, ownerB).post(`/api/schools/${schoolB}/teachers`, { fullName: 'B Öğretmeni' });
    expectStatus(teacherB, 201);
    const res = await client(t.app, ownerToken).post(`/api/schools/${schoolA}/duties`, {
      weekday: 1,
      area: 'Bahçe',
      teacherId: teacherB.json().id,
    });
    expect(res.statusCode).toBe(400);
  });

  it('başka okulun kaydı kimlik bilinse bile güncellenemez', async () => {
    const ownerB = (await login(t.app, 'mudur@b.local', 'MudurB123!')).token;
    const exam = await client(t.app, ownerB).post(`/api/schools/${schoolB}/exams`, {
      title: 'LGS',
      examAt: '2027-06-13T09:30:00+03:00',
    });
    expectStatus(exam, 201);
    const res = await client(t.app, ownerToken).put(`/api/schools/${schoolA}/exams/${exam.json().id}`, {
      title: 'Ele geçirildi',
      examAt: '2027-06-13T09:30:00+03:00',
    });
    expect(res.statusCode).toBe(404);
  });

  it('okul sahibi kendi üyeliğini ya da sahibi değiştiremez', async () => {
    const members = (await client(t.app, ownerToken).get(`/api/schools/${schoolA}/members`)).json();
    const owner = members.find((m: { role: string }) => m.role === 'owner');
    const res = await client(t.app, ownerToken).patch(`/api/schools/${schoolA}/members/${owner.id}`, { role: 'editor' });
    expect(res.statusCode).toBe(403);
  });

  it('her yazma işlemi etkinlik geçmişine düşer', async () => {
    const res = await client(t.app, ownerToken).get(`/api/schools/${schoolA}/audit`);
    expectStatus(res, 200);
    expect(res.json().some((r: { entity: string; userName: string }) => r.entity === 'Duyuru' && r.userName === 'Editör Öğretmen')).toBe(
      true,
    );
  });
});

describe('içerik doğrulama', () => {
  it('Türkçe ve alan bazlı doğrulama hatası döner', async () => {
    const res = await client(t.app, ownerToken).post(`/api/schools/${schoolA}/announcements`, {
      title: 'Video',
      kind: 'video',
      youtubeUrl: 'https://vimeo.com/1',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0]).toMatchObject({ path: 'youtubeUrl', message: 'Geçerli bir YouTube bağlantısı girin' });
  });

  it('çakışan zil saatlerini reddeder', async () => {
    const res = await client(t.app, ownerToken).post(`/api/schools/${schoolA}/bell-schedules`, {
      name: 'Hatalı',
      weekdays: [1],
      periods: [
        { no: 1, start: '08:30', end: '09:10' },
        { no: 2, start: '09:00', end: '09:40' },
      ],
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/çakışıyor/);
  });

  it('aynı öğretmeni aynı saatte iki sınıfa yazmaz', async () => {
    const c = client(t.app, ownerToken);
    const teacher = (await c.post(`/api/schools/${schoolA}/teachers`, { fullName: 'Kemal Tunç', branch: 'Matematik' })).json();
    const c5a = (await c.post(`/api/schools/${schoolA}/classes`, { name: '5-A' })).json();
    const c5b = (await c.post(`/api/schools/${schoolA}/classes`, { name: '5-B' })).json();
    const cell = { weekday: 1, periodNo: 1, teacherId: teacher.id, subject: 'Matematik' };
    expectStatus(await c.put(`/api/schools/${schoolA}/timetable/cell`, { ...cell, classGroupId: c5a.id }), 200);
    // Aynı hücreyi güncellemek serbest
    expectStatus(await c.put(`/api/schools/${schoolA}/timetable/cell`, { ...cell, classGroupId: c5a.id, subject: 'Geometri' }), 200);
    const clash = await c.put(`/api/schools/${schoolA}/timetable/cell`, { ...cell, classGroupId: c5b.id });
    expect(clash.statusCode).toBe(409);
    expect(clash.json().message).toMatch(/5-A sınıfında derste/);
  });

  it('öğrencileri toplu içe aktarır ve eksik sınıfları oluşturur', async () => {
    const c = client(t.app, ownerToken);
    const res = await c.post(`/api/schools/${schoolA}/students/import`, {
      rows: [
        { schoolNo: '501', fullName: 'Ada Yılmaz', className: '7-c', birthDate: '2013-03-14' },
        { schoolNo: '502', fullName: 'Can Demir', className: '7-C', birthDate: '2013-11-02' },
        { schoolNo: '503', fullName: 'Ela Kaya', className: null, birthDate: '2012-05-20' },
      ],
    });
    expectStatus(res, 200);
    expect(res.json()).toEqual({ created: 3, updated: 0, unchanged: 0, classesCreated: 1 });
    const classes = (await c.get(`/api/schools/${schoolA}/classes`)).json();
    expect(classes.filter((k: { name: string }) => k.name === '7-C')).toHaveLength(1);

    const bad = await c.post(`/api/schools/${schoolA}/students/import`, { rows: [{ schoolNo: '9', fullName: 'X Y', birthDate: '14.03.2013' }] });
    expect(bad.statusCode).toBe(400);
    // Okul numarası zorunlu
    const noNo = await c.post(`/api/schools/${schoolA}/students/import`, { rows: [{ fullName: 'X Y', birthDate: '2013-03-14' }] });
    expect(noNo.statusCode).toBe(400);
  });

  it('yalnızca gerçek görsel dosyalarını kabul eder', async () => {
    const png = multipartBody('file', 'afis.png', PNG_1PX, 'image/png');
    const ok = await t.app.inject({
      method: 'POST',
      url: `/api/schools/${schoolA}/uploads`,
      headers: { ...png.headers, authorization: `Bearer ${ownerToken}` },
      payload: png.payload,
    });
    expectStatus(ok, 201);
    expect(ok.json().url).toMatch(new RegExp(`^/uploads/${schoolA}/.+\\.png$`));
    const served = await t.app.inject({ method: 'GET', url: ok.json().url });
    expect(served.statusCode).toBe(200);

    const svg = multipartBody('file', 'kotu.png', Buffer.from('<svg onload="alert(1)"/>'), 'image/png');
    const bad = await t.app.inject({
      method: 'POST',
      url: `/api/schools/${schoolA}/uploads`,
      headers: { ...svg.headers, authorization: `Bearer ${ownerToken}` },
      payload: svg.payload,
    });
    expect(bad.statusCode).toBe(400);
  });
});

describe('ekran eşleştirme ve pano', () => {
  it('kodla eşleşen ekran kalıcı anahtar alır ve pano verisini çeker', async () => {
    const start = await t.app.inject({ method: 'POST', url: '/api/display/pairings' });
    expectStatus(start, 201);
    const { id, code, pollSecret } = start.json();
    expect(code).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);

    const poll = () => t.app.inject({ method: 'GET', url: `/api/display/pairings/${id}`, headers: { 'x-poll-secret': pollSecret } });
    expect((await poll()).json()).toEqual({ status: 'pending' });

    // Yanlış gizli anahtarla yoklama yapılamaz
    const wrong = await t.app.inject({ method: 'GET', url: `/api/display/pairings/${id}`, headers: { 'x-poll-secret': 'ps_x' } });
    expect(wrong.statusCode).toBe(404);

    const pair = await client(t.app, ownerToken).post(`/api/schools/${schoolA}/screens/pair`, {
      code: `${code.slice(0, 3)}-${code.slice(3).toLowerCase()}`,
      name: 'Öğretmenler Odası',
    });
    expectStatus(pair, 201);

    const paired = (await poll()).json();
    expect(paired.status).toBe('paired');
    expect(paired.token).toMatch(/^opd_/);
    // Anahtar yalnızca bir kez verilir
    expect((await poll()).statusCode).toBe(404);

    const state = await t.app.inject({ method: 'GET', url: '/api/display/state', headers: { authorization: `Bearer ${paired.token}` } });
    expectStatus(state, 200);
    const body = state.json() as DisplayState;
    expect(body.school.name).toBe('Atatürk Ortaokulu');
    expect(body.screen?.name).toBe('Öğretmenler Odası');
    expect(body.announcements.map((a) => a.title)).toContain('Kermes Cumartesi');
  });

  let kantin: { screen: { id: string }; token: string };

  it('paket ekran limitini uygular', async () => {
    const c = client(t.app, ownerToken);
    const created = await c.post(`/api/schools/${schoolA}/screens`, { name: 'Kantin' });
    expectStatus(created, 201);
    kantin = created.json();
    const over = await c.post(`/api/schools/${schoolA}/screens`, { name: 'Spor salonu' });
    expect(over.statusCode).toBe(403);
    expect(over.json().message).toMatch(/en fazla 2 ekran/);
  });

  it('silinen ekranın anahtarı anında geçersiz olur', async () => {
    const state = () =>
      t.app.inject({ method: 'GET', url: '/api/display/state', headers: { authorization: `Bearer ${kantin.token}` } });
    expectStatus(await state(), 200);
    expectStatus(await client(t.app, ownerToken).del(`/api/schools/${schoolA}/screens/${kantin.screen.id}`), 204);
    expect((await state()).statusCode).toBe(401);
  });

  it('platform listesi okul başına ekran sayısını doğru verir', async () => {
    const rows = (await client(t.app, rootToken).get('/api/platform/schools')).json() as { id: string; screenCount: number }[];
    expect(rows.find((r) => r.id === schoolA)?.screenCount).toBe(1);
    expect(rows.find((r) => r.id === schoolB)?.screenCount).toBe(0);
  });

  it('önizleme anahtarı panoyu okuyabilir ama panele erişemez', async () => {
    const { token } = (await client(t.app, ownerToken).post(`/api/schools/${schoolA}/preview-token`)).json();
    const state = await t.app.inject({ method: 'GET', url: '/api/display/state', headers: { authorization: `Bearer ${token}` } });
    expectStatus(state, 200);
    expect(state.json().screen).toBeNull();
    const admin = await client(t.app, token).get(`/api/schools/${schoolA}/announcements`);
    expect(admin.statusCode).toBe(401);
  });

  it('örnek okul verisiyle günün tüm pano alanları dolar', async () => {
    const seeded = await seedDemo(t.database.db);
    const state = (
      await t.app.inject({ method: 'GET', url: '/api/display/state', headers: { authorization: `Bearer ${seeded.screenToken}` } })
    ).json() as DisplayState;
    expect(state.school.name).toBe('Örnek Anadolu Lisesi');
    expect(state.duties).toHaveLength(25);
    expect(state.leaves).toHaveLength(2);
    expect(state.birthdays.length).toBeGreaterThanOrEqual(3);
    expect(state.bellSchedules[0]?.periods).toHaveLength(8);
    expect(state.timetable).toHaveLength(5 * 8 * 8);
    expect(state.ticker.length).toBe(4);
    expect(state.exams.length).toBe(2);
    expect(state.school.settings.birthdayNameFormat).toBe('initial');
  });

  it('hava durumunu okul konumuna göre getirir ve önbelleğe alır', async () => {
    clearWeatherCache();
    const seeded = await seedDemo(t.database.db);
    const fetchMock = vi.fn(async () =>
      Response.json({
            current: { temperature_2m: 17.6, weather_code: 2, is_day: 1 },
            daily: {
              temperature_2m_max: [21.2, 4],
              temperature_2m_min: [9.4, -3],
              weather_code: [2, 75],
              snowfall_sum: [0, 14],
              wind_gusts_10m_max: [20, 30],
            },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    try {
      const get = () =>
        t.app.inject({ method: 'GET', url: '/api/display/weather', headers: { authorization: `Bearer ${seeded.screenToken}` } });
      const first = (await get()).json();
      expect(first).toMatchObject({ temperature: 18, weatherCode: 2, isDay: true, high: 21, low: 9, city: 'Ankara' });
      expect(first.alerts).toEqual([{ kind: 'snow', day: 'tomorrow', text: 'Yarın yoğun kar yağışı bekleniyor' }]);
      await get();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('canlı yayın (SSE)', () => {
  it('paneldeki değişiklik ekrana anında olay olarak ulaşır', async () => {
    const seeded = await seedDemo(t.database.db);
    const address = await t.app.listen({ port: 0, host: '127.0.0.1' });
    const controller = new AbortController();
    const res = await fetch(`${address}/api/display/stream?token=${seeded.screenToken}`, { signal: controller.signal });
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const waitFor = async (needle: string) => {
      const deadline = Date.now() + 3000;
      while (!buffer.includes(needle)) {
        if (Date.now() > deadline) throw new Error(`Olay gelmedi: ${needle}\n${buffer}`);
        const { value } = await reader.read();
        buffer += decoder.decode(value, { stream: true });
      }
    };
    await waitFor('event: hello');

    // Ekran artık çevrimiçi görünür
    const ownerToken2 = (await login(t.app, 'mudur@okulpano.local', 'Mudur2026!')).token;
    const screens = (await client(t.app, ownerToken2).get(`/api/schools/${seeded.schoolId}/screens`)).json();
    expect(screens.some((s: { online: boolean }) => s.online)).toBe(true);

    await client(t.app, ownerToken2).post(`/api/schools/${seeded.schoolId}/ticker`, { text: 'Canlı test' });
    await waitFor('event: content');
    controller.abort();
  });
});
