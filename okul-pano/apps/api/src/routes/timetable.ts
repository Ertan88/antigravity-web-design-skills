import { timetableEntrySchema, WEEKDAY_NAMES } from '@okulpano/shared';
import { and, asc, eq, ne } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { audit, schoolGuard, UUID_RE } from '../context.ts';
import { classGroups, teachers, timetableEntries } from '../db/schema.ts';
import { badRequest, conflict, notFound, parse } from '../lib/errors.ts';

/** Ders programı: (gün, ders saati, sınıf) hücresi başına tek kayıt. */
export async function timetableRoutes(app: FastifyInstance) {
  const { db, bus } = app.deps;
  const base = '/api/schools/:schoolId/timetable';
  const t = timetableEntries;
  const write = { preHandler: [app.authenticate, schoolGuard('schedule.manage')] };

  app.get(base, { preHandler: [app.authenticate, schoolGuard()] }, async (req) =>
    db
      .select()
      .from(t)
      .where(eq(t.schoolId, req.ctx.schoolId))
      .orderBy(asc(t.weekday), asc(t.periodNo)),
  );

  app.put(`${base}/cell`, write, async (req) => {
    const body = parse(timetableEntrySchema, req.body);
    const schoolId = req.ctx.schoolId;

    const [cls] = await db
      .select({ name: classGroups.name })
      .from(classGroups)
      .where(and(eq(classGroups.id, body.classGroupId), eq(classGroups.schoolId, schoolId)));
    if (!cls) throw badRequest('Sınıf bu okula ait değil.');

    if (body.teacherId) {
      const [teacher] = await db
        .select({ name: teachers.fullName })
        .from(teachers)
        .where(and(eq(teachers.id, body.teacherId), eq(teachers.schoolId, schoolId)));
      if (!teacher) throw badRequest('Öğretmen bu okula ait değil.');
      // Aynı öğretmen aynı saatte iki sınıfta olamaz
      const [clash] = await db
        .select({ className: classGroups.name })
        .from(t)
        .innerJoin(classGroups, eq(classGroups.id, t.classGroupId))
        .where(
          and(
            eq(t.schoolId, schoolId),
            eq(t.weekday, body.weekday),
            eq(t.periodNo, body.periodNo),
            eq(t.teacherId, body.teacherId),
            ne(t.classGroupId, body.classGroupId),
          ),
        );
      if (clash) {
        throw conflict(`${teacher.name}, ${WEEKDAY_NAMES[body.weekday]} ${body.periodNo}. ders saatinde ${clash.className} sınıfında derste.`);
      }
    }

    const values = { ...body, teacherId: body.teacherId ?? null, schoolId };
    const [row] = await db
      .insert(t)
      .values(values)
      .onConflictDoUpdate({
        target: [t.schoolId, t.weekday, t.periodNo, t.classGroupId],
        set: { subject: values.subject, teacherId: values.teacherId, updatedAt: new Date() },
      })
      .returning();
    await audit(req, 'update', 'Ders programı', row!.id, `${cls.name} · ${WEEKDAY_NAMES[body.weekday]} ${body.periodNo}. ders · ${body.subject}`);
    bus.contentChanged(schoolId);
    return row;
  });

  app.delete(`${base}/:id`, write, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!UUID_RE.test(id)) throw notFound();
    const [row] = await db
      .delete(t)
      .where(and(eq(t.id, id), eq(t.schoolId, req.ctx.schoolId)))
      .returning();
    if (!row) throw notFound();
    await audit(req, 'delete', 'Ders programı', id, `${WEEKDAY_NAMES[row.weekday]} ${row.periodNo}. ders · ${row.subject}`);
    bus.contentChanged(req.ctx.schoolId);
    return reply.status(204).send();
  });
}
