import { lunchIndex, type Period } from '@okulpano/shared/bell';
import { useEffect, useState } from 'react';
import { useMeToday, useMyDuties } from './data.ts';
import { scheduleReminders } from './push.ts';
import type { MeToday, MyDuties } from './data.ts';
import { dayBellPeriods } from './day.ts';
import { storage } from './storage.ts';

/*
 * Nöbet hatırlatmaları: telefonun kendisinde kurulan bildirimler (sunucu ve internet gerekmez). Ayarlar telefonda
 * saklanır; nöbet ya da ders programı değişince ve uygulama her açıldığında yeniden kurulur.
 * Değişiklik bildirimleri (yerinize görevlendirme, yeni görev) sunucudan gelir, burada ayarlanmaz.
 */

export interface ReminderSettings {
  /** Nöbetten önceki akşam */
  evening: { on: boolean; time: '19:00' | '20:00' | '21:00' };
  /** Nöbet sabahı, ilk dersten kaç dakika önce */
  morning: { on: boolean; before: 30 | 15 | 0 };
  /** Nöbet günü her teneffüs başında */
  breaks: { on: boolean };
  /** Taşımalı görev: öğle arası ve servis (son ders) saatinden 10 dk önce */
  transport: { on: boolean };
  /** Son dersten sonra nöbet defteri */
  logbook: { on: boolean };
}

export const DEFAULT_REMINDERS: ReminderSettings = {
  evening: { on: true, time: '20:00' },
  morning: { on: true, before: 15 },
  breaks: { on: false },
  transport: { on: true },
  logbook: { on: false },
};

const KEY = 'okulpano.dutyReminders';
const listeners = new Set<(s: ReminderSettings) => void>();

export async function loadReminders(): Promise<ReminderSettings> {
  try {
    const raw = await storage.get(KEY);
    if (!raw) return DEFAULT_REMINDERS;
    const saved = JSON.parse(raw) as Partial<ReminderSettings>;
    return {
      evening: { ...DEFAULT_REMINDERS.evening, ...saved.evening },
      morning: { ...DEFAULT_REMINDERS.morning, ...saved.morning },
      breaks: { ...DEFAULT_REMINDERS.breaks, ...saved.breaks },
      transport: { ...DEFAULT_REMINDERS.transport, ...saved.transport },
      logbook: { ...DEFAULT_REMINDERS.logbook, ...saved.logbook },
    };
  } catch {
    return DEFAULT_REMINDERS;
  }
}

export async function saveReminders(s: ReminderSettings) {
  await storage.set(KEY, JSON.stringify(s));
  listeners.forEach((l) => l(s));
}

/** Ayarlar (değişince bütün ekranlar ve zamanlayıcı güncellenir) */
export function useReminderSettings(): [ReminderSettings | null, (s: ReminderSettings) => void] {
  const [s, setS] = useState<ReminderSettings | null>(null);
  useEffect(() => {
    void loadReminders().then(setS);
    listeners.add(setS);
    return () => void listeners.delete(setS);
  }, []);
  return [s, (next) => void saveReminders(next)];
}

/** Menü satırında açık olanların kısa özeti */
export function reminderSummary(s: ReminderSettings | null): string {
  if (!s) return 'Telefonunuza bildirim olarak gelir';
  const on = [s.evening.on && 'akşamdan', s.morning.on && 'sabah', s.breaks.on && 'teneffüslerde', s.transport.on && 'taşımalı', s.logbook.on && 'gün sonu'].filter(Boolean);
  return on.length ? `Açık · ${on.join(', ')}` : 'Kapalı';
}

export interface Reminder {
  at: Date;
  title: string;
  body: string;
  url: string;
}

const addMin = (hm: string, n: number) => {
  const t = Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5)) + n;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
/** Telefonun saatiyle (okul saat dilimi telefonla aynı varsayılır) */
const at = (date: string, hm: string) => new Date(`${date}T${hm}:00`);
const prevDate = (iso: string) => new Date(Date.parse(`${iso}T12:00:00Z`) - 86400_000).toISOString().slice(0, 10);
const DAY_NAMES = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

/** O günün zil saatleri (arifede yarım gün saatinden sonrası düşer) */
function periodsOf(me: MeToday, date: string, weekday: number): Period[] {
  let periods = dayBellPeriods(me, weekday, 'morning', date);
  if (me.halfDays?.some((h) => h.date === date) && me.halfDayEnd) periods = periods.filter((p) => p.start < me.halfDayEnd!);
  return periods;
}

/**
 * Önümüzdeki günlerin hatırlatmaları (saf hesap). Telefonlar en çok 64 bekleyen bildirim tuttuğu için en yakın 60'ı alınır.
 */
export function buildReminders(me: MeToday, duties: MyDuties, s: ReminderSettings, now = new Date()): Reminder[] {
  const out: Reminder[] = [];
  // Ay sonunda me/duties yalnızca bu ayı verir; önümüzdeki 8 günün nöbetleri me/today'den eklenir
  const seen = new Set(duties.days.map((d) => d.date));
  const days = [...duties.days, ...me.week.filter((w) => !seen.has(w.date)).map((w) => ({ ...w, transport: null }))];
  for (const d of days) {
    if (d.holiday) continue;
    const mine = d.duties.filter((x) => !x.coveredBy);
    const transport = d.transport;
    if (!mine.length && !transport) continue;
    const periods = periodsOf(me, d.date, d.weekday);
    if (!periods.length) continue;
    const first = periods[0]!;
    const last = periods[periods.length - 1]!;
    const area = mine.map((x) => x.area).join(', ');
    const partners = [...new Set(mine.flatMap((x) => x.partners))];
    const withWho = partners.length ? ` · birlikte: ${partners.join(', ')}` : '';
    const what = mine.length ? area : 'Taşımalı görev';

    if (s.evening.on)
      out.push({ at: at(prevDate(d.date), s.evening.time), title: 'Yarın nöbetçisiniz', body: `${DAY_NAMES[d.weekday]} · ${what}${withWho}`, url: '/nobet' });
    if (s.morning.on && mine.length)
      out.push({
        at: at(d.date, addMin(first.start, -s.morning.before)),
        title: `Bugün nöbetçisiniz · ${area}`,
        body: `İlk ders ${first.start}${partners.length ? `. Birlikte: ${partners.join(', ')}` : ''}`,
        url: '/nobet',
      });
    if (s.breaks.on && mine.length)
      periods.slice(0, -1).forEach((p, i) => {
        const next = periods[i + 1]!;
        out.push({ at: at(d.date, p.end), title: `Teneffüs · nöbet yeriniz ${area}`, body: `${next.start}'de ${next.no}. ders başlar`, url: '/nobet' });
      });
    if (s.transport.on && transport) {
      // Öğle arası: günün en uzun arası (panodaki hesapla aynı)
      const lunchAt = lunchIndex(periods, me.lunchThresholdMin);
      if (lunchAt > 0) out.push({ at: at(d.date, addMin(periods[lunchAt - 1]!.end, -10)), title: 'Öğle nöbeti 10 dk sonra', body: 'Taşımalı öğrencilerin öğle yemeği', url: '/nobet' });
      out.push({ at: at(d.date, addMin(last.end, -10)), title: 'Servis nöbeti 10 dk sonra', body: `Son ders ${last.end}'de biter · taşımalı öğrencilerin uğurlanması`, url: '/nobet' });
    }
    if (s.logbook.on && mine.length) out.push({ at: at(d.date, addMin(last.end, 5)), title: 'Nöbet defteri', body: 'Nöbet defterini imzalamayı unutmayın', url: '/nobet' });
  }
  return out
    .filter((r) => r.at.getTime() > now.getTime() && r.at.getTime() < now.getTime() + 21 * 86400_000)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, 60);
}

/** Öğretmen kaydı olan herkes için: nöbet, program ya da ayar değişince telefondaki hatırlatmalar yeniden kurulur */
export function useDutyReminders(enabled: boolean) {
  const me = useMeToday();
  const duties = useMyDuties();
  const [settings] = useReminderSettings();
  useEffect(() => {
    if (!enabled || !me.data?.teacher || !duties.data || !settings) return;
    void scheduleReminders(buildReminders(me.data, duties.data, settings)).catch(() => undefined);
  }, [enabled, me.data, duties.data, settings]);
}
