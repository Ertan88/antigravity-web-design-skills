import { examReminderText, examRoles, zonedParts, type ScheduledExam } from '@okulpano/shared';
import { and, eq, gte, inArray, isNotNull, lte } from 'drizzle-orm';
import type { AppDeps } from '../context.ts';
import { examReminderAcks, examRemindersSent, examSchedule, memberships, pushTokens, schools } from '../db/schema.ts';
import { examTeacherIds, listExams } from './examSchedule.ts';
import { sendToTokens } from './push.ts';
import { addToInbox } from '../routes/notifications.ts';

/** Sunucu uyuyup geç uyanırsa en fazla bu kadar gecikmeyle gönderilir; daha geç gönderilmez */
const LATE_MS = 10 * 60_000;

/**
 * Sınav hatırlatması (dakikada bir): bildirim anı gelen sınavların gözetmenine ve dersin öğretmenine, hatırlatmayı
 * telefonunda kurmamış (kurduğunu bildirmemiş) cihazlara gönderilir. Her sınav ve an için bir kez gönderilir.
 */
export async function runExamReminders(deps: Pick<AppDeps, 'db' | 'env'>, now = new Date()): Promise<number> {
  const { db } = deps;
  const day = (offset: number) => new Date(now.getTime() + offset * 86400_000).toISOString().slice(0, 10);
  const schoolIds = (
    await db
      .selectDistinct({ schoolId: examSchedule.schoolId })
      .from(examSchedule)
      .where(and(gte(examSchedule.date, day(-1)), lte(examSchedule.date, day(1))))
  ).map((r) => r.schoolId);
  if (!schoolIds.length) return 0;
  const rows = await db.select().from(schools).where(inArray(schools.id, schoolIds));
  let sent = 0;
  for (const school of rows) {
    const today = zonedParts(now, school.timezone).isoDate;
    const due = (await listExams(db, school, today, today)).filter((e) => {
      if (!e.notifyAt) return false;
      const at = Date.parse(e.notifyAt);
      return at <= now.getTime() && at > now.getTime() - LATE_MS;
    });
    for (const exam of due) sent += await remind(deps, school.id, exam);
  }
  return sent;
}

async function remind(deps: Pick<AppDeps, 'db' | 'env'>, schoolId: string, exam: ScheduledExam): Promise<number> {
  const { db } = deps;
  const notifyAt = new Date(exam.notifyAt!);
  // Aynı an için ikinci kez gönderilmez (birden çok sunucu ya da yeniden başlatma)
  const claimed = await db.insert(examRemindersSent).values({ examId: exam.id, notifyAt }).onConflictDoNothing().returning({ examId: examRemindersSent.examId });
  if (!claimed.length) return 0;
  const teacherIds = examTeacherIds(exam);
  if (!teacherIds.length) return 0;
  const users = await db
    .select({ userId: memberships.userId, teacherId: memberships.teacherId })
    .from(memberships)
    .where(and(eq(memberships.schoolId, schoolId), isNotNull(memberships.teacherId), inArray(memberships.teacherId, teacherIds)));
  if (!users.length) return 0;
  const acked = new Set(
    (await db.select({ token: examReminderAcks.token, notifyAt: examReminderAcks.notifyAt }).from(examReminderAcks).where(eq(examReminderAcks.examId, exam.id)))
      .filter((a) => a.notifyAt.getTime() === notifyAt.getTime())
      .map((a) => a.token),
  );
  let count = 0;
  for (const u of users) {
    const tokens = (await db.select({ token: pushTokens.token }).from(pushTokens).where(eq(pushTokens.userId, u.userId))).map((t) => t.token).filter((t) => !acked.has(t));
    if (!tokens.length) continue;
    const text = examReminderText(exam, examRoles(exam, u.teacherId));
    await sendToTokens(deps, tokens, { ...text, url: `/sinav-takvimi?gun=${exam.date}` });
    // Bildirim kutusuna da düşer (telefonda kurulu hatırlatması olsa da olmasa da okunabilir)
    await addToInbox(deps.db, [u.userId], { key: `exam-reminder:${exam.id}:${notifyAt.getTime()}`, kind: 'exam', title: text.title, body: text.body, to: `/sinav-takvimi?gun=${exam.date}`, schoolId });
    count += tokens.length;
  }
  return count;
}
