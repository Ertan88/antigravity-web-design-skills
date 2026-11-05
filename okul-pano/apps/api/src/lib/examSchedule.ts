import {
  bellClassDays,
  classBell,
  dayBells,
  examTiming,
  isoWeekday,
  lessonCounts,
  normalizeClassName,
  normalizeName,
  schoolSettingsSchema,
  zonedInstant,
  type ExamKind,
  type ScheduledExam,
  type SchoolCalendar,
} from '@okulpano/shared';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import type { DB } from '../db/client.ts';
import { bellOverrides, bellSchedules, classGroups, examSchedule, schools, teacherLeaves, teachers, timetableEntries } from '../db/schema.ts';
import { holidaysAndHalfDays } from './dayinfo.ts';
import { fold } from './excel.ts';

/*
 * Sınav takviminin hesaplanan hâli: her sınavın o günkü saati (sınıfın zilinden), hatırlatma anı,
 * gözetmeni (elle seçilen ya da ders programından o saatte sınıfta olan) ve dersin öğretmeni.
 */

type School = Pick<typeof schools.$inferSelect, 'id' | 'timezone' | 'settings'>;

export const classKey = (name: string) => normalizeName(normalizeClassName(name));

/** Ders adı karşılaştırması: büyük/küçük harf, Türkçe karakter ve noktalama fark etmez */
export const subjectKey = (s: string) => fold(s);

/** Sınav hesabının girdileri: zil düzenleri, tatiller, müdahaleler, ders programı, öğretmenler, izinler */
export async function loadExamContext(db: DB, school: School, from: string, to: string) {
  const settings = schoolSettingsSchema.parse(school.settings ?? {});
  const [bells, holidays, overrides, lessons, classes, staff, leaves] = await Promise.all([
    db.select().from(bellSchedules).where(eq(bellSchedules.schoolId, school.id)).orderBy(asc(bellSchedules.sortOrder)),
    holidaysAndHalfDays(db, school.id, from, to),
    db
      .select({ date: bellOverrides.date, target: bellOverrides.target, periods: bellOverrides.periods, note: bellOverrides.note })
      .from(bellOverrides)
      .where(and(eq(bellOverrides.schoolId, school.id), gte(bellOverrides.date, from), lte(bellOverrides.date, to))),
    db
      .select({ weekday: timetableEntries.weekday, periodNo: timetableEntries.periodNo, classGroupId: timetableEntries.classGroupId, teacherId: timetableEntries.teacherId, subject: timetableEntries.subject })
      .from(timetableEntries)
      .where(eq(timetableEntries.schoolId, school.id)),
    db.select({ id: classGroups.id, name: classGroups.name, bellExempt: classGroups.bellExempt, shift: classGroups.shift }).from(classGroups).where(eq(classGroups.schoolId, school.id)),
    db.select({ id: teachers.id, fullName: teachers.fullName }).from(teachers).where(eq(teachers.schoolId, school.id)),
    db
      .select({ teacherId: teacherLeaves.teacherId, startDate: teacherLeaves.startDate, endDate: teacherLeaves.endDate })
      .from(teacherLeaves)
      .where(and(eq(teacherLeaves.schoolId, school.id), eq(teacherLeaves.approvalStatus, 'approved'), lte(teacherLeaves.startDate, to), gte(teacherLeaves.endDate, from))),
  ]);
  const cal: SchoolCalendar = {
    schedules: bells.map((b) => ({ ...b, classIds: b.classIds ?? null })),
    holidays: holidays.holidays,
    halfDays: holidays.halfDays,
    halfDayEnd: settings.halfDayEnd,
    lessonCounts: lessons.length ? lessonCounts(lessons, classes, settings.dualShift) : null,
    bellClasses: bellClassDays(lessons, classes),
    overrides,
    dualShift: settings.dualShift,
  };
  return { settings, cal, lessons, classes, staff, leaves, timezone: school.timezone };
}

export type ExamContext = Awaited<ReturnType<typeof loadExamContext>>;

export interface ExamRowLike {
  id: string;
  date: string;
  periodNo: number;
  classGroupId: string;
  subject: string;
  kind: ExamKind;
  note: string | null;
  proctorTeacherId: string | null;
}

/** Bir sınavı hesaplar: saat, hatırlatma anı, gözetmen(ler), dersin öğretmen(ler)i ve uyarılar */
export function resolveExam(ctx: ExamContext, row: ExamRowLike, bellCache = new Map<string, ReturnType<typeof dayBells>>()): ScheduledExam {
  const cls = ctx.classes.find((c) => c.id === row.classGroupId);
  const nameOf = (id: string) => ctx.staff.find((t) => t.id === id)?.fullName ?? '';
  const onLeave = (teacherId: string) => ctx.leaves.some((l) => l.teacherId === teacherId && l.startDate <= row.date && l.endDate >= row.date);
  const warnings: string[] = [];

  let bells = bellCache.get(row.date);
  if (!bells) {
    bells = dayBells(row.date, ctx.cal);
    bellCache.set(row.date, bells);
  }
  const holiday = ctx.cal.holidays.find((h) => h.date === row.date);
  const weekday = isoWeekday(row.date);
  let timing = null;
  if (holiday) warnings.push(`${holiday.name}: o gün tatil`);
  else if (weekday > 5 && !bells.length) warnings.push('Hafta sonu');
  else {
    const shift = ctx.settings.dualShift && cls?.shift === 'afternoon' ? 'afternoon' : 'morning';
    const bell = classBell(bells, row.classGroupId, shift);
    timing = bell ? examTiming(bell.periods, row.periodNo, ctx.settings.lunchThresholdMin) : null;
    if (!timing) warnings.push(`O gün ${cls?.name ?? 'bu sınıf'} için ${row.periodNo}. ders yok`);
  }

  // Gözetmen: elle seçilen, yoksa o gün o saatte sınıfta dersi olan(lar)
  const slot = ctx.lessons.filter((l) => l.classGroupId === row.classGroupId && l.weekday === weekday && l.periodNo === row.periodNo && l.teacherId);
  const proctorIds = row.proctorTeacherId ? [row.proctorTeacherId] : [...new Set(slot.map((l) => l.teacherId!))];
  const proctors = proctorIds.map((id) => ({ teacherId: id, fullName: nameOf(id), onLeave: onLeave(id), manual: Boolean(row.proctorTeacherId) }));
  if (!proctors.length && !holiday) warnings.push('Gözetmen bulunamadı (ders programında o saatte ders yok); gözetmen seçin');
  for (const p of proctors) if (p.onLeave) warnings.push(`Gözetmen ${p.fullName} o gün izinli; başka bir gözetmen seçin`);
  if (row.proctorTeacherId && slot.length) {
    // Elle seçilen gözetmenin o saatte başka sınıfta dersi varsa
    const busy = ctx.lessons.some((l) => l.teacherId === row.proctorTeacherId && l.weekday === weekday && l.periodNo === row.periodNo && l.classGroupId !== row.classGroupId);
    if (busy) warnings.push(`${nameOf(row.proctorTeacherId)} o saatte başka sınıfta derste`);
  }

  // Dersin öğretmeni: sınıfa bu dersi veren(ler), haftanın herhangi bir günü
  const key = subjectKey(row.subject);
  const subjectTeacherIds = [...new Set(ctx.lessons.filter((l) => l.classGroupId === row.classGroupId && l.teacherId && subjectKey(l.subject) === key).map((l) => l.teacherId!))];
  if (!subjectTeacherIds.length) warnings.push(`"${row.subject}" dersi ${cls?.name ?? 'sınıfın'} programında yok; dersin öğretmenine bildirim gitmez`);

  return {
    id: row.id,
    date: row.date,
    periodNo: row.periodNo,
    classGroupId: row.classGroupId,
    className: cls?.name ?? '',
    subject: row.subject,
    kind: row.kind,
    note: row.note,
    proctorTeacherId: row.proctorTeacherId,
    start: timing?.start ?? null,
    end: timing?.end ?? null,
    notifyAt: timing ? zonedInstant(row.date, timing.notifyAt, ctx.timezone).toISOString() : null,
    notifyKind: timing?.notifyKind ?? null,
    proctors,
    subjectTeachers: subjectTeacherIds.map((id) => ({ teacherId: id, fullName: nameOf(id) })),
    warnings,
  };
}

/** Tarih aralığındaki sınavlar, hesaplanmış hâlleriyle (tarih, ders saati ve sınıf sırasıyla) */
export async function listExams(db: DB, school: School, from: string, to: string): Promise<ScheduledExam[]> {
  const rows = await db
    .select()
    .from(examSchedule)
    .where(and(eq(examSchedule.schoolId, school.id), gte(examSchedule.date, from), lte(examSchedule.date, to)))
    .orderBy(asc(examSchedule.date), asc(examSchedule.periodNo));
  if (!rows.length) return [];
  const ctx = await loadExamContext(db, school, from, to);
  const cache = new Map<string, ReturnType<typeof dayBells>>();
  return rows
    .map((r) => resolveExam(ctx, r, cache))
    .sort((a, b) => a.date.localeCompare(b.date) || a.periodNo - b.periodNo || a.className.localeCompare(b.className, 'tr', { numeric: true }));
}

/** Sınavla ilgili öğretmenler (bildirim için): gözetmenler (izinli değilse) ve dersin öğretmenleri */
export function examTeacherIds(exam: ScheduledExam): string[] {
  return [...new Set([...exam.proctors.filter((p) => !p.onLeave).map((p) => p.teacherId), ...exam.subjectTeachers.map((t) => t.teacherId)])];
}
