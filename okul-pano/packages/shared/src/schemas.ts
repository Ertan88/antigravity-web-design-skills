import { BOARD_MODULES } from './layout.ts';
import { LABEL_KEYS, type LabelKey as LabelKeyT } from './labels.ts';
import { DESIGN_PALETTE_IDS, DESIGN_TEMPLATE_IDS } from './designs.ts';
import { EMERGENCY_TYPES } from './emergency.ts';
import { SCREEN_COMMANDS } from './control.ts';
import { z } from 'zod';
import { validatePeriods } from './bell.ts';
import { PERMISSION_KEYS } from './permissions.ts';
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
  theme: z.enum(['dark', 'light']).default('dark'),
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
  /** Kayan yazı hızı, piksel/saniye */
  tickerSpeed: z.number().int().min(20).max(300).default(90),
  videoSound: z.boolean().default(false),
  lunchThresholdMin: z.number().int().min(10).max(180).default(30),
  /** Arifede (yarım gün) derslerin bittiği saat; kamuda arife 13.00'ten itibaren tatildir */
  halfDayEnd: clock.default('13:00'),
  /** Okulun kendi adlandırdığı başlıklar (kart ve sekme adları); boş olan varsayılanı kullanır */
  labels: z.partialRecord(z.enum(LABEL_KEYS as [LabelKeyT, ...LabelKeyT[]]), z.string().trim().max(60)).default({}),
  /** Okulun varsayılan pano düzeni; yoksa eski göster/gizle ayarlarından türetilir */
  layout: boardLayoutSchema.nullable().default(null),
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
  ownerName: required('Sahip adı', 80, 2),
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

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8, 'Yeni şifre en az 8 karakter olmalı').max(200),
});

const permissionList = z.array(z.enum(PERMISSION_KEYS as [string, ...string[]])).max(PERMISSION_KEYS.length);

export const createMemberSchema = z.object({
  email: z.email('Geçerli bir e-posta girin'),
  fullName: required('Ad soyad', 80, 2),
  /** Yeni kullanıcılar için zorunlu; e-posta sistemde varsa yok sayılır. */
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
    /** Boşsa görsel/metin için okul varsayılanı, video için videonun kendi süresi kullanılır. */
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

export const studentSchema = z.object({
  fullName: required('Ad soyad', 80, 2),
  classGroupId: id.nullable().optional(),
  birthDate: isoDate,
});

/** Excel / e-Okul listesinden yapıştırılan öğrencileri toplu içe aktarma; eksik sınıflar otomatik oluşturulur. */
export const studentImportSchema = z.object({
  rows: z
    .array(
      z.object({
        fullName: required('Ad soyad', 80, 2),
        className: optionalText(20),
        birthDate: isoDate,
      }),
    )
    .min(1, 'İçe aktarılacak satır yok')
    .max(5000, 'Tek seferde en fazla 5000 öğrenci aktarılabilir'),
  /** Aynı ad ve doğum tarihli öğrenci varsa sınıfı güncellenir; kapalıysa dokunulmaz */
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
    weekdays: z
      .array(weekday)
      .min(1, 'En az bir gün seçin')
      .refine((d) => new Set(d).size === d.length, 'Aynı gün iki kez seçilmiş'),
    periods: z.array(periodSchema).min(1, 'En az bir ders saati ekleyin').max(30),
    sortOrder: z.number().int().default(0),
  })
  .superRefine((v, ctx) => {
    const problem = validatePeriods(v.periods);
    if (problem) ctx.addIssue({ code: 'custom', path: ['periods'], message: problem });
  });

export const timetableEntrySchema = z.object({
  weekday,
  periodNo: z.number().int().min(1).max(30),
  classGroupId: id,
  teacherId: id.nullable().optional(),
  subject: required('Ders', 60),
});

export const screenDisplaySchema = z.object({
  orientation: z.enum(['landscape', 'portrait']).default('landscape'),
  mode: z.enum(['board', 'slides', 'clock']).default('board'),
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
