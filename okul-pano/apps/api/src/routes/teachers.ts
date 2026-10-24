import {
  DEFAULT_BRANCHES,
  DEFAULT_TITLES,
  normalizeName,
  teacherImportSchema,
  teacherOptionSchema,
  teacherSchema,
  tidyName,
  trCompare,
} from '@okulpano/shared';
import { and, count, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit, schoolGuard } from '../context.ts';
import type { DB } from '../db/client.ts';
import { duties, teacherBranches, teacherLeaves, teachers, teacherTitles, timetableEntries } from '../db/schema.ts';
import { exportFileName, readXlsxUpload, sendXlsx } from '../lib/excel.ts';
import { buildTeachersWorkbook, parseTeachersWorkbook } from '../lib/sheets/teachers.ts';
import { conflict, parse } from '../lib/errors.ts';
import { registerResource } from './crud.ts';

type OptionTable = typeof teacherBranches | typeof teacherTitles;
type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];

/** Okulun öğretmenlerini branş ve ünvan adlarıyla birlikte, Türkçe alfabeye göre sıralı döndürür. */
export async function listTeachers(db: DB, schoolId: string) {
  const rows = await db
    .select({
      id: teachers.id,
      schoolId: teachers.schoolId,
      fullName: teachers.fullName,
      branchId: teachers.branchId,
      titleId: teachers.titleId,
      branch: teacherBranches.name,
      title: teacherTitles.name,
      isActive: teachers.isActive,
      createdAt: teachers.createdAt,
      updatedAt: teachers.updatedAt,
    })
    .from(teachers)
    .leftJoin(teacherBranches, eq(teacherBranches.id, teachers.branchId))
    .leftJoin(teacherTitles, eq(teacherTitles.id, teachers.titleId))
    .where(eq(teachers.schoolId, schoolId));
  return rows.sort((a, b) => trCompare(a.fullName, b.fullName));
}

/** Eksik branş/ünvanları oluşturur (büyük/küçük harf duyarsız) ve ad -> kimlik eşlemesini döndürür. */
async function ensureOptions(tx: Tx | DB, table: OptionTable, schoolId: string, names: (string | null | undefined)[]) {
  const existing = await tx.select({ id: table.id, name: table.name }).from(table).where(eq(table.schoolId, schoolId));
  const map = new Map(existing.map((o) => [normalizeName(o.name), o.id]));
  const missing = new Map<string, string>();
  for (const n of names) {
    if (!n?.trim()) continue;
    const key = normalizeName(n);
    if (!map.has(key) && !missing.has(key)) missing.set(key, tidyName(n));
  }
  if (missing.size) {
    const created = await tx
      .insert(table)
      .values([...missing.values()].map((name) => ({ schoolId, name })))
      .returning({ id: table.id, name: table.name });
    for (const c of created) map.set(normalizeName(c.name), c.id);
  }
  return { map, created: missing.size };
}

async function optionNames(db: DB, table: OptionTable, schoolId: string): Promise<string[]> {
  const rows = await db.select({ name: table.name }).from(table).where(eq(table.schoolId, schoolId));
  return rows.map((r) => r.name).sort(trCompare);
}

/** Yeni okul açılırken önerilen branş ve ünvan listelerini ekler. */
export async function addDefaultTeacherOptions(tx: Tx | DB, schoolId: string) {
  const b = await ensureOptions(tx, teacherBranches, schoolId, [...DEFAULT_BRANCHES]);
  const t = await ensureOptions(tx, teacherTitles, schoolId, [...DEFAULT_TITLES]);
  return { branchesAdded: b.created, titlesAdded: t.created };
}

export async function teacherRoutes(app: FastifyInstance) {
  const { db, bus } = app.deps;
  const base = '/api/schools/:schoolId';
  const read = { preHandler: [app.authenticate, schoolGuard()] };
  const write = { preHandler: [app.authenticate, schoolGuard('directory.manage')] };

  /* ---------- Branş ve ünvan listeleri ---------- */

  const optionLists = [
    { path: 'teacher-branches', table: teacherBranches, fk: teachers.branchId, entity: 'Branş' },
    { path: 'teacher-titles', table: teacherTitles, fk: teachers.titleId, entity: 'Ünvan' },
  ] as const;

  for (const o of optionLists) {
    registerResource(app, {
      path: o.path,
      entity: o.entity,
      table: o.table,
      permission: 'directory.manage',
      schema: teacherOptionSchema,
      toRow: (i) => ({ name: tidyName(i.name) }),
      validate: async (req, row, id) => {
        const all = await db.select({ id: o.table.id, name: o.table.name }).from(o.table).where(eq(o.table.schoolId, req.ctx.schoolId));
        const name = row.name as string;
        if (all.some((x) => x.id !== id && normalizeName(x.name) === normalizeName(name))) {
          throw conflict(`"${name}" zaten listede.`);
        }
      },
      list: async (req) => {
        const rows = await db
          .select({ id: o.table.id, name: o.table.name, teacherCount: count(teachers.id) })
          .from(o.table)
          .leftJoin(teachers, eq(o.fk, o.table.id))
          .where(eq(o.table.schoolId, req.ctx.schoolId))
          .groupBy(o.table.id, o.table.name);
        return rows.sort((a, b) => trCompare(a.name, b.name));
      },
    });
  }

  app.post(`${base}/teacher-catalog/defaults`, write, async (req) => {
    const result = await db.transaction((tx) => addDefaultTeacherOptions(tx, req.ctx.schoolId));
    await audit(req, 'create', 'Branş ve ünvan', null, `${result.branchesAdded} branş, ${result.titlesAdded} ünvan eklendi`);
    return result;
  });

  /* ---------- Öğretmenler ---------- */

  registerResource(app, {
    path: 'teachers',
    entity: 'Öğretmen',
    table: teachers,
    permission: 'directory.manage',
    schema: teacherSchema,
    refs: { branchId: teacherBranches, titleId: teacherTitles },
    toRow: (i) => ({ ...i, fullName: tidyName(i.fullName), branchId: i.branchId ?? null, titleId: i.titleId ?? null }),
    list: (req) => listTeachers(db, req.ctx.schoolId),
  });

  app.get(`${base}/teachers/usage`, read, async (req) => usage(req.ctx.schoolId));

  async function usage(schoolId: string) {
    const [[t], [d], [l], [tt]] = await Promise.all([
      db.select({ n: count() }).from(teachers).where(eq(teachers.schoolId, schoolId)),
      db.select({ n: count() }).from(duties).where(eq(duties.schoolId, schoolId)),
      db.select({ n: count() }).from(teacherLeaves).where(eq(teacherLeaves.schoolId, schoolId)),
      db
        .select({ n: count() })
        .from(timetableEntries)
        .where(and(eq(timetableEntries.schoolId, schoolId), sql`${timetableEntries.teacherId} is not null`)),
    ]);
    return { teachers: t?.n ?? 0, duties: d?.n ?? 0, leaves: l?.n ?? 0, timetable: tt?.n ?? 0 };
  }

  /** Tüm kadroyu siler. Nöbet ve izin kayıtları da silinir; ders programında öğretmen alanı boşalır. */
  app.post(`${base}/teachers/delete-all`, write, async (req) => {
    parse(z.object({ confirm: z.literal('delete-all', { error: 'Silme onayı eksik' }) }), req.body);
    const before = await usage(req.ctx.schoolId);
    await db.delete(teachers).where(eq(teachers.schoolId, req.ctx.schoolId));
    await audit(req, 'delete', 'Öğretmen', null, `Tüm kadro silindi (${before.teachers} öğretmen)`);
    bus.contentChanged(req.ctx.schoolId);
    return { deleted: before.teachers, duties: before.duties, leaves: before.leaves, timetable: before.timetable };
  });

  /* ---------- Excel ---------- */

  app.get(`${base}/teachers/template`, read, async (req, reply) => {
    const [branches, titles] = await Promise.all([
      optionNames(db, teacherBranches, req.ctx.schoolId),
      optionNames(db, teacherTitles, req.ctx.schoolId),
    ]);
    const buf = await buildTeachersWorkbook({ branches, titles, schoolName: req.ctx.school.name });
    return sendXlsx(reply, buf, 'ogretmen-sablonu.xlsx');
  });

  app.get(`${base}/teachers/export`, read, async (req, reply) => {
    const [rows, branches, titles] = await Promise.all([
      listTeachers(db, req.ctx.schoolId),
      optionNames(db, teacherBranches, req.ctx.schoolId),
      optionNames(db, teacherTitles, req.ctx.schoolId),
    ]);
    const buf = await buildTeachersWorkbook({
      branches,
      titles,
      rows: rows.map((r) => ({ fullName: r.fullName, branch: r.branch, title: r.title, isActive: r.isActive })),
      schoolName: req.ctx.school.name,
    });
    return sendXlsx(reply, buf, exportFileName('ogretmenler', req.ctx.school.name));
  });

  /**
   * 1. adım: Dosya okunur, hiçbir şey kaydedilmeden ne olacağı gösterilir
   * (kaç yeni öğretmen, kaçı güncellenecek, hangi satırlar hatalı, hangi branş/ünvanlar eklenecek).
   */
  app.post(
    `${base}/teachers/import/preview`,
    { ...write, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req) => {
      const parsed = await parseTeachersWorkbook(await readXlsxUpload(req));

      const schoolId = req.ctx.schoolId;
      const [existing, branchRows, titleRows] = await Promise.all([
        listTeachers(db, schoolId),
        db.select({ name: teacherBranches.name }).from(teacherBranches).where(eq(teacherBranches.schoolId, schoolId)),
        db.select({ name: teacherTitles.name }).from(teacherTitles).where(eq(teacherTitles.schoolId, schoolId)),
      ]);
      const byName = new Map(existing.map((t) => [normalizeName(t.fullName), t]));
      const knownBranches = new Set(branchRows.map((b) => normalizeName(b.name)));
      const knownTitles = new Set(titleRows.map((b) => normalizeName(b.name)));
      const newBranches = new Map<string, string>();
      const newTitles = new Map<string, string>();
      const seen = new Map<string, number>();
      const issues = [...parsed.issues];

      const rows = parsed.rows.flatMap((r) => {
        const key = normalizeName(r.fullName);
        const firstRow = seen.get(key);
        if (firstRow !== undefined) {
          issues.push({ row: r.row, message: `${r.fullName} dosyada iki kez var (ilk: ${firstRow}. satır); bu satır atlanacak` });
          return [];
        }
        seen.set(key, r.row);
        if (r.branch && !knownBranches.has(normalizeName(r.branch))) newBranches.set(normalizeName(r.branch), r.branch);
        if (r.title && !knownTitles.has(normalizeName(r.title))) newTitles.set(normalizeName(r.title), r.title);

        const current = byName.get(key);
        let status: 'new' | 'update' | 'unchanged' = 'new';
        if (current) {
          const changed =
            (r.branch && normalizeName(r.branch) !== normalizeName(current.branch ?? '')) ||
            (r.title && normalizeName(r.title) !== normalizeName(current.title ?? '')) ||
            (r.isActive !== undefined && r.isActive !== current.isActive);
          status = changed ? 'update' : 'unchanged';
        }
        return [{ ...r, status }];
      });

      issues.sort((a, b) => a.row - b.row);
      return {
        sheetName: parsed.sheetName,
        rows,
        issues,
        newBranches: [...newBranches.values()].sort(trCompare),
        newTitles: [...newTitles.values()].sort(trCompare),
        totals: {
          new: rows.filter((r) => r.status === 'new').length,
          update: rows.filter((r) => r.status === 'update').length,
          unchanged: rows.filter((r) => r.status === 'unchanged').length,
          skipped: issues.length,
        },
      };
    },
  );

  /** 2. adım: Onaylanan satırlar kaydedilir. Aynı isimli öğretmen varsa güncellenir; boş hücre mevcut bilgiyi silmez. */
  app.post(`${base}/teachers/import`, write, async (req) => {
    const body = parse(teacherImportSchema, req.body);
    const schoolId = req.ctx.schoolId;

    const result = await db.transaction(async (tx) => {
      const branches = await ensureOptions(tx, teacherBranches, schoolId, body.rows.map((r) => r.branch));
      const titles = await ensureOptions(tx, teacherTitles, schoolId, body.rows.map((r) => r.title));
      const current = await tx
        .select({ id: teachers.id, fullName: teachers.fullName, branchId: teachers.branchId, titleId: teachers.titleId, isActive: teachers.isActive })
        .from(teachers)
        .where(eq(teachers.schoolId, schoolId));
      const byName = new Map(current.map((t) => [normalizeName(t.fullName), t]));

      const inserts: (typeof teachers.$inferInsert)[] = [];
      let updated = 0;
      let unchanged = 0;
      const handled = new Set<string>();

      for (const r of body.rows) {
        const key = normalizeName(r.fullName);
        if (handled.has(key)) continue;
        handled.add(key);
        const branchId = r.branch ? (branches.map.get(normalizeName(r.branch)) ?? null) : null;
        const titleId = r.title ? (titles.map.get(normalizeName(r.title)) ?? null) : null;
        const existing = byName.get(key);

        if (!existing) {
          inserts.push({ schoolId, fullName: tidyName(r.fullName), branchId, titleId, isActive: r.isActive ?? true });
          continue;
        }
        const patch = {
          branchId: branchId ?? existing.branchId,
          titleId: titleId ?? existing.titleId,
          isActive: r.isActive ?? existing.isActive,
        };
        const changed = patch.branchId !== existing.branchId || patch.titleId !== existing.titleId || patch.isActive !== existing.isActive;
        if (!changed || !body.updateExisting) {
          unchanged++;
          continue;
        }
        await tx.update(teachers).set(patch).where(eq(teachers.id, existing.id));
        updated++;
      }
      for (let i = 0; i < inserts.length; i += 500) await tx.insert(teachers).values(inserts.slice(i, i + 500));
      return { created: inserts.length, updated, unchanged, branchesCreated: branches.created, titlesCreated: titles.created };
    });

    await audit(req, 'create', 'Öğretmen', null, `Excel'den ${result.created} öğretmen eklendi, ${result.updated} güncellendi`);
    bus.contentChanged(schoolId);
    return result;
  });
}
