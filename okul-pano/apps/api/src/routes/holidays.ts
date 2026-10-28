import { addIsoDays, bridgeDays, canonicalHolidayName, holidayFullName, isHalfDayHoliday, officialHolidays, tidyName, zonedParts } from '@okulpano/shared';
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit, schoolGuard, UUID_RE } from '../context.ts';
import type { DB } from '../db/client.ts';
import { schoolHolidays } from '../db/schema.ts';
import { badRequest, notFound, parse } from '../lib/errors.ts';
import { MONTH_RE, monthRange } from '../lib/months.ts';

type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];

/** Excel'den tanınan tatilleri kaydeder; aynı tarihte kayıt varsa adı güncellenir */
export async function saveHolidays(tx: DB | Tx, schoolId: string, list: { date: string; name: string }[]): Promise<number> {
  if (!list.length) return 0;
  // Excel'deki yazım ("CUMHURIYET BAYRAMI") o günün resmî tatiliyse resmî adıyla saklanır
  const byDate = new Map(list.map((h) => [h.date, canonicalHolidayName(h.date, tidyName(h.name))]));
  const rows = await tx
    .insert(schoolHolidays)
    .values([...byDate].map(([date, name]) => ({ schoolId, date, name })))
    .onConflictDoUpdate({ target: [schoolHolidays.schoolId, schoolHolidays.date], set: { name: sql`excluded.name` } })
    .returning({ id: schoolHolidays.id });
  return rows.length;
}

/** Ay içindeki tatiller: resmi / dini tatiller + okulun eklediği (Excel'den ya da elle) */
export async function holidaysInRange(db: DB, schoolId: string, from: string, to: string) {
  const own = await db
    .select({ id: schoolHolidays.id, date: schoolHolidays.date, name: schoolHolidays.name })
    .from(schoolHolidays)
    .where(and(eq(schoolHolidays.schoolId, schoolId), gte(schoolHolidays.date, from), lte(schoolHolidays.date, to)))
    .orderBy(asc(schoolHolidays.date));
  const out = new Map<string, { id: string | null; date: string; name: string; source: 'official' | 'school' }>();
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
    for (const [date, name] of officialHolidays(y)) if (date >= from && date <= to) out.set(date, { id: null, date, name, source: 'official' });
  }
  // Okulun yazdığı ad öncelikli (ör. "29 Ekim Cumhuriyet Bayramı Töreni")
  for (const h of own) out.set(h.date, { ...h, source: 'school' });
  // Sabit tarihli millî bayramlar tam adıyla gider ("29 Ekim Cumhuriyet Bayramı"): pano, panel ve mobil aynı adı gösterir
  return [...out.values()].map((h) => ({ ...h, name: holidayFullName(h.date, h.name) })).sort((a, b) => a.date.localeCompare(b.date));
}

/** Arife resmî kaynaktan geliyorsa yarım gündür; okul aynı güne kendi tatilini eklediyse tam gün sayılır */
const isHalf = (h: { source: 'official' | 'school'; name: string }) => h.source === 'official' && isHalfDayHoliday(h.name);

export async function upcomingHolidays(db: DB, schoolId: string, from: string, days: number) {
  const to = addIsoDays(from, days);
  // Köprü hesabı için aralığın biraz öncesi ve sonrası da gerekir
  const all = await holidaysInRange(db, schoolId, addIsoDays(from, -7), addIsoDays(to, 7));
  const full = all.filter((h) => !isHalf(h));
  const inRange = (d: string) => d >= from && d <= to;
  return {
    holidays: full.filter((h) => inRange(h.date)),
    halfDays: all.filter((h) => isHalf(h) && inRange(h.date)).map((h) => ({ date: h.date, name: h.name })),
    bridges: bridgeDays(from, to, full),
  };
}

export async function holidayRoutes(app: FastifyInstance) {
  const { db, bus } = app.deps;
  const base = '/api/schools/:schoolId/holidays';
  const read = { preHandler: [app.authenticate, schoolGuard()] };
  const write = { preHandler: [app.authenticate, schoolGuard('duties.manage')] };

  app.get(base, read, async (req) => {
    const { month } = req.query as { month?: string };
    if (!month || !MONTH_RE.test(month)) throw badRequest('Ay YYYY-AA biçiminde olmalı.');
    const [from, to] = monthRange(month);
    return holidaysInRange(db, req.ctx.schoolId, from, to);
  });

  /**
   * Yaklaşan tatiller (bugünden itibaren): tam gün tatiller, arifeler (yarım gün) ve olası köprü günleri.
   * Köprü günü kendiliğinden tatil sayılmaz; idari izin ilan edilirse okul "tatil olarak işaretle" der.
   */
  app.get(`${base}/upcoming`, read, async (req) => {
    const today = zonedParts(new Date(), req.ctx.school.timezone).isoDate;
    // Zil Saatleri'ndeki hafta şeridi için başlangıç (bu haftanın pazartesisi) ve gün sayısı verilebilir
    const q = parse(z.object({ from: z.iso.date().optional(), days: z.coerce.number().int().min(1).max(200).default(150) }), req.query ?? {});
    return upcomingHolidays(db, req.ctx.schoolId, q.from ?? today, q.days);
  });

  app.post(base, write, async (req, reply) => {
    const body = parse(z.object({ date: z.iso.date(), name: z.string().trim().min(2).max(120) }), req.body);
    await saveHolidays(db, req.ctx.schoolId, [body]);
    await audit(req, 'create', 'Tatil', null, `${body.date} · ${body.name}`);
    bus.contentChanged(req.ctx.schoolId);
    return reply.status(201).send(body);
  });

  app.delete(`${base}/:id`, write, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!UUID_RE.test(id)) throw notFound();
    const [row] = await db
      .delete(schoolHolidays)
      .where(and(eq(schoolHolidays.id, id), eq(schoolHolidays.schoolId, req.ctx.schoolId)))
      .returning();
    if (!row) throw notFound();
    await audit(req, 'delete', 'Tatil', id, `${row.date} · ${row.name}`);
    bus.contentChanged(req.ctx.schoolId);
    return reply.status(204).send();
  });
}
