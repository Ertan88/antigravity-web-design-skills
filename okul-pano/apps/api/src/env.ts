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
  /** Tanıtım sitesinin dosyaları (stil, betik, görseller): kök adreste (/) tanıtım sayfası, /site/ altında dosyalar */
  SITE_DIR: z.string().default('./site'),
  /**
   * Satıcı ve iletişim bilgileri: tanıtım sitesinin alt bilgisinde, iletişim sayfasında ve yasal metinlerde yazar.
   * Boş bırakılan bilgi sayfada sarı yer tutucu olarak görünür (site o hâliyle satışa açılmamalıdır).
   */
  SELLER_NAME: z.string().optional().transform((v) => v?.trim() || undefined),
  SELLER_ADDRESS: z.string().optional().transform((v) => v?.trim() || undefined),
  SELLER_TAX_OFFICE: z.string().optional().transform((v) => v?.trim() || undefined),
  SELLER_TAX_NO: z.string().optional().transform((v) => v?.trim() || undefined),
  CONTACT_EMAIL: z.string().optional().transform((v) => v?.trim() || undefined),
  CONTACT_PHONE: z.string().optional().transform((v) => v?.trim() || undefined),
  /** Okul Yayın Pano TV uygulamasının indirme adresi: TV'de kısa "/tv" adresi buraya yönlendirir */
  /** Platform yöneticisinde iki adımlı doğrulama: 'required' (üretim) ya da 'optional' (yalnızca test ve geliştirme) */
  PLATFORM_MFA: z.enum(['required', 'optional']).default('required'),
  TV_APK_URL: z.string().default('https://github.com/Ertan88/antigravity-web-design-skills/releases/download/okul-pano-tv/Okul-Yayin-Pano.apk'),
  /** Okul Yayın telefon uygulamasının (Android) indirme adresi: panelin ve /app'in "İndir" bağlantısı kısa "/indir" adresinden buraya gider */
  APP_APK_URL: z.string().default('https://github.com/Ertan88/antigravity-web-design-skills/releases/download/okul-pano-android/Okul-Yayin.apk'),
  /**
   * Web'den kayıt: 'open' e-posta doğrulanınca okul açılır, 'approval' doğrulama sonrası platform yöneticisinin
   * onayını bekler (okul askıda açılır), 'closed' kayıt kapalı (okulları yalnızca platform yöneticisi açar).
   */
  SIGNUP_MODE: z.enum(['open', 'approval', 'closed']).default('open'),
  /** Kayıtla açılan okulun deneme süresi (gün) ve ekran sınırı */
  TRIAL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  TRIAL_SCREENS: z.coerce.number().int().min(1).max(50).default(2),
  /**
   * E-posta, HTTPS ile (önerilen): Brevo hesabındaki API anahtarı. Render gibi ücretsiz barındırmalar SMTP portlarını
   * kapattığı için doğrulama ve davet e-postaları bu yolla gider. Gönderen adresi SMTP_FROM'dur (Brevo'da doğrulanmış olmalı).
   */
  BREVO_API_KEY: z.string().optional().transform((v) => v || undefined),
  BREVO_API_URL: z.string().default('https://api.brevo.com/v3/smtp/email'),
  /** E-posta (şifre gönderimi). SMTP_HOST boşsa e-posta gönderilmez; panel e-posta programını açar. */
  SMTP_HOST: z.string().optional().transform((v) => v || undefined),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('Okulyayın <bildirim@okulyayin.local>'),
  /**
   * Mobil uygulamaya telefon bildirimi (Expo push servisi). 'off': gönderilmez;
   * 'memory': testler için yalnızca bellekte tutulur.
   */
  PUSH_URL: z.string().default('https://exp.host/--/api/v2/push/send'),
  /** MEB çalışma takvimi duyurusunun aranacağı sayfalar (virgülle). Boş bırakılırsa tarama yapılmaz. */
  MEB_INDEX_URLS: z.string().default('https://www.meb.gov.tr/,https://www.meb.gov.tr/meb_haberindex.php?dil=tr'),
  /** Expo hesabında "push güvenliği" açıksa erişim anahtarı */
  PUSH_ACCESS_TOKEN: z.string().optional().transform((v) => v || undefined),
  /**
   * Firebase hizmet hesabı (JSON içeriği; Render'da gizli değişken). Tanımlıysa Android bildirimleri doğrudan
   * Firebase Cloud Messaging (FCM v1) ile gönderilir; Expo hesabı gerekmez. Değer hiçbir yere yazılmaz, loglanmaz.
   */
  FIREBASE_SERVICE_ACCOUNT: z.string().optional().transform((v) => v?.trim() || undefined),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(overrides: Partial<Record<keyof Env, unknown>> = {}): Env {
  const env = schema.parse({ ...process.env, ...overrides });
  if (env.NODE_ENV === 'production' && env.JWT_SECRET.startsWith('gelistirme')) {
    throw new Error('Üretimde JWT_SECRET ortam değişkeni ayarlanmalı.');
  }
  return env;
}
