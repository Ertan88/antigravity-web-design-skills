import type { BellScheduleLike } from './bell.ts';
import type { BoardLayout } from './layout.ts';
import type { AnnouncementDesign } from './designs.ts';
import type { DisplayEmergency } from './emergency.ts';
import type { ScreenDisplay } from './screen.ts';
import type { ScreenCommand } from './control.ts';
import type { SchoolSettings } from './schemas.ts';

/**
 * Panonun tek seferde çektiği veri paketi. Haftalık veriler (nöbet, ders programı,
 * zil çizelgeleri) bütün olarak gelir; pano hangi günün gösterileceğini kendi saatine göre
 * seçer. Böylece internet kesilse bile son paketle günlerce doğru çalışır.
 */
export interface DisplayState {
  serverTime: string;
  /** Sunucu sürümü: güncelleme yayınlanınca panolar kendini yeniler (eski kodla çalışmaya devam etmesin) */
  appVersion?: string;
  screen: { id: string; name: string } | null;
  school: {
    id: string;
    name: string;
    logoUrl: string | null;
    timezone: string;
    city: string | null;
    settings: SchoolSettings;
    /** Deneme süresi doldu: pano içerik yerine "abonelik sona erdi" ekranı gösterir */
    subscriptionEnded?: boolean;
  };
  /** Bu panonun düzeni (panoya özel ya da okulun) */
  layout: BoardLayout;
  /** Ekran biçimi (yatay / dikey, tam pano ya da yalnızca duyurular) */
  display?: ScreenDisplay;
  /** Etkin acil durum: bütün panolarda tam ekran uyarı */
  emergency?: DisplayEmergency | null;
  exams: { id: string; title: string; examAt: string }[];
  duties: { id: string; weekday: number; area: string; teacherName: string }[];
  /** Tarihe bağlı nöbetçi müdür yardımcıları (bugünden itibaren bir hafta) */
  dutySupervisors: { date: string; name: string }[];
  /** Resmi / dini ve okulun tatilleri (bugünden itibaren bir hafta) */
  holidays: { date: string; name: string }[];
  /** Taşımalı öğrenci görevlileri (bugünden itibaren bir hafta) */
  transportDuties: { date: string; teacherNames: string[] }[];
  leaves: { id: string; teacherName: string; startDate: string; endDate: string }[];
  birthdays: { id: string; name: string; className: string | null; monthDay: string }[];
  announcements: DisplayAnnouncement[];
  ticker: { id: string; text: string; startsAt: string | null; endsAt: string | null }[];
  bellSchedules: BellScheduleLike[];
  timetable: { weekday: number; periodNo: number; className: string; subject: string; teacherName: string | null }[];
  /** Başarılar ve ayın öğrencisi (yayın aralığındakiler) */
  achievements?: { id: string; kind: 'month' | 'achievement'; name: string; className: string | null; title: string; description: string | null; photoUrl: string | null; startsAt: string | null; endsAt: string | null }[];
  /** Bugünden itibaren 30 günlük etkinlik takvimi */
  events?: { id: string; title: string; organizer: string | null; date: string; time: string | null; place: string | null }[];
  /** Haftanın kitabı (yayın aralığındakiler; ilki gösterilir) */
  books?: { id: string; title: string; author: string; coverUrl: string | null; note: string | null; startsAt: string | null; endsAt: string | null }[];
  /** Kayan yazıya eklenen RSS başlıkları (ör. MEB duyuruları) */
  rss?: { source: string; title: string }[];
  /** Nöbet yerine görevlendirme: o tarihte nöbeti başka öğretmen tutar */
  dutySubstitutions?: { date: string; dutyId: string; teacherName: string }[];
}

export interface DisplayAnnouncement {
  id: string;
  kind: 'image' | 'video' | 'text' | 'design';
  title: string;
  /** Hazır şablonla hazırlanan duyuru */
  design?: AnnouncementDesign | null;
  body: string | null;
  imageUrl: string | null;
  youtubeUrl: string | null;
  durationSec: number | null;
  startsAt: string | null;
  endsAt: string | null;
  /** Yayın akışı: günler, saat aralığı, zilin durumu (pano yerinde süzer) */
  schedule?: { days: number[]; from: string | null; to: string | null; phase: 'any' | 'break' | 'lesson' } | null;
}

/**
 * Duyuru şu an gösterilsin mi: gün, saat aralığı ve zilin durumu (teneffüs / ders).
 * Pano yerinde hesaplar; internet kesilse de akış doğru işler.
 */
export function announcementOnAir(
  schedule: DisplayAnnouncement['schedule'],
  now: { weekday: number; secondsOfDay: number; phase: 'lesson' | 'break' | 'other' },
): boolean {
  if (!schedule) return true;
  if (schedule.days.length && !schedule.days.includes(now.weekday)) return false;
  const sec = (hm: string) => Number(hm.slice(0, 2)) * 3600 + Number(hm.slice(3, 5)) * 60;
  if (schedule.from && now.secondsOfDay < sec(schedule.from)) return false;
  if (schedule.to && now.secondsOfDay >= sec(schedule.to)) return false;
  if (schedule.phase === 'break' && now.phase !== 'break') return false;
  if (schedule.phase === 'lesson' && now.phase !== 'lesson') return false;
  return true;
}

export interface WeatherAlert {
  kind: 'snow' | 'heat' | 'cold' | 'storm' | 'thunder' | 'ice';
  day: 'today' | 'tomorrow';
  text: string;
}

export interface WeatherNow {
  temperature: number;
  weatherCode: number;
  isDay: boolean;
  high: number | null;
  low: number | null;
  city: string | null;
  updatedAt: string;
  /** Bugün ve yarın için uyarılar (yoğun kar, aşırı sıcak, fırtına…); üst barda yalnızca bugünkü */
  alerts?: WeatherAlert[];
}

/** SSE üzerinden panoya gönderilen olaylar */
export type DisplayEvent =
  | { type: 'content' }
  | { type: 'command'; command: ScreenCommand; screenId: string | null };

export function isWithinWindow(nowMs: number, startsAt: string | null, endsAt: string | null): boolean {
  if (startsAt && Date.parse(startsAt) > nowMs) return false;
  if (endsAt && Date.parse(endsAt) <= nowMs) return false;
  return true;
}

/** "Ayşe Nur Yılmaz" -> "Ayşe Nur Y." */
export function formatPersonName(fullName: string, format: 'full' | 'initial'): string {
  const parts = fullName.trim().split(/\s+/);
  if (format === 'full' || parts.length < 2) return parts.join(' ');
  const last = parts.pop()!;
  return `${parts.join(' ')} ${last.charAt(0).toLocaleUpperCase('tr-TR')}.`;
}

export type WeatherIcon = 'sun' | 'moon' | 'cloud-sun' | 'cloud-moon' | 'cloud' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';

/** WMO hava durumu kodlarını Türkçe açıklamaya ve simgeye çevirir. */
export function weatherInfo(code: number, isDay: boolean): { label: string; icon: WeatherIcon } {
  if (code === 0) return { label: isDay ? 'Açık ve güneşli' : 'Açık', icon: isDay ? 'sun' : 'moon' };
  if (code === 1) return { label: isDay ? 'Az bulutlu, güneşli' : 'Az bulutlu', icon: isDay ? 'cloud-sun' : 'cloud-moon' };
  if (code === 2) return { label: 'Parçalı bulutlu', icon: isDay ? 'cloud-sun' : 'cloud-moon' };
  if (code === 3) return { label: 'Kapalı', icon: 'cloud' };
  if (code === 45 || code === 48) return { label: 'Sisli', icon: 'fog' };
  if (code >= 51 && code <= 57) return { label: 'Çisenti', icon: 'drizzle' };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { label: 'Yağmurlu', icon: 'rain' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: 'Karlı', icon: 'snow' };
  if (code >= 95) return { label: 'Gök gürültülü', icon: 'storm' };
  return { label: '—', icon: 'cloud' };
}

export const WEEKDAY_NAMES = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'] as const;
export const WEEKDAY_SHORT = ['', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'] as const;
