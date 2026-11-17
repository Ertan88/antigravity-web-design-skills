import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import cookie from '@fastify/cookie';
import { autoLinkTeachers, autoLinkTeachersForUser } from './lib/teacherLink.ts';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AppDeps } from './context.ts';
import { openDatabase, type Database } from './db/client.ts';
import { loadEnv, type Env } from './env.ts';
import { runMebCalendarJob } from './lib/mebCalendar.ts';
import { errorHandler, unauthorized } from './lib/errors.ts';
import { DisplayBus } from './lib/events.ts';
import { DbStorage, LocalStorage, type FileStorage } from './lib/storage.ts';
import { UUID_RE } from './context.ts';
import { academicCalendarRoutes } from './routes/academicCalendar.ts';
import { conductRoutes, runConductRetention } from './routes/conduct.ts';
import { internshipRoutes } from './routes/internship.ts';
import { examScheduleRoutes } from './routes/examSchedule.ts';
import { issueRoutes, runIssuePhotoRetention } from './routes/issues.ts';
import { runScreenKeyExpiry } from './lib/screenSecurity.ts';
import { authRoutes } from './routes/auth.ts';
import { contentRoutes } from './routes/content.ts';
import { dutyRoutes } from './routes/duties.ts';
import { holidayRoutes } from './routes/holidays.ts';
import { transportRoutes } from './routes/transport.ts';
import { displayRoutes } from './routes/display.ts';
import { emergencyRoutes } from './routes/emergency.ts';
import { notificationRoutes } from './routes/notifications.ts';
import { memberRoutes } from './routes/members.ts';
import { enrollRoutes } from './routes/enroll.ts';
import { loadPlatformMail, platformSettingsRoutes } from './routes/platformSettings.ts';
import { platformAccountsRoutes } from './routes/platformAccounts.ts';
import { runContactRetention, siteRoutes } from './routes/site.ts';
import { runExamReminders } from './lib/examReminders.ts';
import { runScreenOfflineAlerts } from './lib/screenOffline.ts';
import { controlRoutes } from './routes/control.ts';
import { draftRoutes } from './routes/drafts.ts';
import { coverRoutes } from './routes/covers.ts';
import { meRoutes } from './routes/me.ts';
import { bellOverrideRoutes } from './routes/bellOverrides.ts';
import { privacyRoutes } from './routes/privacy.ts';
import { runTrialReminders, signupRoutes } from './routes/signup.ts';
import { eq } from 'drizzle-orm';
import { schoolRoutes } from './routes/schools.ts';
import { screenRoutes } from './routes/screens.ts';
import { studentRoutes } from './routes/students.ts';
import { teacherRoutes } from './routes/teachers.ts';
import { timetableRoutes } from './routes/timetable.ts';
import { timetableImportRoutes } from './routes/timetableImport.ts';

/** Hesap ile öğretmen kaydı eşleşmesini etkileyen yazma istekleri (kadro, ders programı, nöbet, taşımalı, hesaplar) */
const TEACHER_LINK_PATHS = /^\/api\/schools\/[^/]+\/(teacher|timetable|duties|transport|members|enrollments)/;

export interface BuildOptions {
  env?: Partial<Record<keyof Env, unknown>>;
  database?: Database;
  storage?: FileStorage;
  logger?: boolean;
}

export async function buildApp(opts: BuildOptions = {}): Promise<FastifyInstance> {
  const env = loadEnv(opts.env);
  const database = opts.database ?? (await openDatabase({ databaseUrl: env.DATABASE_URL, pgliteDir: env.PGLITE_DIR }));
  const localStorage = new LocalStorage(env.UPLOAD_DIR);
  const dbStorage = env.FILE_STORAGE === 'db' ? new DbStorage(database.db) : null;
  const deps: AppDeps = {
    db: database.db,
    bus: new DisplayBus(),
    storage: opts.storage ?? dbStorage ?? localStorage,
    env,
  };

  const useLogger = opts.logger ?? env.NODE_ENV !== 'test';
  const app = Fastify({
    logger: useLogger
      ? {
          level: env.NODE_ENV === 'production' ? 'info' : 'warn',
          // Ekran anahtarı SSE adresinde sorgu olarak taşınır; loglara yalnızca yol yazılır
          serializers: { req: (req) => ({ method: req.method, url: req.url.split('?')[0] }) },
        }
      : false,
    trustProxy: true,
  });
  app.decorate('deps', deps);
  app.decorateRequest('ctx', null as never);
  app.setErrorHandler(errorHandler);

  await app.register(helmet, {
    // CSP aşağıda yalnızca HTML sayfalarına eklenir (YouTube ve dış görsellere izin veren politika)
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    // YouTube gömülü oynatıcı, kaynağı (Referer) göremezse videoyu oynatmayı reddeder
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });
  /*
   * İçerik Güvenlik Politikası (CSP): panel, pano ve mobil web sayfalarında yalnızca kendi betiklerimiz çalışır; olası bir
   * XSS açığında dışarıdan betik yüklenemez, başka sitelere gömülemez. Görseller (kitap kapağı, duyuru) her HTTPS
   * adresinden, video yalnızca YouTube'dan.
   */
  const CSP = [
    "default-src 'self'",
    "script-src 'self' https://www.youtube.com https://s.ytimg.com",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com",
    "connect-src 'self' https: wss:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join('; ');
  app.addHook('onSend', async (_req, reply, payload) => {
    if (String(reply.getHeader('content-type') ?? '').startsWith('text/html')) reply.header('Content-Security-Policy', CSP);
    return payload;
  });
  // Kadro, ders programı, nöbet ya da hesap değişince hesaplar kadrodaki öğretmen kaydına kendiliğinden bağlanır
  // (müdür ve müdür yardımcısı da öğretmendir; bkz. lib/teacherLink.ts). Yanıttan önce çalışır: ekran güncel veriyle açılır.
  app.addHook('onSend', async (req, reply, payload) => {
    if (req.method === 'GET' || reply.statusCode >= 400) return payload;
    const path = req.url.split('?')[0]!;
    try {
      if (path === '/api/me') {
        const sub = (req.user as { sub?: string } | undefined)?.sub;
        if (sub) await autoLinkTeachersForUser(app.deps.db, sub);
      } else if (req.ctx?.schoolId && TEACHER_LINK_PATHS.test(path)) {
        await autoLinkTeachers(app.deps.db, req.ctx.schoolId);
      }
    } catch (err) {
      req.log.warn({ err }, 'öğretmen kaydı eşleştirilemedi');
    }
    return payload;
  });
  await app.register(cookie);
  await app.register(jwt, { secret: env.JWT_SECRET });
  await app.register(rateLimit, { global: false });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

  app.decorate('authenticate', async (req) => {
    try {
      await req.jwtVerify();
    } catch {
      throw unauthorized();
    }
    if (req.user.typ !== 'access') throw unauthorized();
  });

  app.get('/api/health', async () => ({ ok: true, driver: database.driver, time: new Date().toISOString() }));
  // TV'de kumandayla yazması kolay kısa adres: Okul Yayın Pano uygulamasını indirir ("Downloader" uygulamasıyla)
  app.get('/tv', (_req, reply) => reply.redirect(env.TV_APK_URL));
  // Telefon uygulamasını indirme bağlantısı (panelde ve uygulamanın web sürümünde "İndir")
  app.get('/indir', (_req, reply) => reply.redirect(env.APP_APK_URL));

  await app.register(authRoutes);
  await app.register(schoolRoutes);
  await app.register(memberRoutes);
  await app.register(enrollRoutes);
  await app.register(contentRoutes);
  await app.register(teacherRoutes);
  await app.register(studentRoutes);
  await app.register(dutyRoutes);
  await app.register(transportRoutes);
  await app.register(holidayRoutes);
  await app.register(timetableRoutes);
  await app.register(timetableImportRoutes);
  await app.register(screenRoutes);
  await app.register(displayRoutes);
  await app.register(emergencyRoutes);
  await app.register(notificationRoutes);
  await app.register(controlRoutes);
  await app.register(coverRoutes);
  await app.register(draftRoutes);
  await app.register(meRoutes);
  await app.register(bellOverrideRoutes);
  await app.register(privacyRoutes);
  await app.register(signupRoutes);
  await app.register(academicCalendarRoutes);
  await app.register(conductRoutes);
  await app.register(internshipRoutes);
  await app.register(examScheduleRoutes);
  await app.register(issueRoutes);
  await app.register(platformSettingsRoutes);
  await app.register(platformAccountsRoutes);
  // Tanıtım sitesi (kök adres, iletişim ve yasal sayfalar) ve iletişim formu
  await app.register(siteRoutes);
  // Panelden girilmiş e-posta ayarı (ortam değişkeni yoksa kullanılır)
  await loadPlatformMail(deps).catch((err) => app.log.error(err, 'e-posta ayarı okunamadı'));

  // Deneme süresi hatırlatmaları: açılıştan kısa süre sonra ve saatte bir (testlerde elle çağrılır)
  if (env.NODE_ENV !== 'test') {
    const run = () => {
      void runTrialReminders(deps).catch((err) => app.log.error(err, 'deneme hatırlatması'));
      void runConductRetention(deps).catch((err) => app.log.error(err, 'gözlem saklama süresi'));
      // Uzun süre bağlanmayan panoların anahtarı iptal edilir
      void runScreenKeyExpiry(deps).catch((err) => app.log.error(err, 'pano anahtarı süresi'));
      void runContactRetention(deps).catch((err) => app.log.error(err, 'iletişim talebi saklama süresi'));
      void runIssuePhotoRetention(deps).catch((err) => app.log.error(err, 'sorun fotoğrafı saklama süresi'));
      // MEB çalışma takvimi: haziran ortasından itibaren yayımlanır; her yıl için günde bir deneme
      if (deps.env.MEB_INDEX_URLS) void runMebCalendarJob(deps).catch((err) => app.log.error(err, 'MEB çalışma takvimi'));
    };
    const first = setTimeout(run, 60_000);
    const hourly = setInterval(run, 3600_000);
    // Sınav hatırlatmaları dakika hassasiyetinde (teneffüs başı)
    const minutely = setInterval(() => {
      void runExamReminders(deps).catch((err) => app.log.error(err, 'sınav hatırlatması'));
      // Ders saatlerinde bağlantısı kopan pano: ekranları yönetenlere bildirim
      void runScreenOfflineAlerts(deps).catch((err) => app.log.error(err, 'pano kopma bildirimi'));
    }, 60_000);
    minutely.unref();
    first.unref();
    hourly.unref();
    app.addHook('onClose', async () => {
      clearTimeout(first);
      clearInterval(hourly);
      clearInterval(minutely);
    });
  }

  /* ---------- Statik dosyalar: yüklenen görseller ve derlenmiş ön yüzler ---------- */
  await app.register(fastifyStatic, {
    root: localStorage.root,
    prefix: '/uploads/',
    decorateReply: true,
    maxAge: '30d',
    immutable: true,
    // Görseller veritabanındaysa bu adresleri aşağıdaki rota sunar
    serve: !dbStorage,
  });
  if (dbStorage) {
    app.get('/uploads/:schoolId/:name', async (req, reply) => {
      const { schoolId, name } = req.params as { schoolId: string; name: string };
      if (!UUID_RE.test(schoolId) || !/^[0-9a-f-]{36}\.(png|jpg|gif|webp)$/.test(name)) return reply.status(404).send({ error: 'not_found', message: 'Dosya bulunamadı.' });
      const file = await dbStorage.read(schoolId, name);
      if (!file) return reply.status(404).send({ error: 'not_found', message: 'Dosya bulunamadı.' });
      // Adlar rastgele ve dosyalar değişmez: uzun süre önbelleğe alınabilir
      return reply.header('Cache-Control', 'public, max-age=2592000, immutable').type(file.contentType).send(file.data);
    });
  }

  const spas = [
    { prefix: '/admin/', dir: env.ADMIN_DIST },
    { prefix: '/display/', dir: env.DISPLAY_DIST },
    { prefix: '/app/', dir: env.MOBILE_DIST },
  ].filter((s): s is { prefix: string; dir: string } => Boolean(s.dir && existsSync(resolve(s.dir, 'index.html'))));

  for (const spa of spas) {
    await app.register(fastifyStatic, { root: resolve(spa.dir), prefix: spa.prefix, decorateReply: false });
  }
  if (spas.length) {
    // Tanıtım sitesi yoksa (dosyaları bulunamadıysa) kök adres panele gider
    if (!app.hasRoute({ method: 'GET', url: '/' })) app.get('/', (_req, reply) => reply.redirect('/admin/'));
    app.setNotFoundHandler((req, reply) => {
      const [path = '', query] = req.url.split('?');
      // Sondaki "/" unutulmuş adres (ör. /app, /display) uygulamanın kendisine gider
      const bare = spas.find((s) => path === s.prefix.slice(0, -1));
      if (bare && req.method === 'GET') return reply.redirect(`${bare.prefix}${query ? `?${query}` : ''}`);
      const spa = spas.find((s) => path.startsWith(s.prefix));
      // Sayfa rotaları uygulamanın index.html'ine düşer; eksik dosyalar (.js, .css...) gerçek 404 alır
      if (spa && req.method === 'GET' && !/\.[a-z0-9]+$/i.test(path)) {
        return reply.sendFile('index.html', resolve(spa.dir), { maxAge: 0 });
      }
      return reply.status(404).send({ error: 'not_found', message: 'Sayfa bulunamadı.' });
    });
  }

  app.addHook('onClose', async () => {
    deps.bus.close();
    if (!opts.database) await database.close();
  });

  return app;
}
