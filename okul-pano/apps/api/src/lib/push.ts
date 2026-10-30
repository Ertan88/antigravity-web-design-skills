import { and, eq, inArray } from 'drizzle-orm';
import type { AppDeps } from '../context.ts';
import { memberships, pushTokens } from '../db/schema.ts';
import type { Permission } from '@okulpano/shared';

export interface PushMessage {
  title: string;
  body: string;
  /** Uygulamada dokununca açılacak ekran (ör. "/onaylar") */
  url?: string;
}

/** 'memory' modunda gönderilen bildirimler (testler) */
export const sentPushes: { to: string[]; message: PushMessage }[] = [];

const CHUNK = 100;

/**
 * Kullanıcıların telefonlarına bildirim gönderir. İstek akışını bekletmez (hata olursa yalnızca loglanır);
 * telefonda uygulama silinmişse (DeviceNotRegistered) anahtar kendiliğinden temizlenir.
 */
export function notifyUsers(deps: AppDeps, userIds: readonly string[], message: PushMessage): void {
  const ids = [...new Set(userIds)];
  if (!ids.length || deps.env.PUSH_URL === 'off') return;
  void send(deps, ids, message).catch((err) => console.warn('Bildirim gönderilemedi:', (err as Error).message));
}

async function send(deps: AppDeps, userIds: string[], message: PushMessage) {
  const rows = await deps.db.select({ token: pushTokens.token }).from(pushTokens).where(inArray(pushTokens.userId, userIds));
  const tokens = rows.map((r) => r.token);
  if (!tokens.length) return;
  if (deps.env.PUSH_URL === 'memory') {
    sentPushes.push({ to: tokens, message });
    return;
  }
  for (let i = 0; i < tokens.length; i += CHUNK) {
    const batch = tokens.slice(i, i + CHUNK);
    const res = await fetch(deps.env.PUSH_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(deps.env.PUSH_ACCESS_TOKEN ? { authorization: `Bearer ${deps.env.PUSH_ACCESS_TOKEN}` } : {}),
      },
      body: JSON.stringify(
        batch.map((to) => ({ to, title: message.title, body: message.body, sound: 'default', priority: 'high', data: { url: message.url ?? '/' } })),
      ),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Expo push ${res.status}`);
    const json = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
    const gone = (json.data ?? []).flatMap((r, idx) => (r.status === 'error' && r.details?.error === 'DeviceNotRegistered' ? [batch[idx]!] : []));
    if (gone.length) await deps.db.delete(pushTokens).where(inArray(pushTokens.token, gone));
  }
}

/** Okulda bu yetkiye sahip kullanıcılar (sahip ve yöneticiler her yetkiye sahiptir) */
export async function usersWithPermission(deps: AppDeps, schoolId: string, permission: Permission): Promise<string[]> {
  const rows = await deps.db
    .select({ userId: memberships.userId, role: memberships.role, permissions: memberships.permissions })
    .from(memberships)
    .where(eq(memberships.schoolId, schoolId));
  return rows.filter((r) => r.role !== 'editor' || r.permissions.includes(permission)).map((r) => r.userId);
}

/** Okulun bütün üyeleri (acil durum) */
export async function schoolMembers(deps: AppDeps, schoolId: string): Promise<string[]> {
  const rows = await deps.db.select({ userId: memberships.userId }).from(memberships).where(eq(memberships.schoolId, schoolId));
  return rows.map((r) => r.userId);
}

/** Bu öğretmen kaydına bağlı kullanıcılar */
export async function usersForTeacher(deps: AppDeps, schoolId: string, teacherId: string): Promise<string[]> {
  const rows = await deps.db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.schoolId, schoolId), eq(memberships.teacherId, teacherId)));
  return rows.map((r) => r.userId);
}
