import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../context.ts';
import { accessUser } from '../context.ts';
import { platformSettings, users } from '../db/schema.ts';
import { decryptSecret, encryptSecret } from '../lib/crypto.ts';
import { badRequest, forbidden, parse } from '../lib/errors.ts';
import { mailSource, parseFrom, sendWithOverride, setMailOverride, type MailOverride } from '../lib/mailer.ts';

/** Saklanan biçim: anahtar şifreli; gönderen açık */
interface StoredMail {
  brevoApiKey: string;
  from: string;
}

const fromSchema = z
  .string()
  .trim()
  .min(3)
  .max(200)
  .refine((v) => z.email().safeParse(parseFrom(v).email).success, 'Gönderen e-posta adresi geçersiz');

const mailSchema = z.object({
  /** Boş bırakılırsa kayıtlı anahtar korunur */
  brevoApiKey: z.string().trim().max(200).optional(),
  from: fromSchema,
});

/** Kayıtlı ayarı okur ve çözer (anahtar çözülemezse null) */
async function readMail(deps: Pick<AppDeps, 'db' | 'env'>): Promise<{ cfg: MailOverride | null; updatedAt: Date | null; broken: boolean }> {
  const [row] = await deps.db.select().from(platformSettings).where(eq(platformSettings.key, 'mail'));
  if (!row) return { cfg: null, updatedAt: null, broken: false };
  const stored = row.value as unknown as StoredMail;
  const key = decryptSecret(stored.brevoApiKey, deps.env.JWT_SECRET);
  return { cfg: key ? { brevoApiKey: key, from: stored.from } : null, updatedAt: row.updatedAt, broken: !key };
}

/** Açılışta panelden girilmiş e-posta ayarını yükler (ortam değişkeni varsa o geçerli kalır) */
export async function loadPlatformMail(deps: Pick<AppDeps, 'db' | 'env'>) {
  const { cfg } = await readMail(deps);
  setMailOverride(deps.env, cfg);
}

const mask = (key: string) => `••••${key.slice(-4)}`;

/**
 * Platform yöneticisi: e-posta gönderim ayarı (Brevo API anahtarı ve gönderen). Sunucuya erişmeden (ör. Render)
 * panelden girilir; anahtar şifreli saklanır ve hiçbir zaman tam olarak geri gösterilmez.
 */
export async function platformSettingsRoutes(app: FastifyInstance) {
  const { db, env } = app.deps;
  const platform = {
    preHandler: [
      app.authenticate,
      async (req: Parameters<typeof app.authenticate>[0]) => {
        if (!accessUser(req).sa) throw forbidden();
      },
    ],
  };

  const view = async () => {
    const { cfg, updatedAt, broken } = await readMail(app.deps);
    return {
      /** Ortam değişkeniyle ayarlıysa panel ayarı kullanılmaz */
      source: mailSource(env),
      envConfigured: mailSource(env) === 'env',
      keyMask: cfg ? mask(cfg.brevoApiKey) : null,
      from: cfg?.from ?? null,
      broken,
      updatedAt: updatedAt?.toISOString() ?? null,
    };
  };

  app.get('/api/platform/mail', platform, view);

  app.put('/api/platform/mail', platform, async (req) => {
    const body = parse(mailSchema, req.body);
    const current = (await readMail(app.deps)).cfg;
    const apiKey = body.brevoApiKey || current?.brevoApiKey;
    if (!apiKey) throw badRequest('Brevo API anahtarını yazın.');
    const value: StoredMail = { brevoApiKey: encryptSecret(apiKey, env.JWT_SECRET), from: body.from };
    const now = new Date();
    await db
      .insert(platformSettings)
      .values({ key: 'mail', value: value as unknown as Record<string, unknown>, updatedBy: accessUser(req).sub })
      .onConflictDoUpdate({ target: platformSettings.key, set: { value: value as unknown as Record<string, unknown>, updatedBy: accessUser(req).sub, updatedAt: now } });
    setMailOverride(env, { brevoApiKey: apiKey, from: body.from });
    return view();
  });

  app.delete('/api/platform/mail', platform, async (_req, reply) => {
    await db.delete(platformSettings).where(eq(platformSettings.key, 'mail'));
    setMailOverride(env, null);
    return reply.code(204).send();
  });

  /** Deneme: kayıtlı ayarla (ya da formdaki yeni anahtarla) platform yöneticisinin kendi adresine gönderir */
  app.post('/api/platform/mail/test', platform, async (req) => {
    const body = parse(mailSchema.partial(), req.body ?? {});
    const current = (await readMail(app.deps)).cfg;
    const apiKey = body.brevoApiKey || current?.brevoApiKey;
    const from = body.from || current?.from;
    if (!apiKey || !from) throw badRequest('Önce API anahtarını ve gönderen adresini yazın.');
    const [me] = await db.select({ email: users.email }).from(users).where(eq(users.id, accessUser(req).sub));
    try {
      await sendWithOverride(env, { brevoApiKey: apiKey, from }, { to: me!.email, subject: 'Okulyayın deneme e-postası', text: 'Bu e-posta geldiyse e-posta ayarı çalışıyor. Doğrulama kodları ve davetler bu yolla gönderilecek.' });
    } catch (err) {
      throw badRequest(err instanceof Error ? err.message : 'E-posta gönderilemedi');
    }
    return { sent: true, to: me!.email };
  });
}
