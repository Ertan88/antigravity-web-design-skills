import { quickPatchSchema, type Permission } from '@okulpano/shared';
import { and, asc, eq, getTableColumns, inArray, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z, type ZodType } from 'zod';
import { audit, schoolGuard, UUID_RE } from '../context.ts';
import { badRequest, notFound, parse } from '../lib/errors.ts';

type SchoolTable = PgTable & { id: PgColumn; schoolId: PgColumn };

export interface ResourceConfig<S extends ZodType> {
  /** URL parçası: /api/schools/:schoolId/<path> */
  path: string;
  /** Etkinlik geçmişinde görünen ad */
  entity: string;
  table: SchoolTable;
  permission: Permission;
  schema: S;
  orderBy?: (PgColumn | SQL)[];
  /** Doğrulanmış girdiyi tablo satırına çevirir (ör. ISO tarih -> Date) */
  toRow?: (input: z.infer<S>, req: FastifyRequest) => Record<string, unknown>;
  /** Başka okulun kaydına bağlanmayı engellemek için: alan adı -> hedef tablo */
  refs?: Record<string, SchoolTable>;
  /** Etkinlik geçmişi özeti */
  summary?: (row: Record<string, unknown>) => string;
  /** Listeyi özelleştirmek için (birleştirmeler vb.) */
  list?: (req: FastifyRequest) => Promise<unknown[]>;
  /** Değişiklik sonrası ekranlara bildirim gönderilsin mi */
  affectsDisplay?: boolean;
  /** Ek doğrulama (ör. büyük/küçük harf duyarsız tekillik); güncellemede id verilir */
  validate?: (req: FastifyRequest, row: Record<string, unknown>, id: string | null) => Promise<void>;
  /** Ekleme / güncelleme sonrası (ör. onay bekleyen duyuru için bildirim) */
  afterWrite?: (req: FastifyRequest, row: Record<string, unknown>, action: 'create' | 'update') => Promise<void>;
}

const idParam = (req: FastifyRequest) => {
  const { id } = req.params as { id: string };
  if (!UUID_RE.test(id)) throw notFound();
  return id;
};

/**
 * Okul kapsamlı standart CRUD uç noktaları üretir. Her sorgu okul kimliğiyle filtrelenir,
 * yabancı anahtarlar aynı okula ait mi diye kontrol edilir, her yazma işlemi etkinlik
 * geçmişine düşülür ve ekranlara canlı bildirim gider.
 */
export function registerResource<S extends ZodType>(app: FastifyInstance, cfg: ResourceConfig<S>) {
  const base = `/api/schools/:schoolId/${cfg.path}`;
  const t = cfg.table;
  const cols = getTableColumns(t) as Record<string, PgColumn>;
  const read = { preHandler: [app.authenticate, schoolGuard()] };
  const write = { preHandler: [app.authenticate, schoolGuard(cfg.permission)] };
  const toRow = cfg.toRow ?? ((i: z.infer<S>) => i as Record<string, unknown>);
  const summarize = cfg.summary ?? ((r) => String(r.title ?? r.name ?? r.fullName ?? r.text ?? ''));
  const orderBy = cfg.orderBy ?? [cols.sortOrder ?? cols.createdAt].filter(Boolean).map((c) => asc(c as PgColumn));
  const { db, bus } = app.deps;

  const changed = (req: FastifyRequest) => {
    if (cfg.affectsDisplay !== false) bus.contentChanged(req.ctx.schoolId);
  };

  async function checkRefs(req: FastifyRequest, row: Record<string, unknown>) {
    for (const [field, refTable] of Object.entries(cfg.refs ?? {})) {
      const value = row[field];
      if (value == null) continue;
      const [found] = await db
        .select({ id: refTable.id })
        .from(refTable)
        .where(and(eq(refTable.id, value as string), eq(refTable.schoolId, req.ctx.schoolId)));
      if (!found) throw badRequest('Seçilen ilişkili kayıt bu okula ait değil.');
    }
  }

  const scoped = (req: FastifyRequest, id: string) => and(eq(t.id, id), eq(t.schoolId, req.ctx.schoolId));

  app.get(base, read, async (req) => {
    if (cfg.list) return cfg.list(req);
    return db
      .select()
      .from(t as PgTable)
      .where(eq(t.schoolId, req.ctx.schoolId))
      .orderBy(...(orderBy as SQL[]));
  });

  app.post(base, write, async (req, reply) => {
    const row = toRow(parse(cfg.schema, req.body), req);
    await checkRefs(req, row);
    await cfg.validate?.(req, row, null);
    const [created] = (await db
      .insert(t)
      .values({ ...row, schoolId: req.ctx.schoolId } as never)
      .returning()) as Record<string, unknown>[];
    await audit(req, 'create', cfg.entity, String(created!.id), summarize(created!));
    changed(req);
    await cfg.afterWrite?.(req, created!, 'create');
    return reply.status(201).send(created);
  });

  app.put(`${base}/:id`, write, async (req) => {
    const id = idParam(req);
    const row = toRow(parse(cfg.schema, req.body), req);
    await checkRefs(req, row);
    await cfg.validate?.(req, row, id);
    const [updated] = (await db
      .update(t)
      .set(row as never)
      .where(scoped(req, id))
      .returning()) as Record<string, unknown>[];
    if (!updated) throw notFound();
    await audit(req, 'update', cfg.entity, id, summarize(updated));
    changed(req);
    await cfg.afterWrite?.(req, updated, 'update');
    return updated;
  });

  if (cols.isActive || cols.sortOrder) {
    app.patch(`${base}/:id`, write, async (req) => {
      const id = idParam(req);
      const patch = parse(quickPatchSchema, req.body);
      const set: Record<string, unknown> = {};
      if (patch.isActive !== undefined && cols.isActive) set.isActive = patch.isActive;
      if (patch.sortOrder !== undefined && cols.sortOrder) set.sortOrder = patch.sortOrder;
      if (!Object.keys(set).length) throw badRequest('Değiştirilecek alan yok.');
      const [updated] = (await db
        .update(t)
        .set(set as never)
        .where(scoped(req, id))
        .returning()) as Record<string, unknown>[];
      if (!updated) throw notFound();
      if (patch.isActive !== undefined) {
        await audit(req, patch.isActive ? 'publish' : 'unpublish', cfg.entity, id, summarize(updated));
      }
      changed(req);
      return updated;
    });
  }

  if (cols.sortOrder) {
    const reorderSchema = z.object({ ids: z.array(z.uuid()).min(1).max(500) });
    app.post(`${base}/reorder`, write, async (req) => {
      const { ids } = parse(reorderSchema, req.body);
      await db.transaction(async (tx) => {
        for (const [index, id] of ids.entries()) {
          await tx
            .update(t)
            .set({ sortOrder: index } as never)
            .where(scoped(req, id));
        }
      });
      changed(req);
      return { ok: true };
    });
  }

  app.delete(`${base}/:id`, write, async (req, reply) => {
    const id = idParam(req);
    const [deleted] = (await db.delete(t).where(scoped(req, id)).returning()) as Record<string, unknown>[];
    if (!deleted) throw notFound();
    await audit(req, 'delete', cfg.entity, id, summarize(deleted));
    changed(req);
    return reply.status(204).send();
  });

  const bulkDeleteSchema = z.object({ ids: z.array(z.uuid()).min(1).max(1000) });
  app.post(`${base}/bulk-delete`, write, async (req) => {
    const { ids } = parse(bulkDeleteSchema, req.body);
    const deleted = await db
      .delete(t)
      .where(and(inArray(t.id, ids), eq(t.schoolId, req.ctx.schoolId)))
      .returning({ id: t.id });
    await audit(req, 'delete', cfg.entity, null, `${deleted.length} kayıt toplu silindi`);
    changed(req);
    return { deleted: deleted.length };
  });
}
