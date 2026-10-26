import { deleteSchoolSchema, schoolSettingsSchema } from '@okulpano/shared';
import { eq, inArray, getTableColumns } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { readdir, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { accessUser, schoolGuard, UUID_RE } from '../context.ts';
import * as schema from '../db/schema.ts';
import { badRequest, forbidden, notFound, parse } from '../lib/errors.ts';
import { IMAGE_TYPES } from '../lib/storage.ts';

const { memberships, schools, users } = schema;

/** Okula ait bütün tablolar (dışa aktarma). Gizli alanlar (anahtar özetleri) çıkarılır. */
const SCHOOL_TABLES: Record<string, PgTable & { schoolId: PgColumn }> = {
  ogretmenler: schema.teachers,
  branslar: schema.teacherBranches,
  unvanlar: schema.teacherTitles,
  siniflar: schema.classGroups,
  ogrenciler: schema.students,
  nobetler: schema.duties,
  nobetciMudurYardimcilari: schema.dutySupervisors,
  nobetGorevlendirmeleri: schema.dutySubstitutions,
  tasimaliGorevliler: schema.transportDuties,
  izinler: schema.teacherLeaves,
  tatiller: schema.schoolHolidays,
  gunPlanlari: schema.dayPlans,
  sinavlar: schema.exams,
  basarilar: schema.achievements,
  etkinlikler: schema.schoolEvents,
  kitaplar: schema.books,
  duyurular: schema.announcements,
  kayanYazi: schema.tickerItems,
  anlikMesajlar: schema.flashMessages,
  zilCizelgeleri: schema.bellSchedules,
  dersProgrami: schema.timetableEntries,
  etkinlikGecmisi: schema.auditLogs,
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Düz metin → basit HTML: "# " başlık, "- " madde, boş satır paragraf */
function noticeHtml(text: string): string {
  const out: string[] = [];
  let list = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('- ')) {
      if (!list) out.push('<ul>');
      list = true;
      out.push(`<li>${esc(line.slice(2))}</li>`);
      continue;
    }
    if (list) out.push('</ul>');
    list = false;
    if (!line) continue;
    if (line.startsWith('# ')) out.push(`<h2>${esc(line.slice(2))}</h2>`);
    else out.push(`<p>${esc(line)}</p>`);
  }
  if (list) out.push('</ul>');
  return out.join('\n');
}

/**
 * KVKK aydınlatma metni şablonu. Veri sorumlusu okuldur (Okul Pano veri işleyendir). Okula özel bilgiler
 * (adres, iletişim) köşeli parantezle bırakılır; okul kendi bilgisiyle doldurur ve hukukçusuna kontrol ettirir.
 */
export function privacyTemplate(schoolName: string, dataRegion: string): string {
  return `# ${schoolName} · Kişisel Verilerin Korunması Aydınlatma Metni

6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) kapsamında veri sorumlusu ${schoolName} olarak, okul içi dijital pano ve mobil uygulama (Okul Pano) aracılığıyla işlenen kişisel verileriniz hakkında sizi bilgilendiririz.

# Hangi veriler işlenir
- Öğretmen ve personel: ad soyad, branş ve unvan, nöbet yeri ve günleri, ders programı, izin tarihleri, panel kullanıcılarının e-posta adresi ve işlem kayıtları
- Öğrenci: ad soyad (panoda kısaltılmış biçimde, ör. "Ayşe Y."), sınıf, doğum günü (yalnızca gün ve ay)
- Başarılar ve ayın öğrencisi: öğrencinin adı, sınıfı, başarısı ve fotoğrafı (yalnızca velinin açık rızasıyla)

# İşleme amaçları
- Okul içi duyuru ve bilgilendirme, nöbet ve ders düzeninin duyurulması
- Öğrenci başarılarının ve doğum günlerinin okul içinde kutlanması
- Acil durumlarda (deprem, yangın, tahliye) okuldaki herkesin hızla uyarılması

# Hukuki sebepler
Veriler KVKK'nın 5. maddesindeki kanunlarda açıkça öngörülme, veri sorumlusunun hukuki yükümlülüğü ve meşru menfaati sebeplerine dayanılarak; öğrenci fotoğrafı ve başarı paylaşımı ise velinin açık rızasıyla işlenir. Açık rıza her zaman geri alınabilir.

# Saklama ve aktarım
Veriler ${dataRegion} sunucularında saklanır ve okul dışındaki kişilerle paylaşılmaz. Panolar okul binası içinde gösterilir. Hizmet sağlayıcı (Okul Pano) verileri yalnızca okul adına, veri işleyen olarak işler. İçerikler yayın süresi bitince panodan kalkar; okulun aboneliği sona erdiğinde veriler silinir.

# Toplama yöntemi
Veriler okul idaresince yönetim paneline elektronik ortamda girilerek ya da Excel dosyasıyla aktarılarak toplanır.

# Haklarınız
KVKK'nın 11. maddesi uyarınca kişisel verilerinizin işlenip işlenmediğini öğrenme, bilgi isteme, düzeltilmesini ya da silinmesini isteme ve itiraz etme haklarına sahipsiniz. Başvurularınızı [okul adresi] adresine yazılı olarak ya da [okul e-posta adresi] adresine iletebilirsiniz.
`;
}

/**
 * KVKK: herkese açık aydınlatma metni sayfası, okulun bütün verisini dışa aktarma (okul sahibi) ve okulu
 * bütün verileriyle silme (platform yöneticisi; abonelik bitince).
 */
export async function privacyRoutes(app: FastifyInstance) {
  const { db, env, bus } = app.deps;

  /** Herkese açık aydınlatma metni: velilere bağlantı ya da QR kodla verilir */
  app.get('/aydinlatma/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const [school] = /^[a-z0-9-]{3,60}$/.test(slug) ? await db.select().from(schools).where(eq(schools.slug, slug)) : [];
    const notice = school ? schoolSettingsSchema.parse(school.settings ?? {}).privacyNotice.trim() : '';
    const body = notice
      ? noticeHtml(notice)
      : `<h2>Aydınlatma metni bulunamadı</h2><p>${school ? 'Bu okul henüz aydınlatma metnini yayınlamadı.' : 'Böyle bir okul bulunamadı.'}</p>`;
    return reply
      .status(notice ? 200 : 404)
      .header('Cache-Control', 'no-store')
      .type('text/html; charset=utf-8')
      .send(`<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(school?.name ?? 'Okul Pano')} · Aydınlatma Metni</title>
<style>
body{margin:0;background:#f3f6f8;color:#0f172a;font:16px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:760px;margin:0 auto;padding:32px 20px 64px}
article{background:#fff;border:1px solid #e2e8ee;border-radius:16px;padding:24px 28px}
h2{font-size:19px;margin:24px 0 8px}h2:first-child{margin-top:0;font-size:23px}
ul{padding-left:22px}footer{margin-top:16px;color:#475569;font-size:13px;text-align:center}
</style></head>
<body><main><article>${body}</article><footer>Okul Pano</footer></main></body></html>`);
  });

  app.get('/api/schools/:schoolId/privacy-template', { preHandler: [app.authenticate, schoolGuard('settings.manage')] }, async (req) => ({
    text: privacyTemplate(req.ctx.school.name, env.DATA_REGION),
  }));

  /** Okulun bütün verisi tek dosyada (veri taşınabilirliği). Şifre özetleri ve cihaz anahtarları yer almaz. */
  app.get('/api/schools/:schoolId/export', { preHandler: [app.authenticate, schoolGuard()] }, async (req, reply) => {
    const { schoolId, school, role, isSuperAdmin } = req.ctx;
    if (role !== 'owner' && !isSuperAdmin) throw forbidden('Verileri yalnızca okul sahibi dışa aktarabilir.');
    const data: Record<string, unknown> = {};
    for (const [name, table] of Object.entries(SCHOOL_TABLES)) {
      data[name] = await db.select().from(table as PgTable).where(eq(table.schoolId, schoolId));
    }
    const { tokenHash: _t, ...screenCols } = getTableColumns(schema.screens);
    data.panolar = await db.select(screenCols).from(schema.screens).where(eq(schema.screens.schoolId, schoolId));
    data.kullanicilar = await db
      .select({ email: users.email, fullName: users.fullName, role: memberships.role, permissions: memberships.permissions, teacherId: memberships.teacherId })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.schoolId, schoolId));
    data.gorseller = await exportFiles(schoolId);

    const { emergency: _e, ...schoolRow } = school;
    const day = new Date().toISOString().slice(0, 10);
    return reply
      .header('Content-Disposition', `attachment; filename="okul-pano-${school.slug}-${day}.json"`)
      .send({ disaAktarmaTarihi: new Date().toISOString(), okul: schoolRow, ...data });
  });

  async function exportFiles(schoolId: string) {
    if (env.FILE_STORAGE === 'db') {
      const rows = await db.select().from(schema.storedFiles).where(eq(schema.storedFiles.schoolId, schoolId));
      return rows.map((r) => ({ adres: `/uploads/${schoolId}/${r.name}`, tur: r.contentType, base64: r.data.toString('base64') }));
    }
    const dir = join(resolve(env.UPLOAD_DIR), schoolId);
    const names = await readdir(dir).catch(() => [] as string[]);
    return Promise.all(
      names.map(async (name) => ({
        adres: `/uploads/${schoolId}/${name}`,
        tur: IMAGE_TYPES[name.split('.').pop() ?? ''] ?? 'application/octet-stream',
        base64: (await readFile(join(dir, name))).toString('base64'),
      })),
    );
  }

  /**
   * Okulu bütün verileriyle siler (abonelik bitince ya da okul isteyince). Yalnızca platform yöneticisi;
   * okulun kısa adı yazılarak onaylanır. Başka okulda üyeliği kalmayan kullanıcı hesapları da silinir.
   */
  app.delete('/api/platform/schools/:id', { preHandler: [app.authenticate] }, async (req: FastifyRequest) => {
    if (!accessUser(req).sa) throw forbidden();
    const { id } = req.params as { id: string };
    if (!UUID_RE.test(id)) throw notFound();
    const { confirmSlug } = parse(deleteSchoolSchema, req.body);
    const [school] = await db.select().from(schools).where(eq(schools.id, id));
    if (!school) throw notFound('Okul bulunamadı.');
    if (confirmSlug !== school.slug) throw badRequest(`Onay için okulun kısa adını yazın: ${school.slug}`);

    const memberIds = (await db.select({ userId: memberships.userId }).from(memberships).where(eq(memberships.schoolId, id))).map((m) => m.userId);
    // Okula bağlı her şey (öğretmenler, öğrenciler, duyurular, görseller, kayıtlar…) yabancı anahtarla birlikte silinir
    await db.delete(schools).where(eq(schools.id, id));
    let removedUsers = 0;
    if (memberIds.length) {
      const still = new Set((await db.select({ userId: memberships.userId }).from(memberships).where(inArray(memberships.userId, memberIds))).map((m) => m.userId));
      const orphans = (await db.select({ id: users.id, sa: users.isSuperAdmin }).from(users).where(inArray(users.id, memberIds))).filter(
        (u) => !u.sa && !still.has(u.id),
      );
      if (orphans.length) {
        await db.delete(users).where(inArray(users.id, orphans.map((u) => u.id)));
        removedUsers = orphans.length;
      }
    }
    await rm(join(resolve(env.UPLOAD_DIR), id), { recursive: true, force: true });
    // Bu okulun panoları yeniden yüklenip eşleştirme ekranına düşer
    bus.publish(id, { type: 'command', command: 'reload', screenId: null });
    req.log.warn({ schoolId: id, slug: school.slug, removedUsers }, 'Okul ve verileri silindi');
    return { ok: true, removedUsers };
  });
}
