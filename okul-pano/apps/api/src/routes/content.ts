import {
  announcementSchema,
  bellScheduleSchema,
  classGroupSchema,
  examSchema,
  leaveSchema,
  tickerSchema,
} from '@okulpano/shared';
import { asc, desc } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  announcements,
  bellSchedules,
  classGroups,
  exams,
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
