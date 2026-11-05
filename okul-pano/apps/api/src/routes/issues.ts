import { randomUUID } from 'node:crypto';
import {
  ISSUE_CATEGORIES,
  ISSUE_PHOTO_RETENTION_DAYS,
  ISSUE_STATUSES,
  SUPPORT_KINDS,
  issueCreateSchema,
  issueUpdateSchema,
  messageSchema,
  schoolSettingsSchema,
  supportCreateSchema,
  supportStatusSchema,
  type IssueCategory,
  type IssueStatus,
  type SchoolIssue,
  type SupportTicket,
} from '@okulpano/shared';
import { and, asc, desc, eq, inArray, isNotNull, lt } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../context.ts';
import { accessUser, schoolGuard } from '../context.ts';
import { memberships, schoolIssueMessages, schoolIssues, schools, supportMessages, supportTickets, users } from '../db/schema.ts';
import { badRequest, forbidden, notFound, parse } from '../lib/errors.ts';
import { notifyUsers } from '../lib/push.ts';
import { addToInbox } from './notifications.ts';

/*
 * 1. Okul sorunları: her üye idareye (müdür + yöneticiler) bildirir; kategori sorumlusu okul ayarında
 *    (issueOwners). Bildiren yalnızca kendi bildirimlerini görür; idare hepsini görür, durumu değiştirir.
 * 2. Destek talepleri: yalnızca okul müdürü ve yöneticiler platform yöneticisine yazar.
 * Her yeni kayıt, yanıt ve durum değişikliği ilgili kişilere telefon bildirimi + bildirim kutusu olarak gider.
 */

const isManager = (role: string) => role === 'owner' || role === 'admin';

async function tell(deps: AppDeps, userIds: (string | null | undefined)[], n: { kind: string; title: string; body: string; to: string; schoolId?: string | null }) {
  const ids = [...new Set(userIds.filter((x): x is string => Boolean(x)))];
  if (!ids.length) return;
  await addToInbox(deps.db, ids, { key: `${n.kind}:${randomUUID()}`, kind: n.kind, title: n.title, body: n.body, to: n.to, schoolId: n.schoolId ?? null });
  notifyUsers(deps, ids, { title: n.title, body: n.body, url: n.to });
}

const short = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export async function issueRoutes(app: FastifyInstance) {
  const { db, storage } = app.deps;
  const base = '/api/schools/:schoolId/issues';
  const member = { preHandler: [app.authenticate, schoolGuard()] };

  async function managers(schoolId: string) {
    const rows = await db.select({ userId: memberships.userId, role: memberships.role }).from(memberships).where(eq(memberships.schoolId, schoolId));
    return rows.filter((r) => isManager(r.role)).map((r) => r.userId);
  }

  /** Kategorinin sorumlusu (okul ayarı) ya da bütün idareciler */
  async function recipients(schoolId: string, category: string): Promise<string[]> {
    const [school] = await db.select({ settings: schools.settings }).from(schools).where(eq(schools.id, schoolId));
    const owners = schoolSettingsSchema.parse(school?.settings ?? {}).issueOwners;
    const all = await managers(schoolId);
    const owner = owners[category];
    return owner && all.includes(owner) ? [owner] : all;
  }

  async function nameMap(ids: (string | null)[]) {
    const list = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    if (!list.length) return new Map<string, string>();
    const rows = await db.select({ id: users.id, fullName: users.fullName }).from(users).where(inArray(users.id, list));
    return new Map(rows.map((r) => [r.id, r.fullName]));
  }

  async function load(req: FastifyRequest, id: string) {
    const [row] = await db.select().from(schoolIssues).where(and(eq(schoolIssues.id, id), eq(schoolIssues.schoolId, req.ctx.schoolId)));
    if (!row) throw notFound('Bildirim bulunamadı.');
    if (!isManager(req.ctx.role) && row.reporterUserId !== req.ctx.userId) throw notFound('Bildirim bulunamadı.');
    return row;
  }

  async function present(rows: (typeof schoolIssues.$inferSelect)[], me: string, withMessages = false): Promise<SchoolIssue[]> {
    const ids = rows.map((r) => r.id);
    const msgs = ids.length ? await db.select().from(schoolIssueMessages).where(inArray(schoolIssueMessages.issueId, ids)).orderBy(asc(schoolIssueMessages.createdAt)) : [];
    const names = await nameMap([...rows.flatMap((r) => [r.reporterUserId, r.assigneeUserId]), ...msgs.map((m) => m.userId)]);
    return rows.map((r) => {
      const mine = msgs.filter((m) => m.issueId === r.id);
      const last = [...mine].reverse().find((m) => !m.system);
      return {
        id: r.id,
        category: r.category as IssueCategory,
        location: r.location,
        description: r.description,
        urgent: r.urgent,
        photoUrl: r.photoUrl,
        status: r.status as IssueStatus,
        reporterName: names.get(r.reporterUserId ?? '') ?? 'Silinmiş kullanıcı',
        mine: r.reporterUserId === me,
        assigneeUserId: r.assigneeUserId,
        assigneeName: r.assigneeUserId ? (names.get(r.assigneeUserId) ?? null) : null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        resolvedAt: r.resolvedAt?.toISOString() ?? null,
        lastMessage: last ? `${names.get(last.userId ?? '') ?? ''}: ${short(last.body)}` : null,
        ...(withMessages
          ? { messages: mine.map((m) => ({ id: m.id, userName: names.get(m.userId ?? '') ?? '', mine: m.userId === me, system: m.system, body: m.body, at: m.createdAt.toISOString() })) }
          : {}),
      };
    });
  }

  /** Liste: idare için bütün okul (scope=all), herkes için kendi bildirimleri (scope=mine) */
  app.get(base, member, async (req) => {
    const { scope } = parse(z.object({ scope: z.enum(['mine', 'all']).default('mine') }), req.query);
    const all = scope === 'all';
    if (all && !isManager(req.ctx.role)) throw forbidden('Okulun bütün bildirimlerini yalnızca idareciler görür.');
    const rows = await db
      .select()
      .from(schoolIssues)
      .where(and(eq(schoolIssues.schoolId, req.ctx.schoolId), ...(all ? [] : [eq(schoolIssues.reporterUserId, req.ctx.userId)])))
      .orderBy(desc(schoolIssues.createdAt))
      .limit(300);
    return present(rows, req.ctx.userId);
  });

  /** İdareciler (sorumlu seçimi için) */
  app.get(`${base}/managers`, member, async (req) => {
    const ids = await managers(req.ctx.schoolId);
    const names = await nameMap(ids);
    return ids.map((id) => ({ id, fullName: names.get(id) ?? '' })).sort((a, b) => a.fullName.localeCompare(b.fullName, 'tr'));
  });

  app.get(`${base}/:id`, member, async (req) => {
    const row = await load(req, (req.params as { id: string }).id);
    return (await present([row], req.ctx.userId, true))[0];
  });

  /** Fotoğraf: her üye yükleyebilir (yalnızca sorun bildirimi için) */
  app.post(`${base}/photo`, { ...member, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const file = await req.file();
    if (!file) throw badRequest('Dosya bulunamadı.');
    const url = await storage.saveImage(req.ctx.schoolId, await file.toBuffer());
    return reply.status(201).send({ url });
  });

  app.post(base, { ...member, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const body = parse(issueCreateSchema, req.body);
    if (body.photoUrl && !body.photoUrl.startsWith(`/uploads/${req.ctx.schoolId}/`)) throw badRequest('Fotoğraf bu okula ait değil.');
    const [row] = await db
      .insert(schoolIssues)
      .values({ schoolId: req.ctx.schoolId, reporterUserId: req.ctx.userId, category: body.category, location: body.location, description: body.description, urgent: body.urgent, photoUrl: body.photoUrl ?? null })
      .returning();
    const [me] = await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, req.ctx.userId));
    const to = await recipients(req.ctx.schoolId, body.category);
    await tell(app.deps, to.filter((u) => u !== req.ctx.userId), {
      kind: 'issue',
      title: `${body.urgent ? 'ACİL · ' : ''}Yeni sorun · ${ISSUE_CATEGORIES[body.category]}`,
      body: `${me?.fullName ?? 'Bir öğretmen'} (${body.location}): ${short(body.description)}`,
      to: `/sorunlar?id=${row!.id}`,
      schoolId: req.ctx.schoolId,
    });
    return reply.status(201).send((await present([row!], req.ctx.userId, true))[0]);
  });

  /** İdare: durum ve sorumlu */
  app.patch(`${base}/:id`, member, async (req) => {
    if (!isManager(req.ctx.role)) throw forbidden('Durumu yalnızca idareciler değiştirir.');
    const row = await load(req, (req.params as { id: string }).id);
    const body = parse(issueUpdateSchema, req.body);
    const all = await managers(req.ctx.schoolId);
    if (body.assigneeUserId && !all.includes(body.assigneeUserId)) throw badRequest('Sorumlu bir idareci olmalı.');
    const statusChanged = body.status && body.status !== row.status;
    const assigneeChanged = body.assigneeUserId !== undefined && body.assigneeUserId !== row.assigneeUserId;
    const [updated] = await db
      .update(schoolIssues)
      .set({
        ...(body.status ? { status: body.status, resolvedAt: body.status === 'resolved' ? new Date() : null } : {}),
        ...(body.assigneeUserId !== undefined ? { assigneeUserId: body.assigneeUserId } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schoolIssues.id, row.id))
      .returning();
    const names = await nameMap([req.ctx.userId, body.assigneeUserId ?? null]);
    const actor = names.get(req.ctx.userId) ?? 'İdare';
    const notes: string[] = [];
    if (statusChanged) notes.push(`${actor} durumu "${ISSUE_STATUSES[body.status!]}" yaptı`);
    if (assigneeChanged) notes.push(body.assigneeUserId ? `Sorumlu: ${names.get(body.assigneeUserId) ?? ''}` : 'Sorumlu kaldırıldı');
    if (notes.length) await db.insert(schoolIssueMessages).values(notes.map((n) => ({ issueId: row.id, userId: req.ctx.userId, body: n, system: true })));
    const title = `${ISSUE_CATEGORIES[row.category as IssueCategory]} · ${row.location}`;
    if (statusChanged && row.reporterUserId !== req.ctx.userId) {
      await tell(app.deps, [row.reporterUserId], {
        kind: 'issue',
        title: body.status === 'resolved' ? 'Bildiriminiz çözüldü' : body.status === 'in_progress' ? 'Bildiriminiz işleme alındı' : 'Bildiriminiz yeniden açıldı',
        body: `${title} — ${actor}`,
        to: `/sorunlar?id=${row.id}`,
        schoolId: req.ctx.schoolId,
      });
    }
    if (assigneeChanged && body.assigneeUserId && body.assigneeUserId !== req.ctx.userId) {
      await tell(app.deps, [body.assigneeUserId], { kind: 'issue', title: 'Size bir sorun atandı', body: `${title}: ${short(row.description)}`, to: `/sorunlar?id=${row.id}`, schoolId: req.ctx.schoolId });
    }
    return (await present([updated!], req.ctx.userId, true))[0];
  });

  /** Yazışma: bildiren ve idare yanıt yazar; karşı taraf haberdar olur */
  app.post(`${base}/:id/messages`, { ...member, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const row = await load(req, (req.params as { id: string }).id);
    const { body } = parse(messageSchema, req.body);
    await db.insert(schoolIssueMessages).values({ issueId: row.id, userId: req.ctx.userId, body });
    await db.update(schoolIssues).set({ updatedAt: new Date() }).where(eq(schoolIssues.id, row.id));
    const names = await nameMap([req.ctx.userId]);
    const fromReporter = row.reporterUserId === req.ctx.userId;
    const to = fromReporter ? (row.assigneeUserId ? [row.assigneeUserId] : await recipients(req.ctx.schoolId, row.category)) : [row.reporterUserId];
    await tell(
      app.deps,
      to.filter((u) => u !== req.ctx.userId),
      {
        kind: 'issue',
        title: `${names.get(req.ctx.userId) ?? ''} yanıt yazdı`,
        body: `${ISSUE_CATEGORIES[row.category as IssueCategory]} · ${row.location}: ${short(body)}`,
        to: `/sorunlar?id=${row.id}`,
        schoolId: req.ctx.schoolId,
      },
    );
    return reply.status(201).send((await present([row], req.ctx.userId, true))[0]);
  });

  /* ---------- Destek talepleri (okul müdürü / yöneticiler → platform) ---------- */

  const support = '/api/schools/:schoolId/support';
  const managerOnly = async (req: FastifyRequest) => {
    if (!isManager(req.ctx.role) || req.ctx.isSupport) throw forbidden('Platforma yalnızca okul müdürü ve yöneticiler yazabilir.');
  };
  const supportGuard = { preHandler: [app.authenticate, schoolGuard(), managerOnly] };

  async function superAdmins() {
    return (await db.select({ id: users.id }).from(users).where(eq(users.isSuperAdmin, true))).map((u) => u.id);
  }

  async function presentTickets(rows: (typeof supportTickets.$inferSelect)[], me: string, withMessages = false): Promise<SupportTicket[]> {
    const ids = rows.map((r) => r.id);
    const msgs = ids.length ? await db.select().from(supportMessages).where(inArray(supportMessages.ticketId, ids)).orderBy(asc(supportMessages.createdAt)) : [];
    const schoolRows = rows.length ? await db.select({ id: schools.id, name: schools.name }).from(schools).where(inArray(schools.id, [...new Set(rows.map((r) => r.schoolId))])) : [];
    const schoolName = new Map(schoolRows.map((s) => [s.id, s.name]));
    const names = await nameMap([...rows.map((r) => r.userId), ...msgs.map((m) => m.userId)]);
    return rows.map((r) => {
      const mine = msgs.filter((m) => m.ticketId === r.id);
      const last = [...mine].reverse().find((m) => !m.system);
      return {
        id: r.id,
        kind: r.kind as SupportTicket['kind'],
        area: r.area as SupportTicket['area'],
        subject: r.subject,
        status: r.status as SupportTicket['status'],
        schoolId: r.schoolId,
        schoolName: schoolName.get(r.schoolId) ?? '',
        userName: names.get(r.userId ?? '') ?? '',
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        lastMessage: last ? short(last.body) : null,
        ...(withMessages
          ? {
              messages: mine.map((m) => ({
                id: m.id,
                userName: m.fromPlatform ? 'Okul Yayın Destek' : (names.get(m.userId ?? '') ?? ''),
                mine: m.userId === me,
                system: m.system,
                fromPlatform: m.fromPlatform,
                attachmentUrl: m.attachmentUrl,
                body: m.body,
                at: m.createdAt.toISOString(),
              })),
            }
          : {}),
      };
    });
  }

  app.get(support, supportGuard, async (req) => {
    const rows = await db.select().from(supportTickets).where(eq(supportTickets.schoolId, req.ctx.schoolId)).orderBy(desc(supportTickets.updatedAt)).limit(200);
    return presentTickets(rows, req.ctx.userId);
  });

  app.get(`${support}/:id`, supportGuard, async (req) => {
    const [row] = await db.select().from(supportTickets).where(and(eq(supportTickets.id, (req.params as { id: string }).id), eq(supportTickets.schoolId, req.ctx.schoolId)));
    if (!row) throw notFound('Talep bulunamadı.');
    return (await presentTickets([row], req.ctx.userId, true))[0];
  });

  app.post(support, { ...supportGuard, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const body = parse(supportCreateSchema, req.body);
    if (body.attachmentUrl && !body.attachmentUrl.startsWith(`/uploads/${req.ctx.schoolId}/`)) throw badRequest('Ek bu okula ait değil.');
    const [row] = await db.insert(supportTickets).values({ schoolId: req.ctx.schoolId, userId: req.ctx.userId, kind: body.kind, area: body.area, subject: body.subject }).returning();
    await db.insert(supportMessages).values({ ticketId: row!.id, userId: req.ctx.userId, body: body.body, attachmentUrl: body.attachmentUrl ?? null });
    await tell(app.deps, await superAdmins(), {
      kind: 'support-ticket',
      title: `Yeni ${SUPPORT_KINDS[body.kind].toLocaleLowerCase('tr-TR')} · ${req.ctx.school.name}`,
      body: `${body.subject}: ${short(body.body)}`,
      to: `/platform/destek?id=${row!.id}`,
    });
    return reply.status(201).send((await presentTickets([row!], req.ctx.userId, true))[0]);
  });

  app.post(`${support}/:id/messages`, { ...supportGuard, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const [row] = await db.select().from(supportTickets).where(and(eq(supportTickets.id, (req.params as { id: string }).id), eq(supportTickets.schoolId, req.ctx.schoolId)));
    if (!row) throw notFound('Talep bulunamadı.');
    const { body } = parse(messageSchema, req.body);
    await db.insert(supportMessages).values({ ticketId: row.id, userId: req.ctx.userId, body });
    // Okul yeniden yazınca talep yeniden açılır
    const [updated] = await db.update(supportTickets).set({ status: 'new', updatedAt: new Date() }).where(eq(supportTickets.id, row.id)).returning();
    await tell(app.deps, await superAdmins(), { kind: 'support-ticket', title: `Yanıt · ${req.ctx.school.name}`, body: `${row.subject}: ${short(body)}`, to: `/platform/destek?id=${row.id}` });
    return reply.status(201).send((await presentTickets([updated!], req.ctx.userId, true))[0]);
  });

  /* ---------- Platform yöneticisi ---------- */

  const platform = {
    preHandler: [
      app.authenticate,
      async (req: FastifyRequest) => {
        if (!accessUser(req).sa) throw forbidden();
      },
    ],
  };

  app.get('/api/platform/support', platform, async (req) => {
    const rows = await db.select().from(supportTickets).orderBy(desc(supportTickets.updatedAt)).limit(300);
    return presentTickets(rows, accessUser(req).sub);
  });

  app.get('/api/platform/support/:id', platform, async (req) => {
    const [row] = await db.select().from(supportTickets).where(eq(supportTickets.id, (req.params as { id: string }).id));
    if (!row) throw notFound('Talep bulunamadı.');
    return (await presentTickets([row], accessUser(req).sub, true))[0];
  });

  app.post('/api/platform/support/:id/messages', platform, async (req, reply) => {
    const [row] = await db.select().from(supportTickets).where(eq(supportTickets.id, (req.params as { id: string }).id));
    if (!row) throw notFound('Talep bulunamadı.');
    const { body } = parse(messageSchema, req.body);
    const me = accessUser(req).sub;
    await db.insert(supportMessages).values({ ticketId: row.id, userId: me, fromPlatform: true, body });
    const [updated] = await db.update(supportTickets).set({ status: row.status === 'resolved' ? 'resolved' : 'answered', updatedAt: new Date() }).where(eq(supportTickets.id, row.id)).returning();
    await tell(app.deps, [row.userId], { kind: 'support-reply', title: 'Okul Yayın Destek yanıt yazdı', body: `${row.subject}: ${short(body)}`, to: `/platforma-yaz?id=${row.id}`, schoolId: row.schoolId });
    return reply.status(201).send((await presentTickets([updated!], me, true))[0]);
  });

  app.patch('/api/platform/support/:id', platform, async (req) => {
    const [row] = await db.select().from(supportTickets).where(eq(supportTickets.id, (req.params as { id: string }).id));
    if (!row) throw notFound('Talep bulunamadı.');
    const { status } = parse(supportStatusSchema, req.body);
    const me = accessUser(req).sub;
    const [updated] = await db.update(supportTickets).set({ status, updatedAt: new Date() }).where(eq(supportTickets.id, row.id)).returning();
    if (status !== row.status && status === 'resolved') {
      await db.insert(supportMessages).values({ ticketId: row.id, userId: me, fromPlatform: true, system: true, body: 'Destek ekibi talebi çözüldü olarak kapattı' });
      await tell(app.deps, [row.userId], { kind: 'support-reply', title: 'Talebiniz çözüldü', body: row.subject, to: `/platforma-yaz?id=${row.id}`, schoolId: row.schoolId });
    }
    return (await presentTickets([updated!], me, true))[0];
  });
}

/** KVKK: çözülen sorunların fotoğrafları 90 gün sonra silinir (saatlik iş) */
export async function runIssuePhotoRetention(deps: AppDeps, now = new Date()) {
  const cutoff = new Date(now.getTime() - ISSUE_PHOTO_RETENTION_DAYS * 86400_000);
  const rows = await deps.db
    .select({ id: schoolIssues.id, photoUrl: schoolIssues.photoUrl })
    .from(schoolIssues)
    .where(and(eq(schoolIssues.status, 'resolved'), isNotNull(schoolIssues.photoUrl), lt(schoolIssues.resolvedAt, cutoff)));
  for (const r of rows) {
    await deps.storage.deleteImage?.(r.photoUrl!).catch(() => undefined);
    await deps.db.update(schoolIssues).set({ photoUrl: null }).where(eq(schoolIssues.id, r.id));
  }
  return rows.length;
}
