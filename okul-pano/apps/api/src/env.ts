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
  /** Üretimde derlenmiş panel ve pano dosyaları buradan sunulur */
  ADMIN_DIST: z.string().optional(),
  DISPLAY_DIST: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(overrides: Partial<Record<keyof Env, unknown>> = {}): Env {
  const env = schema.parse({ ...process.env, ...overrides });
  if (env.NODE_ENV === 'production' && env.JWT_SECRET.startsWith('gelistirme')) {
    throw new Error('Üretimde JWT_SECRET ortam değişkeni ayarlanmalı.');
  }
  return env;
}
