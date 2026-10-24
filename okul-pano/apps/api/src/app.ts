import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AppDeps } from './context.ts';
import { openDatabase, type Database } from './db/client.ts';
import { loadEnv, type Env } from './env.ts';
import { errorHandler, unauthorized } from './lib/errors.ts';
import { DisplayBus } from './lib/events.ts';
import { LocalStorage, type FileStorage } from './lib/storage.ts';
import { authRoutes } from './routes/auth.ts';
import { contentRoutes } from './routes/content.ts';
import { displayRoutes } from './routes/display.ts';
import { memberRoutes } from './routes/members.ts';
import { schoolRoutes } from './routes/schools.ts';
import { screenRoutes } from './routes/screens.ts';
import { timetableRoutes } from './routes/timetable.ts';

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
  const deps: AppDeps = {
    db: database.db,
    bus: new DisplayBus(),
    storage: opts.storage ?? localStorage,
    env,
  };

  const useLogger = opts.logger ?? env.NODE_ENV !== 'test';
  const app = Fastify({
    logger: useLogger ? { level: env.NODE_ENV === 'production' ? 'info' : 'warn' } : false,
    trustProxy: true,
  });
  app.decorate('deps', deps);
  app.decorateRequest('ctx', null as never);
  app.setErrorHandler(errorHandler);

  await app.register(helmet, {
    // Pano YouTube videolarını gömdüğü için CSP, ön yüz uygulamalarının kendi başlıklarında yönetilir.
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
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

  await app.register(authRoutes);
  await app.register(schoolRoutes);
  await app.register(memberRoutes);
  await app.register(contentRoutes);
  await app.register(timetableRoutes);
  await app.register(screenRoutes);
  await app.register(displayRoutes);

  /* ---------- Statik dosyalar: yüklenen görseller ve derlenmiş ön yüzler ---------- */
  await app.register(fastifyStatic, {
    root: localStorage.root,
    prefix: '/uploads/',
    decorateReply: true,
    maxAge: '30d',
    immutable: true,
  });

  const spas = [
    { prefix: '/admin/', dir: env.ADMIN_DIST },
    { prefix: '/display/', dir: env.DISPLAY_DIST },
  ].filter((s): s is { prefix: string; dir: string } => Boolean(s.dir && existsSync(resolve(s.dir, 'index.html'))));

  for (const spa of spas) {
    await app.register(fastifyStatic, { root: resolve(spa.dir), prefix: spa.prefix, decorateReply: false });
  }
  if (spas.length) {
    app.get('/', (_req, reply) => reply.redirect('/admin/'));
    app.setNotFoundHandler((req, reply) => {
      const path = req.url.split('?')[0] ?? '';
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
