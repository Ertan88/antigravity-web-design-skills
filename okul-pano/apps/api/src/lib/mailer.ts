import nodemailer, { type Transporter } from 'nodemailer';
import type { Env } from '../env.ts';

let cached: { key: string; transport: Transporter } | null = null;

/** "Okulyayın <bildirim@alanadi.com>" -> { name, email } */
export function parseFrom(from: string): { name: string; email: string } {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from);
  return m ? { name: m[1]!.trim() || 'Okulyayın', email: m[2]!.trim() } : { name: 'Okulyayın', email: from.trim() };
}

/** Platform panelinden girilen ayar (sunucuya erişimi olmayan kurulumlar için, ör. Render) */
export interface MailOverride {
  brevoApiKey: string;
  from: string;
}
const overrides = new WeakMap<Env, MailOverride>();
export const setMailOverride = (env: Env, value: MailOverride | null) => (value ? overrides.set(env, value) : overrides.delete(env));

/** Ortam değişkenleri ayarlıysa onlar geçerlidir; değilse panelden girilen ayar kullanılır */
export const mailSource = (env: Env): 'env' | 'panel' | null => (env.BREVO_API_KEY || env.SMTP_HOST ? 'env' : overrides.has(env) ? 'panel' : null);

/** E-posta gönderimi ayarlı mı (Brevo ya da SMTP; ortam değişkeni ya da platform paneli) */
export const mailConfigured = (env: Env) => mailSource(env) !== null;

/** Brevo üzerinden gönderim (anahtar ve gönderen verilir) */
async function sendBrevo(url: string, apiKey: string, from: string, msg: { to: string; subject: string; text: string }) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: parseFrom(from), to: [{ email: msg.to }], subject: msg.subject, textContent: msg.text }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`E-posta gönderilemedi (Brevo ${res.status}): ${(await res.text()).slice(0, 200)}`);
}

/** Panelden girilmiş (henüz kaydedilmemiş olabilecek) ayarla deneme gönderimi */
export const sendWithOverride = (env: Env, cfg: MailOverride, msg: { to: string; subject: string; text: string }) => sendBrevo(env.BREVO_API_URL, cfg.brevoApiKey, cfg.from, msg);

/**
 * E-posta gönderir; ayarlı değilse false döner (panel bağlantıyı kopyalatır, başvurular elle onaylanır).
 * BREVO_API_KEY varsa HTTPS ile Brevo üzerinden gider: ücretsiz barındırmalar (ör. Render) SMTP portlarını kapattığı
 * için önerilen yol budur. Yoksa SMTP_HOST ile klasik SMTP kullanılır.
 */
export async function sendMail(env: Env, msg: { to: string; subject: string; text: string }): Promise<boolean> {
  if (env.BREVO_API_KEY) {
    await sendBrevo(env.BREVO_API_URL, env.BREVO_API_KEY, env.SMTP_FROM, msg);
    return true;
  }
  if (!env.SMTP_HOST) {
    const panel = overrides.get(env);
    if (!panel) return false;
    await sendBrevo(env.BREVO_API_URL, panel.brevoApiKey, panel.from, msg);
    return true;
  }
  const key = `${env.SMTP_HOST}:${env.SMTP_PORT}:${env.SMTP_USER ?? ''}`;
  if (cached?.key !== key) {
    cached = {
      key,
      transport:
        env.SMTP_HOST === 'json'
          ? // Testler için: gerçek gönderim yerine iletiyi JSON olarak üretir
            nodemailer.createTransport({ jsonTransport: true })
          : nodemailer.createTransport({
              host: env.SMTP_HOST,
              port: env.SMTP_PORT,
              secure: env.SMTP_PORT === 465,
              // Portu kapalı sunucularda (ör. Render ücretsiz) istek dakikalarca asılı kalmasın
              connectionTimeout: 10_000,
              greetingTimeout: 10_000,
              auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
            }),
    };
  }
  await cached.transport.sendMail({ from: env.SMTP_FROM, ...msg });
  return true;
}

/** Gönderimi dener; hata olursa günlüğe yazar ve false döner (kayıt/davet akışı bozulmaz) */
export async function trySendMail(env: Env, msg: { to: string; subject: string; text: string }): Promise<boolean> {
  try {
    return await sendMail(env, msg);
  } catch (err) {
    console.error(`[e-posta] ${msg.to} adresine gönderilemedi:`, err instanceof Error ? err.message : err);
    return false;
  }
}
