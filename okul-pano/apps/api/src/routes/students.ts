import { normalizeClassName, normalizeName, studentImportSchema, studentSchema, trCompare } from '@okulpano/shared';
import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { audit, schoolGuard } from '../context.ts';
import type { DB } from '../db/client.ts';
import { classGroups, students } from '../db/schema.ts';
import { parse } from '../lib/errors.ts';
import { exportFileName, readXlsxUpload, sendXlsx } from '../lib/excel.ts';
import { buildStudentsWorkbook, parseStudentsWorkbook } from '../lib/sheets/students.ts';
import { registerResource } from './crud.ts';

type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];

/** Aynı öğrenci: ad soyad (Türkçe büyük/küçük harf duyarsız) + doğum tarihi. Aynı isimli iki öğrenci karışmaz. */
const studentKey = (fullName: string, birthDate: string) => `${normalizeName(fullName)}|${birthDate}`;
const classKey = (name: string) => normalizeName(normalizeClassName(name));

async function loadClasses(db: DB | Tx, schoolId: string) {
  const rows = await db
    .select({ id: classGroups.id, name: classGroups.name, sortOrder: classGroups.sortOrder })
    .from(classGroups)
    .where(eq(classGroups.schoolId, schoolId))
    .orderBy(asc(classGroups.sortOrder), asc(classGroups.name));
  return { rows, byKey: new Map(rows.map((c) => [classKey(c.name), c])), byId: new Map(rows.map((c) => [c.id, c])) };
}

export async function studentRoutes(app: FastifyInstance) {
  const { db, bus } = app.deps;
  const base = '/api/schools/:schoolId/students';
  const read = { preHandler: [app.authenticate, schoolGuard()] };
  const write = { preHandler: [app.authenticate, schoolGuard('students.manage')] };

  registerResource(app, {
    path: 'students',
    entity: 'Öğrenci',
    table: students,
    permission: 'students.manage',
    schema: studentSchema,
    orderBy: [asc(students.fullName)],
    refs: { classGroupId: classGroups },
    toRow: (i) => ({ ...i, classGroupId: i.classGroupId ?? null }),
  });

  /**
   * Toplu içe aktarma (Excel önizlemesinden ya da yapıştırılan listeden). Eksik sınıflar oluşturulur;
   * aynı ad ve doğum tarihli öğrenci varsa yeni kayıt açılmaz, sınıfı güncellenir.
   */
  app.post(`${base}/import`, write, async (req) => {
    const { rows, updateExisting } = parse(studentImportSchema, req.body);
    const schoolId = req.ctx.schoolId;

    const result = await db.transaction(async (tx) => {
      const classes = await loadClasses(tx, schoolId);
      const missing = new Map<string, string>();
      for (const r of rows) {
        if (!r.className) continue;
        const name = normalizeClassName(r.className);
        if (!classes.byKey.has(classKey(name))) missing.set(classKey(name), name);
      }
      if (missing.size) {
        const created = await tx
          .insert(classGroups)
          .values([...missing.values()].map((name, i) => ({ schoolId, name, sortOrder: classes.rows.length + i })))
          .returning({ id: classGroups.id, name: classGroups.name, sortOrder: classGroups.sortOrder });
        for (const c of created) classes.byKey.set(classKey(c.name), c);
      }

      const current = await tx
        .select({ id: students.id, fullName: students.fullName, birthDate: students.birthDate, classGroupId: students.classGroupId })
        .from(students)
        .where(eq(students.schoolId, schoolId));
      const byKey = new Map(current.map((s) => [studentKey(s.fullName, s.birthDate), s]));

      const inserts: (typeof students.$inferInsert)[] = [];
      let updated = 0;
      let unchanged = 0;
      const handled = new Set<string>();
      for (const r of rows) {
        const key = studentKey(r.fullName, r.birthDate);
        if (handled.has(key)) continue;
        handled.add(key);
        const classGroupId = r.className ? (classes.byKey.get(classKey(r.className))?.id ?? null) : null;
        const existing = byKey.get(key);
        if (!existing) {
          inserts.push({ schoolId, fullName: r.fullName.trim().replace(/\s+/g, ' '), birthDate: r.birthDate, classGroupId });
        } else if (updateExisting && classGroupId && classGroupId !== existing.classGroupId) {
          await tx.update(students).set({ classGroupId }).where(eq(students.id, existing.id));
          updated++;
        } else {
          unchanged++;
        }
      }
      for (let i = 0; i < inserts.length; i += 500) await tx.insert(students).values(inserts.slice(i, i + 500));
      return { created: inserts.length, updated, unchanged, classesCreated: missing.size };
    });

    await audit(req, 'create', 'Öğrenci', null, `${result.created} öğrenci eklendi, ${result.updated} güncellendi (toplu)`);
    bus.contentChanged(schoolId);
    return result;
  });

  /** Excel önizlemesi: hiçbir şey kaydetmeden yeni / güncellenecek / atlanacak satırları gösterir. */
  app.post(`${base}/import/preview`, { ...write, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const parsed = await parseStudentsWorkbook(await readXlsxUpload(req));
    const schoolId = req.ctx.schoolId;
    const [classes, current] = await Promise.all([
      loadClasses(db, schoolId),
      db
        .select({ fullName: students.fullName, birthDate: students.birthDate, classGroupId: students.classGroupId })
        .from(students)
        .where(eq(students.schoolId, schoolId)),
    ]);
    const byKey = new Map(current.map((s) => [studentKey(s.fullName, s.birthDate), s]));
    const newClasses = new Map<string, string>();
    const seen = new Map<string, number>();
    const issues = [...parsed.issues];

    const rows = parsed.rows.flatMap((r) => {
      const key = studentKey(r.fullName, r.birthDate);
      const first = seen.get(key);
      if (first !== undefined) {
        issues.push({ row: r.row, message: `${r.fullName} dosyada iki kez var (ilk: ${first}. satır); bu satır atlanacak` });
        return [];
      }
      seen.set(key, r.row);
      const cls = r.className ? classes.byKey.get(classKey(r.className)) : undefined;
      if (r.className && !cls) newClasses.set(classKey(r.className), r.className);
      const existing = byKey.get(key);
      const status: 'new' | 'update' | 'unchanged' = !existing
        ? 'new'
        : r.className && (!cls || cls.id !== existing.classGroupId)
          ? 'update'
          : 'unchanged';
      return [{ ...r, status }];
    });

    issues.sort((a, b) => a.row - b.row);
    return {
      sheetName: parsed.sheetName,
      rows,
      issues,
      additions: newClasses.size ? [{ label: 'Oluşturulacak sınıflar', values: [...newClasses.values()].sort(trCompare) }] : [],
      totals: {
        new: rows.filter((r) => r.status === 'new').length,
        update: rows.filter((r) => r.status === 'update').length,
        unchanged: rows.filter((r) => r.status === 'unchanged').length,
        skipped: issues.length,
      },
    };
  });

  app.get(`${base}/template`, read, async (req, reply) => {
    const classes = await loadClasses(db, req.ctx.schoolId);
    const buf = await buildStudentsWorkbook({ classes: classes.rows.map((c) => c.name), schoolName: req.ctx.school.name });
    return sendXlsx(reply, buf, 'ogrenci-sablonu.xlsx');
  });

  /** Sınıf sırasına, sonra ada göre sıralı liste */
  app.get(`${base}/export`, read, async (req, reply) => {
    const schoolId = req.ctx.schoolId;
    const [classes, rows] = await Promise.all([
      loadClasses(db, schoolId),
      db
        .select({ fullName: students.fullName, birthDate: students.birthDate, classGroupId: students.classGroupId })
        .from(students)
        .where(eq(students.schoolId, schoolId)),
    ]);
    const order = (id: string | null) => {
      const c = id ? classes.byId.get(id) : undefined;
      return c ? c.sortOrder : Number.MAX_SAFE_INTEGER;
    };
    rows.sort(
      (a, b) =>
        order(a.classGroupId) - order(b.classGroupId) ||
        trCompare(classes.byId.get(a.classGroupId ?? '')?.name ?? '', classes.byId.get(b.classGroupId ?? '')?.name ?? '') ||
        trCompare(a.fullName, b.fullName),
    );
    const buf = await buildStudentsWorkbook({
      classes: classes.rows.map((c) => c.name),
      schoolName: req.ctx.school.name,
      rows: rows.map((r) => ({
        fullName: r.fullName,
        birthDate: r.birthDate,
        className: r.classGroupId ? (classes.byId.get(r.classGroupId)?.name ?? null) : null,
      })),
    });
    return sendXlsx(reply, buf, exportFileName('ogrenciler', req.ctx.school.name));
  });
}
