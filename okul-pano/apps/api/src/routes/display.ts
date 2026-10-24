import {
  schoolSettingsSchema,
  upcomingMonthDays,
  zonedParts,
  type DisplayState,
} from '@okulpano/shared';
import { and, asc, desc, eq, gt, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { UUID_RE } from '../context.ts';
import type { DB } from '../db/client.ts';
import {
  announcements,
  bellSchedules,
  classGroups,
  displayPairings,
  duties,
  dutySupervisors,
  exams,
  schools,
  screens,
  students,
  teacherLeaves,
  teachers,
  tickerItems,
  timetableEntries,
  transportDuties,
} from '../db/schema.ts';
import { pairingCode, randomToken, sha256 } from '../lib/crypto.ts';
import { forbidden, notFound, unauthorized } from '../lib/errors.ts';
import { getWeather } from '../lib/weather.ts';
import { DEVICE_TOKEN_PREFIX } from './screens.ts';

const PAIRING_TTL_MS = 10 * 60 * 1000;

interface DisplayAuth {
  schoolId: string;
  screen: typeof screens.$inferSelect | null;
}

/** Ekranlar cihaz anahtarıyla, paneldeki önizleme kısa ömürlü JWT ile kimlik doğrular. */
async function resolveDisplay(app: FastifyInstance, req: FastifyRequest, queryToken?: string): Promise<DisplayAuth> {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : queryToken;
  if (!token) throw unauthorized('Ekran anahtarı gerekli.');

  if (token.startsWith(`${DEVICE_TOKEN_PREFIX}_`)) {
    const [screen] = await app.deps.db.select().from(screens).where(eq(screens.tokenHash, sha256(token)));
    if (!screen) throw unauthorized('Ekran anahtarı geçersiz ya da ekran silinmiş.');
    if (!screen.lastSeenAt || Date.now() - screen.lastSeenAt.getTime() > 60_000) {
      await app.deps.db.update(screens).set({ lastSeenAt: new Date() }).where(eq(screens.id, screen.id));
    }
    return { schoolId: screen.schoolId, screen };
  }
  try {
    const payload = app.jwt.verify<{ typ?: string; sch?: string }>(token);
    if (payload.typ === 'preview' && payload.sch) return { schoolId: payload.sch, screen: null };
  } catch {
    /* geçersiz */
  }
  throw unauthorized('Ekran anahtarı geçersiz.');
}

function groupTransport(rows: { date: string; teacherName: string }[]) {
  const byDate = new Map<string, string[]>();
  for (const r of rows) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r.teacherName]);
  return [...byDate].map(([date, teacherNames]) => ({ date, teacherNames }));
}

export async function buildDisplayState(db: DB, auth: DisplayAuth, now = new Date()): Promise<DisplayState> {
  const [school] = await db.select().from(schools).where(eq(schools.id, auth.schoolId));
  if (!school) throw notFound('Okul bulunamadı.');
  if (!school.isActive) throw forbidden('Okul hesabı askıya alınmış.');

  const id = school.id;
  const tz = school.timezone;
  const today = zonedParts(now, tz).isoDate;
  const weekAhead = new Date(now.getTime() + 7 * 86400_000);
  const weekAheadDate = zonedParts(weekAhead, tz).isoDate;
  const monthDays = upcomingMonthDays(now, tz, 8);
  if (monthDays.includes('02-28')) monthDays.push('02-29');

  // Önümüzdeki haftaya planlanmış içerik de gönderilir; pano zamanı gelince kendisi gösterir.
  const windowed = (startsAt: PgColumn, endsAt: PgColumn) =>
    and(or(isNull(endsAt), gt(endsAt, now)), or(isNull(startsAt), lte(startsAt, weekAhead)));

  const [examRows, dutyRows, supervisorRows, transportRows, leaveRows, birthdayRows, annRows, tickerRows, bellRows, ttRows] = await Promise.all([
    db
      .select({ id: exams.id, title: exams.title, examAt: exams.examAt })
      .from(exams)
      .where(and(eq(exams.schoolId, id), eq(exams.isActive, true), gt(exams.examAt, new Date(now.getTime() - 12 * 3600_000))))
      .orderBy(asc(exams.examAt), asc(exams.sortOrder))
      .limit(5),
    db
      .select({ id: duties.id, weekday: duties.weekday, area: duties.area, teacherName: teachers.fullName })
      .from(duties)
      .innerJoin(teachers, eq(teachers.id, duties.teacherId))
      .where(eq(duties.schoolId, id))
      .orderBy(asc(duties.weekday), asc(duties.sortOrder), asc(duties.area)),
    db
      .select({ date: dutySupervisors.date, name: dutySupervisors.name })
      .from(dutySupervisors)
      .where(and(eq(dutySupervisors.schoolId, id), gte(dutySupervisors.date, today), lte(dutySupervisors.date, weekAheadDate)))
      .orderBy(asc(dutySupervisors.date)),
    db
      .select({ date: transportDuties.date, teacherName: teachers.fullName })
      .from(transportDuties)
      .innerJoin(teachers, eq(teachers.id, transportDuties.teacherId))
      .where(and(eq(transportDuties.schoolId, id), gte(transportDuties.date, today), lte(transportDuties.date, weekAheadDate)))
      .orderBy(asc(transportDuties.date), asc(transportDuties.sortOrder)),
    db
      .select({ id: teacherLeaves.id, teacherName: teachers.fullName, startDate: teacherLeaves.startDate, endDate: teacherLeaves.endDate })
      .from(teacherLeaves)
      .innerJoin(teachers, eq(teachers.id, teacherLeaves.teacherId))
      .where(and(eq(teacherLeaves.schoolId, id), gte(teacherLeaves.endDate, today), lte(teacherLeaves.startDate, weekAheadDate)))
      .orderBy(asc(teachers.fullName)),
    db
      .select({
        id: students.id,
        name: students.fullName,
        className: classGroups.name,
        monthDay: sql<string>`to_char(${students.birthDate}, 'MM-DD')`,
      })
      .from(students)
      .leftJoin(classGroups, eq(classGroups.id, students.classGroupId))
      .where(and(eq(students.schoolId, id), inArray(sql`to_char(${students.birthDate}, 'MM-DD')`, monthDays)))
      .orderBy(asc(classGroups.name), asc(students.fullName)),
    db
      .select()
      .from(announcements)
      .where(and(eq(announcements.schoolId, id), eq(announcements.isActive, true), windowed(announcements.startsAt, announcements.endsAt)))
      // Paneldeki listeyle birebir aynı sıra: önce elle verilen sıra, eşitse en yeni üstte
      .orderBy(asc(announcements.sortOrder), desc(announcements.createdAt)),
    db
      .select()
      .from(tickerItems)
      .where(and(eq(tickerItems.schoolId, id), eq(tickerItems.isActive, true), windowed(tickerItems.startsAt, tickerItems.endsAt)))
      .orderBy(asc(tickerItems.sortOrder), asc(tickerItems.createdAt)),
    db.select().from(bellSchedules).where(eq(bellSchedules.schoolId, id)).orderBy(asc(bellSchedules.sortOrder)),
    db
      .select({
        weekday: timetableEntries.weekday,
        periodNo: timetableEntries.periodNo,
        className: classGroups.name,
        classOrder: classGroups.sortOrder,
        subject: timetableEntries.subject,
        teacherName: teachers.fullName,
      })
      .from(timetableEntries)
      .innerJoin(classGroups, eq(classGroups.id, timetableEntries.classGroupId))
      .leftJoin(teachers, eq(teachers.id, timetableEntries.teacherId))
      .where(eq(timetableEntries.schoolId, id))
      .orderBy(asc(timetableEntries.weekday), asc(timetableEntries.periodNo), asc(classGroups.sortOrder), asc(classGroups.name)),
  ]);

  const iso = (d: Date | null) => (d ? d.toISOString() : null);

  return {
    serverTime: now.toISOString(),
    screen: auth.screen ? { id: auth.screen.id, name: auth.screen.name } : null,
    school: {
      id,
      name: school.name,
      logoUrl: school.logoUrl,
      timezone: tz,
      city: school.city,
      settings: schoolSettingsSchema.parse(school.settings ?? {}),
    },
    exams: examRows.map((e) => ({ ...e, examAt: e.examAt.toISOString() })),
    duties: dutyRows,
    dutySupervisors: supervisorRows,
    transportDuties: groupTransport(transportRows),
    leaves: leaveRows,
    birthdays: birthdayRows,
    announcements: annRows.map((a) => ({
      id: a.id,
      kind: a.kind,
      title: a.title,
      body: a.body,
      imageUrl: a.imageUrl,
      youtubeUrl: a.youtubeUrl,
      durationSec: a.durationSec,
      startsAt: iso(a.startsAt),
      endsAt: iso(a.endsAt),
    })),
    ticker: tickerRows.map((t) => ({ id: t.id, text: t.text, startsAt: iso(t.startsAt), endsAt: iso(t.endsAt) })),
    bellSchedules: bellRows.map((b) => ({ id: b.id, name: b.name, weekdays: b.weekdays, periods: b.periods, sortOrder: b.sortOrder })),
    timetable: ttRows.map(({ classOrder: _, ...r }) => r),
  };
}

export async function displayRoutes(app: FastifyInstance) {
  const { db, bus } = app.deps;

  /** 1) Ekran açılır, kod ister ve kodu büyük puntoyla gösterir. */
  app.post('/api/display/pairings', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (_req, reply) => {
    await db.delete(displayPairings).where(lte(displayPairings.expiresAt, new Date()));
    const pollSecret = randomToken('ps', 24);
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = pairingCode();
      const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);
      const inserted = await db
        .insert(displayPairings)
        .values({ code, pollSecretHash: sha256(pollSecret), expiresAt })
        .onConflictDoNothing()
        .returning({ id: displayPairings.id });
      if (inserted[0]) return reply.status(201).send({ id: inserted[0].id, code, pollSecret, expiresAt: expiresAt.toISOString() });
    }
    throw new Error('Eşleştirme kodu üretilemedi');
  });

  /** 2) Ekran, yönetici kodu girene kadar bu adresi yoklar; eşleşince kalıcı anahtarını bir kez alır. */
  app.get('/api/display/pairings/:id', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req) => {
    const { id } = req.params as { id: string };
    const secret = req.headers['x-poll-secret'];
    if (!UUID_RE.test(id) || typeof secret !== 'string') throw notFound();
    const [p] = await db
      .select()
      .from(displayPairings)
      .where(and(eq(displayPairings.id, id), eq(displayPairings.pollSecretHash, sha256(secret))));
    if (!p || (p.expiresAt < new Date() && !p.screenId)) throw notFound('Kodun süresi doldu.');
    if (!p.screenId) return { status: 'pending' as const };

    const token = randomToken(DEVICE_TOKEN_PREFIX);
    await db.update(screens).set({ tokenHash: sha256(token), lastSeenAt: new Date() }).where(eq(screens.id, p.screenId));
    await db.delete(displayPairings).where(eq(displayPairings.id, p.id));
    return { status: 'paired' as const, token };
  });

  app.get('/api/display/state', async (req, reply) => {
    const auth = await resolveDisplay(app, req);
    reply.header('Cache-Control', 'no-store');
    return buildDisplayState(db, auth);
  });

  app.get('/api/display/weather', async (req) => {
    const auth = await resolveDisplay(app, req);
    const [school] = await db.select().from(schools).where(eq(schools.id, auth.schoolId));
    if (!school || school.latitude == null || school.longitude == null) return null;
    return getWeather(school.latitude, school.longitude, school.timezone, school.city);
  });

  /** Canlı yayın (Server-Sent Events): içerik değişince ve uzaktan komutlarda ekran anında haberdar olur. */
  app.get('/api/display/stream', async (req, reply) => {
    const { token } = req.query as { token?: string };
    const auth = await resolveDisplay(app, req, token);
    const screenId = auth.screen?.id ?? null;

    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const send = (event: string, data: unknown) => raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    raw.write('retry: 5000\n\n');
    send('hello', { serverTime: new Date().toISOString(), screenId });

    const unsubscribe = bus.subscribe(auth.schoolId, (e) => {
      if (e.type === 'command' && e.screenId && e.screenId !== screenId) return;
      send(e.type, e);
    });
    const offline = screenId ? bus.screenConnected(screenId) : () => {};
    const ping = setInterval(() => raw.write(`: ping ${Date.now()}\n\n`), 25_000);

    req.raw.on('close', () => {
      clearInterval(ping);
      unsubscribe();
      offline();
    });
  });
}
