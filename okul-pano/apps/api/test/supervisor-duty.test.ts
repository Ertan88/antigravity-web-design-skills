import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { teacherDutyDays } from '../src/lib/dayinfo.ts';
import { client, createTestApp, expectStatus, login, SUPER, type TestCtx } from './helpers.ts';

/* Nöbetlerim: nöbetçi müdür yardımcısının günleri (çizelgedeki ad öğretmen kaydıyla eşleşir) */

let t: TestCtx;
let schoolId = '';
let teacherId = '';

beforeAll(async () => {
  t = await createTestApp();
  const root = client(t.app, (await login(t.app, SUPER.email, SUPER.password)).token);
  const res = await root.post('/api/platform/schools', { name: 'Nöbet Lisesi', slug: 'nobet-lisesi', ownerEmail: 'mudur@nobet.local', ownerName: 'Müdür', ownerPassword: 'MudurNB123!' });
  expectStatus(res, 201);
  schoolId = res.json().id;
  const owner = client(t.app, (await login(t.app, 'mudur@nobet.local', 'MudurNB123!')).token);
  teacherId = (await owner.post(`/api/schools/${schoolId}/teachers`, { fullName: 'Veli Yardımcı' })).json().id;
  expectStatus(await owner.post(`/api/schools/${schoolId}/duty-supervisors`, { date: '2026-12-02', name: 'VELİ YARDIMCI' }), 201);
  expectStatus(await owner.post(`/api/schools/${schoolId}/duty-supervisors`, { date: '2026-12-03', name: 'Başka Kişi' }), 201);
});
afterAll(async () => {
  await t.app.close();
  await t.database.close();
});

describe('nöbetçi müdür yardımcısı', () => {
  it('çizelgede adı geçen günler Nöbetlerim listesine "Nöbetçi müdür yardımcısı" olarak girer', async () => {
    const days = await teacherDutyDays(t.database.db, schoolId, teacherId, '2026-12-01', '2026-12-31');
    expect(days.map((d) => d.date)).toEqual(['2026-12-02']);
    expect(days[0]!.duties).toEqual([{ dutyId: 'supervisor:2026-12-02', area: 'Nöbetçi müdür yardımcısı', partners: [], substituteFor: null, coveredBy: null }]);
  });
});
