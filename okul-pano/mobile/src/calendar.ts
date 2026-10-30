import * as Calendar from 'expo-calendar/legacy';
import { Platform } from 'react-native';

const TITLE = 'Okul Yayın';

export interface CalendarItem {
  /** Uygulamanın kendi anahtarı (notlara yazılır): aynı kayıt iki kez eklenmez */
  key: string;
  title: string;
  start: Date;
  end: Date;
  location?: string | null;
  alarmMinutes?: number;
}

/** Telefonda "Okul Yayın" takvimi: yoksa oluşturulur (Android'de yerel hesap, iOS'ta varsayılan kaynak) */
async function ensureCalendar(): Promise<string> {
  const all = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const found = all.find((c) => c.title === TITLE && c.allowsModifications);
  if (found) return found.id;
  const source =
    Platform.OS === 'ios'
      ? { sourceId: (await Calendar.getDefaultCalendarAsync()).source.id }
      : {
          source: { isLocalAccount: true, name: TITLE, type: Calendar.SourceType?.LOCAL ?? 'LOCAL' },
          name: TITLE,
          ownerAccount: 'personal',
          accessLevel: Calendar.CalendarAccessLevel.OWNER,
        };
  return Calendar.createCalendarAsync({ title: TITLE, color: '#0E5E66', entityType: Calendar.EntityTypes.EVENT, ...source } as never);
}

/**
 * Nöbetleri ve sınavları telefonun takvimine yazar. Uygulamanın eklediği kayıtlar ayrı bir takvimde durur; her
 * eşitlemede o aralıktaki eski kayıtlar silinip yenileri yazılır (değişen nöbet ya da ertelenen sınav güncellenir).
 */
export async function syncToPhoneCalendar(items: CalendarItem[], from: Date, to: Date): Promise<'ok' | 'denied' | 'unavailable'> {
  if (Platform.OS === 'web' || !(await Calendar.isAvailableAsync())) return 'unavailable';
  const perm = await Calendar.requestCalendarPermissionsAsync();
  if (!perm.granted) return 'denied';
  const id = await ensureCalendar();
  const existing = await Calendar.getEventsAsync([id], from, to);
  for (const e of existing) if (e.notes?.includes('okulyayin:')) await Calendar.deleteEventAsync(e.id);
  for (const it of items) {
    await Calendar.createEventAsync(id, {
      title: it.title,
      startDate: it.start,
      endDate: it.end,
      location: it.location ?? undefined,
      notes: `Okul Yayın uygulamasından eklendi. okulyayin:${it.key}`,
      alarms: it.alarmMinutes != null ? [{ relativeOffset: -it.alarmMinutes }] : [],
    });
  }
  return 'ok';
}
