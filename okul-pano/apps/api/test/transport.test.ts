import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, createTestApp, expectStatus, login, SUPER, type TestCtx } from './helpers.ts';

let t: TestCtx;
let schoolId: string;
let owner: ReturnType<typeof client>;
const path = (p: string) => `/api/schools/${schoolId}/${p}`;
const ids: Record<string, string> = {};

beforeAll(async () => {
  t = await createTestApp();
  const root = client(t.app, (await login(t.app, SUPER.email, SUPER.password)).token);
  const res = await root.post('/api/platform/schools', {
    name: 'Develi Lisesi',
    slug: 'develi-lisesi',
    ownerEmail: 'mudur@develi.local',
    ownerName: 'Müdür',
    ownerPassword: 'MudurDV123!',
  });
  expectStatus(res, 201);
  schoolId = res.json().id;
  owner = client(t.app, (await login(t.app, 'mudur@develi.local', 'MudurDV123!')).token);
  for (const fullName of ['Ayşe Demir', 'Ali Kaya', 'Fatma Aydın', 'Mehmet Öztürk', 'Zeynep Arslan']) {
    const r = await owner.post(path('teachers'), { fullName });
    expectStatus(r, 201);
    ids[fullName] = r.json().id;
  }
  // Pazartesi üç, Salı iki nöbetçi; diğer günler nöbet yok
  for (const [weekday, name, area] of [
    [1, 'Ayşe Demir', 'Bahçe'],
    [1, 'Ali Kaya', 'Kantin'],
    [1, 'Fatma Aydın', '1. Kat'],
    [2, 'Mehmet Öztürk', 'Bahçe'],
    [2, 'Zeynep Arslan', 'Kantin'],
  ] as const) {
    expectStatus(await owner.post(path('duties'), { weekday, area, teacherId: ids[name] }), 201);
  }
  // Ali Kaya 9 Kasım'da izinli
  expectStatus(await owner.post(path('leaves'), { teacherId: ids['Ali Kaya'], startDate: '2026-11-09', endDate: '2026-11-09' }), 201);
});

afterAll(async () => {
  await t.app.close();
  await t.database.close();
});

type Day = { date: string; teachers: { id: string; fullName: string }[] };

describe('taşımalı öğrenci görevlileri', () => {
  it('otomatik dağıtım o günün nöbetçilerinden seçer, görevleri eşitler ve izinliyi atlar', async () => {
    const res = await owner.post(path('transport-duties/auto'), { month: '2026-11', perDay: 2 });
    expectStatus(res, 200);
    // Kasım 2026: 5 pazartesi + 4 salı
    expect(res.json()).toEqual({ days: 9, skipped: 0 });
    const days = (await owner.get(path('transport-duties?month=2026-11'))).json() as Day[];
    expect(days).toHaveLength(9);
    const monday = new Set(['Ayşe Demir', 'Ali Kaya', 'Fatma Aydın']);
    const tuesday = new Set(['Mehmet Öztürk', 'Zeynep Arslan']);
    const counts = new Map<string, number>();
    for (const d of days) {
      expect(d.teachers).toHaveLength(2);
      const weekday = new Date(`${d.date}T12:00:00Z`).getUTCDay();
      for (const x of d.teachers) {
        expect((weekday === 1 ? monday : tuesday).has(x.fullName)).toBe(true);
        counts.set(x.fullName, (counts.get(x.fullName) ?? 0) + 1);
      }
    }
    expect(days.find((d) => d.date === '2026-11-09')!.teachers.map((x) => x.fullName)).not.toContain('Ali Kaya');
    // 5 pazartesi x 2 = 10 görev üç kişiye: 3-4 arası
    for (const name of monday) expect(counts.get(name)).toBeGreaterThanOrEqual(3);
    expect(counts.get('Mehmet Öztürk')).toBe(4);
  });

  it('elle düzenleme günü değiştirir; boş liste kaldırır; otomatik dağıtım dolu günlere dokunmaz', async () => {
    expectStatus(await owner.put(path('transport-duties/2026-11-02'), { teacherIds: [ids['Zeynep Arslan'], ids['Ayşe Demir']] }), 200);
    expectStatus(await owner.put(path('transport-duties/2026-11-03'), { teacherIds: [] }), 200);
    let days = (await owner.get(path('transport-duties?month=2026-11'))).json() as Day[];
    expect(days.find((d) => d.date === '2026-11-02')!.teachers.map((x) => x.fullName)).toEqual(['Zeynep Arslan', 'Ayşe Demir']);
    expect(days.find((d) => d.date === '2026-11-03')).toBeUndefined();

    expect((await owner.post(path('transport-duties/auto'), { month: '2026-11' })).json()).toEqual({ days: 1, skipped: 0 });
    days = (await owner.get(path('transport-duties?month=2026-11'))).json();
    expect(days.find((d) => d.date === '2026-11-02')!.teachers.map((x) => x.fullName)).toEqual(['Zeynep Arslan', 'Ayşe Demir']);
    expect(days.find((d) => d.date === '2026-11-03')!.teachers).toHaveLength(2);
  });

  it('geçersiz tarih, ay ve yabancı öğretmen reddedilir', async () => {
    expect((await owner.put(path('transport-duties/2026-13-45'), { teacherIds: [] })).statusCode).toBe(400);
    expect((await owner.get(path('transport-duties?month=2026-1'))).statusCode).toBe(400);
    expect((await owner.put(path('transport-duties/2026-11-04'), { teacherIds: ['6f1c1f3e-0000-4000-8000-000000000000'] })).statusCode).toBe(400);
  });
});
