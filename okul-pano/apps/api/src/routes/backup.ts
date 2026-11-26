import { schoolSettingsSchema } from '@okulpano/shared';
import { and, desc, eq, getTableColumns, inArray } from 'drizzle-orm';
import { getTableConfig, type PgColumn, type PgTable } from 'drizzle-orm/pg-core';
import type { FastifyInstance } from 'fastify';
import JSZip from 'jszip';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { audit, schoolGuard } from '../context.ts';
import * as schema from '../db/schema.ts';
import { badRequest, forbidden, parse } from '../lib/errors.ts';
import { detectImageType, IMAGE_TYPES } from '../lib/storage.ts';

/*
 * Okul yedeği (ücretli sürüm): okulun bütün kayıtları ve görselleri tek ZIP dosyasında iner; aynı okula geri
 * yüklenebilir. Hesaplar, üyelikler, panolar (TV eşleştirmeleri), bildirimler ve platformla yazışmalar yedeğe girmez
 * ve geri yüklemede değişmez. Geri yükleme yalnızca aynı okulun yedeğini kabul eder; başka okula ya da başka okulun
 * kaydına bağlanan satırlar alınmaz (KVKK: okullar birbirinden ayrıdır).
 */

const FORMAT = 'okulyayin-okul-yedegi';
const VERSION = 1;
/** Geri yüklenecek dosyanın en büyük boyutu */
const MAX_BYTES = 150 * 1024 * 1024;

type SchoolTable = PgTable & { schoolId: PgColumn };

/** Okul verisi tabloları, bağımlılık sırasıyla (önce başvurulan). Silme bunun tersi sırayla yapılır. */
const TABLES: [string, SchoolTable][] = [
  ['branslar', schema.teacherBranches],
  ['unvanlar', schema.teacherTitles],
  ['ogretmenler', schema.teachers],
  ['siniflar', schema.classGroups],
  ['isletmeler', schema.businesses],
  ['ogrenciler', schema.students],
  ['stajDonemleri', schema.internshipPeriods],
  ['stajDevam', schema.internshipMarks],
  ['nobetler', schema.duties],
  ['nobetciMudurYardimcilari', schema.dutySupervisors],
  ['nobetGorevlendirmeleri', schema.dutySubstitutions],
  ['tasimaliGorevliler', schema.transportDuties],
  ['izinler', schema.teacherLeaves],
  ['dersGorevlendirmeleri', schema.lessonCovers],
  ['tatiller', schema.schoolHolidays],
  ['sinavlar', schema.exams],
  ['sinavTakvimi', schema.examSchedule],
  ['basarilar', schema.achievements],
  ['etkinlikler', schema.schoolEvents],
  ['kitaplar', schema.books],
  ['duyurular', schema.announcements],
  ['kayanYazi', schema.tickerItems],
  ['zilCizelgeleri', schema.bellSchedules],
  ['zilDegisiklikleri', schema.bellOverrides],
  ['dersProgrami', schema.timetableEntries],
  ['gozlemKriterleri', schema.conductCriteria],
  ['gozlemKayitlari', schema.conductEntries],
  ['ayinOgrencisi', schema.conductAwards],
  ['rehberlikUyarilari', schema.conductAlerts],
  ['okulSorunlari', schema.schoolIssues],
];
/** Okul kimliği olmayan, sorunlara bağlı yazışmalar */
const ISSUE_MESSAGES = 'okulSorunuYazismalari';

const usersTable = getTableConfig(schema.users).name;

/** Tablonun sütunları: anahtar (JS) → sütun; tarih sütunları ve başka tablolara başvurular */
function shapeOf(table: PgTable) {
  const cols = getTableColumns(table) as Record<string, PgColumn>;
  const byDbName = new Map(Object.entries(cols).map(([key, col]) => [col.name, key]));
  const refs = getTableConfig(table).foreignKeys.flatMap((fk) => {
    const r = fk.reference();
    if (r.columns.length !== 1) return [];
    const key = byDbName.get(r.columns[0]!.name);
    return key ? [{ key, target: getTableConfig(r.foreignTable).name, nullable: !cols[key]!.notNull }] : [];
  });
  return { cols, refs };
}

export interface BackupStatus {
  allowed: boolean;
  /** Ücretsiz denemede kilitli */
  locked: boolean;
  lastBackupAt: string | null;
  lastRestoreAt: string | null;
}

export async function backupRoutes(app: FastifyInstance) {
  const { db, env, bus } = app.deps;
  const guard = { preHandler: [app.authenticate, schoolGuard()] };

  /** Yalnızca okul müdürü (ve süreli destek erişimiyle platform yöneticisi); ücretsiz denemede kilitli */
  const check = (req: Parameters<typeof audit>[0]) => {
    const { role, isSuperAdmin, school } = req.ctx;
    if (role !== 'owner' && !isSuperAdmin) throw forbidden('Okul yedeğini yalnızca okul müdürü alabilir ve geri yükleyebilir.');
    if (school.plan === 'trial') throw forbidden('Okul yedeği ücretli sürümde kullanılır.');
  };

  const lastOf = async (schoolId: string, action: string) => {
    const [row] = await db
      .select({ at: schema.auditLogs.createdAt })
      .from(schema.auditLogs)
      .where(and(eq(schema.auditLogs.schoolId, schoolId), eq(schema.auditLogs.entity, 'backup'), eq(schema.auditLogs.action, action)))
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(1);
    return row?.at.toISOString() ?? null;
  };

  app.get('/api/schools/:schoolId/backup', guard, async (req): Promise<BackupStatus> => {
    const { role, isSuperAdmin, school, schoolId } = req.ctx;
    return {
      allowed: role === 'owner' || isSuperAdmin,
      locked: school.plan === 'trial',
      lastBackupAt: await lastOf(schoolId, 'backup'),
      lastRestoreAt: await lastOf(schoolId, 'restore'),
    };
  });

  /* ---------- Görseller: yerel disk ya da veritabanı ---------- */

  async function readImages(schoolId: string): Promise<{ name: string; data: Buffer }[]> {
    if (env.FILE_STORAGE === 'db') {
      const rows = await db.select({ name: schema.storedFiles.name, data: schema.storedFiles.data }).from(schema.storedFiles).where(eq(schema.storedFiles.schoolId, schoolId));
      return rows.map((r) => ({ name: r.name, data: Buffer.from(r.data) }));
    }
    const dir = join(resolve(env.UPLOAD_DIR), schoolId);
    const names = await readdir(dir).catch(() => [] as string[]);
    return Promise.all(names.map(async (name) => ({ name, data: await readFile(join(dir, name)) })));
  }

  async function replaceImages(schoolId: string, files: { name: string; data: Buffer }[]) {
    if (env.FILE_STORAGE === 'db') {
      await db.delete(schema.storedFiles).where(eq(schema.storedFiles.schoolId, schoolId));
      for (const f of files) {
        const ext = f.name.split('.').pop()!;
        await db.insert(schema.storedFiles).values({ schoolId, name: f.name, contentType: IMAGE_TYPES[ext]!, data: f.data });
      }
      return;
    }
    const dir = join(resolve(env.UPLOAD_DIR), schoolId);
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    for (const f of files) await writeFile(join(dir, f.name), f.data);
  }

  /* ---------- Yedek al ---------- */

  app.get('/api/schools/:schoolId/backup.zip', guard, async (req, reply) => {
    check(req);
    const { schoolId, school } = req.ctx;
    const zip = new JSZip();
    const counts: Record<string, number> = {};
    const issueIds: string[] = [];
    for (const [name, table] of TABLES) {
      const rows = (await db.select().from(table).where(eq(table.schoolId, schoolId))) as Record<string, unknown>[];
      if (table === schema.schoolIssues) issueIds.push(...rows.map((r) => r.id as string));
      counts[name] = rows.length;
      zip.file(`veri/${name}.json`, JSON.stringify(rows));
    }
    const messages = issueIds.length ? await db.select().from(schema.schoolIssueMessages).where(inArray(schema.schoolIssueMessages.issueId, issueIds)) : [];
    counts[ISSUE_MESSAGES] = messages.length;
    zip.file(`veri/${ISSUE_MESSAGES}.json`, JSON.stringify(messages));
    const images = await readImages(schoolId);
    for (const f of images) zip.file(`gorseller/${f.name}`, f.data);
    zip.file(
      'yedek.json',
      JSON.stringify(
        { format: FORMAT, version: VERSION, schoolId, schoolName: school.name, createdAt: new Date().toISOString(), counts, images: images.length, settings: school.settings ?? {} },
        null,
        2,
      ),
    );
    const data = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    await audit(req, 'backup', 'backup', null, `Okul yedeği alındı (${images.length} görsel)`);
    const day = new Date().toISOString().slice(0, 10);
    return reply
      .header('Content-Type', 'application/zip')
      .header('Content-Disposition', `attachment; filename="okul-yedegi-${school.slug}-${day}.zip"`)
      .header('Cache-Control', 'no-store')
      .send(data);
  });

  /* ---------- Geri yükle ---------- */

  const confirmSchema = z.object({ confirm: z.string().trim().min(1) });

  app.post('/api/schools/:schoolId/backup/restore', { ...guard, config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (req) => {
    check(req);
    const { schoolId, school, userId } = req.ctx;
    const { confirm } = parse(confirmSchema, req.query);
    if (confirm !== school.slug) throw badRequest(`Onay için okulun kısa adını yazın: ${school.slug}`);
    const file = await req.file({ limits: { fileSize: MAX_BYTES, files: 1 } });
    if (!file) throw badRequest('Yedek dosyası bulunamadı.');
    const buf = await file.toBuffer().catch(() => {
      throw badRequest('Yedek dosyası çok büyük.');
    });
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(buf);
    } catch {
      throw badRequest('Dosya okunamadı. Okul Yayın’dan indirilen yedek (ZIP) dosyasını seçin.');
    }
    const manifestText = await zip.file('yedek.json')?.async('string');
    const manifest = (() => {
      try {
        return manifestText ? (JSON.parse(manifestText) as { format?: string; version?: number; schoolId?: string; createdAt?: string; settings?: unknown }) : null;
      } catch {
        return null;
      }
    })();
    if (!manifest || manifest.format !== FORMAT) throw badRequest('Bu dosya bir Okul Yayın okul yedeği değil.');
    if ((manifest.version ?? 0) > VERSION) throw badRequest('Yedek daha yeni bir sürümle alınmış; önce uygulamayı güncelleyin.');
    if (manifest.schoolId !== schoolId) throw badRequest('Bu yedek başka bir okula ait. Yalnızca bu okulun yedeği geri yüklenebilir.');

    // Veri: her tablo için satırlar; okul kimliği bu okul olarak zorlanır
    const data = new Map<string, Record<string, unknown>[]>();
    for (const [name] of [...TABLES, [ISSUE_MESSAGES]] as [string][]) {
      const text = await zip.file(`veri/${name}.json`)?.async('string');
      let rows: unknown = [];
      try {
        rows = text ? JSON.parse(text) : [];
      } catch {
        throw badRequest('Yedek dosyası bozuk.');
      }
      if (!Array.isArray(rows)) throw badRequest('Yedek dosyası bozuk.');
      data.set(name, rows.filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === 'object'));
    }
    // Görseller: yalnızca gerçek görsel dosyaları, güvenli adlarla
    const images: { name: string; data: Buffer }[] = [];
    for (const entry of Object.values(zip.files)) {
      const m = /^gorseller\/([0-9a-f-]{36}\.(?:png|jpg|gif|webp))$/.exec(entry.name);
      if (!m || entry.dir) continue;
      const bytes = await entry.async('nodebuffer');
      if (detectImageType(bytes) === m[1]!.split('.').pop()) images.push({ name: m[1]!, data: bytes });
    }

    // Kullanıcı başvuruları: yalnızca bu okulun üyeleri (yoksa boş bırakılır)
    const members = new Set((await db.select({ id: schema.memberships.userId }).from(schema.memberships).where(eq(schema.memberships.schoolId, schoolId))).map((m) => m.id));
    members.add(userId);

    const restored: Record<string, number> = {};
    await db.transaction(async (tx) => {
      // Üyeliklerin öğretmen bağlantısı öğretmenler silinince boşalır; geri yüklemeden sonra yeniden kurulur
      const links = await tx.select({ id: schema.memberships.id, teacherId: schema.memberships.teacherId }).from(schema.memberships).where(eq(schema.memberships.schoolId, schoolId));
      for (const [, table] of [...TABLES].reverse()) await tx.delete(table).where(eq(table.schoolId, schoolId));

      /** Geri yüklenen kimlikler (tablo adı → kimlikler): başvurular yalnızca bunlara bağlanabilir */
      const ids = new Map<string, Set<string>>();
      const insertRows = async (name: string, table: PgTable, force: Record<string, unknown>) => {
        const { cols, refs } = shapeOf(table);
        const tname = getTableConfig(table).name;
        const out: Record<string, unknown>[] = [];
        for (const raw of data.get(name) ?? []) {
          const row: Record<string, unknown> = {};
          for (const [key, col] of Object.entries(cols)) {
            if (!(key in raw)) continue;
            let v = raw[key];
            if (v != null && col.dataType === 'date') v = new Date(v as string);
            row[key] = v;
          }
          Object.assign(row, force);
          if (typeof row.id !== 'string') continue;
          let ok = true;
          for (const ref of refs) {
            const v = row[ref.key];
            if (v == null || ref.target === 'schools') continue;
            const known = ref.target === usersTable ? members.has(v as string) : ids.get(ref.target)?.has(v as string);
            if (known) continue;
            if (ref.nullable) row[ref.key] = null;
            else ok = false;
          }
          if (ok) out.push(row);
        }
        for (let i = 0; i < out.length; i += 200) await tx.insert(table).values(out.slice(i, i + 200) as never);
        ids.set(tname, new Set(out.map((r) => r.id as string)));
        restored[name] = out.length;
      };
      for (const [name, table] of TABLES) await insertRows(name, table, { schoolId });
      await insertRows(ISSUE_MESSAGES, schema.schoolIssueMessages, {});

      const teachers = ids.get(getTableConfig(schema.teachers).name)!;
      for (const l of links) {
        if (l.teacherId && teachers.has(l.teacherId)) await tx.update(schema.memberships).set({ teacherId: l.teacherId }).where(eq(schema.memberships.id, l.id));
      }
      // Okul ayarları (ad, plan ve kısa ad değişmez)
      const settings = schoolSettingsSchema.safeParse(manifest.settings ?? {});
      if (settings.success) await tx.update(schema.schools).set({ settings: settings.data as never }).where(eq(schema.schools.id, schoolId));
    });
    await replaceImages(schoolId, images);
    await audit(req, 'restore', 'backup', null, `Yedek geri yüklendi (${manifest.createdAt?.slice(0, 10) ?? '?'} tarihli)`);
    bus.contentChanged(schoolId);
    return { ok: true, createdAt: manifest.createdAt ?? null, restored, images: images.length };
  });
}
