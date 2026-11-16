import fastifyStatic from '@fastify/static';
import { and, desc, eq, lt } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { accessUser, UUID_RE, type AppDeps } from '../context.ts';
import { contactRequests, users } from '../db/schema.ts';
import { badRequest, forbidden, notFound, parse } from '../lib/errors.ts';
import { trySendMail } from '../lib/mailer.ts';
import { contactPage, homePage, legalPages, siteInfo } from '../site/pages.ts';
import { tell } from './issues.ts';

const TOPIC_LABEL = { demo: 'Tanıtım isteği', quote: 'Fiyat teklifi', question: 'Soru' } as const;

const contactSchema = z.object({
  topic: z.enum(['demo', 'quote', 'question']),
  name: z.string().trim().min(2, 'Adınızı yazın.').max(120),
  role: z.string().trim().min(1, 'Görevinizi seçin.').max(60),
  school: z.string().trim().min(2, 'Okul ya da kurum adını yazın.').max(200),
  city: z.string().trim().min(2, 'İl ve ilçeyi yazın.').max(120),
  email: z.string().trim().max(200).pipe(z.email('Geçerli bir e-posta adresi yazın.')),
  phone: z.string().trim().max(30).nullish().transform((v) => v || null),
  time: z.string().trim().max(60).nullish().transform((v) => v || null),
  message: z.string().trim().min(5, 'Mesajınızı yazın.').max(3000),
  consent: z.literal(true, { error: 'Aydınlatma metnini okuduğunuzu onaylayın.' }),
  website: z.string().max(200).optional().default(''),
});

/** KVKK: yanıtlanan iletişim talepleri 1 yıl, yanıtlanmayanlar 2 yıl sonra silinir */
export async function runContactRetention(deps: AppDeps) {
  const day = 86_400_000;
  await deps.db.delete(contactRequests).where(and(eq(contactRequests.status, 'done'), lt(contactRequests.createdAt, new Date(Date.now() - 365 * day))));
  await deps.db.delete(contactRequests).where(lt(contactRequests.createdAt, new Date(Date.now() - 730 * day)));
}

/**
 * Tanıtım sitesi: kökte tanıtım sayfası, /iletisim ve yasal sayfalar; /site/ altında stil, betik ve görseller.
 * İletişim formu /api/contact'a yazar; talepler platform yöneticisine bildirilir ve panelde listelenir.
 */
export async function siteRoutes(app: FastifyInstance) {
  const deps = app.deps;
  const { db, env } = deps;
  const dir = resolve(env.SITE_DIR);
  const hasAssets = existsSync(resolve(dir, 'site.css'));

  if (hasAssets) {
    await app.register(fastifyStatic, { root: dir, prefix: '/site/', decorateReply: false, maxAge: '1d' });
  }

  const html = (body: string) => (_req: FastifyRequest, reply: import('fastify').FastifyReply) =>
    reply.header('Cache-Control', 'public, max-age=300').type('text/html; charset=utf-8').send(body);

  // Sayfalar her istekte yeniden üretilmez: ortam değişkenleri yalnızca açılışta okunur
  const info = siteInfo(env);
  if (hasAssets) {
    app.get('/', html(homePage(info)));
    app.get('/iletisim', html(contactPage(info)));
    for (const [path, render] of Object.entries(legalPages)) app.get(path, html(render(info)));
  }

  app.post('/api/contact', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (req, reply) => {
    const body = parse(contactSchema, req.body);
    // Bot tuzağı doluysa kaydedilmiş gibi davranılır
    if (body.website) return reply.status(202).send({ ok: true });
    const [row] = await db
      .insert(contactRequests)
      .values({
        topic: body.topic,
        name: body.name,
        role: body.role,
        school: body.school,
        city: body.city,
        email: body.email.toLowerCase(),
        phone: body.phone,
        preferredTime: body.time,
        message: body.message,
      })
      .returning({ id: contactRequests.id });
    const admins = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.isSuperAdmin, true));
    const title = `${TOPIC_LABEL[body.topic]}: ${body.school}`;
    await tell(
      deps,
      admins.map((a) => a.id),
      { kind: 'contact', title, body: `${body.name} (${body.role}), ${body.city}`, to: '/platform/iletisim' },
    );
    const to = env.CONTACT_EMAIL ?? admins[0]?.email;
    if (to) {
      void trySendMail(env, {
        to,
        subject: `Okul Yayın · ${title}`,
        text: [
          `Konu: ${TOPIC_LABEL[body.topic]}`,
          `Ad soyad: ${body.name}`,
          `Görev: ${body.role}`,
          `Okul / kurum: ${body.school}`,
          `İl / ilçe: ${body.city}`,
          `E-posta: ${body.email}`,
          `Telefon: ${body.phone ?? '-'}`,
          `Uygun zaman: ${body.time ?? '-'}`,
          '',
          body.message,
          '',
          `Panelde: ${env.PUBLIC_URL.replace(/\/$/, '')}/admin/platform/iletisim`,
        ].join('\n'),
      });
    }
    return reply.status(201).send({ ok: true, id: row!.id });
  });

  /* ---------- Platform yöneticisi: iletişim talepleri ---------- */
  const platform = {
    preHandler: [
      app.authenticate,
      async (req: FastifyRequest) => {
        if (!accessUser(req).sa) throw forbidden();
      },
    ],
  };

  app.get('/api/platform/contact', platform, async () => db.select().from(contactRequests).orderBy(desc(contactRequests.createdAt)).limit(500));

  app.patch('/api/platform/contact/:id', platform, async (req) => {
    const { id } = req.params as { id: string };
    if (!UUID_RE.test(id)) throw notFound('Talep bulunamadı.');
    const { status } = parse(z.object({ status: z.enum(['new', 'done']) }), req.body);
    const [row] = await db
      .update(contactRequests)
      .set({ status, handledAt: status === 'done' ? new Date() : null })
      .where(eq(contactRequests.id, id))
      .returning();
    if (!row) throw notFound('Talep bulunamadı.');
    return row;
  });

  app.delete('/api/platform/contact/:id', platform, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!UUID_RE.test(id)) throw badRequest('Geçersiz talep.');
    await db.delete(contactRequests).where(eq(contactRequests.id, id));
    return reply.status(204).send();
  });
}
