import {
  businessInfoSchema,
  businessSchema,
  businessStudentsSchema,
  internCells,
  internHalfText,
  internKey,
  internMarksSchema,
  internMonthDays,
  internTotals,
  monthSchema,
  schoolSettingsSchema,
  trCompare,
  schoolHalvesFromTimetable,
  zonedParts,
  type SchoolHalves,
  addIsoDays,
  formatDays,
  type InternDay,
  type InternHalf,
  type InternMark,
  INTERN_ABSENCES,
  INTERN_MARK_TEXT,
  areaVocationalSchema,
  branchIsVocational,
  gradeOf,
  internshipClassIds,
  isInternshipSubject,
  vocationalLessonShare,
  parseClassName,
} from '@okulpano/shared';
import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { audit, schoolGuard, UUID_RE, type AppDeps } from '../context.ts';
import { businesses, classGroups, internshipMarks, memberships, schools, students, teacherBranches, teachers, timetableEntries, users } from '../db/schema.ts';
import { holidaysAndHalfDays } from '../lib/dayinfo.ts';
import { badRequest, forbidden, notFound, parse } from '../lib/errors.ts';
import { notifyUsers } from '../lib/push.ts';
import { addToInbox } from './notifications.ts';

/*
 * İşletmelerde mesleki eğitim: işletmeler, öğrencilerin işletmeleri ve aylık devam çizelgesi. İşletmeleri ve bütün
 * çizelgeyi idare yönetir (internship.manage); koordinatör öğretmen kendi işletmelerindeki öğrencileri işaretler.
 * Öğretmen kendi eklediği ya da koordinatörü olduğu işletmeleri görür (KVKK); idare ve koordinatör müdür yardımcısı hepsini.
 * Devamsızlıklar (D, İ, R, H) birkaç dakika bekletilip koordinatör müdür yardımcısına (okul ayarlarında seçilen kullanıcı)
 * bildirilir: yanlışlıkla girilip hemen düzeltilen işaret bildirilmez. KVKK: destek erişimi öğrenci devam kayıtlarını
 * göremez; panoya hiçbir şey gitmez.
 */

const idParam = (req: FastifyRequest) => {
  const v = (req.params as { id?: string }).id;
  if (!v || !UUID_RE.test(v)) throw notFound();
  return v;
};

const settingsOf = (req: FastifyRequest) => schoolSettingsSchema.parse(req.ctx.school.settings ?? {});
const isManager = (req: FastifyRequest) => req.ctx.permissions.includes('internship.manage');
const isVp = (req: FastifyRequest) => settingsOf(req).internshipManagerUserId === req.ctx.userId;

function requireModule(req: FastifyRequest) {
  if (req.ctx.isSupport) throw forbidden('Destek erişimi öğrenci devam kayıtlarını göremez.');
  if (!settingsOf(req).internshipEnabled) throw forbidden('İşletmelerde mesleki eğitim modülü bu okulda kapalı (Okul Ayarları).');
}

const today = (req: FastifyRequest) => zonedParts(new Date(), req.ctx.school.timezone).isoDate;

const dateText = (iso: string) =>
  new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));

/** Kullanıcının işletmeleri: koordinatörü olduğu ya da kendi eklediği */
async function ownBusinessIds(deps: AppDeps, req: FastifyRequest): Promise<Set<string>> {
  const mine = [eq(businesses.createdBy, req.ctx.userId)];
  if (req.ctx.teacherId) mine.push(eq(businesses.coordinatorTeacherId, req.ctx.teacherId));
  const rows = await deps.db
    .select({ id: businesses.id })
    .from(businesses)
    .where(and(eq(businesses.schoolId, req.ctx.schoolId), or(...mine)));
  return new Set(rows.map((r) => r.id));
}

/**
 * Görme ve işaretleme kapsamı: idare ve koordinatör müdür yardımcısı hepsi, öğretmen kendi işletmeleri. `teacher`
 * açıkken işletmesi olmayan öğretmen de geçer (işletme ekleyebilsin).
 */
async function scope(deps: AppDeps, req: FastifyRequest, opts: { teacher?: boolean } = {}) {
  requireModule(req);
  const all = isManager(req) || isVp(req);
  const own = await ownBusinessIds(deps, req);
  if (!all && !own.size && !(opts.teacher && req.ctx.teacherId)) throw forbidden('Devam çizelgesini idare ve koordinatör öğretmenler görebilir.');
  return { all, own, canEdit: (businessId: string | null) => Boolean(businessId) && (all || own.has(businessId!)) };
}

/** Okulun branşları ve meslek alanı olup olmadıkları */
async function schoolAreas(deps: AppDeps, schoolId: string) {
  const rows = await deps.db
    .select({ id: teacherBranches.id, name: teacherBranches.name, vocational: teacherBranches.vocational })
    .from(teacherBranches)
    .where(eq(teacherBranches.schoolId, schoolId));
  return rows.map((r) => ({ ...r, isVocational: branchIsVocational(r) })).sort((a, b) => trCompare(a.name, b.name));
}

/** İşletme öğrencilerinin seçileceği sınıflar (işletme dersi olanlar ve 12. sınıflar) */
async function eligibleClasses(deps: AppDeps, schoolId: string) {
  const [classes, entries, assigned] = await Promise.all([
    deps.db
      .select({ id: classGroups.id, name: classGroups.name, bellExempt: classGroups.bellExempt, sortOrder: classGroups.sortOrder })
      .from(classGroups)
      .where(eq(classGroups.schoolId, schoolId)),
    deps.db
      .selectDistinct({ classId: timetableEntries.classGroupId, subject: timetableEntries.subject })
      .from(timetableEntries)
      .where(eq(timetableEntries.schoolId, schoolId)),
    deps.db
      .selectDistinct({ classId: students.classGroupId })
      .from(students)
      .where(and(eq(students.schoolId, schoolId), isNotNull(students.businessId))),
  ]);
  const r = internshipClassIds(
    classes,
    entries,
    assigned.map((a) => a.classId).filter((x): x is string => Boolean(x)),
    gradeOf,
  );
  return { ...r, classes };
}

/** İşletmeye giden öğrenciler (sınıf ve işletme adıyla), sınıf sırası ve e-Okul sırasıyla */
async function internStudents(deps: AppDeps, schoolId: string) {
  const rows = await deps.db
    .select({
      id: students.id,
      fullName: students.fullName,
      schoolNo: students.schoolNo,
      listNo: students.listNo,
      classId: students.classGroupId,
      className: classGroups.name,
      classOrder: classGroups.sortOrder,
      businessId: students.businessId,
      businessName: businesses.name,
      areaId: businesses.areaId,
      areaName: teacherBranches.name,
    })
    .from(students)
    .innerJoin(businesses, eq(businesses.id, students.businessId))
    .leftJoin(teacherBranches, eq(teacherBranches.id, businesses.areaId))
    .leftJoin(classGroups, eq(classGroups.id, students.classGroupId))
    .where(and(eq(students.schoolId, schoolId), isNotNull(students.businessId)));
  const num = (v: string) => (/^\d+$/.test(v) ? Number(v) : Number.MAX_SAFE_INTEGER);
  return rows.sort(
    (a, b) =>
      (a.classOrder ?? 0) - (b.classOrder ?? 0) ||
      trCompare(a.className ?? '', b.className ?? '') ||
      (a.listNo ?? 9999) - (b.listNo ?? 9999) ||
      num(a.schoolNo) - num(b.schoolNo) ||
      trCompare(a.fullName, b.fullName),
  );
}

/** Sınıfların okulda olduğu bölümler (ders programından; işletme dersi okul sayılmaz) */
async function schoolWeekdays(deps: AppDeps, schoolId: string, classIds: string[]) {
  const out = new Map<string, SchoolHalves>();
  if (!classIds.length) return out;
  const rows = await deps.db
    .select({ classId: timetableEntries.classGroupId, weekday: timetableEntries.weekday, periodNo: timetableEntries.periodNo, subject: timetableEntries.subject })
    .from(timetableEntries)
    .where(and(eq(timetableEntries.schoolId, schoolId), inArray(timetableEntries.classGroupId, classIds)));
  const byClass = new Map<string, typeof rows>();
  for (const r of rows) byClass.set(r.classId, [...(byClass.get(r.classId) ?? []), r]);
  for (const [id, list] of byClass) out.set(id, schoolHalvesFromTimetable(list));
  return out;
}

const NO_SCHOOL: SchoolHalves = new Map();

async function marksInRange(deps: AppDeps, schoolId: string, from: string, to: string) {
  const rows = await deps.db
    .select({ studentId: internshipMarks.studentId, date: internshipMarks.date, half: internshipMarks.half, code: internshipMarks.code })
    .from(internshipMarks)
    .where(and(eq(internshipMarks.schoolId, schoolId), gte(internshipMarks.date, from), lte(internshipMarks.date, to)));
  const out = new Map<string, Map<string, InternMark>>();
  for (const r of rows) {
    const m = out.get(r.studentId) ?? new Map<string, InternMark>();
    m.set(internKey(r.date, r.half), r.code);
    out.set(r.studentId, m);
  }
  return out;
}

/** Ayın son günü (YYYY-AA-GG) */
const monthLast = (month: string) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
};

async function monthDays(deps: AppDeps, schoolId: string, month: string): Promise<InternDay[]> {
  const from = `${month}-01`;
  const to = monthLast(month);
  const { holidays, halfDays } = await holidaysAndHalfDays(deps.db, schoolId, from, to);
  return internMonthDays(month, holidays, halfDays);
}

async function userName(deps: AppDeps, userId: string) {
  const [u] = await deps.db.select({ fullName: users.fullName }).from(users).where(eq(users.id, userId));
  return u?.fullName ?? 'Kullanıcı';
}

export async function internshipRoutes(app: FastifyInstance) {
  const deps = app.deps;
  const { db } = deps;
  const base = '/api/schools/:schoolId/internship';
  const member = { preHandler: [app.authenticate, schoolGuard()] };
  const manage = { preHandler: [app.authenticate, schoolGuard('internship.manage')] };

  /** Menüde gösterilsin mi: modül açık ve kullanıcı idare, koordinatör müdür yardımcısı ya da koordinatör öğretmen */
  app.get(`${base}/access`, member, async (req) => {
    const enabled = settingsOf(req).internshipEnabled && !req.ctx.isSupport;
    if (!enabled) return { enabled: false, all: false, coordinator: false, manage: false, teacher: false };
    const own = await ownBusinessIds(deps, req);
    return { enabled: true, all: isManager(req) || isVp(req), coordinator: own.size > 0, manage: isManager(req), teacher: Boolean(req.ctx.teacherId) };
  });

  /** Koordinatör müdür yardımcısı seçimi (Genel Ayarlar): okulun kullanıcıları */
  app.get(`${base}/manager-candidates`, { preHandler: [app.authenticate, schoolGuard('settings.manage')] }, async (req) => {
    const rows = await db
      .select({ userId: users.id, fullName: users.fullName, role: memberships.role })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.schoolId, req.ctx.schoolId));
    return rows.sort((a, b) => trCompare(a.fullName, b.fullName));
  });

  /* ---------- İşletmeler ---------- */

  app.get(`${base}/businesses`, member, async (req) => {
    const s = await scope(deps, req, { teacher: true });
    const [rows, counts] = await Promise.all([
      db
        .select({
          id: businesses.id,
          name: businesses.name,
          phone: businesses.phone,
          address: businesses.address,
          contactName: businesses.contactName,
          trainerName: businesses.trainerName,
          email: businesses.email,
          field: businesses.field,
          notes: businesses.notes,
          areaId: businesses.areaId,
          areaName: teacherBranches.name,
          createdBy: businesses.createdBy,
          coordinatorTeacherId: businesses.coordinatorTeacherId,
          coordinatorName: teachers.fullName,
          isActive: businesses.isActive,
        })
        .from(businesses)
        .leftJoin(teachers, eq(teachers.id, businesses.coordinatorTeacherId))
        .leftJoin(teacherBranches, eq(teacherBranches.id, businesses.areaId))
        .where(eq(businesses.schoolId, req.ctx.schoolId))
        .orderBy(asc(businesses.name)),
      db.select({ businessId: students.businessId, id: students.id }).from(students).where(and(eq(students.schoolId, req.ctx.schoolId), isNotNull(students.businessId))),
    ]);
    const n = new Map<string, number>();
    for (const c of counts) n.set(c.businessId!, (n.get(c.businessId!) ?? 0) + 1);
    return rows
      .filter((r) => s.all || s.own.has(r.id))
      .sort((a, b) => trCompare(a.name, b.name))
      .map((r) => ({ ...r, students: n.get(r.id) ?? 0, canEdit: s.canEdit(r.id), canManage: s.all && isManager(req) }));
  });

  /**
   * İşletme ekle: idare her alana ve koordinatöre; öğretmen kendi adına (koordinatörü kendisi, alanı branşı — branşı
   * meslek alanı değilse seçtiği meslek alanı).
   */
  app.post(`${base}/businesses`, member, async (req) => {
    requireModule(req);
    const body = parse(businessSchema, req.body);
    const manager = isManager(req);
    if (!manager && !req.ctx.teacherId) throw forbidden('İşletmeyi idare ya da öğretmenler ekleyebilir.');
    const areas = await schoolAreas(deps, req.ctx.schoolId);
    const vocational = new Set(areas.filter((a) => a.isVocational).map((a) => a.id));
    if (body.areaId && !areas.some((a) => a.id === body.areaId)) throw badRequest('Alan bulunamadı.');
    let values = { ...body, schoolId: req.ctx.schoolId, createdBy: req.ctx.userId };
    if (!manager) {
      const [t] = await db.select({ branchId: teachers.branchId }).from(teachers).where(eq(teachers.id, req.ctx.teacherId!));
      const own = t?.branchId && vocational.has(t.branchId) ? t.branchId : null;
      values = { ...values, coordinatorTeacherId: req.ctx.teacherId!, areaId: own ?? (body.areaId && vocational.has(body.areaId) ? body.areaId : null) };
    } else {
      await checkTeacher(req, body.coordinatorTeacherId);
    }
    const [row] = await db.insert(businesses).values(values).returning();
    await audit(req, 'create', 'İşletme', row!.id, row!.name);
    return row;
  });

  app.patch(`${base}/businesses/:id`, manage, async (req) => {
    requireModule(req);
    const id = idParam(req);
    const body = parse(businessSchema.partial(), req.body);
    if (body.coordinatorTeacherId) await checkTeacher(req, body.coordinatorTeacherId);
    if (body.areaId) {
      const [b] = await db.select({ id: teacherBranches.id }).from(teacherBranches).where(and(eq(teacherBranches.id, body.areaId), eq(teacherBranches.schoolId, req.ctx.schoolId)));
      if (!b) throw badRequest('Alan bulunamadı.');
    }
    const [row] = await db
      .update(businesses)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(businesses.id, id), eq(businesses.schoolId, req.ctx.schoolId)))
      .returning();
    if (!row) throw notFound();
    await audit(req, 'update', 'İşletme', id, row.name);
    return row;
  });

  app.delete(`${base}/businesses/:id`, manage, async (req) => {
    requireModule(req);
    const id = idParam(req);
    // Öğrencilerin işletme bağı boşalır; geçmiş devam işaretleri öğrencide kalır
    const [row] = await db
      .delete(businesses)
      .where(and(eq(businesses.id, id), eq(businesses.schoolId, req.ctx.schoolId)))
      .returning();
    if (!row) throw notFound();
    await audit(req, 'delete', 'İşletme', id, row.name);
    return { ok: true };
  });

  /** İşletme bilgileri: idare ya da işletmenin koordinatör öğretmeni düzenler (ziyarette güncel bilgi) */
  app.patch(`${base}/businesses/:id/info`, member, async (req) => {
    const s = await scope(deps, req);
    const id = idParam(req);
    if (!s.canEdit(id)) throw forbidden('Yalnızca koordinatör olduğunuz işletmenin bilgilerini düzenleyebilirsiniz.');
    const body = parse(businessInfoSchema, req.body);
    const [row] = await db
      .update(businesses)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(businesses.id, id), eq(businesses.schoolId, req.ctx.schoolId)))
      .returning();
    if (!row) throw notFound();
    await audit(req, 'update', 'İşletme', id, `${row.name}: bilgiler`);
    return row;
  });

  async function checkTeacher(req: FastifyRequest, teacherId: string | null | undefined) {
    if (!teacherId) return;
    const [t] = await db
      .select({ id: teachers.id })
      .from(teachers)
      .where(and(eq(teachers.id, teacherId), eq(teachers.schoolId, req.ctx.schoolId)));
    if (!t) throw badRequest('Koordinatör öğretmen bulunamadı.');
  }

  /** İşletmenin öğrencileri: listedekiler bu işletmeye bağlanır, listeden çıkarılanların bağı kalkar */
  app.put(`${base}/businesses/:id/students`, member, async (req) => {
    const s = await scope(deps, req);
    const id = idParam(req);
    if (!s.canEdit(id)) throw forbidden('Yalnızca kendi işletmelerinizin öğrencilerini seçebilirsiniz.');
    const { studentIds } = parse(businessStudentsSchema, req.body);
    if (studentIds.length) {
      // Öğretmen başka işletmedeki öğrenciyi alamaz; herkes yalnızca işletme sınıflarından seçer
      const { ids } = await eligibleClasses(deps, req.ctx.schoolId);
      const picked = await db
        .select({ id: students.id, fullName: students.fullName, classId: students.classGroupId, businessId: students.businessId })
        .from(students)
        .where(and(eq(students.schoolId, req.ctx.schoolId), inArray(students.id, studentIds)));
      for (const p of picked) {
        if (!p.classId || !ids.has(p.classId)) throw badRequest(`${p.fullName} işletmeye gidebilecek bir sınıfta değil.`);
        if (!s.all && p.businessId && p.businessId !== id && !s.own.has(p.businessId)) throw forbidden(`${p.fullName} başka bir işletmeye bağlı; idareden değiştirmesini isteyin.`);
      }
    }
    const [b] = await db
      .select({ name: businesses.name })
      .from(businesses)
      .where(and(eq(businesses.id, id), eq(businesses.schoolId, req.ctx.schoolId)));
    if (!b) throw notFound();
    await db.transaction(async (tx) => {
      await tx
        .update(students)
        .set({ businessId: null })
        .where(and(eq(students.schoolId, req.ctx.schoolId), eq(students.businessId, id)));
      if (studentIds.length)
        await tx
          .update(students)
          .set({ businessId: id })
          .where(and(eq(students.schoolId, req.ctx.schoolId), inArray(students.id, studentIds)));
    });
    await audit(req, 'update', 'İşletme', id, `${b.name}: ${studentIds.length} öğrenci`);
    return { ok: true, students: studentIds.length };
  });

  /**
   * Öğrenci seçimi için: yalnızca işletme dersi olan sınıfların ve 12. sınıfların öğrencileri (öğretmen için de aynı
   * liste; başka işletmedeki öğrencinin işletme adı gizlenir). Sınıfların hangisinde işletme dersi olduğu da döner.
   */
  app.get(`${base}/students`, member, async (req) => {
    const s = await scope(deps, req, { teacher: true });
    const eligible = await eligibleClasses(deps, req.ctx.schoolId);
    const rows = await db
      .select({
        id: students.id,
        fullName: students.fullName,
        schoolNo: students.schoolNo,
        listNo: students.listNo,
        classId: students.classGroupId,
        className: classGroups.name,
        classOrder: classGroups.sortOrder,
        businessId: students.businessId,
      })
      .from(students)
      .leftJoin(classGroups, eq(classGroups.id, students.classGroupId))
      .where(eq(students.schoolId, req.ctx.schoolId));
    const shown = rows
      .filter((r) => r.classId && eligible.ids.has(r.classId))
      .sort(
        (a, b) =>
          Number(eligible.withLesson.has(b.classId!)) - Number(eligible.withLesson.has(a.classId!)) ||
          (a.classOrder ?? 0) - (b.classOrder ?? 0) ||
          trCompare(a.className ?? '', b.className ?? '') ||
          (a.listNo ?? 9999) - (b.listNo ?? 9999),
      )
      // KVKK: öğretmen başka işletmenin adını görmez, yalnızca "başka işletmede" bilgisini
      .map((r) => ({ ...r, businessId: s.all || !r.businessId || s.own.has(r.businessId) ? r.businessId : 'other' }));
    const classes = eligible.classes
      .filter((c) => eligible.ids.has(c.id))
      .map((c) => ({ id: c.id, name: c.name, withLesson: eligible.withLesson.has(c.id) }))
      .sort((a, b) => Number(b.withLesson) - Number(a.withLesson) || trCompare(a.name, b.name));
    return { students: shown, classes, fallback: eligible.fallback };
  });

  /* ---------- Alanlar ve koordinatör adayları ---------- */

  /**
   * Okul alanları: meslek alanı olan branşlar (MEB alan adlarından tanınır ya da okul işaretler), işletme ve öğretmen
   * sayıları. İdareye ayrıca bütün branşlar ve branşı girilmemiş öğretmenler (meslek dersi okutanlar üstte) döner.
   */
  app.get(`${base}/areas`, member, async (req) => {
    const s = await scope(deps, req, { teacher: true });
    const [areas, bizRows, teacherRows] = await Promise.all([
      schoolAreas(deps, req.ctx.schoolId),
      db.select({ id: businesses.id, areaId: businesses.areaId }).from(businesses).where(eq(businesses.schoolId, req.ctx.schoolId)),
      db
        .select({ id: teachers.id, fullName: teachers.fullName, branchId: teachers.branchId })
        .from(teachers)
        .where(and(eq(teachers.schoolId, req.ctx.schoolId), eq(teachers.isActive, true))),
    ]);
    const visible = bizRows.filter((b) => s.all || s.own.has(b.id));
    const count = (id: string) => visible.filter((b) => b.areaId === id).length;
    const teacherCount = (id: string) => teacherRows.filter((t) => t.branchId === id).length;
    const out = areas.map((a) => ({ ...a, businesses: count(a.id), teachers: teacherCount(a.id) }));
    if (!isManager(req)) return { areas: out.filter((a) => a.isVocational), branches: [], unbranched: [] };
    // Branşı girilmemiş öğretmenler: ders programına göre meslek dersi okutanlar üstte (yalnızca sıralama ipucu)
    const [entries, classes] = await Promise.all([
      db
        .select({ teacherId: timetableEntries.teacherId, classId: timetableEntries.classGroupId, subject: timetableEntries.subject })
        .from(timetableEntries)
        .where(eq(timetableEntries.schoolId, req.ctx.schoolId)),
      db.select({ id: classGroups.id, name: classGroups.name, bellExempt: classGroups.bellExempt }).from(classGroups).where(eq(classGroups.schoolId, req.ctx.schoolId)),
    ]);
    // Program ve düzeye göre (AMP 11, ATP 11…): kültür dersleri gruptaki her şubede okutulur
    const share = vocationalLessonShare(entries, classes, (n) => {
      const p = parseClassName(n);
      return p ? `${p.program ?? ''}|${p.grade}` : null;
    });
    const unbranched = teacherRows
      .filter((t) => !t.branchId)
      .map((t) => ({ id: t.id, fullName: t.fullName, share: share.get(t.id) ?? 0, likely: (share.get(t.id) ?? 0) >= 0.5 }))
      .sort((a, b) => b.share - a.share || trCompare(a.fullName, b.fullName));
    return { areas: out.filter((a) => a.isVocational), branches: out, unbranched };
  });

  /** Branşın meslek alanı olup olmadığını okul belirler (null: MEB alan adlarından tanınsın) */
  app.patch(`${base}/areas/:id`, manage, async (req) => {
    requireModule(req);
    const id = idParam(req);
    const { vocational } = parse(areaVocationalSchema, req.body);
    const [row] = await db
      .update(teacherBranches)
      .set({ vocational, updatedAt: new Date() })
      .where(and(eq(teacherBranches.id, id), eq(teacherBranches.schoolId, req.ctx.schoolId)))
      .returning({ name: teacherBranches.name });
    if (!row) throw notFound();
    await audit(req, 'update', 'Branş', id, `${row.name}: meslek alanı ${vocational === null ? 'otomatik' : vocational ? 'açık' : 'kapalı'}`);
    return { ok: true };
  });

  /** Öğretmenin branşını gir (branşı boş meslek öğretmenleri için); yeni branş adı verilirse oluşturulur */
  app.put(`${base}/teachers/:id/branch`, manage, async (req) => {
    requireModule(req);
    const id = idParam(req);
    const body = parse(z.object({ branchId: z.uuid().nullable().optional(), newBranch: z.string().trim().min(2).max(80).optional() }), req.body);
    const [t] = await db.select({ fullName: teachers.fullName }).from(teachers).where(and(eq(teachers.id, id), eq(teachers.schoolId, req.ctx.schoolId)));
    if (!t) throw notFound();
    let branchId = body.branchId ?? null;
    if (body.newBranch) {
      const [b] = await db
        .insert(teacherBranches)
        .values({ schoolId: req.ctx.schoolId, name: body.newBranch })
        .onConflictDoUpdate({ target: [teacherBranches.schoolId, teacherBranches.name], set: { updatedAt: new Date() } })
        .returning({ id: teacherBranches.id });
      branchId = b!.id;
    } else if (branchId) {
      const [b] = await db.select({ id: teacherBranches.id }).from(teacherBranches).where(and(eq(teacherBranches.id, branchId), eq(teacherBranches.schoolId, req.ctx.schoolId)));
      if (!b) throw badRequest('Branş bulunamadı.');
    }
    await db.update(teachers).set({ branchId, updatedAt: new Date() }).where(eq(teachers.id, id));
    await audit(req, 'update', 'Öğretmen', id, `${t.fullName}: branş`);
    return { ok: true, branchId };
  });

  /**
   * Koordinatör adayları: branşı meslek alanı olan öğretmenler, ders programında işletme dersi olanlar ve şu an
   * koordinatör olanlar. Hiç meslek branşlı öğretmen yoksa `fallback` ile bütün öğretmenler döner.
   */
  app.get(`${base}/coordinator-candidates`, manage, async (req) => {
    requireModule(req);
    const [areas, rows, lessonTeachers, current] = await Promise.all([
      schoolAreas(deps, req.ctx.schoolId),
      db
        .select({ id: teachers.id, fullName: teachers.fullName, branchId: teachers.branchId })
        .from(teachers)
        .where(and(eq(teachers.schoolId, req.ctx.schoolId), eq(teachers.isActive, true))),
      db
        .selectDistinct({ teacherId: timetableEntries.teacherId, subject: timetableEntries.subject })
        .from(timetableEntries)
        .where(and(eq(timetableEntries.schoolId, req.ctx.schoolId), isNotNull(timetableEntries.teacherId))),
      db
        .selectDistinct({ teacherId: businesses.coordinatorTeacherId })
        .from(businesses)
        .where(and(eq(businesses.schoolId, req.ctx.schoolId), isNotNull(businesses.coordinatorTeacherId))),
    ]);
    const areaOf = new Map(areas.map((a) => [a.id, a]));
    const internship = new Set(lessonTeachers.filter((l) => isInternshipSubject(l.subject)).map((l) => l.teacherId!));
    const coordinators = new Set(current.map((c) => c.teacherId!));
    const all = rows.map((t) => {
      const area = t.branchId ? areaOf.get(t.branchId) : undefined;
      return {
        id: t.id,
        fullName: t.fullName,
        areaId: area?.isVocational ? area.id : null,
        branchName: area?.name ?? null,
        vocational: Boolean(area?.isVocational) || internship.has(t.id),
        coordinator: coordinators.has(t.id),
      };
    });
    const picked = all.filter((t) => t.vocational || t.coordinator);
    const anyVocational = all.some((t) => t.vocational);
    return {
      fallback: !anyVocational,
      teachers: (anyVocational ? picked : all).sort((a, b) => trCompare(a.branchName ?? 'ZZZ', b.branchName ?? 'ZZZ') || trCompare(a.fullName, b.fullName)),
    };
  });

  /* ---------- Devam çizelgesi ---------- */

  /** Aylık çizelge (web): sınıf ya da işletmeye göre süzülebilir */
  app.get(`${base}/sheet`, member, async (req) => {
    const s = await scope(deps, req);
    const q = req.query as { month?: string; classId?: string; businessId?: string; areaId?: string };
    const month = q.month ? parse(monthSchema, q.month) : today(req).slice(0, 7);
    const list = (await internStudents(deps, req.ctx.schoolId)).filter((st) => s.all || s.own.has(st.businessId!));
    const classes = [...new Map(list.filter((x) => x.classId).map((x) => [x.classId!, { id: x.classId!, name: x.className ?? '' }])).values()];
    const bizs = [...new Map(list.map((x) => [x.businessId!, { id: x.businessId!, name: x.businessName }])).values()].sort((a, b) => trCompare(a.name, b.name));
    const shown = list.filter((x) => (!q.classId || x.classId === q.classId) && (!q.businessId || x.businessId === q.businessId) && (!q.areaId || x.areaId === q.areaId));
    const [days, weekdays, marks] = await Promise.all([
      monthDays(deps, req.ctx.schoolId, month),
      schoolWeekdays(deps, req.ctx.schoolId, classes.map((c) => c.id)),
      marksInRange(deps, req.ctx.schoolId, `${month}-01`, monthLast(month)),
    ]);
    const now = today(req);
    const settings = settingsOf(req);
    return {
      month,
      today: now,
      days,
      classes,
      businesses: bizs,
      areas: [...new Map(list.filter((x) => x.areaId).map((x) => [x.areaId!, { id: x.areaId!, name: x.areaName ?? '' }])).values()].sort((a, b) => trCompare(a.name, b.name)),
      managerAssigned: Boolean(settings.internshipManagerUserId),
      students: shown.map((st) => {
        const cells = internCells(days, { school: weekdays.get(st.classId ?? '') ?? NO_SCHOOL, marks: marks.get(st.id) ?? new Map(), today: now });
        return {
          id: st.id,
          fullName: st.fullName,
          schoolNo: st.schoolNo,
          listNo: st.listNo,
          classId: st.classId,
          className: st.className,
          businessId: st.businessId,
          businessName: st.businessName,
          areaId: st.areaId,
          editable: s.canEdit(st.businessId),
          cells,
          totals: internTotals(cells),
        };
      }),
    };
  });

  /** Ziyaret günü (mobil): o gün işletmelere göre öğrenciler ve iki bölümün kodu */
  app.get(`${base}/day`, member, async (req) => {
    const s = await scope(deps, req);
    const q = req.query as { date?: string };
    const date = q.date && /^\d{4}-\d{2}-\d{2}$/.test(q.date) ? q.date : today(req);
    const list = (await internStudents(deps, req.ctx.schoolId)).filter((st) => s.all || s.own.has(st.businessId!));
    const month = date.slice(0, 7);
    const classIds = [...new Set(list.map((x) => x.classId).filter((x): x is string => Boolean(x)))];
    const [days, weekdays, marks, infoRows] = await Promise.all([
      monthDays(deps, req.ctx.schoolId, month),
      schoolWeekdays(deps, req.ctx.schoolId, classIds),
      marksInRange(deps, req.ctx.schoolId, date, date),
      db
        .select({
          id: businesses.id,
          phone: businesses.phone,
          address: businesses.address,
          contactName: businesses.contactName,
          trainerName: businesses.trainerName,
          email: businesses.email,
          field: businesses.field,
          notes: businesses.notes,
        })
        .from(businesses)
        .where(eq(businesses.schoolId, req.ctx.schoolId)),
    ]);
    const info = new Map(infoRows.map(({ id, ...rest }) => [id, rest]));
    const day = days.find((d) => d.date === date)!;
    const now = today(req);
    const groups = new Map<string, { id: string; name: string; own: boolean; editable: boolean; info: unknown; students: unknown[] }>();
    for (const st of list) {
      const [cell] = internCells([day], { school: weekdays.get(st.classId ?? '') ?? NO_SCHOOL, marks: marks.get(st.id) ?? new Map(), today: now });
      const g = groups.get(st.businessId!) ?? {
        id: st.businessId!,
        name: st.businessName,
        own: s.own.has(st.businessId!),
        editable: s.canEdit(st.businessId),
        info: info.get(st.businessId!) ?? null,
        students: [],
      };
      g.students.push({ id: st.id, fullName: st.fullName, schoolNo: st.schoolNo, className: st.className, am: cell![0], pm: cell![1], editable: s.canEdit(st.businessId) });
      groups.set(g.id, g);
    }
    return {
      date,
      today: now,
      day,
      managerAssigned: Boolean(settingsOf(req).internshipManagerUserId),
      // Kendi işletmeleri önce
      businesses: [...groups.values()].sort((a, b) => Number(b.own) - Number(a.own) || trCompare(a.name, b.name)),
    };
  });

  /**
   * İşaretleri kaydet. 'X' işareti kaldırır. 'T' işletmeye giden bütün öğrencilere, 'K' öğrencinin işletmesindeki bütün
   * öğrencilere uygulanır (kaldırınca da aynı kapsamdan kalkar). D ve R koordinatör müdür yardımcısına bildirilir.
   */
  app.post(`${base}/marks`, member, async (req) => {
    const s = await scope(deps, req);
    const { date, until, items } = parse(internMarksSchema, req.body);
    const last = until && until > date ? until : date;
    const dates: string[] = [];
    for (let d = date; d <= last; d = addIsoDays(d, 1)) dates.push(d);
    if (dates.length > 31) throw badRequest('En çok 31 günlük aralık girilebilir.');
    const now = today(req);
    if (last > now && items.some((i) => i.code === 'D')) throw badRequest('İleri tarihe özürsüz devamsızlık (D) girilemez; izin (İ), rapor (R), sevk (H), tatil (T) ya da işletme kapalı (K) girilebilir.');
    const single = dates.length === 1;
    const list = await internStudents(deps, req.ctx.schoolId);
    const byId = new Map(list.map((x) => [x.id, x]));
    for (const it of items) {
      const st = byId.get(it.studentId);
      if (!st) throw badRequest('Öğrenci işletmeye bağlı değil.');
      if (!s.canEdit(st.businessId)) throw forbidden(`${st.fullName} sizin koordinatör olduğunuz bir işletmede değil.`);
    }
    const months = [...new Set(dates.map((d) => d.slice(0, 7)))];
    const [monthList, weekdays, before] = await Promise.all([
      Promise.all(months.map((m) => monthDays(deps, req.ctx.schoolId, m))),
      schoolWeekdays(deps, req.ctx.schoolId, [...new Set(list.map((x) => x.classId).filter((x): x is string => Boolean(x)))]),
      marksInRange(deps, req.ctx.schoolId, date, last),
    ]);
    const dayOf = new Map(monthList.flat().map((d) => [d.date, d]));

    // Değişiklikler: öğrenci, gün, bölüm, yeni kod (null: kaldır)
    const changed: { studentId: string; date: string; half: InternHalf; code: InternMark | null }[] = [];
    for (const dt of dates) {
      const day = dayOf.get(dt)!;
      const prev = (studentId: string, half: InternHalf) => before.get(studentId)?.get(internKey(dt, half)) ?? null;
      /** İşletme günü mü (okul günü, hafta sonu ve takvim tatili değil) */
      const workHalf = (studentId: string, half: InternHalf) => {
        const st = byId.get(studentId)!;
        const [c] = internCells([day], { school: weekdays.get(st.classId ?? '') ?? NO_SCHOOL, marks: new Map(), today: '9999-12-31' });
        return c![half === 'am' ? 0 : 1] === 'X';
      };
      const next = new Map<string, InternMark | null>();
      const set = (studentId: string, half: InternHalf, code: InternMark | null) => {
        if (workHalf(studentId, half)) next.set(`${studentId}|${half}`, code);
      };
      for (const it of items) {
        const st = byId.get(it.studentId)!;
        if (!workHalf(st.id, it.half)) {
          // Aralıkta okul günleri ve tatiller atlanır; tek günde uyarılır
          if (single) throw badRequest(`${dateText(dt)} ${internHalfText([it.half])} okul günü ya da tatil; işaretlenemez.`);
          continue;
        }
        const old = prev(st.id, it.half);
        if (it.code === 'T') {
          for (const x of list) set(x.id, it.half, 'T');
        } else if (it.code === 'K') {
          for (const x of list) if (x.businessId === st.businessId) set(x.id, it.half, 'K');
        } else if (it.code === 'X' && old === 'T') {
          for (const x of list) if (prev(x.id, it.half) === 'T') set(x.id, it.half, null);
        } else if (it.code === 'X' && old === 'K') {
          for (const x of list) if (x.businessId === st.businessId && prev(x.id, it.half) === 'K') set(x.id, it.half, null);
        } else {
          set(st.id, it.half, it.code === 'X' ? null : it.code);
        }
      }
      // Öğrencinin kendi satırındaki seçim, toplu (T, K) uygulamadan sonra gelir
      for (const it of items) if (INTERN_ABSENCES.includes(it.code as InternMark)) set(it.studentId, it.half, it.code as InternMark);
      for (const [k, code] of next) {
        const [studentId, half] = k.split('|') as [string, InternHalf];
        if (prev(studentId, half) !== code) changed.push({ studentId, date: dt, half, code });
      }
    }
    if (!changed.length) {
      if (!single) throw badRequest('Seçilen günlerde işaretlenecek işletme günü yok (okul günü ya da tatil).');
      return { changed: 0 };
    }
    const name = await userName(deps, req.ctx.userId);
    await db.transaction(async (tx) => {
      for (const c of changed) {
        await tx
          .delete(internshipMarks)
          .where(and(eq(internshipMarks.studentId, c.studentId), eq(internshipMarks.date, c.date), eq(internshipMarks.half, c.half)));
        if (c.code) await tx.insert(internshipMarks).values({ schoolId: req.ctx.schoolId, studentId: c.studentId, date: c.date, half: c.half, code: c.code, userId: req.ctx.userId, userName: name });
      }
    });

    await audit(req, 'update', 'İşletmede devam', null, `${dateText(date)}${single ? '' : ` – ${dateText(last)}`}: ${changed.length} işaret`);
    // Devamsızlıklar birkaç dakika sonra bildirilir (runInternshipNotices); bu sürede düzeltilen işaret bildirilmez
    const pending = changed.filter((c) => c.code && INTERN_ABSENCES.includes(c.code)).length;
    return { changed: changed.length, pending };
  });
}

/** Devamsızlık bildirimi bekleme süresi (bu sürede düzeltilen işaret bildirilmez) ve en eski bildirilecek işaret */
const NOTICE_DELAY_MS = 2 * 60_000;
const NOTICE_MAX_AGE_MS = 3 * 86400_000;

const shortDate = (iso: string) => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));

/**
 * Bekleyen devamsızlıkları (D, İ, R, H) koordinatör müdür yardımcısına bildirir: okul ve bildiren kişiye göre tek bildirim.
 * Ayrıntı (öğrenci adı, rapor) yalnızca uygulamanın bildirim kutusunda; kilit ekranına düşen bildirimde ad ve sağlık
 * bilgisi yazmaz (KVKK). Müdür yardımcısı seçilmemişse ya da işaret çok eskiyse gönderilmeden kapatılır.
 */
export async function runInternshipNotices(deps: AppDeps, now = new Date()) {
  const { db } = deps;
  const rows = await db
    .select({
      id: internshipMarks.id,
      schoolId: internshipMarks.schoolId,
      userId: internshipMarks.userId,
      userName: internshipMarks.userName,
      studentId: internshipMarks.studentId,
      date: internshipMarks.date,
      half: internshipMarks.half,
      code: internshipMarks.code,
      createdAt: internshipMarks.createdAt,
      fullName: students.fullName,
      className: classGroups.name,
      businessName: businesses.name,
      settings: schools.settings,
    })
    .from(internshipMarks)
    .innerJoin(students, eq(students.id, internshipMarks.studentId))
    .leftJoin(classGroups, eq(classGroups.id, students.classGroupId))
    .leftJoin(businesses, eq(businesses.id, students.businessId))
    .innerJoin(schools, eq(schools.id, internshipMarks.schoolId))
    .where(
      and(
        isNull(internshipMarks.notifiedAt),
        inArray(internshipMarks.code, [...INTERN_ABSENCES]),
        lte(internshipMarks.createdAt, new Date(now.getTime() - NOTICE_DELAY_MS)),
      ),
    );
  if (!rows.length) return 0;
  const groups = new Map<string, typeof rows>();
  for (const r of rows) groups.set(`${r.schoolId}|${r.userId ?? ''}`, [...(groups.get(`${r.schoolId}|${r.userId ?? ''}`) ?? []), r]);
  let sent = 0;
  for (const list of groups.values()) {
    const first = list[0]!;
    const vp = schoolSettingsSchema.parse(first.settings ?? {}).internshipManagerUserId;
    const fresh = list.filter((r) => now.getTime() - r.createdAt.getTime() <= NOTICE_MAX_AGE_MS);
    let member = false;
    if (vp && vp !== first.userId && fresh.length) {
      const [m] = await db
        .select({ id: memberships.id })
        .from(memberships)
        .where(and(eq(memberships.schoolId, first.schoolId), eq(memberships.userId, vp)));
      member = Boolean(m);
    }
    if (member && vp) {
      // Öğrenci ve koda göre günler ve bölümler birleşir
      const byKey = new Map<string, typeof fresh>();
      for (const r of fresh) byKey.set(`${r.studentId}|${r.code}`, [...(byKey.get(`${r.studentId}|${r.code}`) ?? []), r]);
      const lines = [...byKey.values()].map((parts) => {
        const p = parts[0]!;
        const days = [...new Set(parts.map((x) => x.date))].sort();
        const when =
          days.length === 1
            ? `${shortDate(days[0]!)} ${internHalfText(parts.map((x) => x.half))}`
            : `${shortDate(days[0]!)} – ${shortDate(days[days.length - 1]!)}, ${formatDays(parts.length / 2)} gün`;
        return `${p.fullName}${p.className ? ` (${p.className})` : ''}: ${when} ${INTERN_MARK_TEXT[p.code]}${p.businessName ? ` · ${p.businessName}` : ''}`;
      });
      const codes = new Set(fresh.map((r) => r.code));
      const absent = codes.has('D');
      const excused = [...codes].some((c) => c !== 'D');
      const title = absent && excused ? 'İşletmede devamsızlık ve rapor/izin' : absent ? 'İşletmede devamsızlık' : 'İşletmede rapor / izin bildirimi';
      const what = absent && excused ? 'devamsızlık ve rapor/izin' : absent ? 'devamsızlık' : 'rapor / izin';
      const studentCount = new Set(fresh.map((r) => r.studentId)).size;
      const firstDate = [...fresh.map((r) => r.date)].sort()[0]!;
      await addToInbox(db, [vp], {
        key: `internship:${randomUUID()}`,
        kind: 'internship',
        title,
        body: `Bildiren: ${first.userName}\n${lines.join('\n')}`,
        to: `/isletme-devam?ay=${firstDate.slice(0, 7)}&gun=${firstDate}`,
        schoolId: first.schoolId,
      });
      notifyUsers(deps, [vp], { title, body: `${studentCount === 1 ? 'Bir öğrenci' : `${studentCount} öğrenci`} için ${what} bildirildi. Ayrıntı uygulamada.`, url: '/bildirimler' });
      sent++;
    }
    await db
      .update(internshipMarks)
      .set({ notifiedAt: now })
      .where(inArray(internshipMarks.id, list.map((r) => r.id)));
  }
  return sent;
}
