import type { BellScheduleLike } from './bell.ts';
import type { SchoolSettings } from './schemas.ts';

/**
 * Panonun tek seferde çektiği veri paketi. Haftalık veriler (nöbet, ders programı,
 * zil çizelgeleri) bütün olarak gelir; pano hangi günün gösterileceğini kendi saatine göre
 * seçer. Böylece internet kesilse bile son paketle günlerce doğru çalışır.
 */
export interface DisplayState {
  serverTime: string;
  screen: { id: string; name: string } | null;
  school: {
    id: string;
    name: string;
    logoUrl: string | null;
    timezone: string;
    city: string | null;
    settings: SchoolSettings;
  };
  exams: { id: string; title: string; examAt: string }[];
  duties: { id: string; weekday: number; area: string; teacherName: string }[];
  /** Tarihe bağlı nöbetçi müdür yardımcıları (bugünden itibaren bir hafta) */
  dutySupervisors: { date: string; name: string }[];
  /** Taşımalı öğrenci görevlileri (bugünden itibaren bir hafta) */
  transportDuties: { date: string; teacherNames: string[] }[];
  leaves: { id: string; teacherName: string; startDate: string; endDate: string }[];
  birthdays: { id: string; name: string; className: string | null; monthDay: string }[];
  announcements: DisplayAnnouncement[];
  ticker: { id: string; text: string; startsAt: string | null; endsAt: string | null }[];
  bellSchedules: BellScheduleLike[];
  timetable: { weekday: number; periodNo: number; className: string; subject: string; teacherName: string | null }[];
}

export interface DisplayAnnouncement {
  id: string;
  kind: 'image' | 'video' | 'text';
  title: string;
  body: string | null;
  imageUrl: string | null;
  youtubeUrl: string | null;
  durationSec: number | null;
  startsAt: string | null;
  endsAt: string | null;
}

export interface WeatherNow {
  temperature: number;
  weatherCode: number;
  isDay: boolean;
  high: number | null;
  low: number | null;
  city: string | null;
  updatedAt: string;
}

/** SSE üzerinden panoya gönderilen olaylar */
export type DisplayEvent =
  | { type: 'content' }
  | { type: 'command'; command: 'reload' | 'identify'; screenId: string | null };

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
  if (code === 0) return { label: 'Açık', icon: isDay ? 'sun' : 'moon' };
  if (code === 1) return { label: 'Az bulutlu', icon: isDay ? 'cloud-sun' : 'cloud-moon' };
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
