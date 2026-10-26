import { trCompare } from '@okulpano/shared';
import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { DB } from '../db/client.ts';
import { duties, dutySubstitutions, dutySupervisors, teacherLeaves, teachers } from '../db/schema.ts';
import { holidaysInRange } from '../routes/holidays.ts';

/** ISO hafta günü (1 = Pazartesi) */
export const weekdayOf = (iso: string) => ((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;

export const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

/** O ayın nöbet çizelgesi; yoksa en son yüklenen ayınki (panodaki kuralla aynı) */
export function dutyMonthSql(schoolId: string, month: string) {
  return sql`coalesce((select max(d2.month) from duties d2 where d2.school_id = ${schoolId} and d2.month <= ${month}), (select min(d3.month) from duties d3 where d3.school_id = ${schoolId}))`;
}

/** Arife günleri yarım gündür: panoda ve nöbette tatil sayılmaz */
const realHoliday = (h: { source: 'official' | 'school'; name: string }) => !(h.source === 'official' && h.name.endsWith('Arifesi'));

/** Tatiller: resmi / dini tatiller ve okulun eklediği tatiller (arife yarım gün, sayılmaz) */
export async function effectiveHolidays(db: DB, schoolId: string, from: string, to: string) {
  const list = await holidaysInRange(db, schoolId, from, to);
  return list.filter(realHoliday).map((h) => ({ date: h.date, name: h.name }));
}

export interface DutyDayEntry {
  dutyId: string;
  area: string;
  teacherId: string;
  teacherName: string;
  /** Onaylı izinde */
  onLeave: boolean;
  /** İzin talebi var, onay bekliyor */
  leavePending: boolean;
  substitute: { id: string; teacherId: string; teacherName: string } | null;
}

export interface DutyDay {
  date: string;
  weekday: number;
  holiday: string | null;
  supervisor: string | null;
  entries: DutyDayEntry[];
}

/** Bir günün nöbet yerleri: kim nerede, kim izinli, yerine kim görevli */
export async function dutyDay(db: DB, schoolId: string, date: string): Promise<DutyDay> {
  const weekday = weekdayOf(date);
  const [rows, holidays, leaves, subs, [supervisor]] = await Promise.all([
    db
      .select({ dutyId: duties.id, area: duties.area, teacherId: duties.teacherId, teacherName: teachers.fullName, sortOrder: duties.sortOrder })
      .from(duties)
      .innerJoin(teachers, eq(teachers.id, duties.teacherId))
      .where(and(eq(duties.schoolId, schoolId), eq(duties.weekday, weekday), eq(duties.month, dutyMonthSql(schoolId, date.slice(0, 7)))))
      .orderBy(asc(duties.sortOrder), asc(duties.area)),
    effectiveHolidays(db, schoolId, date, date),
    db
      .select({ teacherId: teacherLeaves.teacherId, status: teacherLeaves.approvalStatus })
      .from(teacherLeaves)
      .where(and(eq(teacherLeaves.schoolId, schoolId), lte(teacherLeaves.startDate, date), gte(teacherLeaves.endDate, date))),
    db
      .select({ id: dutySubstitutions.id, dutyId: dutySubstitutions.dutyId, teacherId: dutySubstitutions.teacherId, teacherName: teachers.fullName })
      .from(dutySubstitutions)
      .innerJoin(teachers, eq(teachers.id, dutySubstitutions.teacherId))
      .where(and(eq(dutySubstitutions.schoolId, schoolId), eq(dutySubstitutions.date, date))),
    db
      .select({ name: dutySupervisors.name })
      .from(dutySupervisors)
      .where(and(eq(dutySupervisors.schoolId, schoolId), eq(dutySupervisors.date, date))),
  ]);
  const approved = new Set(leaves.filter((l) => l.status === 'approved').map((l) => l.teacherId));
  const pending = new Set(leaves.filter((l) => l.status === 'pending').map((l) => l.teacherId));
  const subByDuty = new Map(subs.map((s) => [s.dutyId, s]));
  return {
    date,
    weekday,
    holiday: holidays[0]?.name ?? null,
    supervisor: supervisor?.name ?? null,
    entries: rows.map((r) => {
      const sub = subByDuty.get(r.dutyId);
      return {
        dutyId: r.dutyId,
        area: r.area,
        teacherId: r.teacherId,
        teacherName: r.teacherName,
        onLeave: approved.has(r.teacherId),
        leavePending: pending.has(r.teacherId),
        substitute: sub ? { id: sub.id, teacherId: sub.teacherId, teacherName: sub.teacherName } : null,
      };
    }),
  };
}

/** Boş kalan nöbet yerleri: öğretmen izinli ve yerine kimse görevlendirilmemiş (tatilde yok) */
export const dutyGaps = (day: DutyDay) => (day.holiday ? [] : day.entries.filter((e) => e.onLeave && !e.substitute));

export interface SubstituteCandidate {
  teacherId: string;
  fullName: string;
  /** Bu ay tuttuğu nöbet sayısı (haftalık çizelge × hafta + yerine görevlendirmeler) */
  monthCount: number;
}

/**
 * Yerine görevlendirme önerileri: o gün izinli olmayan ve o gün zaten nöbeti olmayan etkin öğretmenler,
 * bu ay en az nöbet tutan önce. Okuldan okula değişen bir kural koda gömülmez; sıralama yalnızca adalet içindir.
 */
export async function substituteCandidates(db: DB, schoolId: string, day: DutyDay, limit = 8): Promise<SubstituteCandidate[]> {
  const month = day.date.slice(0, 7);
  const [all, monthDuties, monthSubs] = await Promise.all([
    db.select({ id: teachers.id, fullName: teachers.fullName }).from(teachers).where(and(eq(teachers.schoolId, schoolId), eq(teachers.isActive, true))),
    db
      .select({ teacherId: duties.teacherId, n: sql<number>`count(*)::int` })
      .from(duties)
      .where(and(eq(duties.schoolId, schoolId), eq(duties.month, dutyMonthSql(schoolId, month))))
      .groupBy(duties.teacherId),
    db
      .select({ teacherId: dutySubstitutions.teacherId, n: sql<number>`count(*)::int` })
      .from(dutySubstitutions)
      .where(and(eq(dutySubstitutions.schoolId, schoolId), gte(dutySubstitutions.date, `${month}-01`), lte(dutySubstitutions.date, `${month}-31`)))
      .groupBy(dutySubstitutions.teacherId),
  ]);
  const onLeave = await db
    .select({ teacherId: teacherLeaves.teacherId })
    .from(teacherLeaves)
    .where(
      and(
        eq(teacherLeaves.schoolId, schoolId),
        inArray(teacherLeaves.approvalStatus, ['approved', 'pending']),
        lte(teacherLeaves.startDate, day.date),
        gte(teacherLeaves.endDate, day.date),
      ),
    );
  const busy = new Set([
    ...day.entries.map((e) => e.teacherId),
    ...day.entries.flatMap((e) => (e.substitute ? [e.substitute.teacherId] : [])),
    ...onLeave.map((l) => l.teacherId),
  ]);
  // Haftalık çizelgedeki bir satır ayda yaklaşık 4 nöbet demektir
  const count = new Map<string, number>();
  for (const d of monthDuties) count.set(d.teacherId, (count.get(d.teacherId) ?? 0) + d.n * 4);
  for (const s of monthSubs) count.set(s.teacherId, (count.get(s.teacherId) ?? 0) + s.n);
  return all
    .filter((t) => !busy.has(t.id))
    .map((t) => ({ teacherId: t.id, fullName: t.fullName, monthCount: count.get(t.id) ?? 0 }))
    .sort((a, b) => a.monthCount - b.monthCount || trCompare(a.fullName, b.fullName))
    .slice(0, limit);
}
