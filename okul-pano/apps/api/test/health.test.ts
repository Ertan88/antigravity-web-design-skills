import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isQuietHour } from '../src/lib/quietHours.ts';
import { createTestApp, type TestCtx } from './helpers.ts';

describe('sağlık denetimi', () => {
  let t: TestCtx;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.app.close();
  });

  it('veritabanı yanıt veriyorsa 200 ve db: true', async () => {
    const r = await t.app.inject({ method: 'GET', url: '/api/health' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ ok: true, db: true });
  });

  it('veritabanı yanıt vermiyorsa 503 ve db: false', async () => {
    const original = t.database.db.execute.bind(t.database.db);
    (t.database.db as { execute: unknown }).execute = () => Promise.reject(new Error('kota doldu'));
    try {
      const r = await t.app.inject({ method: 'GET', url: '/api/health' });
      expect(r.statusCode).toBe(503);
      expect(r.json()).toMatchObject({ ok: false, db: false });
    } finally {
      (t.database.db as { execute: unknown }).execute = original;
    }
  });
});

describe('gece sessiz saatleri', () => {
  // Türkiye UTC+3: 20:30 UTC = 23:30, 01:59 UTC = 04:59, 02:00 UTC = 05:00
  it.each([
    ['2026-11-25T19:59:00Z', false],
    ['2026-11-25T20:00:00Z', true],
    ['2026-11-25T20:30:00Z', true],
    ['2026-11-26T01:59:00Z', true],
    ['2026-11-26T02:00:00Z', false],
    ['2026-11-26T09:00:00Z', false],
  ])('%s → %s', (iso, quiet) => {
    expect(isQuietHour(new Date(iso), 'Europe/Istanbul')).toBe(quiet);
  });
});
