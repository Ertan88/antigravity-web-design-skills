import { bellOverrideSchema, zonedParts } from '@okulpano/shared';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { audit, schoolGuard, UUID_RE } from '../context.ts';
import { bellOverrides, bellSchedules, users } from '../db/schema.ts';
import { badRequest, notFound, parse } from '../lib/errors.ts';
import { notifyUsers, schoolMembers } from '../lib/push.ts';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
/** "10 Kasım Salı" */
const trDay = (iso: string) =>
  new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));

/**
 * Zil saatlerine elle müdahale: bir tarih ve bir zil (okul geneli ya da sınıfa özel düzen) için o günün saatleri.
 * Düzen değişmez; pano ve telefonlar o gün bu saatleri kullanır. Aynı gün ve zil için ikinci kayıt öncekinin yerine geçer.
 */
export async function bellOverrideRoutes(app: FastifyInstance) {
  const { db, bus } = app.deps;
  const manage = { preHandler: [app.authenticate, schoolGuard('schedule.manage')] };

  /** Tarih aralığındaki müdahaleler (varsayılan: 30 gün önceden 60 gün sonrasına), kimin yaptığıyla */
  app.get<{ Querystring: { from?: string; to?: string } }>('/api/schools/:schoolId/bell-overrides', manage, async (req) => {
    const today = zonedParts(new Date(), req.ctx.school.timezone).isoDate;
    const from = ISO.test(req.query.from ?? '') ? req.query.from! : addDays(today, -30);
    const to = ISO.test(req.query.to ?? '') ? req.query.to! : addDays(today, 60);
    return db
      .select({
        id: bellOverrides.id,
        date: bellOverrides.date,
        target: bellOverrides.target,
        periods: bellOverrides.periods,
        note: bellOverrides.note,
        createdByName: users.fullName,
        updatedAt: bellOverrides.updatedAt,
      })
      .from(bellOverrides)
      .leftJoin(users, eq(users.id, bellOverrides.createdBy))
      .where(and(eq(bellOverrides.schoolId, req.ctx.schoolId), gte(bellOverrides.date, from), lte(bellOverrides.date, to)))
      .orderBy(asc(bellOverrides.date), asc(bellOverrides.target));
  });

  /** O gün ve zil için saatleri kaydeder (varsa günceller) */
  app.put('/api/schools/:schoolId/bell-overrides', manage, async (req) => {
    const input = parse(bellOverrideSchema, req.body);
    const { schoolId } = req.ctx;
    let label = 'okul geneli zil';
    if (input.target.startsWith('schedule:')) {
      const [s] = await db
        .select({ id: bellSchedules.id, name: bellSchedules.name })
        .from(bellSchedules)
        .where(and(eq(bellSchedules.id, input.target.slice(9)), eq(bellSchedules.schoolId, schoolId)));
      if (!s) throw badRequest('Zil düzeni bulunamadı.');
      label = s.name;
    }
    const today = zonedParts(new Date(), req.ctx.school.timezone).isoDate;
    if (input.date < today) throw badRequest('Geçmiş bir günün zil saatleri değiştirilemez.');
    const values = { schoolId, date: input.date, target: input.target, periods: input.periods, note: input.note ?? null, createdBy: req.ctx.userId };
    const [row] = await db
      .insert(bellOverrides)
      .values(values)
      .onConflictDoUpdate({
        target: [bellOverrides.schoolId, bellOverrides.date, bellOverrides.target],
        set: { periods: values.periods, note: values.note, createdBy: values.createdBy, updatedAt: new Date() },
      })
      .returning();
    await audit(req, 'update', 'Zil saatleri (o gün)', row!.id, `${trDay(input.date)} · ${label}${input.note ? ` · ${input.note}` : ''}`);
    bus.contentChanged(schoolId);
    if (input.notify) {
      const members = (await schoolMembers(app.deps, schoolId)).filter((id) => id !== req.ctx.userId);
      notifyUsers(app.deps, members, {
        title: 'Zil saatleri değişti',
        body: `${trDay(input.date)}${input.note ? `: ${input.note}` : ''}. Yeni saatler programınızda.`,
        url: '/programim',
      });
    }
    return row;
  });

  /** Müdahaleyi geri alır: o gün düzenin saatleri çalar */
  app.delete<{ Params: { id: string } }>('/api/schools/:schoolId/bell-overrides/:id', manage, async (req, reply) => {
    if (!UUID_RE.test(req.params.id)) throw notFound();
    const [row] = await db
      .delete(bellOverrides)
      .where(and(eq(bellOverrides.id, req.params.id), eq(bellOverrides.schoolId, req.ctx.schoolId)))
      .returning();
    if (!row) throw notFound();
    await audit(req, 'delete', 'Zil saatleri (o gün)', row.id, `${trDay(row.date)} · geri alındı`);
    bus.contentChanged(req.ctx.schoolId);
    return reply.code(204).send();
  });
}
