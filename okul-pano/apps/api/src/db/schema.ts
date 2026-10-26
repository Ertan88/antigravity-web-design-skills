import type { AnnouncementDesign, BellShift, BoardLayout, DayMode, EmergencyType, FlashStyle, FlashTone, Period, SchoolSettings, ScreenDisplay } from '@okulpano/shared';
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/*
 * Çok kiracılı (multi-tenant) şema: her içerik tablosu school_id taşır ve tüm sorgular
 * okul kimliğiyle filtrelenir. Kimlikler UUID'dir; tahmin edilemez ve mobil eşitlemeye uygundur.
 */

const pk = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const schoolId = () =>
  uuid('school_id')
    .notNull()
    .references(() => schools.id, { onDelete: 'cascade' });
const sortOrder = () => integer('sort_order').notNull().default(0);
const isActive = () => boolean('is_active').notNull().default(true);

export const users = pgTable('users', {
  id: pk(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  fullName: text('full_name').notNull(),
  isSuperAdmin: boolean('is_super_admin').notNull().default(false),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: pk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    userAgent: text('user_agent'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const schools = pgTable('schools', {
  id: pk(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logoUrl: text('logo_url'),
  timezone: text('timezone').notNull().default('Europe/Istanbul'),
  city: text('city'),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  settings: jsonb('settings').$type<Partial<SchoolSettings>>().notNull().default({}),
  /** Abonelik altyapısı: plan ve ekran limiti şimdiden şemada */
  plan: text('plan').$type<'trial' | 'basic' | 'pro'>().notNull().default('trial'),
  maxScreens: integer('max_screens').notNull().default(3),
  /** Etkin acil durum (deprem, yangın…): doluysa bütün panolar tam ekran uyarı gösterir */
  emergency: jsonb('emergency').$type<{ type: EmergencyType; message: string | null; sound: boolean; startedAt: string; startedBy: string | null }>(),
  isActive: isActive(),
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const memberships = pgTable(
  'memberships',
  {
    id: pk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    schoolId: schoolId(),
    role: text('role').$type<'owner' | 'admin' | 'editor'>().notNull(),
    permissions: jsonb('permissions').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** Kullanıcı bu okulda öğretmense: mobil uygulamada kendi nöbetleri ve ders programı */
    teacherId: uuid('teacher_id').references((): AnyPgColumn => teachers.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('memberships_user_school_uq').on(t.userId, t.schoolId), index('memberships_school_idx').on(t.schoolId)],
);

/** Okulun branş listesi; adı değişince bağlı tüm öğretmenlerde değişmiş olur. */
export const teacherBranches = pgTable(
  'teacher_branches',
  {
    id: pk(),
    schoolId: schoolId(),
    name: text('name').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('teacher_branches_school_name_uq').on(t.schoolId, t.name)],
);

/** Okulun ünvan listesi (Öğretmen, Uzman Öğretmen, Müdür Yardımcısı...) */
export const teacherTitles = pgTable(
  'teacher_titles',
  {
    id: pk(),
    schoolId: schoolId(),
    name: text('name').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('teacher_titles_school_name_uq').on(t.schoolId, t.name)],
);

export const teachers = pgTable(
  'teachers',
  {
    id: pk(),
    schoolId: schoolId(),
    fullName: text('full_name').notNull(),
    branchId: uuid('branch_id').references(() => teacherBranches.id, { onDelete: 'set null' }),
    titleId: uuid('title_id').references(() => teacherTitles.id, { onDelete: 'set null' }),
    isActive: isActive(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('teachers_school_idx').on(t.schoolId)],
);

export const classGroups = pgTable(
  'class_groups',
  {
    id: pk(),
    schoolId: schoolId(),
    name: text('name').notNull(),
    sortOrder: sortOrder(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('class_groups_school_name_uq').on(t.schoolId, t.name)],
);

export const duties = pgTable(
  'duties',
  {
    id: pk(),
    schoolId: schoolId(),
    /** Çizelgenin ait olduğu ay (YYYY-AA); pano o ayın, yoksa en son ayın çizelgesini gösterir */
    month: text('month').notNull(),
    weekday: integer('weekday').notNull(),
    area: text('area').notNull(),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => teachers.id, { onDelete: 'cascade' }),
    sortOrder: sortOrder(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('duties_school_idx').on(t.schoolId, t.month, t.weekday)],
);

/** Okulun tatil günleri (Excel'den tanınan ya da elle eklenen); resmi tatiller ayrıca koddan gelir */
export const schoolHolidays = pgTable(
  'school_holidays',
  {
    id: pk(),
    schoolId: schoolId(),
    date: date('date', { mode: 'string' }).notNull(),
    name: text('name').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('school_holidays_school_date_uq').on(t.schoolId, t.date)],
);

/** Nöbetçi müdür yardımcısı: tarihe bağlı, okul başına günde bir kayıt */
export const dutySupervisors = pgTable(
  'duty_supervisors',
  {
    id: pk(),
    schoolId: schoolId(),
    date: date('date', { mode: 'string' }).notNull(),
    name: text('name').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('duty_supervisors_school_date_uq').on(t.schoolId, t.date)],
);

/**
 * Taşımalı öğrenci görevlisi: servisten indirme, öğle yemeği dağıtımı ve servise bindirme için
 * idarenin o günün nöbetçileri arasından görevlendirdiği öğretmenler (genelde iki kişi).
 */
export const transportDuties = pgTable(
  'transport_duties',
  {
    id: pk(),
    schoolId: schoolId(),
    date: date('date', { mode: 'string' }).notNull(),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => teachers.id, { onDelete: 'cascade' }),
    sortOrder: sortOrder(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('transport_duties_school_date_teacher_uq').on(t.schoolId, t.date, t.teacherId)],
);

export const teacherLeaves = pgTable(
  'teacher_leaves',
  {
    id: pk(),
    schoolId: schoolId(),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => teachers.id, { onDelete: 'cascade' }),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    endDate: date('end_date', { mode: 'string' }).notNull(),
    note: text('note'),
    /** Öğretmenin mobil uygulamadan bildirdiği izin onay bekler; panoda yalnızca onaylananlar görünür */
    approvalStatus: text('approval_status').$type<'approved' | 'pending' | 'rejected'>().notNull().default('approved'),
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('teacher_leaves_school_idx').on(t.schoolId, t.endDate)],
);

/** Nöbet yerine görevlendirme: o tarihte (ör. izinli öğretmenin) nöbetini başka öğretmen tutar */
export const dutySubstitutions = pgTable(
  'duty_substitutions',
  {
    id: pk(),
    schoolId: schoolId(),
    date: date('date', { mode: 'string' }).notNull(),
    dutyId: uuid('duty_id')
      .notNull()
      .references(() => duties.id, { onDelete: 'cascade' }),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => teachers.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('duty_substitutions_school_date_duty_uq').on(t.schoolId, t.date, t.dutyId)],
);

export const students = pgTable(
  'students',
  {
    id: pk(),
    schoolId: schoolId(),
    fullName: text('full_name').notNull(),
    classGroupId: uuid('class_group_id').references(() => classGroups.id, { onDelete: 'set null' }),
    birthDate: date('birth_date', { mode: 'string' }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('students_school_idx').on(t.schoolId)],
);

export const exams = pgTable(
  'exams',
  {
    id: pk(),
    schoolId: schoolId(),
    title: text('title').notNull(),
    examAt: timestamp('exam_at', { withTimezone: true }).notNull(),
    isActive: isActive(),
    sortOrder: sortOrder(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('exams_school_idx').on(t.schoolId)],
);

/** Başarılar ve ayın öğrencisi */
export const achievements = pgTable(
  'achievements',
  {
    id: pk(),
    schoolId: schoolId(),
    kind: text('kind').$type<'month' | 'achievement'>().notNull(),
    name: text('name').notNull(),
    className: text('class_name'),
    title: text('title').notNull(),
    description: text('description'),
    photoUrl: text('photo_url'),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    isActive: isActive(),
    sortOrder: sortOrder(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('achievements_school_idx').on(t.schoolId)],
);

/** Kulüp ve etkinlik takvimi */
export const schoolEvents = pgTable(
  'school_events',
  {
    id: pk(),
    schoolId: schoolId(),
    title: text('title').notNull(),
    organizer: text('organizer'),
    date: date('date', { mode: 'string' }).notNull(),
    time: text('time'),
    place: text('place'),
    isActive: isActive(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('school_events_school_idx').on(t.schoolId, t.date)],
);

/** Kütüphane: haftanın kitabı */
export const books = pgTable(
  'books',
  {
    id: pk(),
    schoolId: schoolId(),
    title: text('title').notNull(),
    author: text('author').notNull(),
    coverUrl: text('cover_url'),
    note: text('note'),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    isActive: isActive(),
    sortOrder: sortOrder(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('books_school_idx').on(t.schoolId)],
);

export const announcements = pgTable(
  'announcements',
  {
    id: pk(),
    schoolId: schoolId(),
    kind: text('kind').$type<'image' | 'video' | 'text' | 'design'>().notNull(),
    title: text('title').notNull(),
    body: text('body'),
    imageUrl: text('image_url'),
    youtubeUrl: text('youtube_url'),
    /** Hazır şablonla hazırlanan duyuru (şablon, renk, metinler) */
    design: jsonb('design').$type<AnnouncementDesign>(),
    /** Yalnızca bu panolarda (boşsa bütün panolarda) */
    screenIds: jsonb('screen_ids').$type<string[]>(),
    /** Yayın akışı: günler, saat aralığı, zilin durumu */
    schedule: jsonb('schedule').$type<{ days: number[]; from: string | null; to: string | null; phase: 'any' | 'break' | 'lesson' }>(),
    /** Onay akışı: onaylanmamış duyuru panoda görünmez */
    approvalStatus: text('approval_status').$type<'approved' | 'pending' | 'rejected'>().notNull().default('approved'),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewNote: text('review_note'),
    durationSec: integer('duration_sec'),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    isActive: isActive(),
    sortOrder: sortOrder(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('announcements_school_idx').on(t.schoolId, t.sortOrder)],
);

export const tickerItems = pgTable(
  'ticker_items',
  {
    id: pk(),
    schoolId: schoolId(),
    text: text('text').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    isActive: isActive(),
    sortOrder: sortOrder(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('ticker_items_school_idx').on(t.schoolId)],
);

export const bellSchedules = pgTable(
  'bell_schedules',
  {
    id: pk(),
    schoolId: schoolId(),
    name: text('name').notNull(),
    weekdays: jsonb('weekdays').$type<number[]>().notNull(),
    periods: jsonb('periods').$type<Period[]>().notNull(),
    sortOrder: sortOrder(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('bell_schedules_school_idx').on(t.schoolId)],
);

export const timetableEntries = pgTable(
  'timetable_entries',
  {
    id: pk(),
    schoolId: schoolId(),
    weekday: integer('weekday').notNull(),
    periodNo: integer('period_no').notNull(),
    classGroupId: uuid('class_group_id')
      .notNull()
      .references(() => classGroups.id, { onDelete: 'cascade' }),
    teacherId: uuid('teacher_id').references(() => teachers.id, { onDelete: 'set null' }),
    subject: text('subject').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('timetable_cell_uq').on(t.schoolId, t.weekday, t.periodNo, t.classGroupId)],
);

export const screens = pgTable(
  'screens',
  {
    id: pk(),
    schoolId: schoolId(),
    name: text('name').notNull(),
    location: text('location'),
    tokenHash: text('token_hash').unique(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    /** Bu panoya özel kart düzeni; null ise okulun varsayılanı */
    layout: jsonb('layout').$type<BoardLayout>(),
    /** Ekran biçimi: yatay / dikey, yalnızca duyurular, video duvarı */
    display: jsonb('display').$type<Partial<ScreenDisplay>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('screens_school_idx').on(t.schoolId)],
);

/** Panoya anlık mesaj: onaya takılmaz, bitiş zamanı gelince kendiliğinden kalkar */
export const flashMessages = pgTable(
  'flash_messages',
  {
    id: pk(),
    schoolId: schoolId(),
    text: text('text').notNull(),
    style: text('style').$type<FlashStyle>().notNull().default('banner'),
    tone: text('tone').$type<FlashTone>().notNull().default('info'),
    /** Yalnızca bu panolarda (boşsa bütün panolarda) */
    screenIds: jsonb('screen_ids').$type<string[]>(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('flash_messages_school_idx').on(t.schoolId, t.endsAt)],
);

/** Günün modu (kısaltılmış gün, sınav, tören, tatil) ve zil kaydırmaları: yalnızca o tarih için */
export const dayPlans = pgTable(
  'day_plans',
  {
    id: pk(),
    schoolId: schoolId(),
    date: date('date', { mode: 'string' }).notNull(),
    mode: text('mode').$type<DayMode>().notNull().default('normal'),
    lessonMin: integer('lesson_min'),
    shifts: jsonb('shifts').$type<BellShift[]>().notNull().default(sql`'[]'::jsonb`),
    note: text('note'),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('day_plans_school_date_uq').on(t.schoolId, t.date)],
);

/** Telefon bildirimleri: kullanıcının mobil cihazlarının Expo push anahtarları */
export const pushTokens = pgTable(
  'push_tokens',
  {
    id: pk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    platform: text('platform').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('push_tokens_user_idx').on(t.userId)],
);

/** Ekranda gösterilen 6 haneli kodla cihaz eşleştirme (TV'lerde klavye gerekmez). */
export const displayPairings = pgTable('display_pairings', {
  id: pk(),
  code: text('code').notNull().unique(),
  pollSecretHash: text('poll_secret_hash').notNull(),
  screenId: uuid('screen_id').references(() => screens.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: pk(),
    schoolId: schoolId(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    summary: text('summary'),
    createdAt: createdAt(),
  },
  (t) => [index('audit_logs_school_idx').on(t.schoolId, t.createdAt)],
);
