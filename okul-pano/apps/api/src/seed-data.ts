import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePeriods, zonedParts } from '@okulpano/shared';
import { eq } from 'drizzle-orm';
import type { DB } from './db/client.ts';
import {
  announcements,
  bellSchedules,
  classGroups,
  duties,
  exams,
  memberships,
  schools,
  screens,
  students,
  teacherLeaves,
  teachers,
  tickerItems,
  timetableEntries,
  users,
} from './db/schema.ts';
import { hashPassword, randomToken, sha256 } from './lib/crypto.ts';
import type { FileStorage } from './lib/storage.ts';

export interface SeedResult {
  schoolId: string;
  screenToken: string;
  accounts: { role: string; email: string; password: string }[];
}

const TEACHERS: [string, string, string][] = [
  ['Ayşe Demir', 'Türk Dili ve Edebiyatı', 'Edebiyat'],
  ['Mehmet Kaya', 'Matematik', 'Matematik'],
  ['Zeynep Şahin', 'Fizik', 'Fizik'],
  ['Ali Yıldız', 'Kimya', 'Kimya'],
  ['Elif Arslan', 'Biyoloji', 'Biyoloji'],
  ['Mustafa Çelik', 'Tarih', 'Tarih'],
  ['Fatma Aydın', 'Coğrafya', 'Coğrafya'],
  ['Hasan Öztürk', 'İngilizce', 'İngilizce'],
  ['Emine Koç', 'Almanca', 'Almanca'],
  ['İbrahim Kurt', 'Beden Eğitimi', 'Beden Eğitimi'],
  ['Hatice Özdemir', 'Görsel Sanatlar', 'Görsel Sanatlar'],
  ['Murat Aslan', 'Felsefe', 'Felsefe'],
  ['Selin Erdoğan', 'Rehberlik', 'Rehberlik'],
  ['Burak Polat', 'Bilişim Teknolojileri', 'Bilişim'],
];

const CLASSES = ['9-A', '9-B', '10-A', '10-B', '11-A', '11-B', '12-A', '12-B'];
const DUTY_AREAS = ['Zemin Kat', '1. Kat', '2. Kat', 'Bahçe', 'Kantin'];
const STUDENT_NAMES = [
  'Deniz Yılmaz', 'Ece Kara', 'Kerem Aksoy', 'Defne Güneş', 'Emir Çetin', 'Zehra Bulut', 'Yusuf Taş',
  'Elif Nur Sarı', 'Ahmet Can Doğan', 'Meryem Yalçın', 'Ömer Faruk Kılıç', 'Asya Tekin', 'Berk Uçar', 'Nehir Acar',
];

function seedAssetsDir(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  return [resolve(here, '../seed-assets'), resolve(here, '../../seed-assets')].find((d) => existsSync(d)) ?? null;
}

/** Tanıtım ve geliştirme için gerçekçi örnek okul verisi oluşturur. */
export async function seedDemo(
  db: DB,
  opts: { storage?: FileStorage; superAdmin?: { email: string; password: string }; now?: Date } = {},
): Promise<SeedResult> {
  const now = opts.now ?? new Date();
  const tz = 'Europe/Istanbul';
  const today = zonedParts(now, tz);
  const accounts: SeedResult['accounts'] = [];

  if (opts.superAdmin) {
    const email = opts.superAdmin.email.toLowerCase();
    const [existing] = await db.select().from(users).where(eq(users.email, email));
    if (!existing) {
      await db.insert(users).values({
        email,
        fullName: 'Platform Yöneticisi',
        isSuperAdmin: true,
        passwordHash: await hashPassword(opts.superAdmin.password),
      });
    }
    accounts.push({ role: 'Platform yöneticisi', email, password: opts.superAdmin.password });
  }

  const [school] = await db
    .insert(schools)
    .values({
      name: 'Örnek Anadolu Lisesi',
      slug: `ornek-anadolu-lisesi-${Date.now().toString(36)}`,
      city: 'Ankara',
      latitude: 39.9334,
      longitude: 32.8597,
      timezone: tz,
      plan: 'pro',
      maxScreens: 10,
      settings: {},
    })
    .returning();
  const schoolId = school!.id;

  const people = [
    { role: 'owner' as const, email: 'mudur@okulpano.local', name: 'Okul Müdürü', password: 'Mudur2026!', permissions: [] },
    {
      role: 'editor' as const,
      email: 'editor@okulpano.local',
      name: 'Duyuru Editörü',
      password: 'Editor2026!',
      permissions: ['announcements.manage', 'ticker.manage'],
    },
  ];
  for (const p of people) {
    let [u] = await db.select().from(users).where(eq(users.email, p.email));
    if (!u) {
      [u] = await db
        .insert(users)
        .values({ email: p.email, fullName: p.name, passwordHash: await hashPassword(p.password) })
        .returning();
    }
    await db.insert(memberships).values({ userId: u!.id, schoolId, role: p.role, permissions: p.permissions }).onConflictDoNothing();
    accounts.push({ role: p.role === 'owner' ? 'Okul sahibi' : 'Editör (duyuru + kayan yazı)', email: p.email, password: p.password });
  }

  const teacherRows = await db
    .insert(teachers)
    .values(TEACHERS.map(([fullName, branch]) => ({ schoolId, fullName, branch })))
    .returning();
  const classRows = await db
    .insert(classGroups)
    .values(CLASSES.map((name, i) => ({ schoolId, name, sortOrder: i })))
    .returning();

  // Nöbet: her gün her alana farklı bir öğretmen
  await db.insert(duties).values(
    [1, 2, 3, 4, 5].flatMap((weekday) =>
      DUTY_AREAS.map((area, i) => ({
        schoolId,
        weekday,
        area,
        sortOrder: i,
        teacherId: teacherRows[(weekday * 3 + i) % teacherRows.length]!.id,
      })),
    ),
  );

  await db.insert(teacherLeaves).values([
    { schoolId, teacherId: teacherRows[8]!.id, startDate: today.isoDate, endDate: today.isoDate, note: 'Sağlık raporu' },
    { schoolId, teacherId: teacherRows[11]!.id, startDate: today.isoDate, endDate: today.isoDate, note: 'Seminer' },
  ]);

  // Bugün doğum günü olan üç öğrenci, diğerleri yıla dağılmış
  await db.insert(students).values(
    STUDENT_NAMES.map((fullName, i) => {
      const year = i < 3 ? 2008 : 2008 + (i % 3); // 2008 artık yıl: 29 Şubat'ta da geçerli tarih
      const birthDate = i < 3 ? `${year}-${today.monthDay}` : `${year}-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`;
      return { schoolId, fullName, classGroupId: classRows[i % classRows.length]!.id, birthDate };
    }),
  );

  const nextYear = today.month >= 7 ? today.year + 1 : today.year;
  await db.insert(exams).values([
    { schoolId, title: 'YKS (örnek tarih)', examAt: new Date(`${nextYear}-06-19T10:15:00+03:00`), sortOrder: 0 },
    { schoolId, title: '1. Dönem Ortak Sınavı', examAt: new Date(now.getTime() + 24 * 86400_000), sortOrder: 1 },
  ]);

  const periods = generatePeriods({ firstStart: '08:30', lessonMin: 40, breakMin: 10, count: 8, lunchAfter: 5, lunchMin: 45 });
  await db.insert(bellSchedules).values({ schoolId, name: 'Hafta içi', weekdays: [1, 2, 3, 4, 5], periods });

  // Ders programı: dönüşümlü atama sayesinde bir öğretmen aynı saatte tek sınıfta olur
  const entries: (typeof timetableEntries.$inferInsert)[] = [];
  for (const weekday of [1, 2, 3, 4, 5]) {
    for (const p of periods) {
      classRows.forEach((cls, ci) => {
        const teacher = TEACHERS[(ci + p.no + weekday * 3) % TEACHERS.length]!;
        const teacherRow = teacherRows.find((t) => t.fullName === teacher[0])!;
        entries.push({ schoolId, weekday, periodNo: p.no, classGroupId: cls.id, teacherId: teacherRow.id, subject: teacher[2] });
      });
    }
  }
  await db.insert(timetableEntries).values(entries);

  // Görselli duyurular: seed-assets klasöründeki afişler yüklenir
  const assets = seedAssetsDir();
  const posters: { file: string; title: string; body: string }[] = [
    { file: 'cumhuriyet.png', title: '29 Ekim Cumhuriyet Bayramımız Kutlu Olsun', body: 'Tören 08:45\'te okul bahçesinde başlayacaktır.' },
    { file: 'bilim-fuari.png', title: 'Bilim Fuarı Başvuruları Başladı', body: 'Proje başvuruları için son gün 15 Kasım. Danışman öğretmeninizle görüşün.' },
    { file: 'kutuphane.png', title: 'Kütüphane Haftası', body: 'Ayın kitabı: "Çalıkuşu". Okuma köşemiz teneffüslerde açık.' },
  ];
  let order = 0;
  for (const poster of posters) {
    const path = assets ? resolve(assets, poster.file) : null;
    if (!path || !existsSync(path) || !opts.storage) continue;
    const imageUrl = await opts.storage.saveImage(schoolId, readFileSync(path));
    await db.insert(announcements).values({ schoolId, kind: 'image', title: poster.title, body: poster.body, imageUrl, sortOrder: order++ });
  }
  await db.insert(announcements).values({
    schoolId,
    kind: 'text',
    title: 'Veli Toplantısı',
    body: 'Birinci dönem veli toplantısı 7 Kasım Cumartesi saat 10:00\'da sınıflarda yapılacaktır.',
    sortOrder: order++,
  });

  await db.insert(tickerItems).values(
    [
      'Cumhuriyetimizin 103. yılı kutlu olsun!',
      'Kantin fiyat listesi güncellendi, panoya asılmıştır.',
      'Satranç turnuvası kayıtları rehberlik servisinde.',
      'Okul servisleri 15:40\'ta hareket eder.',
    ].map((text, i) => ({ schoolId, text, sortOrder: i })),
  );

  const screenToken = randomToken('opd');
  await db.insert(screens).values({ schoolId, name: 'Giriş Holü', location: 'Zemin kat, ana giriş', tokenHash: sha256(screenToken) });

  return { schoolId, screenToken, accounts };
}
