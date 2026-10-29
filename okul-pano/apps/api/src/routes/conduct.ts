import {
  academicYearOf,
  CONDUCT_GROUP_KEYS,
  CONDUCT_MIN_TEACHERS,
  CONDUCT_TEACHER_CAP,
  CONDUCT_TEMPLATES,
  classLevel,
  conductAwardSchema,
  conductCriterionSchema,
  conductEntrySchema,
  levelFromClassName,
  monthRange,
  monthSchema,
  normalizeName,
  rankConductCandidates,
  SCHOOL_LEVEL_KEYS,
  trCompare,
  type SchoolLevel,
} from '@okulpano/shared';
import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { audit, schoolGuard, UUID_RE, type AppDeps } from '../context.ts';
import { achievements, classGroups, conductAwards, conductCriteria, conductEntries, schools, students, users } from '../db/schema.ts';
import { badRequest, forbidden, notFound, parse } from '../lib/errors.ts';

/*
 * Gözlem: öğretmenler öğrencilere kriterlere göre artı / eksi verir. Okuldaki bütün öğretmenler (öğretmen kaydına
 * bağlı üyeler), rehber öğretmenler ve idare girer ve görür. Kriterleri ve ayın öğrencisini idare yönetir
 * (conduct.manage). Veliler ve pano bu verileri görmez; panoya yalnızca seçilen ayın öğrencisinin adı gider.
 * KVKK: platform destek erişimi öğrenci gözlemlerini göremez.
 */

const UNDO_MINUTES = 15;
const DELETE_OWN_HOURS = 24;

const idParam = (req: FastifyRequest, name = 'id') => {
  const v = (req.params as Record<string, string>)[name];
  if (!v || !UUID_RE.test(v)) throw notFound();
  return v;
};

/** Gözlem girebilir ve görebilir mi: idare, öğretmen kaydına bağlı üye, rehber öğretmen */
function canRecord(req: FastifyRequest): boolean {
  const c = req.ctx;
  if (c.isSupport) return false;
  return c.role === 'owner' || c.role === 'admin' || Boolean(c.teacherId) || c.permissions.includes('conduct.counsel') || c.permissions.includes('conduct.manage');
}

function requireRecorder(req: FastifyRequest) {
  if (!canRecord(req)) throw forbidden('Gözlem kayıtlarını yalnızca öğretmenler, rehber öğretmenler ve idare görebilir.');
}

/** Ayın başı ve sonu okulun saat diliminde (SQL zaman damgası karşılaştırması için) */
function monthBounds(month: string, tz: string) {
  const { from, to } = monthRange(month);
  return {
    from: sql`(${from}::timestamp AT TIME ZONE ${tz})`,
    to: sql`(${to}::timestamp AT TIME ZONE ${tz})`,
  };
}

function currentMonth(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
}

const monthQuery = (req: FastifyRequest) => {
  const raw = (req.query as { month?: string }).month;
  return raw ? parse(monthSchema, raw) : currentMonth(req.ctx.school.timezone);
};

/** Okulun sınıfları ve gözlemde kullanılan düzeyleri; düzeyi anlaşılamayan sınıf okulun en yaygın düzeyini alır */
async function schoolClasses(deps: AppDeps, schoolId: string) {
  const rows = await deps.db
    .select({ id: classGroups.id, name: classGroups.name, level: classGroups.level, sortOrder: classGroups.sortOrder })
    .from(classGroups)
    .where(eq(classGroups.schoolId, schoolId))
    .orderBy(asc(classGroups.sortOrder), asc(classGroups.name));
  const counts = new Map<SchoolLevel, number>();
  for (const r of rows) {
    const known = r.level ?? levelFromClassName(r.name);
    if (known) counts.set(known, (counts.get(known) ?? 0) + 1);
  }
  const fallback = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'high';
  return rows.map((r) => ({ ...r, resolvedLevel: classLevel(r, fallback), levelSet: Boolean(r.level) }));
}

async function userName(deps: AppDeps, userId: string) {
  const [u] = await deps.db.select({ fullName: users.fullName }).from(users).where(eq(users.id, userId));
  return u?.fullName ?? 'Kullanıcı';
}

export async function conductRoutes(app: FastifyInstance) {
  const deps = app.deps;
  const { db } = deps;
  const base = '/api/schools/:schoolId/conduct';
  const member = { preHandler: [app.authenticate, schoolGuard()] };
  const manage = { preHandler: [app.authenticate, schoolGuard('conduct.manage')] };

  /* ---------- Kriterler ---------- */

  app.get(`${base}/criteria`, member, async (req) => {
    if (!canRecord(req) && !req.ctx.permissions.includes('conduct.manage')) throw forbidden();
    const level = (req.query as { level?: string }).level;
    const where = [eq(conductCriteria.schoolId, req.ctx.schoolId)];
    if (level) {
      if (!SCHOOL_LEVEL_KEYS.includes(level as SchoolLevel)) throw badRequest('Geçersiz düzey');
      where.push(eq(conductCriteria.level, level as SchoolLevel));
    }
    const rows = await db
      .select()
      .from(conductCriteria)
      .where(and(...where))
      .orderBy(asc(conductCriteria.sortOrder), asc(conductCriteria.createdAt));
    return rows.sort((a, b) => CONDUCT_GROUP_KEYS.indexOf(a.group) - CONDUCT_GROUP_KEYS.indexOf(b.group));
  });

  app.post(`${base}/criteria`, manage, async (req) => {
    const body = parse(conductCriterionSchema, req.body);
    const [{ max } = { max: 0 }] = await db
      .select({ max: sql<number>`coalesce(max(${conductCriteria.sortOrder}), 0)::int` })
      .from(conductCriteria)
      .where(and(eq(conductCriteria.schoolId, req.ctx.schoolId), eq(conductCriteria.level, body.level)));
    const [row] = await db
      .insert(conductCriteria)
      .values({ ...body, schoolId: req.ctx.schoolId, sortOrder: max + 1 })
      .returning();
    await audit(req, 'create', 'Gözlem kriteri', row!.id, `${row!.label} (${row!.points > 0 ? '+' : ''}${row!.points})`);
    return row;
  });

  app.patch(`${base}/criteria/:id`, manage, async (req) => {
    const id = idParam(req);
    const body = parse(conductCriterionSchema.partial(), req.body);
    const [row] = await db
      .update(conductCriteria)
      .set(body)
      .where(and(eq(conductCriteria.id, id), eq(conductCriteria.schoolId, req.ctx.schoolId)))
      .returning();
    if (!row) throw notFound();
    await audit(req, 'update', 'Gözlem kriteri', id, row.label);
    return row;
  });

  app.delete(`${base}/criteria/:id`, manage, async (req) => {
    const id = idParam(req);
    // Geçmiş kayıtlar kriter adını ve puanını kendileri taşır; kriter silinince bozulmaz
    const [row] = await db
      .delete(conductCriteria)
      .where(and(eq(conductCriteria.id, id), eq(conductCriteria.schoolId, req.ctx.schoolId)))
      .returning();
    if (!row) throw notFound();
    await audit(req, 'delete', 'Gözlem kriteri', id, row.label);
    return { ok: true };
  });

  /** Hazır şablonu yükle: düzeyin şablonundaki kriterlerden okulda aynı adla olmayanlar eklenir */
  app.post(`${base}/criteria/template`, manage, async (req) => {
    const { level } = parse(z.object({ level: z.enum(SCHOOL_LEVEL_KEYS as [SchoolLevel, ...SchoolLevel[]]) }), req.body);
    const current = await db
      .select({ label: conductCriteria.label, sortOrder: conductCriteria.sortOrder })
      .from(conductCriteria)
      .where(and(eq(conductCriteria.schoolId, req.ctx.schoolId), eq(conductCriteria.level, level)));
    const have = new Set(current.map((c) => normalizeName(c.label)));
    let order = Math.max(0, ...current.map((c) => c.sortOrder));
    const add = CONDUCT_TEMPLATES[level].filter((t) => !have.has(normalizeName(t.label)));
    if (add.length) {
      await db.insert(conductCriteria).values(add.map((t) => ({ ...t, level, schoolId: req.ctx.schoolId, sortOrder: ++order })));
      await audit(req, 'create', 'Gözlem kriteri', null, `Hazır şablondan ${add.length} kriter eklendi`);
    }
    return { added: add.length };
  });

  /* ---------- Sınıflar ---------- */

  app.get(`${base}/classes`, member, async (req) => {
    requireRecorder(req);
    const [classes, counts] = await Promise.all([
      schoolClasses(deps, req.ctx.schoolId),
      db
        .select({ classGroupId: students.classGroupId, n: sql<number>`count(*)::int` })
        .from(students)
        .where(eq(students.schoolId, req.ctx.schoolId))
        .groupBy(students.classGroupId),
    ]);
    const byClass = new Map(counts.map((c) => [c.classGroupId, c.n]));
    return classes.map((c) => ({ id: c.id, name: c.name, level: c.resolvedLevel, levelSet: c.levelSet, students: byClass.get(c.id) ?? 0 }));
  });

  /** Sınıfın düzeyini elle seç (null: sınıf adından anlaşılsın) */
  app.patch(`${base}/classes/:id`, manage, async (req) => {
    const id = idParam(req);
    const { level } = parse(z.object({ level: z.enum(SCHOOL_LEVEL_KEYS as [SchoolLevel, ...SchoolLevel[]]).nullable() }), req.body);
    const [row] = await db
      .update(classGroups)
      .set({ level })
      .where(and(eq(classGroups.id, id), eq(classGroups.schoolId, req.ctx.schoolId)))
      .returning({ id: classGroups.id, name: classGroups.name });
    if (!row) throw notFound();
    await audit(req, 'update', 'Sınıf', id, `${row.name} düzeyi: ${level ?? 'addan'}`);
    return { ok: true };
  });

  /** Hızlı giriş ekranı: sınıfın öğrencileri (bu ayın net puanıyla) ve sınıfın düzeyindeki açık kriterler */
  app.get(`${base}/classes/:id/students`, member, async (req) => {
    requireRecorder(req);
    const id = idParam(req);
    const month = monthQuery(req);
    const tz = req.ctx.school.timezone;
    const cls = (await schoolClasses(deps, req.ctx.schoolId)).find((c) => c.id === id);
    if (!cls) throw notFound('Sınıf bulunamadı.');
    const { from, to } = monthBounds(month, tz);
    const [list, sums, criteria] = await Promise.all([
      db
        .select({ id: students.id, schoolNo: students.schoolNo, fullName: students.fullName })
        .from(students)
        .where(and(eq(students.schoolId, req.ctx.schoolId), eq(students.classGroupId, id))),
      db
        .select({
          studentId: conductEntries.studentId,
          plus: sql<number>`coalesce(sum(case when ${conductEntries.points} > 0 then ${conductEntries.points} end), 0)::int`,
          minus: sql<number>`coalesce(sum(case when ${conductEntries.points} < 0 then -${conductEntries.points} end), 0)::int`,
        })
        .from(conductEntries)
        .innerJoin(students, eq(students.id, conductEntries.studentId))
        .where(
          and(
            eq(conductEntries.schoolId, req.ctx.schoolId),
            eq(students.classGroupId, id),
            gte(conductEntries.createdAt, from),
            lt(conductEntries.createdAt, to),
          ),
        )
        .groupBy(conductEntries.studentId),
      db
        .select()
        .from(conductCriteria)
        .where(and(eq(conductCriteria.schoolId, req.ctx.schoolId), eq(conductCriteria.level, cls.resolvedLevel), eq(conductCriteria.isActive, true)))
        .orderBy(asc(conductCriteria.sortOrder)),
    ]);
    const bySt = new Map(sums.map((s) => [s.studentId, s]));
    // Okul numarası sayısal ise sayı sırasıyla (2, 10, 101), değilse alfabetik
    const noOrder = (a: string, b: string) => (/^\d+$/.test(a) && /^\d+$/.test(b) ? Number(a) - Number(b) : trCompare(a, b));
    return {
      month,
      class: { id: cls.id, name: cls.name, level: cls.resolvedLevel },
      criteria: criteria.sort((a, b) => CONDUCT_GROUP_KEYS.indexOf(a.group) - CONDUCT_GROUP_KEYS.indexOf(b.group)),
      students: list
        .sort((a, b) => noOrder(a.schoolNo, b.schoolNo))
        .map((s) => {
          const t = bySt.get(s.id);
          return { ...s, plus: t?.plus ?? 0, minus: t?.minus ?? 0, net: (t?.plus ?? 0) - (t?.minus ?? 0) };
        }),
    };
  });

  /* ---------- Kayıtlar ---------- */

  app.post(`${base}/entries`, member, async (req) => {
    requireRecorder(req);
    const body = parse(conductEntrySchema, req.body);
    const schoolId = req.ctx.schoolId;
    const [criterion] = await db
      .select()
      .from(conductCriteria)
      .where(and(eq(conductCriteria.id, body.criterionId), eq(conductCriteria.schoolId, schoolId)));
    if (!criterion || !criterion.isActive) throw badRequest('Kriter bulunamadı ya da kapalı.');
    const note = body.note?.trim() || null;
    if (criterion.noteRequired && !note) throw badRequest(`"${criterion.label}" için kısa bir not yazın.`);
    const ids = [...new Set(body.studentIds)];
    const found = await db
      .select({ id: students.id, fullName: students.fullName })
      .from(students)
      .where(and(eq(students.schoolId, schoolId), inArray(students.id, ids)));
    if (found.length !== ids.length) throw badRequest('Öğrencilerden biri bulunamadı.');
    const batchId = randomUUID();
    const name = await userName(deps, req.ctx.userId);
    await db.insert(conductEntries).values(
      found.map((s) => ({
        schoolId,
        studentId: s.id,
        criterionId: criterion.id,
        group: criterion.group,
        label: criterion.label,
        points: criterion.points,
        note,
        userId: req.ctx.userId,
        userName: name,
        batchId,
      })),
    );
    const sign = criterion.points > 0 ? '+' : '';
    await audit(
      req,
      'create',
      'Gözlem',
      batchId,
      found.length === 1 ? `${found[0]!.fullName}: ${sign}${criterion.points} ${criterion.label}` : `${found.length} öğrenciye ${sign}${criterion.points} ${criterion.label}`,
    );
    return { batchId, count: found.length, label: criterion.label, points: criterion.points, names: found.map((s) => s.fullName) };
  });

  /** Geri al: kaydı giren UNDO_MINUTES dakika içinde, idare her zaman */
  app.delete(`${base}/batches/:batchId`, member, async (req) => {
    requireRecorder(req);
    const batchId = idParam(req, 'batchId');
    const rows = await db
      .select({ id: conductEntries.id, userId: conductEntries.userId, createdAt: conductEntries.createdAt })
      .from(conductEntries)
      .where(and(eq(conductEntries.batchId, batchId), eq(conductEntries.schoolId, req.ctx.schoolId)));
    if (!rows.length) throw notFound();
    const manager = req.ctx.permissions.includes('conduct.manage');
    const fresh = rows.every((r) => r.userId === req.ctx.userId && Date.now() - r.createdAt.getTime() < UNDO_MINUTES * 60_000);
    if (!manager && !fresh) throw forbidden(`Kaydı yalnızca giren öğretmen ${UNDO_MINUTES} dakika içinde geri alabilir.`);
    await db.delete(conductEntries).where(and(eq(conductEntries.batchId, batchId), eq(conductEntries.schoolId, req.ctx.schoolId)));
    await audit(req, 'delete', 'Gözlem', batchId, `${rows.length} kayıt geri alındı`);
    return { deleted: rows.length };
  });

  /** Tek kaydı sil: giren öğretmen DELETE_OWN_HOURS saat içinde, idare her zaman */
  app.delete(`${base}/entries/:id`, member, async (req) => {
    requireRecorder(req);
    const id = idParam(req);
    const [row] = await db
      .select()
      .from(conductEntries)
      .where(and(eq(conductEntries.id, id), eq(conductEntries.schoolId, req.ctx.schoolId)));
    if (!row) throw notFound();
    const manager = req.ctx.permissions.includes('conduct.manage');
    if (!manager && (row.userId !== req.ctx.userId || Date.now() - row.createdAt.getTime() > DELETE_OWN_HOURS * 3600_000)) {
      throw forbidden(`Kaydı yalnızca giren öğretmen ${DELETE_OWN_HOURS} saat içinde silebilir.`);
    }
    await db.delete(conductEntries).where(eq(conductEntries.id, id));
    await audit(req, 'delete', 'Gözlem', id, `${row.label} (${row.points})`);
    return { ok: true };
  });

  /** Öğrenci kartı: ayın toplamları, kriter dağılımı ve kayıtlar */
  app.get(`${base}/students/:id`, member, async (req) => {
    requireRecorder(req);
    const id = idParam(req);
    const month = monthQuery(req);
    const [student] = await db
      .select({ id: students.id, schoolNo: students.schoolNo, fullName: students.fullName, className: classGroups.name })
      .from(students)
      .leftJoin(classGroups, eq(classGroups.id, students.classGroupId))
      .where(and(eq(students.id, id), eq(students.schoolId, req.ctx.schoolId)));
    if (!student) throw notFound('Öğrenci bulunamadı.');
    const { from, to } = monthBounds(month, req.ctx.school.timezone);
    const entries = await db
      .select({
        id: conductEntries.id,
        group: conductEntries.group,
        label: conductEntries.label,
        points: conductEntries.points,
        note: conductEntries.note,
        userId: conductEntries.userId,
        userName: conductEntries.userName,
        batchId: conductEntries.batchId,
        createdAt: conductEntries.createdAt,
      })
      .from(conductEntries)
      .where(and(eq(conductEntries.studentId, id), gte(conductEntries.createdAt, from), lt(conductEntries.createdAt, to)))
      .orderBy(desc(conductEntries.createdAt));
    const byLabel = new Map<string, { label: string; group: string; points: number; count: number }>();
    for (const e of entries) {
      const k = `${e.label}|${Math.sign(e.points)}`;
      const cur = byLabel.get(k) ?? { label: e.label, group: e.group, points: 0, count: 0 };
      cur.points += e.points;
      cur.count++;
      byLabel.set(k, cur);
    }
    const plus = entries.filter((e) => e.points > 0);
    const minus = entries.filter((e) => e.points < 0);
    const canSeeAuthors = req.ctx.permissions.includes('conduct.manage') || req.ctx.permissions.includes('conduct.counsel');
    return {
      month,
      student,
      totals: {
        net: entries.reduce((n, e) => n + e.points, 0),
        plus: plus.length,
        minus: minus.length,
        plusPoints: plus.reduce((n, e) => n + e.points, 0),
        minusPoints: -minus.reduce((n, e) => n + e.points, 0),
        teachers: new Set(entries.map((e) => e.userId ?? e.userName)).size,
      },
      byCriterion: [...byLabel.values()].sort((a, b) => Math.abs(b.points) - Math.abs(a.points)),
      canSeeAuthors,
      // Kaydı kimin girdiğini yalnızca idare ve rehber öğretmen görür; öğretmen kendi kayıtlarını tanır
      entries: entries.map(({ userId, ...e }) => {
        const mine = userId === req.ctx.userId;
        return { ...e, userName: canSeeAuthors || mine ? e.userName : null, mine };
      }),
    };
  });

  /* ---------- Ayın öğrencisi ---------- */

  app.get(`${base}/awards/candidates`, member, async (req) => {
    const ctx = req.ctx;
    if (!ctx.permissions.includes('conduct.manage') && !ctx.permissions.includes('conduct.counsel')) throw forbidden();
    if (ctx.isSupport) throw forbidden('Destek erişimi öğrenci gözlemlerini göremez.');
    const month = monthQuery(req);
    const q = req.query as { scope?: string; key?: string };
    const scope = q.scope === 'level' || q.scope === 'class' ? q.scope : 'school';
    const classes = await schoolClasses(deps, ctx.schoolId);
    const classIds =
      scope === 'class'
        ? classes.filter((c) => c.id === q.key).map((c) => c.id)
        : scope === 'level'
          ? classes.filter((c) => c.resolvedLevel === q.key).map((c) => c.id)
          : null;
    if (classIds && !classIds.length) return { month, scope, candidates: [], awards: [] };
    const { from, to } = monthBounds(month, ctx.school.timezone);
    const entries = await db
      .select({ studentId: conductEntries.studentId, userId: conductEntries.userId, userName: conductEntries.userName, points: conductEntries.points, label: conductEntries.label })
      .from(conductEntries)
      .innerJoin(students, eq(students.id, conductEntries.studentId))
      .where(
        and(
          eq(conductEntries.schoolId, ctx.schoolId),
          gte(conductEntries.createdAt, from),
          lt(conductEntries.createdAt, to),
          ...(classIds ? [inArray(students.classGroupId, classIds)] : []),
        ),
      );
    const ranked = rankConductCandidates(
      entries.map((e) => ({ studentId: e.studentId, by: e.userId ?? e.userName, points: e.points })),
      { limit: 5 },
    );
    const ids = ranked.map((r) => r.studentId);
    const [info, awards] = await Promise.all([
      ids.length
        ? db
            .select({ id: students.id, schoolNo: students.schoolNo, fullName: students.fullName, className: classGroups.name })
            .from(students)
            .leftJoin(classGroups, eq(classGroups.id, students.classGroupId))
            .where(inArray(students.id, ids))
        : Promise.resolve([]),
      db
        .select({ id: conductAwards.id, month: conductAwards.month, studentId: conductAwards.studentId, fullName: students.fullName, className: classGroups.name })
        .from(conductAwards)
        .innerJoin(students, eq(students.id, conductAwards.studentId))
        .leftJoin(classGroups, eq(classGroups.id, students.classGroupId))
        .where(eq(conductAwards.schoolId, ctx.schoolId))
        .orderBy(desc(conductAwards.month)),
    ]);
    const infoById = new Map(info.map((s) => [s.id, s]));
    const topLabel = (studentId: string) => {
      const n = new Map<string, number>();
      for (const e of entries) if (e.studentId === studentId && e.points > 0) n.set(e.label, (n.get(e.label) ?? 0) + e.points);
      return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    };
    return {
      month,
      scope,
      rules: { cap: CONDUCT_TEACHER_CAP, minTeachers: CONDUCT_MIN_TEACHERS },
      candidates: ranked.map((r) => ({
        ...r,
        student: infoById.get(r.studentId)!,
        topLabel: topLabel(r.studentId),
        awardedIn: awards.filter((a) => a.studentId === r.studentId).map((a) => a.month),
      })),
      awards: awards.filter((a) => a.month === month),
    };
  });

  /** Seçim: panodaki "Ayın öğrencisi" şablonuna gider (Başarılar). Puanlar ve sıralama panoya gitmez. */
  app.post(`${base}/awards`, manage, async (req) => {
    const body = parse(conductAwardSchema, req.body);
    const ctx = req.ctx;
    const [student] = await db
      .select({ id: students.id, fullName: students.fullName, className: classGroups.name })
      .from(students)
      .leftJoin(classGroups, eq(classGroups.id, students.classGroupId))
      .where(and(eq(students.id, body.studentId), eq(students.schoolId, ctx.schoolId)));
    if (!student) throw notFound('Öğrenci bulunamadı.');
    const [y, m] = body.month.split('-').map(Number) as [number, number];
    const monthName = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 15)));
    const name = await userName(deps, ctx.userId);
    const result = await db.transaction(async (tx) => {
      const [ach] = await tx
        .insert(achievements)
        .values({
          schoolId: ctx.schoolId,
          kind: 'month',
          name: student.fullName,
          className: student.className,
          title: body.title?.trim() || `${monthName} ayının öğrencisi`,
          description: body.description ?? null,
          photoUrl: body.photoUrl ?? null,
          // Seçildiği andan bir ay boyunca panoda kalır; Başarılar sayfasından değiştirilebilir
          startsAt: new Date(),
          endsAt: new Date(Date.now() + 31 * 86400_000),
        })
        .returning({ id: achievements.id });
      const [award] = await tx
        .insert(conductAwards)
        .values({ schoolId: ctx.schoolId, month: body.month, studentId: student.id, achievementId: ach!.id, selectedBy: name })
        .onConflictDoNothing()
        .returning({ id: conductAwards.id });
      if (!award) throw badRequest('Bu öğrenci bu ay için zaten seçildi.');
      return { awardId: award.id, achievementId: ach!.id };
    });
    await audit(req, 'create', 'Ayın öğrencisi', result.awardId, `${student.fullName} · ${monthName}`);
    deps.bus.contentChanged(ctx.schoolId);
    return result;
  });

  /** Seçimi geri al: panodaki başarı kaydı da kaldırılır */
  app.delete(`${base}/awards/:id`, manage, async (req) => {
    const id = idParam(req);
    const [award] = await db
      .delete(conductAwards)
      .where(and(eq(conductAwards.id, id), eq(conductAwards.schoolId, req.ctx.schoolId)))
      .returning();
    if (!award) throw notFound();
    if (award.achievementId) await db.delete(achievements).where(and(eq(achievements.id, award.achievementId), eq(achievements.schoolId, req.ctx.schoolId)));
    await audit(req, 'delete', 'Ayın öğrencisi', id, award.month);
    deps.bus.contentChanged(req.ctx.schoolId);
    return { ok: true };
  });
}

/**
 * KVKK saklama süresi: okul "öğretim yılı sonunda sil" seçtiyse (varsayılan) önceki öğretim yıllarının gözlem
 * kayıtları silinir. Ayın öğrencisi seçimleri (panoya giden başarılar) kalır. Saatlik görevden çağrılır.
 */
export async function runConductRetention(deps: AppDeps, today = new Date()) {
  const startYear = academicYearOf(today.toISOString().slice(0, 10));
  const cutoff = new Date(`${startYear}-09-01T00:00:00Z`);
  const rows = await deps.db.select({ id: schools.id, settings: schools.settings }).from(schools);
  let deleted = 0;
  for (const s of rows) {
    if ((s.settings as { conductRetention?: string } | null)?.conductRetention === 'keep') continue;
    const r = await deps.db
      .delete(conductEntries)
      .where(and(eq(conductEntries.schoolId, s.id), lt(conductEntries.createdAt, cutoff)))
      .returning({ id: conductEntries.id });
    deleted += r.length;
  }
  return deleted;
}
