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
} from '@okulpano/shared';
import { and, asc, eq, gte, inArray, isNotNull, lte } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { audit, schoolGuard, UUID_RE, type AppDeps } from '../context.ts';
import { businesses, classGroups, internshipMarks, memberships, students, teachers, timetableEntries, users } from '../db/schema.ts';
import { holidaysAndHalfDays } from '../lib/dayinfo.ts';
import { badRequest, forbidden, notFound, parse } from '../lib/errors.ts';
import { notifyUsers } from '../lib/push.ts';
import { addToInbox } from './notifications.ts';

/*
 * İşletmelerde mesleki eğitim: işletmeler, öğrencilerin işletmeleri ve aylık devam çizelgesi. İşletmeleri ve bütün
 * çizelgeyi idare yönetir (internship.manage); koordinatör öğretmen kendi işletmelerindeki öğrencileri işaretler.
 * D (devamsız) ve R (raporlu) kaydedilince koordinatör müdür yardımcısına (okul ayarlarında seçilen kullanıcı)
 * bildirim gider. KVKK: destek erişimi öğrenci devam kayıtlarını göremez; panoya hiçbir şey gitmez.
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

/** Kullanıcının koordinatör olduğu işletmeler */
async function ownBusinessIds(deps: AppDeps, req: FastifyRequest): Promise<Set<string>> {
  if (!req.ctx.teacherId) return new Set();
  const rows = await deps.db
    .select({ id: businesses.id })
    .from(businesses)
    .where(and(eq(businesses.schoolId, req.ctx.schoolId), eq(businesses.coordinatorTeacherId, req.ctx.teacherId)));
  return new Set(rows.map((r) => r.id));
}

/** Görme ve işaretleme kapsamı: idare ve koordinatör müdür yardımcısı hepsi, koordinatör öğretmen kendi işletmeleri */
async function scope(deps: AppDeps, req: FastifyRequest) {
  requireModule(req);
  const all = isManager(req) || isVp(req);
  const own = await ownBusinessIds(deps, req);
  if (!all && !own.size) throw forbidden('Devam çizelgesini idare ve koordinatör öğretmenler görebilir.');
  return { all, own, canEdit: (businessId: string | null) => Boolean(businessId) && (all || own.has(businessId!)) };
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
    })
    .from(students)
    .innerJoin(businesses, eq(businesses.id, students.businessId))
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
    if (!enabled) return { enabled: false, all: false, coordinator: false, manage: false };
    const own = await ownBusinessIds(deps, req);
    return { enabled: true, all: isManager(req) || isVp(req), coordinator: own.size > 0, manage: isManager(req) };
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
    const s = await scope(deps, req);
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
          coordinatorTeacherId: businesses.coordinatorTeacherId,
          coordinatorName: teachers.fullName,
          isActive: businesses.isActive,
        })
        .from(businesses)
        .leftJoin(teachers, eq(teachers.id, businesses.coordinatorTeacherId))
        .where(eq(businesses.schoolId, req.ctx.schoolId))
        .orderBy(asc(businesses.name)),
      db.select({ businessId: students.businessId, id: students.id }).from(students).where(and(eq(students.schoolId, req.ctx.schoolId), isNotNull(students.businessId))),
    ]);
    const n = new Map<string, number>();
    for (const c of counts) n.set(c.businessId!, (n.get(c.businessId!) ?? 0) + 1);
    return rows
      .filter((r) => s.all || s.own.has(r.id))
      .sort((a, b) => trCompare(a.name, b.name))
      .map((r) => ({ ...r, students: n.get(r.id) ?? 0 }));
  });

  app.post(`${base}/businesses`, manage, async (req) => {
    requireModule(req);
    const body = parse(businessSchema, req.body);
    await checkTeacher(req, body.coordinatorTeacherId);
    const [row] = await db
      .insert(businesses)
      .values({ ...body, schoolId: req.ctx.schoolId })
      .returning();
    await audit(req, 'create', 'İşletme', row!.id, row!.name);
    return row;
  });

  app.patch(`${base}/businesses/:id`, manage, async (req) => {
    requireModule(req);
    const id = idParam(req);
    const body = parse(businessSchema.partial(), req.body);
    if (body.coordinatorTeacherId) await checkTeacher(req, body.coordinatorTeacherId);
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
  app.put(`${base}/businesses/:id/students`, manage, async (req) => {
    requireModule(req);
    const id = idParam(req);
    const { studentIds } = parse(businessStudentsSchema, req.body);
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

  /** Öğrenci seçimi için: bütün öğrenciler ve işletmeleri */
  app.get(`${base}/students`, manage, async (req) => {
    requireModule(req);
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
    return rows.sort(
      (a, b) => (a.classOrder ?? 0) - (b.classOrder ?? 0) || trCompare(a.className ?? '', b.className ?? '') || (a.listNo ?? 9999) - (b.listNo ?? 9999),
    );
  });

  /* ---------- Devam çizelgesi ---------- */

  /** Aylık çizelge (web): sınıf ya da işletmeye göre süzülebilir */
  app.get(`${base}/sheet`, member, async (req) => {
    const s = await scope(deps, req);
    const q = req.query as { month?: string; classId?: string; businessId?: string };
    const month = q.month ? parse(monthSchema, q.month) : today(req).slice(0, 7);
    const list = (await internStudents(deps, req.ctx.schoolId)).filter((st) => s.all || s.own.has(st.businessId!));
    const classes = [...new Map(list.filter((x) => x.classId).map((x) => [x.classId!, { id: x.classId!, name: x.className ?? '' }])).values()];
    const bizs = [...new Map(list.map((x) => [x.businessId!, { id: x.businessId!, name: x.businessName }])).values()].sort((a, b) => trCompare(a.name, b.name));
    const shown = list.filter((x) => (!q.classId || x.classId === q.classId) && (!q.businessId || x.businessId === q.businessId));
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
    if (last > now && items.some((i) => i.code === 'D')) throw badRequest('İleri tarihe devamsızlık (D) girilemez; yalnızca rapor (R), tatil (T) ya da işletme kapalı (K) girilebilir.');
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
      for (const it of items) if (it.code === 'D' || it.code === 'R') set(it.studentId, it.half, it.code);
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

    // Yeni D ve R: öğrenci ve koda göre günler ve bölümler birleşir
    const news = new Map<string, { date: string; half: InternHalf }[]>();
    for (const c of changed) {
      if (c.code !== 'D' && c.code !== 'R') continue;
      const key = `${c.studentId}|${c.code}`;
      news.set(key, [...(news.get(key) ?? []), { date: c.date, half: c.half }]);
    }
    await audit(req, 'update', 'İşletmede devam', null, `${dateText(date)}${single ? '' : ` – ${dateText(last)}`}: ${changed.length} işaret`);
    if (news.size) await notifyManager(req, date, news, byId);
    return { changed: changed.length, notified: news.size };
  });

  /**
   * Koordinatör müdür yardımcısına bildirim. Ayrıntı (öğrenci adı, rapor) yalnızca uygulamanın bildirim kutusunda
   * görünür; kilit ekranına düşen telefon bildiriminde ad ve sağlık bilgisi yazmaz (KVKK).
   */
  async function notifyManager(
    req: FastifyRequest,
    date: string,
    news: Map<string, { date: string; half: InternHalf }[]>,
    byId: Map<string, { fullName: string; className: string | null; businessName: string }>,
  ) {
    const vp = settingsOf(req).internshipManagerUserId;
    if (!vp || vp === req.ctx.userId) return;
    const [m] = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.schoolId, req.ctx.schoolId), eq(memberships.userId, vp)));
    if (!m) return;
    const by = await userName(deps, req.ctx.userId);
    const short = (iso: string) => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
    const lines = [...news].map(([k, parts]) => {
      const [studentId, code] = k.split('|') as [string, 'D' | 'R'];
      const st = byId.get(studentId)!;
      const what = code === 'R' ? 'raporlu (özürlü)' : 'devamsız (özürsüz)';
      const days = [...new Set(parts.map((p) => p.date))].sort();
      const when =
        days.length === 1
          ? `${short(days[0]!)} ${internHalfText(parts.map((p) => p.half))}`
          : `${short(days[0]!)} – ${short(days[days.length - 1]!)}, ${formatDays(parts.length / 2)} gün`;
      return `${st.fullName}${st.className ? ` (${st.className})` : ''}: ${when} ${what} · ${st.businessName}`;
    });
    const anyD = [...news.keys()].some((k) => k.endsWith('|D'));
    const anyR = [...news.keys()].some((k) => k.endsWith('|R'));
    const title = anyD && anyR ? 'İşletmede devamsızlık ve rapor' : anyR ? 'İşletmede rapor bildirimi' : 'İşletmede devamsızlık';
    const what = anyD && anyR ? 'devamsızlık ve rapor' : anyR ? 'rapor' : 'devamsızlık';
    const studentCount = new Set([...news.keys()].map((k) => k.split('|')[0])).size;
    await addToInbox(db, [vp], {
      key: `internship:${randomUUID()}`,
      kind: 'internship',
      title,
      body: `Bildiren: ${by}\n${lines.join('\n')}`,
      to: `/isletme-devam?ay=${date.slice(0, 7)}&gun=${date}`,
      schoolId: req.ctx.schoolId,
    });
    notifyUsers(deps, [vp], { title, body: `${studentCount === 1 ? 'Bir öğrenci' : `${studentCount} öğrenci`} için ${what} bildirildi. Ayrıntı uygulamada.`, url: '/bildirimler' });
  }
}
