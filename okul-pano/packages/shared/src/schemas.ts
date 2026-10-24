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

export const schoolSettingsSchema = z.object({
  /** Panoda okul adının altında ikinci satır (ör. "Mesleki ve Teknik Anadolu Lisesi"). Boşsa addan tahmin edilir. */
  schoolType: z.string().trim().max(80).default(''),
  /** Okulda taşımalı eğitim (servisle gelen öğrenci) var mı; açıksa Taşımalı Eğitim sayfası ve panodaki görevli bilgisi görünür */
  hasTransport: z.boolean().default(false),
  theme: z.enum(['dark', 'light']).default('dark'),
  primaryColor: hexColor.default('#3b82f6'),
  accentColor: hexColor.default('#f59e0b'),
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
});
export type SchoolSettings = z.infer<typeof schoolSettingsSchema>;
export const defaultSchoolSettings: SchoolSettings = schoolSettingsSchema.parse({});

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
});

export const updateMemberSchema = z.object({
  role: z.enum(['admin', 'editor']).optional(),
  permissions: permissionList.optional(),
});

/* ---------- Pano içerikleri ---------- */

export const announcementSchema = z
  .object({
    title: required('Başlık', 120),
    body: optionalText(600),
    kind: z.enum(['image', 'video', 'text']),
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
    if (v.kind === 'video' && !(v.youtubeUrl && parseYouTubeUrl(v.youtubeUrl))) {
      ctx.addIssue({ code: 'custom', path: ['youtubeUrl'], message: 'Geçerli bir YouTube bağlantısı girin' });
    }
    endAfterStart(v, ctx);
  });
export type AnnouncementInput = z.infer<typeof announcementSchema>;

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

/** Excel'den servis (taşımalı eğitim) nöbet çizelgesi: dosyadaki tarihlerin görevlileri yenilenir */
export const transportImportSchema = z.object({
  days: z
    .array(z.object({ date: isoDate, teacherIds: z.array(id).max(4) }))
    .min(1, 'İçe aktarılacak gün yok')
    .max(400),
});

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
  mode: z.enum(['replace', 'merge']).default('replace'),
  weekdays: z.array(weekday).min(1).max(7),
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

export const screenSchema = z.object({
  name: required('Ekran adı', 60),
  location: optionalText(80),
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
