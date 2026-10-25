import {
  achievementSchema,
  announcementSchema,
  bellScheduleSchema,
  bookSchema,
  classGroupSchema,
  examSchema,
  leaveSchema,
  reviewSchema,
  schoolEventSchema,
  schoolSettingsSchema,
  tickerSchema,
} from '@okulpano/shared';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { audit, schoolGuard, UUID_RE } from '../context.ts';
import {
  achievements,
  announcements,
  bellSchedules,
  books,
  classGroups,
  exams,
  schoolEvents,
  screens,
  teacherLeaves,
  teachers,
  tickerItems,
} from '../db/schema.ts';
import { badRequest, notFound, parse } from '../lib/errors.ts';
import { registerResource } from './crud.ts';

/** Onay akışı açıksa onay yetkisi olmayanın eklediği / değiştirdiği duyuru onay bekler */
function approvalFor(req: FastifyRequest) {
  const settings = schoolSettingsSchema.parse(req.ctx.school.settings ?? {});
  const pending = settings.requireApproval && !req.ctx.permissions.includes('announcements.approve');
  return pending
    ? { approvalStatus: 'pending' as const, reviewedBy: null, reviewNote: null }
    : { approvalStatus: 'approved' as const, reviewedBy: null, reviewNote: null };
}

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
      design: i.kind === 'design' ? (i.design ?? null) : null,
      screenIds: i.screenIds?.length ? [...new Set(i.screenIds)] : null,
      schedule: i.schedule && (i.schedule.days.length || i.schedule.from || i.schedule.to || i.schedule.phase !== 'any') ? i.schedule : null,
      ...approvalFor(req),
      startsAt: toDate(i.startsAt),
      endsAt: toDate(i.endsAt),
      ...(req.method === 'POST' ? { createdBy: req.ctx.userId } : {}),
    }),
    // Seçilen panolar bu okula ait olmalı
    validate: async (req, row) => {
      const ids = row.screenIds as string[] | null;
      if (!ids?.length) return;
      const found = await app.deps.db
        .select({ id: screens.id })
        .from(screens)
        .where(and(inArray(screens.id, ids), eq(screens.schoolId, req.ctx.schoolId)));
      if (found.length !== ids.length) throw badRequest('Seçilen panolardan biri bu okula ait değil.');
    },
  });

  // Onay akışı: onay yetkisi olanlar bekleyen duyuruyu onaylar ya da notla reddeder
  const review = { preHandler: [app.authenticate, schoolGuard('announcements.approve')] };
  const reviewAnnouncement = (status: 'approved' | 'rejected') => async (req: FastifyRequest) => {
    const { id } = req.params as { id: string };
    if (!UUID_RE.test(id)) throw notFound();
    const { note } = parse(reviewSchema, req.body ?? {});
    const [updated] = await app.deps.db
      .update(announcements)
      .set({ approvalStatus: status, reviewedBy: req.ctx.userId, reviewNote: status === 'rejected' ? (note?.trim() || null) : null })
      .where(and(eq(announcements.id, id), eq(announcements.schoolId, req.ctx.schoolId)))
      .returning();
    if (!updated) throw notFound();
    await audit(req, status === 'approved' ? 'approve' : 'reject', 'Duyuru', id, updated.title);
    app.deps.bus.contentChanged(req.ctx.schoolId);
    return updated;
  };
  app.post('/api/schools/:schoolId/announcements/:id/approve', review, reviewAnnouncement('approved'));
  app.post('/api/schools/:schoolId/announcements/:id/reject', review, reviewAnnouncement('rejected'));

  const toDateOpt = (i: { startsAt?: string | null; endsAt?: string | null }) => ({ startsAt: toDate(i.startsAt), endsAt: toDate(i.endsAt) });
  registerResource(app, {
    path: 'achievements',
    entity: 'Başarı',
    table: achievements,
    permission: 'highlights.manage',
    schema: achievementSchema,
    toRow: (i) => ({ ...i, ...toDateOpt(i) }),
    summary: (r) => `${String(r.name)} · ${String(r.title)}`,
  });

  registerResource(app, {
    path: 'events',
    entity: 'Etkinlik',
    table: schoolEvents,
    permission: 'highlights.manage',
    schema: schoolEventSchema,
    orderBy: [asc(schoolEvents.date)],
  });

  registerResource(app, {
    path: 'books',
    entity: 'Haftanın kitabı',
    table: books,
    permission: 'highlights.manage',
    schema: bookSchema,
    toRow: (i) => ({ ...i, ...toDateOpt(i) }),
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
    path: 'bell-schedules',
    entity: 'Zil çizelgesi',
    table: bellSchedules,
    permission: 'schedule.manage',
    schema: bellScheduleSchema,
    toRow: (i) => ({ ...i, weekdays: [...i.weekdays].sort(), periods: [...i.periods].sort((a, b) => a.start.localeCompare(b.start)) }),
  });
}
