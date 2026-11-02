import { classAdvisorSchema, classBellExemptSchema, classShiftSchema, timetableEntrySchema, WEEKDAY_NAMES } from '@okulpano/shared';
import { applyAdvisor } from '../lib/advisor.ts';
import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit, schoolGuard, UUID_RE } from '../context.ts';
import { classGroups, teachers, timetableEntries } from '../db/schema.ts';
import { badRequest, conflict, notFound, parse } from '../lib/errors.ts';

/**
 * Ders programı: (gün, ders saati, sınıf) hücresinde bir ya da birden çok kayıt (bölünmüş sınıfta iki öğretmen,
 * dallara ayrılan şubede her dalın dersi). e-Okul PDF'inden toplu yüklenebilir.
 */
export async function timetableRoutes(app: FastifyInstance) {
  const { db, bus } = app.deps;
  const base = '/api/schools/:schoolId/timetable';
  const t = timetableEntries;
  const write = { preHandler: [app.authenticate, schoolGuard('schedule.manage')] };

  /** Sınıfın rehber öğretmeni; öğretmeni boş (ya da önceki rehbere yazılmış) rehberlik dersleri ona geçer */
  app.put('/api/schools/:schoolId/classes/:id/advisor', write, async (req) => {
    const { id } = req.params as { id: string };
    if (!UUID_RE.test(id)) throw notFound('Sınıf bulunamadı.');
    const { teacherId } = parse(classAdvisorSchema, req.body);
    const schoolId = req.ctx.schoolId;
    const [cls] = await db
      .select({ name: classGroups.name, advisor: classGroups.advisorTeacherId })
      .from(classGroups)
      .where(and(eq(classGroups.id, id), eq(classGroups.schoolId, schoolId)));
    if (!cls) throw notFound('Sınıf bulunamadı.');
    let teacherName: string | null = null;
    if (teacherId) {
      const [t] = await db.select({ fullName: teachers.fullName }).from(teachers).where(and(eq(teachers.id, teacherId), eq(teachers.schoolId, schoolId)));
      if (!t) throw badRequest('Öğretmen bu okulun kadrosunda değil.');
      teacherName = t.fullName;
    }
    await db.transaction(async (tx) => {
      await tx.update(classGroups).set({ advisorTeacherId: teacherId, updatedAt: new Date() }).where(eq(classGroups.id, id));
      await applyAdvisor(tx, schoolId, id, teacherId, cls.advisor);
    });
    await audit(req, 'update', 'Sınıf', id, `${cls.name} rehber öğretmeni: ${teacherName ?? 'yok'}`);
    bus.contentChanged(schoolId);
    return { ok: true };
  });

  /** İkili öğretim: seçili sınıfların vardiyası (sabahçı / öğlenci) */
  app.post('/api/schools/:schoolId/classes/shift', write, async (req) => {
    const body = parse(classShiftSchema, req.body);
    const schoolId = req.ctx.schoolId;
    if (!body.classIds.length) return { updated: 0 };
    const rows = await db
      .update(classGroups)
      .set({ shift: body.shift, updatedAt: new Date() })
      .where(and(eq(classGroups.schoolId, schoolId), inArray(classGroups.id, body.classIds)))
      .returning({ id: classGroups.id });
    await audit(req, 'update', 'Zil düzeni', null, `${rows.length} sınıf ${body.shift === 'afternoon' ? 'öğlenci' : 'sabahçı'}`);
    bus.contentChanged(schoolId);
    return { updated: rows.length };
  });

  /** Seçili sınıfları zil hesabına kat / katma (ör. özel eğitim sınıfları) */
  app.post('/api/schools/:schoolId/classes/bell-exempt', write, async (req) => {
    const body = parse(classBellExemptSchema, req.body);
    const schoolId = req.ctx.schoolId;
    if (!body.classIds.length) return { updated: 0 };
    const rows = await db
      .update(classGroups)
      .set({ bellExempt: body.exempt, updatedAt: new Date() })
      .where(and(eq(classGroups.schoolId, schoolId), inArray(classGroups.id, body.classIds)))
      .returning({ id: classGroups.id });
    await audit(req, 'update', 'Zil düzeni', null, `${rows.length} sınıf zil hesabına ${body.exempt ? 'katılmıyor' : 'katılıyor'}`);
    bus.contentChanged(schoolId);
    return { updated: rows.length };
  });

  app.get(base, { preHandler: [app.authenticate, schoolGuard()] }, async (req) =>
    db
      .select()
      .from(t)
      .where(eq(t.schoolId, req.ctx.schoolId))
      .orderBy(asc(t.weekday), asc(t.periodNo)),
  );

  /** Bir hücreyi elle yazar: hücredeki kayıtların yerine (bölünmüş sınıfta birden çok öğretmenle) yeni ders */
  app.put(`${base}/cell`, write, async (req) => {
    const body = parse(timetableEntrySchema, req.body);
    const schoolId = req.ctx.schoolId;

    const [cls] = await db
      .select({ name: classGroups.name })
      .from(classGroups)
      .where(and(eq(classGroups.id, body.classGroupId), eq(classGroups.schoolId, schoolId)));
    if (!cls) throw badRequest('Sınıf bu okula ait değil.');

    const teacherIds = [...new Set([body.teacherId, ...(body.extraTeacherIds ?? [])].filter((x): x is string => Boolean(x)))];
    for (const teacherId of teacherIds) {
      const [teacher] = await db
        .select({ name: teachers.fullName })
        .from(teachers)
        .where(and(eq(teachers.id, teacherId), eq(teachers.schoolId, schoolId)));
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
            eq(t.teacherId, teacherId),
            ne(t.classGroupId, body.classGroupId),
          ),
        );
      if (clash) {
        throw conflict(`${teacher.name}, ${WEEKDAY_NAMES[body.weekday]} ${body.periodNo}. ders saatinde ${clash.className} sınıfında derste.`);
      }
    }

    const cell = and(eq(t.schoolId, schoolId), eq(t.weekday, body.weekday), eq(t.periodNo, body.periodNo), eq(t.classGroupId, body.classGroupId));
    const rows = await db.transaction(async (tx) => {
      await tx.delete(t).where(cell);
      const values = (teacherIds.length ? teacherIds : [null]).map((teacherId) => ({
        schoolId,
        weekday: body.weekday,
        periodNo: body.periodNo,
        classGroupId: body.classGroupId,
        subject: body.subject,
        teacherId,
      }));
      return tx.insert(t).values(values).returning();
    });
    await audit(req, 'update', 'Ders programı', rows[0]!.id, `${cls.name} · ${WEEKDAY_NAMES[body.weekday]} ${body.periodNo}. ders · ${body.subject}`);
    bus.contentChanged(schoolId);
    return rows[0];
  });

  /** Toplu silme: bir sınıfın programı, bir öğretmenin dersleri ya da okulun bütün programı */
  app.post(`${base}/clear`, write, async (req) => {
    const body = parse(
      z.discriminatedUnion('scope', [
        z.object({ scope: z.literal('all'), confirm: z.literal('delete-all') }),
        z.object({ scope: z.literal('class'), id: z.string().regex(UUID_RE) }),
        z.object({ scope: z.literal('teacher'), id: z.string().regex(UUID_RE) }),
      ]),
      req.body,
    );
    const schoolId = req.ctx.schoolId;
    const where =
      body.scope === 'all'
        ? eq(t.schoolId, schoolId)
        : and(eq(t.schoolId, schoolId), body.scope === 'class' ? eq(t.classGroupId, body.id) : eq(t.teacherId, body.id));
    const rows = await db.delete(t).where(where).returning({ id: t.id });
    const label = body.scope === 'all' ? 'okulun bütün programı' : body.scope === 'class' ? 'bir sınıfın programı' : 'bir öğretmenin dersleri';
    await audit(req, 'delete', 'Ders programı', body.scope === 'all' ? null : body.id, `${label} silindi (${rows.length} kayıt)`);
    bus.contentChanged(schoolId);
    return { deleted: rows.length };
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
