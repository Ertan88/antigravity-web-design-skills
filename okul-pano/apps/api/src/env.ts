import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  HOST: z.string().default('0.0.0.0'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET en az 32 karakter olmalı').default('gelistirme-icin-degistirin-en-az-32-karakter-uzunlugunda'),
  DATABASE_URL: z.string().optional().transform((v) => v || undefined),
  PGLITE_DIR: z.string().default('./data/pglite'),
  UPLOAD_DIR: z.string().default('./uploads'),
  /** Yüklenen görseller: 'local' sunucunun diskinde, 'db' veritabanında (kalıcı diski olmayan ücretsiz barındırmalar) */
  FILE_STORAGE: z.enum(['local', 'db']).default('local'),
  /** Verilerin saklandığı yer: aydınlatma metni şablonunda yazar (ör. "Türkiye", "Almanya (Frankfurt)") */
  DATA_REGION: z.string().default('Türkiye'),
  /** Panelin dış adresi (e-postadaki bağlantılar). Render gibi ortamlar kendi adresini RENDER_EXTERNAL_URL ile verir. */
  PUBLIC_URL: z.string().default(process.env.RENDER_EXTERNAL_URL ?? 'http://localhost:5173'),
  /** Derlenmiş panel ve pano dosyaları (varsa) API ile aynı adresten sunulur: /admin/ ve /display/ */
  ADMIN_DIST: z.string().default('../admin/dist'),
  DISPLAY_DIST: z.string().default('../display/dist'),
  /** Mobil uygulamanın web sürümü (varsa): /app/ — uygulamayı yüklemeyen öğretmenler tarayıcıdan kullanır */
  MOBILE_DIST: z.string().default('../../mobile/dist'),
  /**
   * Web'den kayıt: 'open' e-posta doğrulanınca okul açılır, 'approval' doğrulama sonrası platform yöneticisinin
   * onayını bekler (okul askıda açılır), 'closed' kayıt kapalı (okulları yalnızca platform yöneticisi açar).
   */
  SIGNUP_MODE: z.enum(['open', 'approval', 'closed']).default('open'),
  /** Kayıtla açılan okulun deneme süresi (gün) ve ekran sınırı */
  TRIAL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  TRIAL_SCREENS: z.coerce.number().int().min(1).max(50).default(2),
  /** E-posta (şifre gönderimi). SMTP_HOST boşsa e-posta gönderilmez; panel e-posta programını açar. */
  SMTP_HOST: z.string().optional().transform((v) => v || undefined),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('Panokul <bildirim@panokul.local>'),
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
