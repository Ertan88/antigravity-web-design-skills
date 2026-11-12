import { BOARD_MODULES } from './layout.ts';
import { LABEL_KEYS, type LabelKey as LabelKeyT } from './labels.ts';
import { DESIGN_PALETTE_IDS, DESIGN_TEMPLATE_IDS } from './designs.ts';
import { EMERGENCY_TYPES } from './emergency.ts';
import { SCREEN_COMMANDS } from './control.ts';
import { z } from 'zod';
import { validatePeriods } from './bell.ts';
import { PERMISSION_KEYS } from './permissions.ts';
import { CONDUCT_GROUP_KEYS, SCHOOL_LEVEL_KEYS, type ConductGroup, type SchoolLevel } from './conduct.ts';
import { parseYouTubeUrl } from './youtube.ts';

/*
 * Tüm giriş doğrulama şemaları tek yerde: API aynı şemayla doğrular, yönetim paneli
 * ve ileride mobil uygulama aynı şemayla form hatalarını gösterir.
 */

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Renk #RRGGBB biçiminde olmalı');
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Saat SS:DD biçiminde olmalı');
const isoDate = z.iso.date({ error: 'Tarih YYYY-AA-GG biçiminde olmalı' });
/** Ay: YYYY-AA */
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Ay YYYY-AA biçiminde olmalı');
const isoDateTime = z.iso.datetime({ offset: true, error: 'Geçerli bir tarih ve saat girin' });
const weekday = z.number().int().min(1).max(7);
const id = z.uuid({ error: 'Geçersiz kimlik' });
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
/** İsteğe bağlı e-posta: boş bırakılabilir, küçük harfe çevrilir */
export const optionalEmail = z
  .string()
  .trim()
  .max(160)
  .transform((v) => v.toLowerCase())
  .pipe(z.union([z.literal(''), z.email('Geçerli bir e-posta girin')]))
  .transform((v) => v || null)
  .nullable()
  .optional();
/** İsteğe bağlı telefon: yalnızca rakam ve +; 10–13 hane (0 ile ya da +90 ile) */
export const optionalPhone = z
  .string()
  .trim()
  .max(30)
  .transform((v) => v.replace(/[^\d+]/g, ''))
  .pipe(z.union([z.literal(''), z.string().regex(/^\+?\d{10,13}$/, 'Geçerli bir telefon numarası girin')]))
  .transform((v) => v || null)
  .nullable()
  .optional();
const required = (label: string, max: number, min = 1) =>
  z
    .string({ error: `${label} gerekli` })
    .trim()
    .min(min, `${label} en az ${min} karakter olmalı`)
    .max(max, `${label} en fazla ${max} karakter olabilir`);

const timezone = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, 'Geçersiz saat dilimi');

function endAfterStart(v: { startsAt?: string | null; endsAt?: string | null }, ctx: z.RefinementCtx) {
  if (v.startsAt && v.endsAt && Date.parse(v.endsAt) <= Date.parse(v.startsAt)) {
    ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'Bitiş, başlangıçtan sonra olmalı' });
  }
}

/* ---------- Okul ve ayarlar ---------- */

const boardModule = z.enum(BOARD_MODULES);
/** Sütun öğesi: tek kart ya da 2-4 kartlık birleşik kart (aynı yerde sırayla döner) */
const layoutItem = z.union([boardModule, z.array(boardModule).min(2).max(4)]);
/** Pano düzeni: sol / sağ sütundaki kartlar ve sıraları */
export const boardLayoutSchema = z
  .object({ left: z.array(layoutItem).max(9), right: z.array(layoutItem).max(9) })
  .refine((l) => {
    const all = [...l.left, ...l.right].flat();
    return new Set(all).size === all.length;
  }, 'Bir kart yalnızca bir yerde olabilir');

export const schoolSettingsSchema = z.object({
  /** Panoda okul adının altında ikinci satır (ör. "Mesleki ve Teknik Anadolu Lisesi"). Boşsa addan tahmin edilir. */
  schoolType: z.string().trim().max(80).default(''),
  /** Okulda taşımalı eğitim (servisle gelen öğrenci) var mı; açıksa Taşımalı Eğitim sayfası ve panodaki görevli bilgisi görünür */
  hasTransport: z.boolean().default(false),
  /** MEB çalışma takvimindeki ara tatil, yarıyıl ve yaz tatili okulda da tatil sayılır */
  followMebCalendar: z.boolean().default(true),
  /** Gözlem kayıtlarının saklama süresi (KVKK): öğretim yılı sonunda silinir ya da okul elle siler */
  conductRetention: z.enum(['year', 'keep']).default('year'),
  /** İkinci dönemin ilk günü ("02-09"); boşsa MEB takviminden, o da yoksa 1 Şubat */
  conductTerm2Start: z
    .string()
    .regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'Tarih AA-GG biçiminde olmalı')
    .nullable()
    .default(null),
  /** Rehberlik uyarısı: bir öğrenci `days` gün içinde `minus` eksi alırsa rehber öğretmene sessizce haber verilir */
  conductAlert: z
    .object({ enabled: z.boolean().default(true), days: z.number().int().min(1).max(60).default(7), minus: z.number().int().min(1).max(20).default(3) })
    .default({ enabled: true, days: 7, minus: 3 }),
  theme: z.enum(['dark', 'light']).default('dark'),
  /** Kartların görünümü: klasik (renkli şeritli kartlar), bento (pastel kutular) ya da canlı (dolu parlak kutular) */
  boardStyle: z.enum(['classic', 'bento', 'vivid']).default('classic'),
  primaryColor: hexColor.default('#1f8bad'),
  accentColor: hexColor.default('#f59e0b'),
  /** Özel günlerde (millî bayram, 10 Kasım, bayramlar…) hazır temayı kendiliğinden uygula */
  autoSpecialThemes: z.boolean().default(true),
  /** Düzende olan ama o gün içeriği olmayan kartlar (izinli, doğum günü…) kısa bir notla görünür */
  showEmptyCards: z.boolean().default(false),
  /** Kart girişleri, slayt geçişleri, zil sayacının son dakikadaki nabzı */
  animations: z.boolean().default(true),
  /** Erişilebilirlik: yüksek kontrast ve uzaktan okunabilirlik için büyük yazı */
  highContrast: z.boolean().default(false),
  textSize: z.enum(['normal', 'large']).default('normal'),
  /** Gece ve hafta sonu modu: ders dışı saatlerde karartma ya da ekran koruyucu */
  sleepMode: z.enum(['off', 'dim', 'screensaver']).default('off'),
  sleepAfterMin: z.number().int().min(0).max(240).default(30),
  sleepBeforeMin: z.number().int().min(0).max(240).default(30),
  sleepOffDays: z.boolean().default(true),
  /** Elle uygulanan özel gün teması (filigranı da gösterilir); renkler değişince temizlenir */
  specialTheme: z.string().max(20).nullable().default(null),
  /** Onay akışı: açıkken onay yetkisi olmayanların eklediği duyurular onaylanınca yayına çıkar */
  requireApproval: z.boolean().default(false),
  /** Başarılar ve ayın öğrencisi duyuru alanında da hazır şablonlu slayt olarak döner */
  achievementSlides: z.boolean().default(true),
  /** Sınav olan günlerde duyuru alanına "Bugünkü sınavlar" slaytı eklenir (sınavlar "Şu an derste" kartında hep görünür) */
  examSlide: z.boolean().default(false),
  /** Okul Yayın Pano TV uygulamasının gizli ayarlarını açan şifre (4-8 rakam); boşsa ayarlar şifresiz açılır */
  tvExitPin: z
    .string()
    .regex(/^\d{4,8}$/, 'Şifre 4-8 rakam olmalı')
    .nullable()
    .default(null),
  /** Kayan yazıya ek kaynaklar */
  tickerHistory: z.boolean().default(false),
  tickerQuote: z.boolean().default(false),
  tickerWeatherAlerts: z.boolean().default(true),
  rssFeeds: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(30),
        url: z.url('Geçerli bir RSS adresi girin').max(500),
        /** 'students': yalnızca öğrencileri ilgilendiren başlıklar */
        audience: z.enum(['all', 'students']).default('all'),
        /** Virgülle ayrılmış kelimeler: doluysa yalnızca bunları içeren başlıklar */
        keywords: z.string().trim().max(300).default(''),
      }),
    )
    .max(5)
    .default([]),
  /** Üst barda bugünün hava durumu uyarısı (yoğun kar, aşırı sıcak…) */
  showWeatherAlert: z.boolean().default(true),
  showExams: z.boolean().default(true),
  showDuties: z.boolean().default(true),
  showLeaves: z.boolean().default(true),
  showBirthdays: z.boolean().default(true),
  showTimetable: z.boolean().default(true),
  /** "Ayşe Nur Yılmaz" yerine "Ayşe Nur Y." gösterimi (KVKK dostu varsayılan) */
  birthdayNameFormat: z.enum(['full', 'initial']).default('initial'),
  slideDurationSec: z.number().int().min(3).max(300).default(10),
  /**
   * Bir duyurunun panoda en çok kalma süresi: süresi girilmemiş duyurular metin uzunluğuna göre en çok bu kadar kalır;
   * elle bundan uzun süre girilen duyuru onaylayıcının onayına düşer
   */
  slideMaxDurationSec: z.number().int().min(10).max(300).default(60),
  /** Kayan yazı hızı, piksel/saniye */
  tickerSpeed: z.number().int().min(20).max(300).default(90),
  videoSound: z.boolean().default(false),
  lunchThresholdMin: z.number().int().min(10).max(180).default(30),
  /** İkili öğretim: sabahçı ve öğlenci sınıfların zilleri ayrı */
  dualShift: z.boolean().default(false),
  /** İşletmelerde mesleki eğitim modülü (meslek liseleri): işletmeler ve aylık devam çizelgesi */
  internshipEnabled: z.boolean().default(false),
  /** Koordinatör müdür yardımcısı (kullanıcı): işletmede devamsızlık ve rapor bildirimlerini alır */
  internshipManagerUserId: z.uuid().nullable().default(null),
  /**
   * Koordinatör öğretmenler (öğretmen kaydı): yönetim (müdür, koordinatör müdür yardımcısı, "Mesleki eğitimi yönetir"
   * yetkisi verilenler) işaretler; yalnızca meslek alanı branşlı öğretmenler. İşaretlenmeyen öğretmen modülü görmez.
   * Hiç kaydedilmemişse (undefined) işletmelerin bugünkü koordinatörleri işaretli sayılır (eski okullar için).
   */
  internshipCoordinatorTeacherIds: z.array(z.uuid()).max(500).optional(),
  /** Arifede (yarım gün) derslerin bittiği saat; kamuda arife 13.00'ten itibaren tatildir */
  halfDayEnd: clock.default('13:00'),
  /** Okulun kendi adlandırdığı başlıklar (kart ve sekme adları); boş olan varsayılanı kullanır */
  labels: z.partialRecord(z.enum(LABEL_KEYS as [LabelKeyT, ...LabelKeyT[]]), z.string().trim().max(60)).default({}),
  /** Okulun varsayılan pano düzeni; yoksa eski göster/gizle ayarlarından türetilir */
  layout: boardLayoutSchema.nullable().default(null),
  /** Mobil uygulamada özel gün şeridi ve mesaj penceresi (kutlama ve anma günleri) */
  specialDays: z
    .object({
      enabled: z.boolean().default(true),
      signature: z.string().trim().max(80).default(''),
      days: z
        .record(
          z.string().max(30),
          z.object({
            enabled: z.boolean().optional(),
            title: z.string().trim().max(80).optional(),
            message: z.string().trim().max(400).optional(),
            imageUrl: z.string().max(500).nullable().optional(),
          }),
        )
        .default({}),
    })
    .default({ enabled: true, signature: '', days: {} }),
  /** Okul sorunları: kategori → sorumlu idareci (kullanıcı). Seçilmeyen kategoride bütün idarecilere gider */
  issueOwners: z.record(z.string().max(20), z.uuid()).default({}),
  /** Okul sorunları: kategori → ek sorumlular (ör. meslek ya da bilişim öğretmeni); bildirim alır, durumu değiştirebilir */
  issueHelpers: z.record(z.string().max(20), z.array(z.uuid()).max(10)).default({}),
  /** Kadrodaki ünvan → hesap açılırken önerilen rol (okul belirler; ör. "Müdür Yardımcısı" → Yönetici) */
  titleRoles: z.record(z.uuid(), z.enum(['admin', 'teacher', 'counselor'])).default({}),
  /** KVKK aydınlatma metni: okulun kendi metni, herkese açık /aydinlatma/<okul> adresinde yayınlanır */
  privacyNotice: z.string().max(20000).default(''),
});
export type SchoolSettings = z.infer<typeof schoolSettingsSchema>;
export const defaultSchoolSettings: SchoolSettings = schoolSettingsSchema.parse({});

/** Başlıklar: yalnızca başlıkları düzenleme yetkisiyle kaydedilir (okul ayarlarından ayrı) */
export const labelsSchema = z.object({
  labels: z.partialRecord(z.enum(LABEL_KEYS as [LabelKeyT, ...LabelKeyT[]]), z.string().trim().max(60, 'Başlık en çok 60 karakter olabilir')),
});

export const updateSchoolSchema = z.object({
  name: required('Okul adı', 120, 2).optional(),
  logoUrl: optionalText(500),
  timezone: timezone.optional(),
  city: optionalText(80),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  settings: schoolSettingsSchema.partial().optional(),
});
export type UpdateSchoolInput = z.infer<typeof updateSchoolSchema>;

export const PLANS = { trial: 'Deneme', basic: 'Temel', pro: 'Profesyonel' } as const;
export type Plan = keyof typeof PLANS;

const slug = z
  .string()
  .trim()
  .min(3, 'Kısa ad en az 3 karakter olmalı')
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Kısa ad yalnızca küçük harf, rakam ve tire içerebilir');

export const createSchoolSchema = z.object({
  name: required('Okul adı', 120, 2),
  slug,
  plan: z.enum(['trial', 'basic', 'pro']).default('trial'),
  maxScreens: z.number().int().min(1).max(500).default(3),
  ownerEmail: z.email('Geçerli bir e-posta girin'),
  ownerName: required('Müdür adı', 80, 2),
  ownerPassword: z.string().min(8, 'Şifre en az 8 karakter olmalı').max(200).optional(),
});
export type CreateSchoolInput = z.infer<typeof createSchoolSchema>;

export const adminUpdateSchoolSchema = z.object({
  plan: z.enum(['trial', 'basic', 'pro']).optional(),
  maxScreens: z.number().int().min(1).max(500).optional(),
  isActive: z.boolean().optional(),
  /** Deneme süresini bugünden (ya da bitiş henüz gelmediyse bitişten) itibaren uzatır */
  extendTrialDays: z.number().int().min(1).max(365).optional(),
});

/* ---------- Kimlik ve kullanıcılar ---------- */

export const loginSchema = z.object({
  email: z.email('Geçerli bir e-posta girin'),
  password: z.string().min(1, 'Şifre gerekli').max(200),
  /** Mobil istemciler yenileme anahtarını gövdede alır; web çerez kullanır. */
  client: z.enum(['web', 'mobile']).default('web'),
});

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2, 'Ad soyad en az 2 karakter olmalı').max(120).optional(),
  email: z.email('Geçerli bir e-posta yazın').max(200).optional(),
  /** E-posta değişirse zorunlu */
  currentPassword: z.string().max(200).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8, 'Yeni şifre en az 8 karakter olmalı').max(200),
});

const permissionList = z.array(z.enum(PERMISSION_KEYS as [string, ...string[]])).max(PERMISSION_KEYS.length);

export const createMemberSchema = z.object({
  email: z.email('Geçerli bir e-posta girin'),
  fullName: required('Ad soyad', 80, 2),
  /** Yeni kullanıcının geçici şifresi (davet yoksa; verilmezse sunucu üretir). E-posta sistemde varsa yok sayılır. */
  password: z.string().min(8, 'Şifre en az 8 karakter olmalı').max(200).optional(),
  role: z.enum(['admin', 'editor']),
  permissions: permissionList.default([]),
  /** Kullanıcı bir öğretmense: mobil uygulamada kendi nöbetleri ve ders programı görünür */
  teacherId: id.nullable().optional(),
  /** Şifre yerine davet: kişiye e-postayla bağlantı gider, şifresini kendisi belirler */
  invite: z.boolean().default(false),
});

/* ---------- Web'den kayıt ve davet ---------- */

const newPassword = z.string().min(8, 'Şifre en az 8 karakter olmalı').max(200);

/** Okul için deneme kaydı (yalnızca web) */
export const signupSchema = z.object({
  schoolName: required('Okul adı', 120, 3),
  city: required('İl', 40, 2),
  district: optionalText(60),
  schoolType: required('Okul türü', 80, 2),
  ownerName: required('Ad soyad', 80, 3),
  email: z.email('Geçerli bir e-posta girin'),
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/[^\d+]/g, ''))
    .pipe(z.string().regex(/^\+?\d{10,13}$/, 'Geçerli bir telefon numarası girin')),
  password: newPassword,
  kvkk: z.literal(true, { error: 'Aydınlatma metnini onaylayın' }),
  marketing: z.boolean().default(false),
  /** Bot tuzağı: insanlar bu alanı görmez, doluysa kayıt sessizce yok sayılır */
  website: z.string().max(200).optional(),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const tokenSchema = z.object({ token: z.string().min(20).max(200) });

export const acceptInviteSchema = z.object({ token: z.string().min(20).max(200), password: newPassword });

/** Yöneticinin bir kullanıcının şifresini sıfırlaması; şifre verilmezse üretilir */
export const resetPasswordSchema = z.object({
  password: z.string().min(8, 'Şifre en az 8 karakter olmalı').max(200).optional(),
  sendEmail: z.boolean().default(false),
});

export const updateMemberSchema = z.object({
  role: z.enum(['admin', 'editor']).optional(),
  permissions: permissionList.optional(),
  teacherId: id.nullable().optional(),
});

/* ---------- Pano içerikleri ---------- */

/**
 * Duyurunun yayın akışı: hangi günlerde, hangi saatlerde ve zilin hangi durumunda görünsün
 * (ör. kantindeki panoda yalnızca teneffüste). Boş alanlar sınır koymaz.
 */
export const announcementScheduleSchema = z.object({
  days: z.array(weekday).max(7).default([]),
  from: z.string().regex(/^\d{2}:\d{2}$/).nullable().default(null),
  to: z.string().regex(/^\d{2}:\d{2}$/).nullable().default(null),
  phase: z.enum(['any', 'break', 'lesson']).default('any'),
});

/** Hazır şablonla hazırlanan duyuru: şablon, renk ve alanlara yazılan metinler */
export const announcementDesignSchema = z.object({
  template: z.enum(DESIGN_TEMPLATE_IDS),
  palette: z.enum(DESIGN_PALETTE_IDS),
  fields: z.record(z.string().max(40), z.string().trim().max(500)),
});

export const announcementSchema = z
  .object({
    title: required('Başlık', 120),
    body: optionalText(600),
    kind: z.enum(['image', 'video', 'text', 'design']),
    design: announcementDesignSchema.nullable().optional(),
    /** Yalnızca bu panolarda; boş ya da yoksa bütün panolarda */
    screenIds: z.array(id).max(100).nullable().optional(),
    schedule: announcementScheduleSchema.nullable().optional(),
    imageUrl: optionalText(500),
    youtubeUrl: optionalText(300),
    /**
     * Boşsa görsel/metin metnin uzunluğuna göre (okul varsayılanı ile üst sınır arasında), video kendi süresince kalır.
     * Okulun üst sınırından (slideMaxDurationSec) uzun süre onaylayıcının onayına düşer.
     */
    durationSec: z.number().int().min(3).max(1800).nullable().optional(),
    startsAt: isoDateTime.nullable().optional(),
    endsAt: isoDateTime.nullable().optional(),
    isActive: z.boolean().default(true),
    sortOrder: z.number().int().default(0),
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'image' && !v.imageUrl) {
      ctx.addIssue({ code: 'custom', path: ['imageUrl'], message: 'Görselli duyuru için bir görsel yükleyin' });
    }
    if (v.kind === 'design' && !v.design) {
      ctx.addIssue({ code: 'custom', path: ['design'], message: 'Bir şablon seçin' });
    }
    if (v.kind === 'video' && !(v.youtubeUrl && parseYouTubeUrl(v.youtubeUrl))) {
      ctx.addIssue({ code: 'custom', path: ['youtubeUrl'], message: 'Geçerli bir YouTube bağlantısı girin' });
    }
    if (v.schedule?.from && v.schedule.to && v.schedule.to <= v.schedule.from) {
      ctx.addIssue({ code: 'custom', path: ['schedule'], message: 'Bitiş saati başlangıçtan sonra olmalı' });
    }
    endAfterStart(v, ctx);
  });
export type AnnouncementInput = z.infer<typeof announcementSchema>;

/** Onay akışında reddetme notu */
export const reviewSchema = z.object({ note: optionalText(200) });

/* ---------- Okul hayatı: başarılar, etkinlik takvimi, haftanın kitabı ---------- */

export const achievementSchema = z
  .object({
    /** 'month': Ayın öğrencisi · 'achievement': başarı / derece */
    kind: z.enum(['month', 'achievement']),
    name: required('Öğrenci / takım', 80),
    className: optionalText(30),
    title: required('Başlık', 100),
    description: optionalText(200),
    photoUrl: optionalText(500),
    startsAt: isoDateTime.nullable().optional(),
    endsAt: isoDateTime.nullable().optional(),
    isActive: z.boolean().default(true),
    /** Panodaki Başarılar kartında göster */
    showCard: z.boolean().default(true),
    /** Duyuru alanında hazır şablonla göster */
    showSlide: z.boolean().default(true),
    sortOrder: z.number().int().default(0),
  })
  .superRefine(endAfterStart);

export const schoolEventSchema = z.object({
  title: required('Etkinlik', 100),
  /** Düzenleyen kulüp ya da birim */
  organizer: optionalText(60),
  date: isoDate,
  time: optionalText(20),
  place: optionalText(60),
  isActive: z.boolean().default(true),
});

export const bookSchema = z
  .object({
    title: required('Kitap adı', 100),
    author: required('Yazar', 80),
    coverUrl: optionalText(500),
    note: optionalText(200),
    startsAt: isoDateTime.nullable().optional(),
    endsAt: isoDateTime.nullable().optional(),
    isActive: z.boolean().default(true),
    sortOrder: z.number().int().default(0),
  })
  .superRefine(endAfterStart);

export const tickerSchema = z
  .object({
    text: required('Metin', 200),
    isActive: z.boolean().default(true),
    startsAt: isoDateTime.nullable().optional(),
    endsAt: isoDateTime.nullable().optional(),
    sortOrder: z.number().int().default(0),
  })
  .superRefine(endAfterStart);

export const examSchema = z.object({
  title: required('Sınav adı', 80),
  examAt: isoDateTime,
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export const teacherSchema = z.object({
  fullName: required('Ad soyad', 80, 2),
  branchId: id.nullable().optional(),
  titleId: id.nullable().optional(),
  /** İletişim (isteğe bağlı): yalnızca idare ve kadro yetkilisi görür */
  email: optionalEmail,
  phone: optionalPhone,
  isActive: z.boolean().default(true),
});

/** Branş ve ünvan listelerinin bir öğesi */
export const teacherOptionSchema = z.object({
  name: required('Ad', 60),
});

/**
 * Excel'den öğretmen içe aktarma. Branş ve ünvan adla gelir; listede yoksa oluşturulur.
 * Aynı isimli öğretmen varsa (büyük/küçük harf ve boşluk farkı yok sayılarak) güncellenir.
 */
export const teacherImportSchema = z.object({
  rows: z
    .array(
      z.object({
        fullName: required('Ad soyad', 80, 2),
        branch: optionalText(60),
        title: optionalText(60),
        email: optionalEmail,
        phone: optionalPhone,
        isActive: z.boolean().optional(),
      }),
    )
    .min(1, 'İçe aktarılacak satır yok')
    .max(2000, 'Tek seferde en fazla 2000 öğretmen aktarılabilir'),
  updateExisting: z.boolean().default(true),
});
export type TeacherImportInput = z.infer<typeof teacherImportSchema>;

export const classGroupSchema = z.object({
  name: required('Sınıf adı', 20),
  sortOrder: z.number().int().default(0),
  /** Zil hesabına katılmaz (ör. özel eğitim sınıfı): günün ders sayısını belirlemez */
  bellExempt: z.boolean().optional(),
  /** İkili öğretimde vardiyası */
  shift: z.enum(['morning', 'afternoon']).nullable().optional(),
});

/** Sınıfın rehber öğretmeni (boş: yok) */
export const classAdvisorSchema = z.object({ teacherId: id.nullable() });

/** İkili öğretim: seçili sınıfların vardiyası */
export const classShiftSchema = z.object({
  classIds: z.array(id).max(300),
  shift: z.enum(['morning', 'afternoon']),
});

/** Seçili sınıfları zil hesabına kat / katma */
export const classBellExemptSchema = z.object({
  classIds: z.array(id).max(300),
  exempt: z.boolean(),
});

export const dutySchema = z.object({
  month: monthSchema,
  weekday,
  area: required('Nöbet yeri', 60),
  teacherId: id,
  sortOrder: z.number().int().default(0),
});

/** Nöbetçi müdür yardımcısı tarihe bağlıdır; aynı güne tek kayıt. İsim serbest metindir (ör. "M. Akkaya"). */
export const dutySupervisorSchema = z.object({
  date: isoDate,
  name: required('Nöbetçi müdür yardımcısı', 80, 2),
});

/** Bir günün taşımalı öğrenci görevlileri (sıralı); boş liste o günün görevlendirmesini kaldırır */
export const transportDaySchema = z.object({
  teacherIds: z.array(id).max(4, 'Bir güne en fazla 4 görevli atanabilir'),
});

/** Servis nöbetlerini adil dağıtma: ayın boş iş günleri, eğitim yılında en az nöbet tutandan başlanarak doldurulur */
export const transportAutoFillSchema = z.object({
  month: monthSchema,
  /** Bir günde kaç görevli */
  perDay: z.number().int().min(1).max(4).default(2),
  /** Dağıtıma katılacak öğretmenler */
  teacherIds: z.array(id).min(1, 'En az bir öğretmen seçin').max(300),
});

/** Excel'den servis (taşımalı eğitim) nöbet çizelgesi: dosyadaki tarihlerin görevlileri yenilenir */
export const transportImportSchema = z.object({
  days: z
    .array(
      z.object({
        date: isoDate,
        teacherIds: z.array(id).max(4),
        /** Kadroda olmayan, kaydederken Öğretmen Kadrosu'na eklenecek öğretmenler; position: dosyadaki sırası */
        newTeachers: z
          .array(z.object({ name: required('Öğretmen', 80, 2), position: z.number().int().min(0).max(3) }))
          .max(4)
          .default([]),
      }),
    )
    .max(400),
  holidays: z.array(z.object({ date: isoDate, name: required('Tatil', 120) })).max(100).default([]),
});

/** Bir ayın tüm kayıtlarını temizleme (nöbet, müdür yardımcısı, taşımalı) */
export const clearMonthSchema = z.object({ month: monthSchema });

export const leaveSchema = z
  .object({
    teacherId: id,
    startDate: isoDate,
    endDate: isoDate,
    /** Yalnızca panelde görünür, panoda gösterilmez. */
    note: optionalText(120),
  })
  .refine((v) => v.endDate >= v.startDate, { path: ['endDate'], message: 'Bitiş tarihi başlangıçtan önce olamaz' });

/** Okul numarası: okul içinde benzersiz (e-Okul numarası gibi); harf, rakam ve tire */
export const schoolNoSchema = required('Okul no', 20)
  .transform((v) => v.replace(/\s+/g, ''))
  .pipe(z.string().regex(/^[0-9A-Za-zÇĞİÖŞÜçğıöşü-]+$/, 'Okul no yalnızca harf, rakam ve tire içerebilir'));

export const studentSchema = z.object({
  schoolNo: schoolNoSchema,
  fullName: required('Ad soyad', 80, 2),
  classGroupId: id.nullable().optional(),
  birthDate: isoDate,
  /** e-Okul sınıf listesindeki sıra numarası (S.No) */
  listNo: z.number().int().min(1).max(999).nullable().optional(),
});

/** Excel / e-Okul listesinden yapıştırılan öğrencileri toplu içe aktarma; eksik sınıflar otomatik oluşturulur. */
export const studentImportSchema = z.object({
  rows: z
    .array(
      z.object({
        schoolNo: schoolNoSchema,
        fullName: required('Ad soyad', 80, 2),
        className: optionalText(20),
        birthDate: isoDate,
        listNo: z.number().int().min(1).max(999).nullable().optional(),
      }),
    )
    .min(1, 'İçe aktarılacak satır yok')
    .max(5000, 'Tek seferde en fazla 5000 öğrenci aktarılabilir'),
  /** e-Okul sınıf listesindeki sınıf öğretmenleri: sınıfın rehber öğretmeni olarak yazılır (kadrodaki adla eşleşir) */
  advisors: z.array(z.object({ className: required('Sınıf', 20), teacherName: required('Öğretmen', 120) })).max(500).optional(),
  /** Aynı okul numaralı öğrenci varsa adı, sınıfı ve doğum tarihi güncellenir; kapalıysa dokunulmaz */
  updateExisting: z.boolean().default(true),
});

/**
 * Excel'den nöbet çizelgesi. "replace" dosyadaki günlerin mevcut nöbetlerini silip dosyadakini yazar
 * (dosyada olmayan günlere dokunmaz); "merge" yalnızca eksik nöbetleri ekler.
 */
export const dutyImportSchema = z.object({
  /** Çizelgenin kaydedileceği ay */
  month: monthSchema,
  mode: z.enum(['replace', 'merge']).default('replace'),
  /** Kadroda olmayan öğretmenler kaydederken Öğretmen Kadrosu'na eklensin */
  addTeachers: z.boolean().default(false),
  weekdays: z.array(weekday).max(7),
  rows: z
    .array(
      z.object({
        weekday,
        area: required('Nöbet yeri', 60),
        teacherName: required('Öğretmen', 80, 2),
      }),
    )
    .max(2000, 'Tek seferde en fazla 2000 nöbet aktarılabilir'),
  /** Dosyadaki tarih / nöbetçi müdür yardımcısı eşleşmeleri; aynı tarihte kayıt varsa güncellenir */
  supervisors: z.array(dutySupervisorSchema).max(400).default([]),
  /** Dosyada tanınan tatiller (öğretmen yerine tatil adı yazılmış günler) */
  holidays: z.array(z.object({ date: isoDate, name: required('Tatil', 120) })).max(100).default([]),
});
export type DutyImportInput = z.infer<typeof dutyImportSchema>;

export const periodSchema = z.object({
  no: z.number().int().min(1).max(30),
  start: clock,
  end: clock,
  label: optionalText(30),
});

export const bellScheduleSchema = z
  .object({
    name: required('Çizelge adı', 60),
    /** Elle sabitlendiği günler (ör. Cuma düzeni); boşsa düzen günün ders sayısına göre otomatik seçilir */
    weekdays: z
      .array(weekday)
      .max(7)
      .refine((d) => new Set(d).size === d.length, 'Aynı gün iki kez seçilmiş'),
    periods: z.array(periodSchema).min(1, 'En az bir ders saati ekleyin').max(30),
    sortOrder: z.number().int().default(0),
    /** "N derslik gün": günün ders sayısı N olduğunda seçilir */
    lessonCount: z.number().int().min(1).max(30).nullable().default(null),
    /** İkili öğretimde vardiya (boş: sabahçı) */
    shift: z.enum(['morning', 'afternoon']).nullable().default(null),
    /** Sınıfa özel düzen: yalnızca bu sınıflar (boş: okul geneli) */
    classIds: z.array(id).max(300).nullable().default(null),
  })
  .superRefine((v, ctx) => {
    const problem = validatePeriods(v.periods);
    if (problem) ctx.addIssue({ code: 'custom', path: ['periods'], message: problem });
  });

/** Bir günün zil saatlerine elle müdahale (yalnızca o tarih ve o zil) */
export const bellOverrideSchema = z
  .object({
    date: isoDate,
    target: z.string().regex(/^(school:(morning|afternoon)|schedule:[0-9a-f-]{36})$/, 'Geçersiz zil'),
    periods: z.array(periodSchema).min(1, 'En az bir ders saati kalmalı').max(30),
    note: optionalText(120),
    /** Öğretmenlere telefon bildirimi gönderilsin mi */
    notify: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    const problem = validatePeriods(v.periods);
    if (problem) ctx.addIssue({ code: 'custom', path: ['periods'], message: problem });
  });
export type BellOverrideInput = z.infer<typeof bellOverrideSchema>;

export const timetableEntrySchema = z.object({
  weekday,
  periodNo: z.number().int().min(1).max(30),
  classGroupId: id,
  teacherId: id.nullable().optional(),
  /** Bölünmüş sınıf: aynı derse giren diğer öğretmen(ler) */
  extraTeacherIds: z.array(id).max(3).optional(),
  subject: required('Ders', 80),
});

export const screenDisplaySchema = z.object({
  orientation: z.enum(['landscape', 'portrait']).default('landscape'),
  mode: z.enum(['board', 'slides', 'clock']).default('board'),
  /** Bu panoda gösterilen sınıflar (dersler ve zil); boş: bütün okul */
  classIds: z.array(id).max(300).default([]),
  /** Animasyonlar: otomatik (TV'ye göre), açık ya da hafif */
  animations: z.enum(['auto', 'on', 'lite']).default('auto'),
});

export const screenSchema = z.object({
  name: required('Pano adı', 60),
  location: optionalText(80),
  /** Bu panoya özel düzen; null ise okulun varsayılan düzeni kullanılır */
  layout: boardLayoutSchema.nullable().optional(),
  /** Ekran biçimi: yatay / dikey, tam pano ya da yalnızca duyurular */
  display: screenDisplaySchema.optional(),
});

export const pairScreenSchema = screenSchema.extend({
  code: z
    .string()
    .trim()
    .transform((c) => c.toUpperCase().replace(/[^A-Z0-9]/g, ''))
    .pipe(z.string().length(6, 'Eşleştirme kodu 6 karakter olmalı')),
});

/** Sıralama ve yayın durumunu hızlıca değiştirmek için (PATCH). */
export const quickPatchSchema = z.object({
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

/** Acil durum başlatma: tür, isteğe bağlı ek mesaj ve sesli uyarı */
export const emergencySchema = z.object({
  type: z.enum(EMERGENCY_TYPES),
  message: optionalText(200),
  sound: z.boolean().default(true),
});
export type EmergencyInput = z.infer<typeof emergencySchema>;

/* ---------- Uzaktan komutlar ---------- */

export const screenCommandSchema = z.object({ command: z.enum(SCREEN_COMMANDS) });

/** Panonun bildirdiği canlı durum (mobil uzaktan kumanda) */
export const screenLiveStatusSchema = z.object({
  slideIndex: z.number().int().min(0).max(1000),
  slideCount: z.number().int().min(0).max(1000),
  slideTitle: z.string().max(200).nullable(),
  /** Gösterilen slaytın kimliği: önizleme (mobil uzaktan kumanda) TV'de gösterilen slayda geçer */
  slideId: z.string().max(80).nullable().optional(),
  /** TV'nin tarayıcı bileşeninin (WebView / Chrome) ana sürümü ve hafif modda olup olmadığı */
  webview: z.number().int().min(0).max(1000).nullable().optional(),
  lite: z.boolean().optional(),
  paused: z.boolean(),
  sleeping: z.boolean(),
  mode: z.enum(['board', 'slides', 'clock', 'emergency']),
});

/** Nöbet yerine görevlendirme (izinli öğretmenin nöbetini başka öğretmen tutar) */
export const dutySubstitutionSchema = z.object({
  date: isoDate,
  dutyId: id,
  teacherId: id,
});

/** Öğretmenin kendi izin bildirimi (mobil): izin yetkisi yoksa onaya düşer */
export const leaveRequestSchema = z
  .object({
    startDate: isoDate,
    endDate: isoDate,
    note: optionalText(120),
  })
  .refine((v) => v.endDate >= v.startDate, { path: ['endDate'], message: 'Bitiş tarihi başlangıçtan önce olamaz' });

/** Telefon bildirimleri için cihaz kaydı (Expo push anahtarı) */
export const pushTokenSchema = z.object({
  token: z
    .string()
    .trim()
    .min(10)
    .max(300)
    .regex(/^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/, 'Geçersiz bildirim anahtarı'),
  platform: z.enum(['ios', 'android', 'web']).default('android'),
});

/** Okulun silinmesi: yanlışlıkla silinmesin diye okulun kısa adı yazılarak onaylanır */
export const deleteSchoolSchema = z.object({ confirmSlug: z.string().trim().min(1, 'Onay için okulun kısa adını yazın') });

/* ---------- Gözlem (öğrenci davranış takibi) ---------- */

export const conductCriterionSchema = z.object({
  level: z.enum(SCHOOL_LEVEL_KEYS as [SchoolLevel, ...SchoolLevel[]]),
  group: z.enum(CONDUCT_GROUP_KEYS as [ConductGroup, ...ConductGroup[]]),
  label: required('Kriter adı', 60, 2),
  points: z
    .number()
    .int()
    .min(-5, 'Puan en az −5 olabilir')
    .max(5, 'Puan en fazla +5 olabilir')
    .refine((n) => n !== 0, 'Puan 0 olamaz'),
  noteRequired: z.boolean().default(false),
  isActive: z.boolean().default(true),
});
export type ConductCriterionInput = z.infer<typeof conductCriterionSchema>;

/** Bir ya da birden çok öğrenciye aynı kriterle puan (toplu giriş aynı kayıt grubunu taşır, birlikte geri alınır) */
export const conductEntrySchema = z.object({
  studentIds: z.array(id).min(1, 'Öğrenci seçin').max(200, 'Tek seferde en fazla 200 öğrenci'),
  criterionId: id,
  note: optionalText(200),
});

/** Ayın öğrencisi seçimi: panodaki "Ayın öğrencisi" şablonuna gider */
export const conductAlertResolveSchema = z.object({ note: optionalText(300) });

export const conductAwardSchema = z.object({
  month: monthSchema,
  studentId: id,
  title: optionalText(80),
  description: optionalText(200),
  photoUrl: optionalText(500),
});

/* ---------- Öğretmen hesabı açma (katılım) ---------- */

/** Önerilen / seçilen hesap rolü: Yönetici, Öğretmen (yalnızca kendi bilgileri), Rehber öğretmen */
export const ENROLL_ROLES = { teacher: 'Öğretmen', counselor: 'Rehber öğretmen', admin: 'Yönetici' } as const;
export type EnrollRole = keyof typeof ENROLL_ROLES;

/**
 * Ünvana göre varsayılan rol önerisi: MEB ünvanı müdür yardımcısı ya da müdür başyardımcısı ise Yönetici, diğerleri
 * Öğretmen. Okul "Ünvan → rol" ile her ünvan için başka rol seçebilir (okulun seçimi her zaman önceliklidir).
 */
export function defaultTitleRole(title?: string | null): EnrollRole {
  const n = (title ?? '').toLocaleLowerCase('tr-TR').replace(/[.]/g, ' ').replace(/\s+/g, ' ').trim();
  return /(^| )müd(ür)? ?(baş ?)?(yardımcısı|yrd)( |$)/u.test(n) ? 'admin' : 'teacher';
}

/** Ünvan için önerilen rol: okulun eşlemesi, yoksa varsayılan öneri */
export const titleRoleFor = (titleRoles: Record<string, EnrollRole>, titleId: string | null | undefined, titleName: string | null | undefined): EnrollRole =>
  (titleId ? titleRoles[titleId] : undefined) ?? (titleId ? defaultTitleRole(titleName) : 'teacher');

export const enrollCodeCreateSchema = z.object({
  teacherId: id,
  role: z.enum(['admin', 'teacher', 'counselor']).default('teacher'),
});
export const enrollStartCodeSchema = z.object({ code: z.string().trim().min(6).max(12) });
export const enrollMeetingSchema = z.object({ link: z.string().min(10).max(200) });
export const enrollMeetingStartSchema = z.object({ link: z.string().min(10).max(200), teacherId: id });
export const enrollEmailSchema = z.object({ token: z.string().min(10).max(200), email: z.email('Geçerli bir e-posta girin').max(160) });
export const enrollFinishSchema = z.object({
  token: z.string().min(10).max(200),
  /** E-postaya giden 6 haneli kod (e-posta gönderimi ayarlıysa) */
  emailCode: z.string().trim().max(10).optional(),
  /** Yeni hesap için şifre */
  password: z.string().min(8, 'Şifre en az 8 karakter olmalı').max(200).optional(),
  /** E-posta başka okuldan kayıtlıysa o hesabın şifresi */
  existingPassword: z.string().max(200).optional(),
});
export const enrollApproveSchema = z.object({ role: z.enum(['admin', 'teacher', 'counselor']).optional() });

/**
 * Okul müdürlüğü devri: yeni müdür okuldaki bir kullanıcı (memberId) ya da e-postayla davet edilen kişi.
 * Eski müdür yönetici olarak kalır (admin) ya da okuldan çıkar (leave).
 */
export const ownershipTransferSchema = z
  .object({
    memberId: z.uuid().optional(),
    email: z.email('Geçerli bir e-posta girin').max(160).optional(),
    fullName: z.string().trim().min(3, 'Ad soyad en az 3 karakter').max(80).optional(),
    keep: z.enum(['admin', 'leave']).default('admin'),
  })
  .refine((v) => Boolean(v.memberId) || (Boolean(v.email) && Boolean(v.fullName)), { message: 'Yeni müdürü seçin ya da adını ve e-postasını yazın', path: ['email'] });
export type OwnershipTransferInput = z.infer<typeof ownershipTransferSchema>;
