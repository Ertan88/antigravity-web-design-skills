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
  type InternStored,
  internFillSchema,
  internSendSchema,
  INTERN_ABSENCES,
  INTERN_MARK_TEXT,
  areaVocationalSchema,
  branchIsVocational,
  gradeOf,
  internshipClassIds,
  isInternshipSubject,
  vocationalLessonShare,
  isMesem,
  internAssignSchema,
  parseClassName,
  compareClassNames,
  areaInitials,
  mondayOf,
  monthVisitDates,
  trDate,
  weekVisitDate,
  type InternCell,
} from '@okulpano/shared';
import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { audit, schoolGuard, UUID_RE, type AppDeps } from '../context.ts';
import { businesses, classGroups, internshipMarks, internshipPeriods, memberships, schools, students, teacherBranches, teachers, teacherTitles, timetableEntries, users } from '../db/schema.ts';
import { holidaysAndHalfDays } from '../lib/dayinfo.ts';
import { ATTENDANCE_ROWS, attendanceFormsPdf, dailyFormsPdf, reportFormsPdf, type AttendanceForm, type DailyForm, type ReportForm } from '../lib/internshipForms.ts';
import { badRequest, forbidden, notFound, parse } from '../lib/errors.ts';
import { notifyUsers } from '../lib/push.ts';
import { addToInbox } from './notifications.ts';

/*
 * İşletmelerde mesleki eğitim: işletmeler, öğrencilerin işletmeleri ve aylık devam çizelgesi.
 * Görme (KVKK): bütün işletmeleri ve öğrencileri yalnızca okul müdürü, koordinatör müdür yardımcısı ve Okul Ayarları'nda
 * seçilen ek kişiler görür; işletme ekler, koordinatör atar. Diğer müdür yardımcıları dahil herkes yalnızca koordinatörü
 * olduğu işletmeleri (branşı ne olursa olsun) ve kendi eklediği, henüz koordinatörü atanmamış işletmeleri görür.
 * "İşletmede" (X) da koordinatörün koyduğu işarettir; işaretsiz geçmiş gün "kontrol edilmedi" (?) görünür. Devamsızlıklar
 * (D, İ, R, H) hemen bildirilmez: koordinatör kontrol edip "Gönder" deyince koordinatör müdür yardımcısına (okul ayarlarında
 * seçilen kullanıcı) gider. KVKK: destek erişimi öğrenci devam kayıtlarını
 * göremez; panoya hiçbir şey gitmez.
 */

const idParam = (req: FastifyRequest) => {
  const v = (req.params as { id?: string }).id;
  if (!v || !UUID_RE.test(v)) throw notFound();
  return v;
};

const settingsOf = (req: FastifyRequest) => schoolSettingsSchema.parse(req.ctx.school.settings ?? {});
const isVp = (req: FastifyRequest) => settingsOf(req).internshipManagerUserId === req.ctx.userId;
/** "Mesleki eğitimi yönetir" yetkisi açıkça verilmiş mi (müdür yardımcısının rolü bunu kendiliğinden vermez) */
const isGranted = (req: FastifyRequest) => req.ctx.granted.includes('internship.manage');
/** Bütün işletmeleri gören ve yöneten: okul müdürü, koordinatör müdür yardımcısı, "Mesleki eğitimi yönetir" yetkisi verilenler */
const isManager = (req: FastifyRequest) => !req.ctx.isSupport && (req.ctx.role === 'owner' || isVp(req) || isGranted(req));

/** İşaretli koordinatör öğretmenler; hiç kaydedilmemişse (eski okullar) işletmelerin bugünkü koordinatörleri */
async function designatedCoordinators(deps: AppDeps, req: FastifyRequest): Promise<Set<string>> {
  const list = settingsOf(req).internshipCoordinatorTeacherIds;
  if (list) return new Set(list);
  const rows = await deps.db
    .selectDistinct({ id: businesses.coordinatorTeacherId })
    .from(businesses)
    .where(and(eq(businesses.schoolId, req.ctx.schoolId), isNotNull(businesses.coordinatorTeacherId)));
  return new Set(rows.map((r) => r.id!));
}

/** Alan şefi: kadroda ünvanı "Alan Şefi" olan öğretmen; branşı (alanı) döner, değilse null */
async function areaHeadBranch(deps: AppDeps, req: FastifyRequest): Promise<string | null> {
  if (!req.ctx.teacherId) return null;
  const [t] = await deps.db
    .select({ branchId: teachers.branchId, title: teacherTitles.name })
    .from(teachers)
    .leftJoin(teacherTitles, eq(teacherTitles.id, teachers.titleId))
    .where(and(eq(teachers.id, req.ctx.teacherId), eq(teachers.schoolId, req.ctx.schoolId)));
  return t?.branchId && t.title && /alan\s*şef/.test(t.title.toLocaleLowerCase('tr-TR')) ? t.branchId : null;
}

/** Bir alanın işletmeleri: alanı o branş olanlar ve koordinatörü o branştan olanlar */
async function areaBusinessIds(deps: AppDeps, schoolId: string, branchId: string): Promise<Set<string>> {
  const rows = await deps.db
    .select({ id: businesses.id })
    .from(businesses)
    .leftJoin(teachers, eq(teachers.id, businesses.coordinatorTeacherId))
    .where(and(eq(businesses.schoolId, schoolId), or(eq(businesses.areaId, branchId), eq(teachers.branchId, branchId))));
  return new Set(rows.map((r) => r.id));
}

function requireModule(req: FastifyRequest) {
  if (req.ctx.isSupport) throw forbidden('Destek erişimi öğrenci devam kayıtlarını göremez.');
  if (!settingsOf(req).internshipEnabled) throw forbidden('İşletmelerde mesleki eğitim modülü bu okulda kapalı (Okul Ayarları).');
}

const today = (req: FastifyRequest) => zonedParts(new Date(), req.ctx.school.timezone).isoDate;

const dateText = (iso: string) =>
  new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));

/** Kullanıcının işletmeleri: koordinatörü olduğu ya da kendi ekleyip henüz koordinatör atanmamış olanlar */
async function ownBusinessIds(deps: AppDeps, req: FastifyRequest): Promise<Set<string>> {
  const mine = [and(eq(businesses.createdBy, req.ctx.userId), isNull(businesses.coordinatorTeacherId))!];
  if (req.ctx.teacherId) mine.push(eq(businesses.coordinatorTeacherId, req.ctx.teacherId));
  const rows = await deps.db
    .select({ id: businesses.id })
    .from(businesses)
    .where(and(eq(businesses.schoolId, req.ctx.schoolId), or(...mine)));
  return new Set(rows.map((r) => r.id));
}

/** Kişinin mesleki eğitimdeki yeri (hata vermeden): yönetim, işaretli koordinatör, alan şefi */
async function roleOf(deps: AppDeps, req: FastifyRequest) {
  const all = isManager(req);
  const designated = !all && req.ctx.teacherId ? (await designatedCoordinators(deps, req)).has(req.ctx.teacherId) : false;
  // İşaretlenmemiş öğretmen kendi eklediği ya da koordinatörü olduğu işletmeyi de görmez
  const own = designated ? await ownBusinessIds(deps, req) : new Set<string>();
  const head = all ? null : await areaHeadBranch(deps, req);
  const area = head ? await areaBusinessIds(deps, req.ctx.schoolId, head) : new Set<string>();
  return { all, designated, own, head, area };
}

/**
 * Görme ve işaretleme kapsamı: yönetim hepsini görür ve düzenler; işaretli koordinatör kendi işletmelerini görür ve
 * düzenler; alan şefi kendi alanının işletmelerini yalnızca görür. Bunların dışındaki herkes erişemez.
 */
async function scope(deps: AppDeps, req: FastifyRequest, _opts: { teacher?: boolean } = {}) {
  requireModule(req);
  const r = await roleOf(deps, req);
  if (!r.all && !r.designated && !r.head) throw forbidden('Mesleki eğitimi yönetim, koordinatör öğretmenler ve alan şefleri görebilir.');
  return {
    ...r,
    sees: (businessId: string | null) => Boolean(businessId) && (r.all || r.own.has(businessId!) || r.area.has(businessId!)),
    canEdit: (businessId: string | null) => Boolean(businessId) && (r.all || r.own.has(businessId!)),
  };
}

/** Okulun branşları ve meslek alanı olup olmadıkları */
async function schoolAreas(deps: AppDeps, schoolId: string) {
  const rows = await deps.db
    .select({ id: teacherBranches.id, name: teacherBranches.name, vocational: teacherBranches.vocational })
    .from(teacherBranches)
    .where(eq(teacherBranches.schoolId, schoolId));
  return rows.map((r) => ({ ...r, isVocational: branchIsVocational(r) })).sort((a, b) => trCompare(a.name, b.name));
}

/** Meslek öğretmeni mi: branşı meslek alanı (okulun düzeltmesi dahil) ya da programında işletmelerde mesleki eğitim dersi var */
async function isVocationalTeacher(deps: AppDeps, schoolId: string, teacherId: string) {
  const [t] = await deps.db
    .select({ name: teacherBranches.name, vocational: teacherBranches.vocational })
    .from(teachers)
    .innerJoin(teacherBranches, eq(teacherBranches.id, teachers.branchId))
    .where(and(eq(teachers.id, teacherId), eq(teachers.schoolId, schoolId)));
  if (t && branchIsVocational(t)) return true;
  const lessons = await deps.db
    .selectDistinct({ subject: timetableEntries.subject })
    .from(timetableEntries)
    .where(and(eq(timetableEntries.schoolId, schoolId), eq(timetableEntries.teacherId, teacherId)));
  return lessons.some((l) => isInternshipSubject(l.subject));
}

/** İşletme öğrencilerinin seçileceği sınıflar (işletme dersi olanlar ve 12. sınıflar) */
async function eligibleClasses(deps: AppDeps, req: FastifyRequest) {
  const schoolId = req.ctx.schoolId;
  const mesem = isMesem(req.ctx.school.name, settingsOf(req).schoolType);
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
    { mesem },
  );
  return { ...r, classes, mesem };
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
      compareClassNames(a.className ?? '', b.className ?? '') ||
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
    .select({ studentId: internshipMarks.studentId, date: internshipMarks.date, half: internshipMarks.half, code: internshipMarks.code, notifiedAt: internshipMarks.notifiedAt })
    .from(internshipMarks)
    .where(and(eq(internshipMarks.schoolId, schoolId), gte(internshipMarks.date, from), lte(internshipMarks.date, to)));
  const out = new Map<string, Map<string, InternStored>>() as Map<string, Map<string, InternStored>> & { unsent: Map<string, string[]> };
  out.unsent = new Map();
  for (const r of rows) {
    const m = out.get(r.studentId) ?? new Map<string, InternStored>();
    m.set(internKey(r.date, r.half), r.code);
    out.set(r.studentId, m);
    // Gönderilmemiş devamsızlık (koordinatör henüz müdür yardımcısına göndermedi)
    if (!r.notifiedAt && isAbsence(r.code)) out.unsent.set(r.studentId, [...(out.unsent.get(r.studentId) ?? []), internKey(r.date, r.half)]);
  }
  return out;
}

const isAbsence = (code: string) => (INTERN_ABSENCES as readonly string[]).includes(code);

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

type Tx = Parameters<Parameters<AppDeps['db']['transaction']>[0]>[0];

/**
 * Öğrencileri bir işletmeye taşır (businessId null: işletmeden çıkarır). Açık dönem `from`dan bir gün önce kapanır,
 * yeni işletmede `from` ile başlayan dönem açılır (öğrencinin ilk işletmesiyse başlangıç boş kalır: yılın başından). Aynı gün ya da daha önce başlamış açık dönem silinir (yanlış atama
 * düzeltmesi). Öğrencinin şu anki işletmesi (students.businessId) de güncellenir.
 */
async function moveStudents(tx: Tx, schoolId: string, studentIds: string[], businessId: string | null, from: string) {
  if (!studentIds.length) return;
  const [open, current] = await Promise.all([
    tx
      .select({ id: internshipPeriods.id, studentId: internshipPeriods.studentId, businessId: internshipPeriods.businessId, startDate: internshipPeriods.startDate })
      .from(internshipPeriods)
      .where(and(eq(internshipPeriods.schoolId, schoolId), inArray(internshipPeriods.studentId, studentIds), isNull(internshipPeriods.endDate))),
    tx.select({ id: students.id, businessId: students.businessId }).from(students).where(and(eq(students.schoolId, schoolId), inArray(students.id, studentIds))),
  ]);
  const openOf = new Map(open.map((p) => [p.studentId, p]));
  // Hiç dönemi olmayan öğrencinin ilk işletmesi öğretim yılının başından sayılır (başlangıç boş)
  const known = new Set(
    (
      await tx
        .selectDistinct({ studentId: internshipPeriods.studentId })
        .from(internshipPeriods)
        .where(and(eq(internshipPeriods.schoolId, schoolId), inArray(internshipPeriods.studentId, studentIds)))
    ).map((r) => r.studentId),
  );
  for (const st of current) {
    const p = openOf.get(st.id);
    if (st.businessId === businessId && (p?.businessId ?? null) === businessId) continue;
    // Dönemi tutulmamış eski atama: başlangıcı bilinmeyen dönem olarak kaydedilir
    if (st.businessId === businessId && businessId && !p) {
      await tx.insert(internshipPeriods).values({ schoolId, studentId: st.id, businessId, startDate: null });
      continue;
    }
    if (p) {
      if (p.startDate && p.startDate >= from) await tx.delete(internshipPeriods).where(eq(internshipPeriods.id, p.id));
      else await tx.update(internshipPeriods).set({ endDate: addIsoDays(from, -1) }).where(eq(internshipPeriods.id, p.id));
    } else if (st.businessId && st.businessId !== businessId) {
      // Dönemi tutulmamış eski atama: eski işletmedeki süre kaybolmasın (başlangıcı bilinmiyor)
      await tx.insert(internshipPeriods).values({ schoolId, studentId: st.id, businessId: st.businessId, startDate: null, endDate: addIsoDays(from, -1) });
      known.add(st.id);
    }
    if (businessId) await tx.insert(internshipPeriods).values({ schoolId, studentId: st.id, businessId, startDate: known.has(st.id) ? from : null });
  }
  await tx.update(students).set({ businessId }).where(and(eq(students.schoolId, schoolId), inArray(students.id, studentIds)));
}

/** Öğretim yılının ilk günü (1 Eylül) */
const schoolYearStart = (iso: string) => {
  const y = Number(iso.slice(0, 4));
  return Number(iso.slice(5, 7)) >= 9 ? `${y}-09-01` : `${y - 1}-09-01`;
};

/** Dönemin dışındaki günler boşaltılır (o işletmenin çizelgesinde sayılmaz) */
const maskCells = (days: InternDay[], cells: InternCell[][], start: string | null, end: string | null): InternCell[][] =>
  cells.map((c, i) => {
    const d = days[i]!.date;
    return (start && d < start) || (end && d > end) ? (['', ''] as InternCell[]) : c;
  });

export async function internshipRoutes(app: FastifyInstance) {
  const deps = app.deps;
  const { db } = deps;
  const base = '/api/schools/:schoolId/internship';
  const member = { preHandler: [app.authenticate, schoolGuard()] };
  // Yönetim: müdür, koordinatör müdür yardımcısı ve "Mesleki eğitimi yönetir" yetkisi verilenler (diğer müdür yardımcıları değil)
  const manage = {
    preHandler: [
      app.authenticate,
      schoolGuard(),
      async (req: FastifyRequest) => {
        if (!isManager(req)) throw forbidden('İşletmeleri okul müdürü, koordinatör müdür yardımcısı ve yetki verilen kişiler yönetir.');
      },
    ],
  };

  /**
   * Menüde gösterilsin mi: modül açık ve kişi yönetimde, işaretli koordinatör öğretmen ya da alan şefi. Kültür dersi
   * öğretmenleri ve işaretlenmemiş meslek öğretmenleri görmez. `canPickManager`: koordinatör müdür yardımcısını seçebilir.
   */
  app.get(`${base}/access`, member, async (req) => {
    const enabled = settingsOf(req).internshipEnabled && !req.ctx.isSupport;
    const canPickManager = !req.ctx.isSupport && (req.ctx.role === 'owner' || isGranted(req));
    if (!enabled) return { enabled: false, all: false, coordinator: false, manage: false, teacher: false, areaHead: false, canPickManager };
    const r = await roleOf(deps, req);
    return { enabled: true, all: r.all, coordinator: r.designated, manage: r.all, teacher: r.designated, areaHead: Boolean(r.head), canPickManager };
  });

  /**
   * Koordinatör müdür yardımcısı adayları: müdür yardımcıları ve "Mesleki eğitimi yönetir" yetkisi verilenler.
   * Listeyi okul müdürü ve bu yetkiyi alanlar görür (seçimi yalnızca onlar değiştirir).
   */
  app.get(`${base}/manager-candidates`, member, async (req) => {
    if (req.ctx.isSupport || !(req.ctx.role === 'owner' || isGranted(req) || req.ctx.permissions.includes('settings.manage'))) throw forbidden();
    const rows = await db
      .select({ userId: users.id, fullName: users.fullName, role: memberships.role, permissions: memberships.permissions })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.schoolId, req.ctx.schoolId));
    return rows
      .filter((r) => r.role === 'admin' || r.permissions.includes('internship.manage'))
      .map(({ userId, fullName, role }) => ({ userId, fullName, role }))
      .sort((a, b) => trCompare(a.fullName, b.fullName));
  });

  /** Koordinatör öğretmenler: işaretliler ve işaretlenebilecek meslek öğretmenleri (branşı meslek alanı ya da işletme dersi var) */
  app.get(`${base}/coordinators`, manage, async (req) => {
    requireModule(req);
    const [designated, areas, rows, lessonTeachers] = await Promise.all([
      designatedCoordinators(deps, req),
      schoolAreas(deps, req.ctx.schoolId),
      db
        .select({ id: teachers.id, fullName: teachers.fullName, branchId: teachers.branchId })
        .from(teachers)
        .where(and(eq(teachers.schoolId, req.ctx.schoolId), eq(teachers.isActive, true))),
      db
        .selectDistinct({ teacherId: timetableEntries.teacherId, subject: timetableEntries.subject })
        .from(timetableEntries)
        .where(and(eq(timetableEntries.schoolId, req.ctx.schoolId), isNotNull(timetableEntries.teacherId))),
    ]);
    const areaOf = new Map(areas.map((a) => [a.id, a]));
    const internship = new Set(lessonTeachers.filter((l) => isInternshipSubject(l.subject)).map((l) => l.teacherId!));
    const list = rows
      .map((t) => {
        const area = t.branchId ? areaOf.get(t.branchId) : undefined;
        return { id: t.id, fullName: t.fullName, branchName: area?.name ?? null, vocational: Boolean(area?.isVocational) || internship.has(t.id), designated: designated.has(t.id) };
      })
      .filter((t) => t.vocational || t.designated)
      .sort((a, b) => trCompare(a.branchName ?? 'ZZZ', b.branchName ?? 'ZZZ') || trCompare(a.fullName, b.fullName));
    return { teachers: list };
  });

  /** Koordinatör öğretmenleri işaretle: yalnızca meslek öğretmenleri (kültür dersi öğretmeni koordinatör olamaz) */
  app.put(`${base}/coordinators`, manage, async (req) => {
    requireModule(req);
    const body = parse(z.object({ teacherIds: z.array(z.uuid()).max(500) }), req.body);
    const ids = [...new Set(body.teacherIds)];
    for (const id of ids) {
      if (!(await isVocationalTeacher(deps, req.ctx.schoolId, id))) {
        const [t] = await db.select({ fullName: teachers.fullName }).from(teachers).where(and(eq(teachers.id, id), eq(teachers.schoolId, req.ctx.schoolId)));
        throw badRequest(`${t?.fullName ?? 'Öğretmen'} meslek öğretmeni değil (branşı meslek alanı değil, işletme dersi de yok); koordinatör olamaz.`);
      }
    }
    const settings = schoolSettingsSchema.parse({ ...(req.ctx.school.settings ?? {}), internshipCoordinatorTeacherIds: ids });
    await db.update(schools).set({ settings }).where(eq(schools.id, req.ctx.schoolId));
    await audit(req, 'update', 'Koordinatör öğretmenler', null, `${ids.length} öğretmen`);
    return { teacherIds: ids };
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
          visitWeekday: businesses.visitWeekday,
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
      .filter((r) => s.sees(r.id))
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
    // Koordinatör öğretmen kendi işletmesini ekleyebilir; işaretlenmemiş öğretmen ekleyemez
    const designated = req.ctx.teacherId ? (await designatedCoordinators(deps, req)).has(req.ctx.teacherId) : false;
    if (!manager && !designated) throw forbidden('İşletmeyi yönetim ya da koordinatör öğretmenler ekleyebilir.');
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
      .select({ id: teachers.id, fullName: teachers.fullName })
      .from(teachers)
      .where(and(eq(teachers.id, teacherId), eq(teachers.schoolId, req.ctx.schoolId)));
    if (!t) throw badRequest('Koordinatör öğretmen bulunamadı.');
    if (!(await designatedCoordinators(deps, req)).has(t.id)) throw badRequest(`${t.fullName} koordinatör öğretmen olarak işaretli değil; önce Koordinatör öğretmenler listesine ekleyin.`);
  }

  /** İşletmenin öğrencileri: listedekiler bu işletmeye bağlanır, listeden çıkarılanların bağı kalkar */
  app.put(`${base}/businesses/:id/students`, member, async (req) => {
    const s = await scope(deps, req);
    const id = idParam(req);
    if (!s.canEdit(id)) throw forbidden('Yalnızca kendi işletmelerinizin öğrencilerini seçebilirsiniz.');
    const { studentIds } = parse(businessStudentsSchema, req.body);
    if (studentIds.length) {
      // Öğretmen başka işletmedeki öğrenciyi alamaz; herkes yalnızca işletme sınıflarından seçer
      const { ids } = await eligibleClasses(deps, req);
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
    const now = today(req);
    await db.transaction(async (tx) => {
      const before = await tx
        .select({ id: students.id })
        .from(students)
        .where(and(eq(students.schoolId, req.ctx.schoolId), eq(students.businessId, id)));
      const keep = new Set(studentIds);
      await moveStudents(tx, req.ctx.schoolId, before.map((b) => b.id).filter((x) => !keep.has(x)), null, now);
      await moveStudents(tx, req.ctx.schoolId, studentIds, id, now);
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
    const eligible = await eligibleClasses(deps, req);
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
    const bizRows = await db.select({ id: businesses.id, name: businesses.name }).from(businesses).where(eq(businesses.schoolId, req.ctx.schoolId));
    const bizName = new Map(bizRows.map((x) => [x.id, x.name]));
    const shown = rows
      .filter((r) => r.classId && eligible.ids.has(r.classId))
      .sort(
        (a, b) =>
          Number(eligible.withLesson.has(b.classId!)) - Number(eligible.withLesson.has(a.classId!)) ||
          compareClassNames(a.className ?? '', b.className ?? '') ||
          (a.listNo ?? 9999) - (b.listNo ?? 9999),
      )
      // KVKK: öğretmen başka işletmenin adını görmez, yalnızca "başka işletmede" bilgisini
      .map((r) => ({ ...r, businessId: !r.businessId || s.sees(r.businessId) ? r.businessId : 'other', businessName: r.businessId && s.sees(r.businessId) ? (bizName.get(r.businessId) ?? null) : null }));
    const classes = eligible.classes
      .filter((c) => eligible.ids.has(c.id))
      .map((c) => ({ id: c.id, name: c.name, withLesson: eligible.withLesson.has(c.id) }))
      .sort((a, b) => Number(b.withLesson) - Number(a.withLesson) || compareClassNames(a.name, b.name));
    return { students: shown, classes, fallback: eligible.fallback, mesem: eligible.mesem };
  });

  /**
   * Stajyerler (mobil "Öğrenciler" sekmesi): görülen işletmelerdeki öğrenciler, işletme adı ve bu öğretim yılındaki
   * özürsüz devamsızlık (gün) ile.
   */
  app.get(`${base}/interns`, member, async (req) => {
    const s = await scope(deps, req);
    const list = (await internStudents(deps, req.ctx.schoolId)).filter((st) => s.sees(st.businessId));
    const now = today(req);
    const ids = list.map((x) => x.id);
    const marks = ids.length
      ? await db
          .select({ studentId: internshipMarks.studentId, code: internshipMarks.code })
          .from(internshipMarks)
          .where(and(eq(internshipMarks.schoolId, req.ctx.schoolId), inArray(internshipMarks.studentId, ids), gte(internshipMarks.date, schoolYearStart(now))))
      : [];
    const absent = new Map<string, { unexcused: number; excused: number }>();
    for (const m of marks) {
      const a = absent.get(m.studentId) ?? { unexcused: 0, excused: 0 };
      if (m.code === 'D') a.unexcused += 0.5;
      else if (m.code === 'İ' || m.code === 'R' || m.code === 'H') a.excused += 0.5;
      absent.set(m.studentId, a);
    }
    return {
      canAdd: s.all || s.own.size > 0,
      students: list.map((x) => ({
        id: x.id,
        fullName: x.fullName,
        schoolNo: x.schoolNo,
        classId: x.classId,
        className: x.className,
        businessId: x.businessId,
        businessName: x.businessName,
        editable: s.canEdit(x.businessId),
        ...(absent.get(x.id) ?? { unexcused: 0, excused: 0 }),
      })),
    };
  });

  /**
   * Öğrenci ekle / işletme değiştir / işletmeden çıkar. Yönetim her işletmeye ekler; koordinatör öğretmen yalnızca
   * kendi işletmelerine ekler, başka işletmedeki öğrenciyi alamaz ve yalnızca kendi işletmesindeki öğrenciyi çıkarır.
   * Öğrenci, öğrenci seçimindeki sınıflardan olmalıdır. Eski işletmedeki dönem bir gün önce kapanır.
   */
  app.post(`${base}/students/assign`, member, async (req) => {
    const s = await scope(deps, req);
    const body = parse(internAssignSchema, req.body);
    const now = today(req);
    const from = body.from ?? now;
    if (from > addIsoDays(now, 60)) throw badRequest('Başlangıç tarihi en çok 60 gün sonrası olabilir.');
    if (from < addIsoDays(now, -400)) throw badRequest('Başlangıç tarihi bir yıldan eski olamaz.');
    let bizName = '';
    if (body.businessId) {
      const [b] = await db
        .select({ name: businesses.name })
        .from(businesses)
        .where(and(eq(businesses.id, body.businessId), eq(businesses.schoolId, req.ctx.schoolId)));
      if (!b) throw notFound();
      if (!s.canEdit(body.businessId)) throw forbidden('Yalnızca koordinatörü olduğunuz işletmelere öğrenci ekleyebilirsiniz.');
      bizName = b.name;
    }
    const picked = await db
      .select({ id: students.id, fullName: students.fullName, classId: students.classGroupId, businessId: students.businessId })
      .from(students)
      .where(and(eq(students.schoolId, req.ctx.schoolId), inArray(students.id, body.studentIds)));
    if (picked.length !== body.studentIds.length) throw notFound();
    const { ids } = await eligibleClasses(deps, req);
    for (const p of picked) {
      if (body.businessId && (!p.classId || !ids.has(p.classId))) throw badRequest(`${p.fullName} işletmeye gidebilecek bir sınıfta değil.`);
      // Başka işletmedeki öğrenciyi yalnızca yönetim taşır; öğretmen kendi işletmesindekini çıkarır ya da taşır
      if (p.businessId && !s.canEdit(p.businessId)) throw forbidden(`${p.fullName} başka bir işletmeye bağlı; koordinatör müdür yardımcısından değiştirmesini isteyin.`);
      if (!body.businessId && !p.businessId) throw badRequest(`${p.fullName} zaten bir işletmeye bağlı değil.`);
    }
    await db.transaction((tx) => moveStudents(tx, req.ctx.schoolId, body.studentIds, body.businessId, from));
    await audit(req, 'update', 'İşletme öğrencisi', body.businessId, body.businessId ? `${bizName}: ${picked.length} öğrenci (${from})` : `${picked.length} öğrenci işletmeden çıkarıldı (${from})`);
    return { ok: true, students: picked.length };
  });

  /**
   * Öğrenci sayfası: kimlik, şu anki işletme, işletme dönemleri, bu öğretim yılının toplamları ve devamsızlık kayıtları.
   * Şu anki işletmeyi gören (yeni koordinatör, yönetim) bütün dönemleri görür; yalnızca eski işletmeyi gören o dönemi görür.
   */
  app.get(`${base}/students/:id/record`, member, async (req) => {
    const s = await scope(deps, req);
    const id = idParam(req);
    const [st] = await db
      .select({ id: students.id, fullName: students.fullName, schoolNo: students.schoolNo, classId: students.classGroupId, className: classGroups.name, businessId: students.businessId })
      .from(students)
      .leftJoin(classGroups, eq(classGroups.id, students.classGroupId))
      .where(and(eq(students.id, id), eq(students.schoolId, req.ctx.schoolId)));
    if (!st) throw notFound();
    const periodRows = await db
      .select({ id: internshipPeriods.id, businessId: internshipPeriods.businessId, startDate: internshipPeriods.startDate, endDate: internshipPeriods.endDate, businessName: businesses.name, coordinatorName: teachers.fullName })
      .from(internshipPeriods)
      .innerJoin(businesses, eq(businesses.id, internshipPeriods.businessId))
      .leftJoin(teachers, eq(teachers.id, businesses.coordinatorTeacherId))
      .where(and(eq(internshipPeriods.studentId, id), eq(internshipPeriods.schoolId, req.ctx.schoolId)));
    const full = s.all || s.sees(st.businessId);
    const periods = periodRows
      .filter((p) => full || s.sees(p.businessId))
      .sort((a, b) => (a.startDate ?? '0000').localeCompare(b.startDate ?? '0000'));
    if (!full && !periods.length) throw forbidden('Bu öğrenci sizin işletmelerinizden birinde değil.');

    let business: Record<string, unknown> | null = null;
    if (st.businessId && full) {
      const [b] = await db
        .select({
          id: businesses.id,
          name: businesses.name,
          phone: businesses.phone,
          address: businesses.address,
          contactName: businesses.contactName,
          trainerName: businesses.trainerName,
          visitWeekday: businesses.visitWeekday,
          coordinatorName: teachers.fullName,
          areaName: teacherBranches.name,
        })
        .from(businesses)
        .leftJoin(teachers, eq(teachers.id, businesses.coordinatorTeacherId))
        .leftJoin(teacherBranches, eq(teacherBranches.id, businesses.areaId))
        .where(eq(businesses.id, st.businessId));
      business = b ?? null;
    }

    // Bu öğretim yılı: ay ay hücreler, görülen dönemlerin dışı boş
    const now = today(req);
    const start = schoolYearStart(now);
    const months: string[] = [];
    for (let m = start.slice(0, 7); m <= now.slice(0, 7); ) {
      months.push(m);
      const [y, mo] = m.split('-').map(Number) as [number, number];
      m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
    }
    const [monthList, weekdays, markRows] = await Promise.all([
      Promise.all(months.map((m) => monthDays(deps, req.ctx.schoolId, m))),
      schoolWeekdays(deps, req.ctx.schoolId, st.classId ? [st.classId] : []),
      db
        .select({ date: internshipMarks.date, half: internshipMarks.half, code: internshipMarks.code, userName: internshipMarks.userName, notifiedAt: internshipMarks.notifiedAt })
        .from(internshipMarks)
        .where(and(eq(internshipMarks.studentId, id), eq(internshipMarks.schoolId, req.ctx.schoolId), gte(internshipMarks.date, start))),
    ]);
    const marks = new Map(markRows.map((m) => [internKey(m.date, m.half), m.code as InternStored]));
    // Hiç dönem kaydı yoksa (eski atama) bütün yıl şu anki işletmenindir
    const ranges = periods.length ? periods.map((p) => ({ businessId: p.businessId, start: p.startDate, end: p.endDate })) : st.businessId && full ? [{ businessId: st.businessId, start: null, end: null }] : [];
    const inRange = (d: string, r: { start: string | null; end: string | null }) => (!r.start || d >= r.start) && (!r.end || d <= r.end);
    const visible = (d: string) => ranges.some((r) => inRange(d, r));
    const allCells: InternCell[][] = [];
    const perBusiness = new Map<string, InternCell[][]>();
    for (const days of monthList) {
      const cells = internCells(days, { school: weekdays.get(st.classId ?? '') ?? NO_SCHOOL, marks, today: now });
      days.forEach((d, i) => {
        if (!visible(d.date)) return;
        allCells.push(cells[i]!);
        for (const r of ranges) if (inRange(d.date, r)) perBusiness.set(r.businessId, [...(perBusiness.get(r.businessId) ?? []), cells[i]!]);
      });
    }
    const events = markRows
      .filter((m) => m.code !== 'X' && visible(m.date))
      .sort((a, b) => b.date.localeCompare(a.date) || a.half.localeCompare(b.half))
      .map((m) => ({ date: m.date, half: m.half, code: m.code, userName: m.userName, sent: Boolean(m.notifiedAt), businessId: ranges.find((r) => inRange(m.date, r))?.businessId ?? null }));
    return {
      student: { id: st.id, fullName: st.fullName, schoolNo: st.schoolNo, className: st.className },
      business,
      editable: s.canEdit(st.businessId),
      today: now,
      yearStart: start,
      totals: internTotals(allCells),
      periods: periods.map((p) => ({
        businessId: p.businessId,
        businessName: p.businessName,
        coordinatorName: p.coordinatorName,
        startDate: p.startDate,
        endDate: p.endDate,
        current: !p.endDate && p.businessId === st.businessId,
        totals: internTotals(perBusiness.get(p.businessId) ?? []),
      })),
      events,
    };
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
    const visible = bizRows.filter((b) => s.sees(b.id));
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

  /** İşletmeye atanabilecek koordinatörler: işaretli koordinatör öğretmenler (Koordinatör öğretmenler listesi) */
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
    // İşletmeye yalnızca işaretli koordinatör öğretmenler atanır
    const designated = await designatedCoordinators(deps, req);
    return {
      fallback: false,
      teachers: all.filter((t) => designated.has(t.id)).sort((a, b) => trCompare(a.branchName ?? 'ZZZ', b.branchName ?? 'ZZZ') || trCompare(a.fullName, b.fullName)),
    };
  });

  /* ---------- Devam çizelgesi ---------- */

  /** Aylık çizelge (web): sınıf ya da işletmeye göre süzülebilir */
  app.get(`${base}/sheet`, member, async (req) => {
    const s = await scope(deps, req);
    const q = req.query as { month?: string; classId?: string; businessId?: string; areaId?: string };
    const month = q.month ? parse(monthSchema, q.month) : today(req).slice(0, 7);
    const list = (await internStudents(deps, req.ctx.schoolId)).filter((st) => s.sees(st.businessId));
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
          unsent: marks.unsent.get(st.id) ?? [],
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
    const list = (await internStudents(deps, req.ctx.schoolId)).filter((st) => s.sees(st.businessId));
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
      g.students.push({ id: st.id, fullName: st.fullName, schoolNo: st.schoolNo, className: st.className, am: cell![0], pm: cell![1], unsent: marks.unsent.get(st.id) ?? [], editable: s.canEdit(st.businessId) });
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

  /* ---------- Rehberlik formları (PDF) ---------- */

  const MONTHS_TR = ['OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN', 'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK'];
  const formQuery = z.object({
    type: z.enum(['daily', 'attendance', 'report']),
    week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    month: monthSchema.optional(),
    ids: z.string().max(20000).optional(),
  });

  /** Görünen işletmeler: koordinatör, alan, öğrenci sayısı ve görev günüyle */
  async function formBusinesses(req: FastifyRequest) {
    const s = await scope(deps, req);
    const [rows, counts] = await Promise.all([
      db
        .select({
          id: businesses.id,
          name: businesses.name,
          phone: businesses.phone,
          email: businesses.email,
          address: businesses.address,
          contactName: businesses.contactName,
          field: businesses.field,
          areaName: teacherBranches.name,
          coordinatorName: teachers.fullName,
          visitWeekday: businesses.visitWeekday,
        })
        .from(businesses)
        .leftJoin(teachers, eq(teachers.id, businesses.coordinatorTeacherId))
        .leftJoin(teacherBranches, eq(teacherBranches.id, businesses.areaId))
        .where(and(eq(businesses.schoolId, req.ctx.schoolId), eq(businesses.isActive, true))),
      db.select({ businessId: students.businessId }).from(students).where(and(eq(students.schoolId, req.ctx.schoolId), isNotNull(students.businessId))),
    ]);
    const n = new Map<string, number>();
    for (const c of counts) n.set(c.businessId!, (n.get(c.businessId!) ?? 0) + 1);
    return {
      s,
      list: rows
        .filter((r) => s.sees(r.id))
        .map((r) => ({ ...r, students: n.get(r.id) ?? 0 }))
        .sort((a, b) => trCompare(a.coordinatorName ?? 'ZZZ', b.coordinatorName ?? 'ZZZ') || trCompare(a.name, b.name)),
    };
  }

  /** Haftanın görevleri: her işletme için görev günü tarihi ve tatil bilgisi */
  async function weekItems(req: FastifyRequest, week: string) {
    const { list } = await formBusinesses(req);
    const monday = mondayOf(week);
    const friday = addIsoDays(monday, 4);
    const { holidays } = await holidaysAndHalfDays(db, req.ctx.schoolId, monday, friday);
    const off = new Map(holidays.map((h) => [h.date, h.name]));
    return {
      monday,
      friday,
      items: list.map((b) => {
        const date = weekVisitDate(monday, b.visitWeekday);
        return { ...b, date, holiday: date ? (off.get(date) ?? null) : null };
      }),
    };
  }

  /** Ayın görevleri: her işletme için görev tarihleri (tatiller çıkarılmış) */
  async function monthItems(req: FastifyRequest, month: string) {
    const { list } = await formBusinesses(req);
    const days = await monthDays(deps, req.ctx.schoolId, month);
    return { days, items: list.map((b) => ({ ...b, dates: monthVisitDates(days, b.visitWeekday) })) };
  }

  /** Okul Ayarları'ndan: program adı, resmî il ve ilçe */
  const formSettings = (req: FastifyRequest) => {
    const st = settingsOf(req);
    return { programName: st.internshipProgramName, district: st.district, province: st.province };
  };

  /**
   * Devam çizelgesindeki satırlar (işletmelere göre): ay içinde o işletmede dönemi olan öğrenciler. İşletme değiştiren
   * öğrenci iki işletmenin çizelgesinde de yer alır; her birinde yalnızca o işletmedeki günler dolar, diğer günler "–"
   * (outside) olur ve toplama girmez.
   */
  async function attendanceRows(req: FastifyRequest, days: InternDay[], month: string, businessIds: Set<string>) {
    const from = `${month}-01`;
    const to = monthLast(month);
    const ids = [...businessIds];
    const [all, periodRows] = await Promise.all([
      internStudents(deps, req.ctx.schoolId),
      ids.length
        ? db
            .select({
              studentId: internshipPeriods.studentId,
              businessId: internshipPeriods.businessId,
              startDate: internshipPeriods.startDate,
              endDate: internshipPeriods.endDate,
              fullName: students.fullName,
              schoolNo: students.schoolNo,
              listNo: students.listNo,
              classId: students.classGroupId,
              className: classGroups.name,
              businessName: businesses.name,
              areaName: teacherBranches.name,
            })
            .from(internshipPeriods)
            .innerJoin(students, eq(students.id, internshipPeriods.studentId))
            .innerJoin(businesses, eq(businesses.id, internshipPeriods.businessId))
            .leftJoin(teacherBranches, eq(teacherBranches.id, businesses.areaId))
            .leftJoin(classGroups, eq(classGroups.id, students.classGroupId))
            .where(
              and(
                eq(internshipPeriods.schoolId, req.ctx.schoolId),
                inArray(internshipPeriods.businessId, ids),
                or(isNull(internshipPeriods.startDate), lte(internshipPeriods.startDate, to)),
                or(isNull(internshipPeriods.endDate), gte(internshipPeriods.endDate, from)),
              ),
            )
        : Promise.resolve([]),
    ]);
    type Row = { id: string; fullName: string; schoolNo: string; listNo: number | null; classId: string | null; className: string | null; businessId: string; businessName: string; areaName: string | null; start: string | null; end: string | null };
    const rows: Row[] = periodRows.map((p) => ({ id: p.studentId, fullName: p.fullName, schoolNo: p.schoolNo, listNo: p.listNo, classId: p.classId, className: p.className, businessId: p.businessId, businessName: p.businessName, areaName: p.areaName, start: p.startDate, end: p.endDate }));
    // Dönemi kaydı olmayan eski atama: bütün ay şu anki işletmede
    const has = new Set(rows.map((r) => `${r.id}|${r.businessId}`));
    for (const x of all) if (businessIds.has(x.businessId!) && !has.has(`${x.id}|${x.businessId}`)) rows.push({ ...x, businessId: x.businessId!, start: null, end: null });
    const num = (v: string) => (/^\d+$/.test(v) ? Number(v) : Number.MAX_SAFE_INTEGER);
    rows.sort((a, b) => compareClassNames(a.className ?? '', b.className ?? '') || (a.listNo ?? 9999) - (b.listNo ?? 9999) || num(a.schoolNo) - num(b.schoolNo) || (a.start ?? '').localeCompare(b.start ?? ''));
    const classIds = [...new Set(rows.map((x) => x.classId).filter((x): x is string => Boolean(x)))];
    const [weekdays, marks] = await Promise.all([schoolWeekdays(deps, req.ctx.schoolId, classIds), marksInRange(deps, req.ctx.schoolId, from, to)]);
    const now = today(req);
    return rows.map((x) => {
      const raw = internCells(days, { school: weekdays.get(x.classId ?? '') ?? NO_SCHOOL, marks: marks.get(x.id) ?? new Map(), today: now });
      const outside = days.map((d) => Boolean((x.start && d.date < x.start) || (x.end && d.date > x.end)));
      return { ...x, cells: maskCells(days, raw, x.start, x.end), outside };
    });
  }

  /** Yazdırma penceresi: seçilen hafta ya da ayın görevleri */
  app.get(`${base}/forms`, member, async (req) => {
    const q = parse(formQuery, req.query);
    const settings = { ...formSettings(req), canEdit: isManager(req) };
    if (q.type === 'daily') {
      const r = await weekItems(req, q.week ?? today(req));
      return {
        settings,
        monday: r.monday,
        friday: r.friday,
        items: r.items.map((b) => ({ id: b.id, name: b.name, coordinatorName: b.coordinatorName, students: b.students, visitWeekday: b.visitWeekday, date: b.date, holiday: b.holiday })),
      };
    }
    const month = q.month ?? today(req).slice(0, 7);
    const r = await monthItems(req, month);
    // Devam çizelgesi: kontrol edilmemiş (?) yarım günler ve ay bitmeden yazdırılırsa boş kalacak günler
    const unchecked = new Map<string, { halves: number; students: number }>();
    const rowCount = new Map<string, number>();
    if (q.type === 'attendance') {
      const rows = await attendanceRows(req, r.days, month, new Set(r.items.map((b) => b.id)));
      for (const x of rows) rowCount.set(x.businessId, (rowCount.get(x.businessId) ?? 0) + 1);
      for (const x of rows) {
        const n = x.cells.reduce((k, c) => k + c.filter((v) => v === '?').length, 0);
        if (!n) continue;
        const u = unchecked.get(x.businessId!) ?? { halves: 0, students: 0 };
        unchecked.set(x.businessId!, { halves: u.halves + n, students: u.students + 1 });
      }
    }
    const now = today(req);
    return {
      settings,
      month,
      today: now,
      // Ay bitmediyse bugünden sonraki günler çizelgede boş kalır
      monthOpen: now < monthLast(month),
      items: r.items.map((b) => ({
        id: b.id,
        name: b.name,
        coordinatorName: b.coordinatorName,
        // Devam çizelgesi: ay içinde işletmede bulunmuş öğrenciler (ayrılanlar dahil)
        students: q.type === 'attendance' ? (rowCount.get(b.id) ?? 0) : b.students,
        visitWeekday: b.visitWeekday,
        dates: b.dates,
        unchecked: unchecked.get(b.id) ?? null,
      })),
    };
  });

  /**
   * Formlar (PDF, A5; iki form bir A4'e). `ids` seçilen işletmeler (virgülle); yoksa görevi olan bütün işletmeler.
   * Günlük form: haftanın görev günü (tatile denk gelen görev ancak açıkça seçilirse basılır). Aylık devam çizelgesi:
   * işletmedeki öğrencilerin ay boyu işaretleri. Aylık rapor: ayın görev tarihleri. Belge ve rapor tarihi, o ay o
   * işletmeye son gidilen görev tarihidir.
   */
  app.get(`${base}/forms.pdf`, member, async (req, reply) => {
    const q = parse(formQuery, req.query);
    const picked = q.ids ? new Set(q.ids.split(',').filter((x) => UUID_RE.test(x))) : null;
    const st = settingsOf(req);
    const managerName = st.internshipManagerUserId ? await userName(deps, st.internshipManagerUserId) : '';
    const school = req.ctx.school;
    const fs = formSettings(req);
    const area = (b: { areaName: string | null; field: string | null }) => [b.areaName, b.field].filter(Boolean).join(' / ');
    let pdf: Buffer;
    let name: string;
    if (q.type === 'daily') {
      const r = await weekItems(req, q.week ?? today(req));
      const chosen = r.items.filter((b) => b.date && (picked ? picked.has(b.id) : !b.holiday));
      const forms: DailyForm[] = chosen.map((b) => ({
        schoolLine: [school.name, fs.programName].filter(Boolean).join(' '),
        business: b.name,
        students: b.students,
        responsible: b.students,
        address: b.address ?? '',
        area: area(b),
        date: trDate(b.date),
        contact: b.contactName ?? '',
        teacher: b.coordinatorName ?? '',
        manager: managerName,
      }));
      pdf = await dailyFormsPdf(forms);
      name = `gunluk-rehberlik-formu-${r.monday}.pdf`;
    } else {
      const month = q.month ?? today(req).slice(0, 7);
      const r = await monthItems(req, month);
      // Devam çizelgesi görev gününe bağlı değildir (öğrencisi olan her işletme); rapor görev tarihleriyle
      const att = q.type === 'attendance' ? await attendanceRows(req, r.days, month, new Set(r.items.filter((b) => !picked || picked.has(b.id)).map((b) => b.id))) : [];
      const chosen = r.items.filter((b) => (picked ? picked.has(b.id) : q.type === 'attendance' ? att.some((x) => x.businessId === b.id) : b.dates.length > 0));
      const monthText = `${MONTHS_TR[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
      if (q.type === 'report') {
        const forms: ReportForm[] = chosen.map((b) => ({
          addressee: `${school.name} Müdürlüğüne`,
          place: [fs.district, fs.province.toLocaleUpperCase('tr-TR')].filter(Boolean).join('/'),
          area: b.areaName ?? '',
          date: trDate(b.dates.at(-1)),
          business: b.name,
          address: b.address ?? '',
          contact: b.contactName ?? '',
          teacher: b.coordinatorName ?? '',
          dates: b.dates.map(trDate),
        }));
        pdf = await reportFormsPdf(forms);
        name = `aylik-rehberlik-raporu-${month}.pdf`;
      } else {
        const all = att;
        const letter = (c: InternCell) => (c === 'TA' || c === 'T' ? 'T' : c === 'W' || c === '?' || c === '' || c === 'K' ? '' : c);
        const num = (v: number) => String(v).replace('.', ',');
        const forms: AttendanceForm[] = [];
        for (const b of chosen) {
          const rows = all
            .filter((x) => x.businessId === b.id)
            .map((x) => {
              const cells = x.cells;
              const t = internTotals(cells);
              return {
                name: x.fullName,
                no: x.schoolNo,
                area: areaInitials(x.areaName),
                // İşletmede olmadığı günler (ayrıldıktan sonra ya da gelmeden önce) "–"
                cells: cells.map(([am, pm], i) => (x.outside[i] && r.days[i]!.weekday < 6 ? ['–', '–'] : [letter(am ?? ''), letter(pm ?? '')]) as [string, string]),
                excused: num(t.excused),
                unexcused: num(t.unexcused),
              };
            });
          for (let i = 0; i < Math.max(1, rows.length); i += ATTENDANCE_ROWS)
            forms.push({
              business: b.name,
              phone: b.phone ?? '',
              email: b.email ?? '',
              month: monthText,
              daysInMonth: r.days.length,
              weekend: r.days.map((d) => d.weekday >= 6),
              issued: trDate(b.dates.at(-1)),
              contact: b.contactName ?? '',
              manager: managerName,
              students: rows.slice(i, i + ATTENDANCE_ROWS),
            });
        }
        pdf = await attendanceFormsPdf(forms);
        name = `aylik-devam-cizelgesi-${month}.pdf`;
      }
    }
    await audit(req, 'export', 'Rehberlik formu', null, name);
    return reply.header('content-type', 'application/pdf').header('content-disposition', `attachment; filename="${name}"`).send(pdf);
  });

  /**
   * İşaretleri kaydet. 'X' işletmede, '-' işareti kaldırır. 'T' işletmeye giden bütün öğrencilere, 'K' öğrencinin işletmesindeki bütün
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
    if (last > now && items.some((i) => i.code === 'X')) throw badRequest('İleri tarih "İşletmede" işaretlenemez; gün gelince kontrol edip işaretleyin.');
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
    const changed: { studentId: string; date: string; half: InternHalf; code: InternStored | null }[] = [];
    for (const dt of dates) {
      const day = dayOf.get(dt)!;
      const prev = (studentId: string, half: InternHalf) => before.get(studentId)?.get(internKey(dt, half)) ?? null;
      /** İşletme günü mü (okul günü, hafta sonu ve takvim tatili değil) */
      const workHalf = (studentId: string, half: InternHalf) => {
        const st = byId.get(studentId)!;
        const [c] = internCells([day], { school: weekdays.get(st.classId ?? '') ?? NO_SCHOOL, marks: new Map(), today: '9999-12-31' });
        return c![half === 'am' ? 0 : 1] === '?';
      };
      const next = new Map<string, InternStored | null>();
      const set = (studentId: string, half: InternHalf, code: InternStored | null) => {
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
        } else if (it.code === '-' && old === 'T') {
          for (const x of list) if (prev(x.id, it.half) === 'T') set(x.id, it.half, null);
        } else if (it.code === '-' && old === 'K') {
          for (const x of list) if (x.businessId === st.businessId && prev(x.id, it.half) === 'K') set(x.id, it.half, null);
        } else {
          set(st.id, it.half, it.code === '-' ? null : it.code);
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
    // Devamsızlıklar hemen bildirilmez: koordinatör "Gönder" deyince gider (bkz. /send)
    const pending = changed.filter((c) => c.code && isAbsence(c.code)).length;
    return { changed: changed.length, pending };
  });

  /** Toplu "İşletmede": aralıktaki işaretsiz (?) işletme günleri X olur; var olan işaretlere dokunulmaz */
  app.post(`${base}/marks/fill`, member, async (req) => {
    const s = await scope(deps, req);
    const { from, until, businessId } = parse(internFillSchema, req.body);
    const now = today(req);
    const last = until < now ? until : now;
    if (from > last) throw badRequest('İleri tarih "İşletmede" işaretlenemez.');
    const dates: string[] = [];
    for (let d = from; d <= last; d = addIsoDays(d, 1)) dates.push(d);
    if (dates.length > 62) throw badRequest('En çok iki aylık aralık seçilebilir.');
    const list = (await internStudents(deps, req.ctx.schoolId)).filter((st) => s.canEdit(st.businessId) && (!businessId || st.businessId === businessId));
    if (!list.length) throw badRequest('İşaretlenecek öğrenci yok.');
    const months = [...new Set(dates.map((d) => d.slice(0, 7)))];
    const [monthList, weekdays, before] = await Promise.all([
      Promise.all(months.map((m) => monthDays(deps, req.ctx.schoolId, m))),
      schoolWeekdays(deps, req.ctx.schoolId, [...new Set(list.map((x) => x.classId).filter((x): x is string => Boolean(x)))]),
      marksInRange(deps, req.ctx.schoolId, from, last),
    ]);
    const days = monthList.flat().filter((d) => d.date >= from && d.date <= last);
    const rows: (typeof internshipMarks.$inferInsert)[] = [];
    const name = await userName(deps, req.ctx.userId);
    for (const st of list) {
      const cells = internCells(days, { school: weekdays.get(st.classId ?? '') ?? NO_SCHOOL, marks: before.get(st.id) ?? new Map(), today: now });
      days.forEach((d, i) =>
        INTERN_HALVES_LIST.forEach((half, hi) => {
          if (cells[i]![hi] === '?') rows.push({ schoolId: req.ctx.schoolId, studentId: st.id, date: d.date, half, code: 'X', userId: req.ctx.userId, userName: name });
        }),
      );
    }
    if (rows.length) {
      await db.transaction(async (tx) => {
        for (let i = 0; i < rows.length; i += 500) await tx.insert(internshipMarks).values(rows.slice(i, i + 500)).onConflictDoNothing();
      });
      await audit(req, 'update', 'İşletmede devam', null, `${dateText(from)} – ${dateText(last)}: ${rows.length} bölüm işletmede işaretlendi`);
    }
    return { changed: rows.length };
  });

  /** Gönderilmemiş devamsızlıklar (koordinatörün düzenleyebildiği öğrencilerde) */
  app.get(`${base}/pending`, member, async (req) => {
    const s = await scope(deps, req);
    const rows = await pendingRows(deps, req.ctx.schoolId);
    return rows
      .filter((r) => s.canEdit(r.businessId))
      .map((r) => ({ id: r.id, studentId: r.studentId, fullName: r.fullName, className: r.className, businessName: r.businessName, date: r.date, half: r.half, code: r.code, userName: r.userName }));
  });

  /** Seçilen devamsızlıkları koordinatör müdür yardımcısına gönder (bildirim kutusu ve anlık bildirim) */
  app.post(`${base}/send`, member, async (req) => {
    const s = await scope(deps, req);
    const { ids, note } = parse(internSendSchema, req.body);
    const rows = (await pendingRows(deps, req.ctx.schoolId)).filter((r) => ids.includes(r.id));
    if (!rows.length) throw badRequest('Gönderilecek devamsızlık yok (daha önce gönderilmiş olabilir).');
    for (const r of rows) if (!s.canEdit(r.businessId)) throw forbidden(`${r.fullName} sizin koordinatör olduğunuz bir işletmede değil.`);
    const vp = settingsOf(req).internshipManagerUserId;
    if (!vp) throw badRequest('Okul ayarlarında işletmelerden sorumlu müdür yardımcısı seçilmemiş; idareye bildirin.');
    const [m] = await db.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.schoolId, req.ctx.schoolId), eq(memberships.userId, vp)));
    if (!m) throw badRequest('Seçilen müdür yardımcısı artık okulda değil; okul ayarlarından yeniden seçilmeli.');
    const sender = await userName(deps, req.ctx.userId);
    if (vp !== req.ctx.userId) await sendInternshipNotice(deps, { schoolId: req.ctx.schoolId, vp, sender, note: note || null, rows });
    await db
      .update(internshipMarks)
      .set({ notifiedAt: new Date() })
      .where(inArray(internshipMarks.id, rows.map((r) => r.id)));
    await audit(req, 'update', 'İşletmede devam', null, `${rows.length} devamsızlık müdür yardımcısına gönderildi`);
    return { sent: rows.length };
  });
}

const INTERN_HALVES_LIST: InternHalf[] = ['am', 'pm'];

/** Okulun gönderilmemiş devamsızlıkları (D, İ, R, H; müdür yardımcısına henüz gitmedi) */
async function pendingRows(deps: AppDeps, schoolId: string) {
  const rows = await deps.db
    .select({
      id: internshipMarks.id,
      studentId: internshipMarks.studentId,
      date: internshipMarks.date,
      half: internshipMarks.half,
      code: internshipMarks.code,
      userName: internshipMarks.userName,
      fullName: students.fullName,
      className: classGroups.name,
      businessId: students.businessId,
      businessName: businesses.name,
    })
    .from(internshipMarks)
    .innerJoin(students, eq(students.id, internshipMarks.studentId))
    .leftJoin(classGroups, eq(classGroups.id, students.classGroupId))
    .leftJoin(businesses, eq(businesses.id, students.businessId))
    .where(and(eq(internshipMarks.schoolId, schoolId), isNull(internshipMarks.notifiedAt), inArray(internshipMarks.code, [...INTERN_ABSENCES])));
  return rows.sort((a, b) => trCompare(a.businessName ?? '', b.businessName ?? '') || trCompare(a.fullName, b.fullName) || a.date.localeCompare(b.date) || a.half.localeCompare(b.half));
}

const shortDate = (iso: string) => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));

/**
 * Devamsızlıkları koordinatör müdür yardımcısına bildirir: tek bildirim, öğrenci ve koda göre günler birleşir. Ayrıntı
 * (öğrenci adı, rapor) yalnızca uygulamanın bildirim kutusunda; kilit ekranına düşen bildirimde ad ve sağlık bilgisi
 * yazmaz (KVKK).
 */
async function sendInternshipNotice(
  deps: AppDeps,
  o: {
    schoolId: string;
    vp: string;
    sender: string;
    note: string | null;
    rows: { studentId: string; date: string; half: InternHalf; code: InternStored; fullName: string; className: string | null; businessName: string | null }[];
  },
) {
  const byKey = new Map<string, typeof o.rows>();
  for (const r of o.rows) byKey.set(`${r.studentId}|${r.code}`, [...(byKey.get(`${r.studentId}|${r.code}`) ?? []), r]);
  const lines = [...byKey.values()].map((parts) => {
    const p = parts[0]!;
    const days = [...new Set(parts.map((x) => x.date))].sort();
    const when =
      days.length === 1
        ? `${shortDate(days[0]!)} ${internHalfText(parts.map((x) => x.half))}`
        : `${shortDate(days[0]!)} – ${shortDate(days[days.length - 1]!)}, ${formatDays(parts.length / 2)} gün`;
    return `${p.fullName}${p.className ? ` (${p.className})` : ''}: ${when} ${INTERN_MARK_TEXT[p.code]}${p.businessName ? ` · ${p.businessName}` : ''}`;
  });
  const codes = new Set(o.rows.map((r) => r.code));
  const absent = codes.has('D');
  const excused = [...codes].some((c) => c !== 'D');
  const title = absent && excused ? 'İşletmede devamsızlık ve rapor/izin' : absent ? 'İşletmede devamsızlık' : 'İşletmede rapor / izin bildirimi';
  const what = absent && excused ? 'devamsızlık ve rapor/izin' : absent ? 'devamsızlık' : 'rapor / izin';
  const studentCount = new Set(o.rows.map((r) => r.studentId)).size;
  const firstDate = [...o.rows.map((r) => r.date)].sort()[0]!;
  await addToInbox(deps.db, [o.vp], {
    key: `internship:${randomUUID()}`,
    kind: 'internship',
    title,
    body: `Bildiren: ${o.sender}\n${lines.join('\n')}${o.note ? `\nNot: ${o.note}` : ''}`,
    to: `/isletme-devam?ay=${firstDate.slice(0, 7)}&gun=${firstDate}`,
    schoolId: o.schoolId,
  });
  notifyUsers(deps, [o.vp], { title, body: `${studentCount === 1 ? 'Bir öğrenci' : `${studentCount} öğrenci`} için ${what} bildirildi. Ayrıntı uygulamada.`, url: '/bildirimler' });
}
