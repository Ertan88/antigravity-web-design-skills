import {
  announcementSchema,
  bellScheduleSchema,
  classGroupSchema,
  dutySchema,
  examSchema,
  leaveSchema,
  studentImportSchema,
  studentSchema,
  tickerSchema,
  WEEKDAY_NAMES,
} from '@okulpano/shared';
import { asc, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { audit, schoolGuard } from '../context.ts';
import { parse } from '../lib/errors.ts';
import {
  announcements,
  bellSchedules,
  classGroups,
  duties,
  exams,
  students,
  teacherLeaves,
  teachers,
  tickerItems,
} from '../db/schema.ts';
import { registerResource } from './crud.ts';

const toDate = (v: string | null | undefined) => (v ? new Date(v) : null);

export async function contentRoutes(app: FastifyInstance) {
  registerResource(app, {
    path: 'announcements',
    entity: 'Duyuru',
    table: announcements,
    permission: 'announcements.manage',
    schema: announcementSchema,
    orderBy: [asc(announcements.sortOrder), desc(announcements.createdAt)],
    toRow: (i, req) => ({
      ...i,
      body: i.body || null,
      imageUrl: i.kind === 'image' ? i.imageUrl : (i.imageUrl ?? null),
      youtubeUrl: i.kind === 'video' ? i.youtubeUrl : null,
      startsAt: toDate(i.startsAt),
      endsAt: toDate(i.endsAt),
      ...(req.method === 'POST' ? { createdBy: req.ctx.userId } : {}),
    }),
  });

  registerResource(app, {
    path: 'ticker',
    entity: 'Kayan yazı',
    table: tickerItems,
    permission: 'ticker.manage',
    schema: tickerSchema,
    toRow: (i) => ({ ...i, startsAt: toDate(i.startsAt), endsAt: toDate(i.endsAt) }),
  });

  registerResource(app, {
    path: 'exams',
    entity: 'Sınav',
    table: exams,
    permission: 'exams.manage',
    schema: examSchema,
    orderBy: [asc(exams.examAt)],
    toRow: (i) => ({ ...i, examAt: new Date(i.examAt) }),
  });

  registerResource(app, {
    path: 'classes',
    entity: 'Sınıf',
    table: classGroups,
    permission: 'directory.manage',
    schema: classGroupSchema,
    orderBy: [asc(classGroups.sortOrder), asc(classGroups.name)],
  });

  registerResource(app, {
    path: 'duties',
    entity: 'Nöbet',
    table: duties,
    permission: 'duties.manage',
    schema: dutySchema,
    orderBy: [asc(duties.weekday), asc(duties.sortOrder), asc(duties.area)],
    refs: { teacherId: teachers },
    summary: (r) => `${WEEKDAY_NAMES[r.weekday as number] ?? ''} · ${r.area}`,
  });

  registerResource(app, {
    path: 'leaves',
    entity: 'İzin',
    table: teacherLeaves,
    permission: 'leaves.manage',
    schema: leaveSchema,
    orderBy: [desc(teacherLeaves.startDate)],
    refs: { teacherId: teachers },
    summary: (r) => `${r.startDate} – ${r.endDate}`,
  });

  registerResource(app, {
    path: 'students',
    entity: 'Öğrenci',
    table: students,
    permission: 'students.manage',
    schema: studentSchema,
    orderBy: [asc(students.fullName)],
    refs: { classGroupId: classGroups },
    toRow: (i) => ({ ...i, classGroupId: i.classGroupId ?? null }),
  });

  app.post(
    '/api/schools/:schoolId/students/import',
    { preHandler: [app.authenticate, schoolGuard('students.manage')] },
    async (req) => {
      const { rows } = parse(studentImportSchema, req.body);
      const schoolId = req.ctx.schoolId;
      const result = await app.deps.db.transaction(async (tx) => {
        const existing = await tx.select().from(classGroups).where(eq(classGroups.schoolId, schoolId));
        const classIds = new Map(existing.map((c) => [c.name.toLocaleUpperCase('tr-TR'), c.id]));
        const missing = [
          ...new Set(rows.map((r) => r.className?.trim().toLocaleUpperCase('tr-TR')).filter((n): n is string => Boolean(n))),
        ].filter((n) => !classIds.has(n));
        if (missing.length) {
          const created = await tx
            .insert(classGroups)
            .values(missing.map((name, i) => ({ schoolId, name, sortOrder: existing.length + i })))
            .returning();
          for (const c of created) classIds.set(c.name, c.id);
        }
        for (let i = 0; i < rows.length; i += 500) {
          await tx.insert(students).values(
            rows.slice(i, i + 500).map((r) => ({
              schoolId,
              fullName: r.fullName,
              birthDate: r.birthDate,
              classGroupId: r.className ? (classIds.get(r.className.trim().toLocaleUpperCase('tr-TR')) ?? null) : null,
            })),
          );
        }
        return { created: rows.length, classesCreated: missing.length };
      });
      await audit(req, 'create', 'Öğrenci', null, `${result.created} öğrenci içe aktarıldı`);
      app.deps.bus.contentChanged(schoolId);
      return result;
    },
  );

  registerResource(app, {
    path: 'bell-schedules',
    entity: 'Zil çizelgesi',
    table: bellSchedules,
    permission: 'schedule.manage',
    schema: bellScheduleSchema,
    toRow: (i) => ({ ...i, weekdays: [...i.weekdays].sort(), periods: [...i.periods].sort((a, b) => a.start.localeCompare(b.start)) }),
  });
}
