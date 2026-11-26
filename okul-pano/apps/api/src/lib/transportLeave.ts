import { zonedParts } from '@okulpano/shared';
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import type { AppDeps } from '../context.ts';
import { schools, teacherLeaves, teachers, transportDuties } from '../db/schema.ts';
import { tell } from './push.ts';
import { responsibleUsers } from './responsibility.ts';
import { trDate } from './sheets/duties.ts';

/*
 * Servis (taşımalı öğrenci) nöbeti ve izin: izin geçerli olunca öğretmen izin günlerindeki servis nöbetlerinden
 * çıkarılır; böylece tutmadığı nöbet istatistikte sayılmaz. Bugün ve sonrasında görevlisiz kalan gün varsa nöbet
 * çizelgesinin sorumlularına bildirim gider. İzin sonradan iptal edilirse öğretmen kendiliğinden geri yazılmaz.
 */
export async function releaseTransportForLeave(deps: AppDeps, schoolId: string, leave: { teacherId: string; startDate: string; endDate: string }): Promise<string[]> {
  const removed = await deps.db
    .delete(transportDuties)
    .where(and(eq(transportDuties.schoolId, schoolId), eq(transportDuties.teacherId, leave.teacherId), gte(transportDuties.date, leave.startDate), lte(transportDuties.date, leave.endDate)))
    .returning({ date: transportDuties.date });
  if (!removed.length) return [];
  deps.bus.contentChanged(schoolId);
  const dates = [...new Set(removed.map((r) => r.date))].sort();
  const [school] = await deps.db.select({ timezone: schools.timezone, settings: schools.settings }).from(schools).where(eq(schools.id, schoolId));
  const today = zonedParts(new Date(), school?.timezone ?? 'Europe/Istanbul').isoDate;
  const upcoming = dates.filter((d) => d >= today);
  if (!upcoming.length) return dates;
  const still = await deps.db
    .select({ date: transportDuties.date })
    .from(transportDuties)
    .where(and(eq(transportDuties.schoolId, schoolId), inArray(transportDuties.date, upcoming)));
  const empty = upcoming.filter((d) => !still.some((s) => s.date === d));
  const [t] = await deps.db.select({ fullName: teachers.fullName }).from(teachers).where(eq(teachers.id, leave.teacherId));
  const name = t?.fullName ?? 'Bir öğretmen';
  const managers = await responsibleUsers(deps, schoolId, school?.settings, 'duties', 'duties.manage');
  await tell(deps, schoolId, managers, {
    kind: 'transport-leave',
    title: empty.length ? 'Servis nöbeti boş kaldı' : 'Servis nöbetinden çıkarıldı',
    body: empty.length
      ? `${name} izinli; servis nöbetinden çıkarıldı. Görevlisiz kalan gün: ${empty.map(trDate).join(', ')}.`
      : `${name} izinli; ${upcoming.map(trDate).join(', ')} servis nöbetinden çıkarıldı.`,
    to: '/nobet?bolum=tasimali',
    url: '/nobet',
  });
  return dates;
}

/** Verilen tarihlerde onaylı izinli öğretmenler: tarih -> öğretmen kimlikleri */
export async function approvedLeavesOn(deps: Pick<AppDeps, 'db'>, schoolId: string, from: string, to: string): Promise<(date: string, teacherId: string) => boolean> {
  const rows = await deps.db
    .select({ teacherId: teacherLeaves.teacherId, startDate: teacherLeaves.startDate, endDate: teacherLeaves.endDate })
    .from(teacherLeaves)
    .where(and(eq(teacherLeaves.schoolId, schoolId), eq(teacherLeaves.approvalStatus, 'approved'), lte(teacherLeaves.startDate, to), gte(teacherLeaves.endDate, from)));
  return (date, teacherId) => rows.some((r) => r.teacherId === teacherId && r.startDate <= date && r.endDate >= date);
}
