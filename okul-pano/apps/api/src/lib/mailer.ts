import nodemailer, { type Transporter } from 'nodemailer';
import type { Env } from '../env.ts';

let cached: { key: string; transport: Transporter } | null = null;

/** SMTP ayarlıysa e-posta gönderir; değilse false döner (panel e-posta programını açar) */
export async function sendMail(env: Env, msg: { to: string; subject: string; text: string }): Promise<boolean> {
  if (!env.SMTP_HOST) return false;
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
              auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
            }),
    };
  }
  await cached.transport.sendMail({ from: env.SMTP_FROM, ...msg });
  return true;
}
