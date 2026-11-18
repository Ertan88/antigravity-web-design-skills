/**
 * Ödeme hatırlatma planı: son ödeme tarihinden geriye doğru bildirim zamanlarını üretir.
 * Saf fonksiyon — bildirimleri gerçekten kuran katman (expo-notifications) bunu kullanır.
 */
export type ReminderOffset = 'D-3' | 'D-1' | 'D0';

export interface ReminderSettings {
  offsets: ReminderOffset[];
  hour: number; // 0–23
  minute: number; // 0–59
}

export interface PlannedReminder {
  offset: ReminderOffset;
  fireAt: Date;
}

const DAYS: Record<ReminderOffset, number> = { 'D-3': 3, 'D-1': 1, D0: 0 };

export const DEFAULT_REMINDERS: ReminderSettings = { offsets: ['D-3', 'D-1', 'D0'], hour: 9, minute: 30 };

export function planReminders(dueDate: Date, settings: ReminderSettings, now: Date): PlannedReminder[] {
  return settings.offsets
    .map((offset) => {
      const d = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate() - DAYS[offset]);
      d.setHours(settings.hour, settings.minute, 0, 0);
      return { offset, fireAt: d };
    })
    .filter((r) => r.fireAt.getTime() > now.getTime())
    .sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
}

/** "Ertele" aksiyonu: şimdiden itibaren `minutes` sonra tekrar hatırlat. */
export const snooze = (now: Date, minutes = 120) => new Date(now.getTime() + minutes * 60_000);
