import { effectivePermissions, type Permission, type Role } from '@okulpano/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { DB } from './db/client.ts';
import { auditLogs, memberships, schools } from './db/schema.ts';
import type { Env } from './env.ts';
import { forbidden, notFound, unauthorized } from './lib/errors.ts';
import type { DisplayBus } from './lib/events.ts';
import type { FileStorage } from './lib/storage.ts';

export interface AppDeps {
  db: DB;
  bus: DisplayBus;
  storage: FileStorage;
  env: Env;
}

export interface AccessPayload {
  typ: 'access';
  sub: string;
  /** Platform yöneticisi (SaaS sahibi) */
  sa: boolean;
}

export interface PreviewPayload {
  typ: 'preview';
  sch: string;
}

export interface SchoolCtx {
  schoolId: string;
  school: typeof schools.$inferSelect;
  role: Role;
  permissions: Permission[];
  userId: string;
  isSuperAdmin: boolean;
  /** Kullanıcı bu okulda bir öğretmen kaydına bağlıysa */
  teacherId: string | null;
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: AppDeps;
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    ctx: SchoolCtx;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AccessPayload | PreviewPayload;
    user: AccessPayload | PreviewPayload;
  }
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function accessUser(req: FastifyRequest): AccessPayload {
  const u = req.user;
  if (!u || u.typ !== 'access') throw unauthorized();
  return u;
}

/**
 * /api/schools/:schoolId/... altındaki her istek için üyeliği doğrular ve okul bağlamını kurar.
 * Yetki verilirse yazma izni de kontrol edilir. Platform yöneticisi tüm okullara sahip yetkisiyle erişir.
 */
export function schoolGuard(permission?: Permission) {
  return async (req: FastifyRequest) => {
    const user = accessUser(req);
    const { schoolId } = req.params as { schoolId?: string };
    if (!schoolId || !UUID_RE.test(schoolId)) throw notFound('Okul bulunamadı.');
    const { db } = req.server.deps;

    const [school] = await db.select().from(schools).where(eq(schools.id, schoolId));
    if (!school) throw notFound('Okul bulunamadı.');

    let role: Role = 'owner';
    let granted: string[] = [];
    let teacherId: string | null = null;
    if (!user.sa) {
      const [m] = await db
        .select()
        .from(memberships)
        .where(and(eq(memberships.userId, user.sub), eq(memberships.schoolId, schoolId)));
      if (!m) throw forbidden('Bu okula erişiminiz yok.');
      if (!school.isActive) throw forbidden('Okul hesabı askıya alınmış. Lütfen destek ile iletişime geçin.');
      role = m.role;
      granted = m.permissions;
      teacherId = m.teacherId;
    }
    const perms = effectivePermissions(role, granted);
    if (permission && !perms.includes(permission)) throw forbidden();
    req.ctx = { schoolId, school, role, permissions: perms, userId: user.sub, isSuperAdmin: user.sa, teacherId };
  };
}

export async function audit(
  req: FastifyRequest,
  action: 'create' | 'update' | 'delete' | string,
  entity: string,
  entityId: string | null,
  summary?: string | null,
): Promise<void> {
  const { ctx } = req;
  await req.server.deps.db.insert(auditLogs).values({
    schoolId: ctx.schoolId,
    userId: ctx.userId,
    action,
    entity,
    entityId,
    summary: summary?.slice(0, 200) ?? null,
  });
}
