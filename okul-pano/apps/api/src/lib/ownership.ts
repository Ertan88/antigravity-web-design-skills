import type { OwnershipTransferInput } from '@okulpano/shared';
import { and, count, eq, ne } from 'drizzle-orm';
import type { AppDeps } from '../context.ts';
import { auditLogs, memberships, schools, users } from '../db/schema.ts';
import { badRequest, conflict, notFound } from './errors.ts';
import { trySendMail } from './mailer.ts';
import { notifyUsers } from './push.ts';
import { INVITE_PENDING } from '../routes/members.ts';
import { addToInbox } from '../routes/notifications.ts';
import { createInvite } from '../routes/signup.ts';

/**
 * Okul müdürlüğünü devreder. Okulda her zaman tek müdür kalır: yeni kişi müdür olur, eski müdür yönetici olarak
 * kalır ya da okuldan çıkar (başka okulda kaydı yoksa hesabı da silinir). Yeni hesapsa davet, değilse bildirim gider.
 */
export async function transferOwnership(
  deps: AppDeps,
  opts: { schoolId: string; byUserId: string; input: OwnershipTransferInput },
): Promise<{ newOwner: { fullName: string; email: string }; invite: { inviteUrl: string; emailed: boolean } | null }> {
  const { db } = deps;
  const { input, schoolId } = opts;
  const [school] = await db.select().from(schools).where(eq(schools.id, schoolId));
  if (!school) throw notFound('Okul bulunamadı.');
  const [current] = await db.select().from(memberships).where(and(eq(memberships.schoolId, schoolId), eq(memberships.role, 'owner')));

  // Yeni müdür: okuldaki bir üyelik ya da e-posta (gerekirse hesap ve üyelik açılır)
  let target: typeof memberships.$inferSelect | undefined;
  let createdUser = false;
  if (input.memberId) {
    [target] = await db.select().from(memberships).where(and(eq(memberships.id, input.memberId), eq(memberships.schoolId, schoolId)));
    if (!target) throw notFound('Kullanıcı bulunamadı.');
  } else {
    const email = input.email!.toLowerCase();
    let [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user) {
      [user] = await db.insert(users).values({ email, fullName: input.fullName!, passwordHash: INVITE_PENDING }).returning();
      createdUser = true;
    }
    [target] = await db.select().from(memberships).where(and(eq(memberships.userId, user!.id), eq(memberships.schoolId, schoolId)));
    if (!target) [target] = await db.insert(memberships).values({ userId: user!.id, schoolId, role: 'admin', permissions: [] }).returning();
  }
  if (current && target!.id === current.id) throw conflict('Bu kişi zaten okul müdürü.');

  await db.transaction(async (tx) => {
    if (current) {
      if (input.keep === 'leave') await tx.delete(memberships).where(eq(memberships.id, current.id));
      else await tx.update(memberships).set({ role: 'admin', permissions: [] }).where(eq(memberships.id, current.id));
    }
    await tx.update(memberships).set({ role: 'owner', permissions: [] }).where(eq(memberships.id, target!.id));
    // Eski kayıtlardan kalan fazladan müdür kayıtları yöneticiye iner: okulda tek müdür kalır
    await tx.update(memberships).set({ role: 'admin', permissions: [] }).where(and(eq(memberships.schoolId, schoolId), eq(memberships.role, 'owner'), ne(memberships.id, target!.id)));
  });

  // Eski müdür okuldan çıktıysa ve başka okulda kaydı yoksa hesabı da silinir (platform yöneticisi hariç)
  if (current && input.keep === 'leave') {
    const [u] = await db.select({ isSuperAdmin: users.isSuperAdmin }).from(users).where(eq(users.id, current.userId));
    const [{ n }] = (await db.select({ n: count() }).from(memberships).where(eq(memberships.userId, current.userId))) as [{ n: number }];
    if (u && !u.isSuperAdmin && n === 0) await db.delete(users).where(eq(users.id, current.userId));
  }

  const [owner] = await db.select({ id: users.id, email: users.email, fullName: users.fullName, passwordHash: users.passwordHash }).from(users).where(eq(users.id, target!.userId));
  const [prev] = current ? await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, current.userId)) : [];
  await db.insert(auditLogs).values({
    schoolId,
    userId: opts.byUserId,
    action: 'update',
    entity: 'Okul müdürlüğü',
    entityId: target!.id,
    summary: `Müdürlük ${prev?.fullName ?? '—'} → ${owner!.fullName}${current ? (input.keep === 'leave' ? ' (eski müdür okuldan çıktı)' : ' (eski müdür yönetici olarak kaldı)') : ''}`.slice(0, 200),
  });

  // Hesabı henüz açılmamış kişiye davet; açık hesaba bildirim ve e-posta
  let invite: { inviteUrl: string; emailed: boolean } | null = null;
  if (createdUser || owner!.passwordHash === INVITE_PENDING) {
    invite = await createInvite(deps, {
      userId: owner!.id,
      schoolId,
      school,
      membership: { role: 'owner' },
      email: owner!.email,
      fullName: owner!.fullName,
      createdBy: opts.byUserId,
    });
  } else {
    const title = 'Okul müdürlüğü size devredildi';
    const body = `${school.name} okulunun müdür hesabı artık sizsiniz. Yönetici atama ve destek erişimi verme yetkileri sizde.`;
    notifyUsers(deps, [owner!.id], { title, body, url: '/' });
    await addToInbox(db, [owner!.id], { key: `owner:${schoolId}:${Date.now()}`, kind: 'owner', title, body, schoolId, openSchoolId: schoolId });
    await trySendMail(deps.env, { to: owner!.email, subject: `${school.name} · ${title}`, text: `Merhaba ${owner!.fullName},\n\n${body}\n` });
  }
  return { newOwner: { fullName: owner!.fullName, email: owner!.email }, invite };
}

/** Okulun müdürü (platform listesi için) */
export async function schoolOwners(deps: Pick<AppDeps, 'db'>): Promise<Map<string, { fullName: string; email: string }>> {
  const rows = await deps.db
    .select({ schoolId: memberships.schoolId, fullName: users.fullName, email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.role, 'owner'));
  return new Map(rows.map((r) => [r.schoolId, { fullName: r.fullName, email: r.email }]));
}
