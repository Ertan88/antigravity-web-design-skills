import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  HOST: z.string().default('0.0.0.0'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET en az 32 karakter olmalı').default('gelistirme-icin-degistirin-en-az-32-karakter-uzunlugunda'),
  DATABASE_URL: z.string().optional().transform((v) => v || undefined),
  PGLITE_DIR: z.string().default('./data/pglite'),
  UPLOAD_DIR: z.string().default('./uploads'),
  PUBLIC_URL: z.string().default('http://localhost:5173'),
  /** Derlenmiş panel ve pano dosyaları (varsa) API ile aynı adresten sunulur: /admin/ ve /display/ */
  ADMIN_DIST: z.string().default('../admin/dist'),
  DISPLAY_DIST: z.string().default('../display/dist'),
  /** E-posta (şifre gönderimi). SMTP_HOST boşsa e-posta gönderilmez; panel e-posta programını açar. */
  SMTP_HOST: z.string().optional().transform((v) => v || undefined),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('Okul Pano <bildirim@okulpano.local>'),
  /**
   * Mobil uygulamaya telefon bildirimi (Expo push servisi). 'off': gönderilmez;
   * 'memory': testler için yalnızca bellekte tutulur.
   */
  PUSH_URL: z.string().default('https://exp.host/--/api/v2/push/send'),
  /** Expo hesabında "push güvenliği" açıksa erişim anahtarı */
  PUSH_ACCESS_TOKEN: z.string().optional().transform((v) => v || undefined),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(overrides: Partial<Record<keyof Env, unknown>> = {}): Env {
  const env = schema.parse({ ...process.env, ...overrides });
  if (env.NODE_ENV === 'production' && env.JWT_SECRET.startsWith('gelistirme')) {
    throw new Error('Üretimde JWT_SECRET ortam değişkeni ayarlanmalı.');
  }
  return env;
}
