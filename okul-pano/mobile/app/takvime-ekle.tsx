import { sortPeriods } from '@okulpano/shared/bell';
import { useState } from 'react';
import { Platform } from 'react-native';
import { syncToPhoneCalendar, type CalendarItem } from '../src/calendar.ts';
import { useMeToday, useSchoolQuery } from '../src/data.ts';
import { addDays, clock, fullDate, localIso } from '../src/day.ts';
import { colors } from '../src/theme.ts';
import { Button, Card, ErrorNote, Loading, Screen, SectionTitle, T, ToggleRow } from '../src/ui.tsx';

interface Exam {
  id: string;
  title: string;
  examAt: string;
  isActive: boolean;
}

/** "08:30" ve bir tarih → telefonun saatine göre Date */
const at = (iso: string, hm: string) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setHours(Number(hm.slice(0, 2)), Number(hm.slice(3, 5)), 0, 0);
  return d;
};

/** Telefon takvimine ekle: bu haftaki nöbetler ve yaklaşan sınavlar "Okul Yayın" takvimine yazılır */
export default function TakvimeEkle() {
  const me = useMeToday();
  const exams = useSchoolQuery<Exam[]>('exams');
  const [duties, setDuties] = useState(true);
  const [withExams, setWithExams] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const data = me.data;

  const dutyItems: CalendarItem[] = (data?.week ?? []).flatMap((d) => {
    if (d.holiday) return [];
    const own = d.duties.filter((x) => !x.coveredBy);
    if (!own.length || !data) return [];
    const schedule = data.bellSchedules.filter((s) => s.weekdays.includes(d.weekday)).sort((a, b) => a.weekdays.length - b.weekdays.length)[0];
    const periods = schedule ? sortPeriods(schedule.periods) : [];
    if (!periods.length) return [];
    const half = data.halfDays?.find((h) => h.date === d.date);
    const end = half && data.halfDayEnd ? data.halfDayEnd : periods[periods.length - 1]!.end;
    return own.map((x) => ({
      key: `duty:${d.date}:${x.dutyId}`,
      title: `Nöbet · ${x.area}`,
      start: at(d.date, periods[0]!.start),
      end: at(d.date, end),
      location: x.area,
      alarmMinutes: 15,
    }));
  });
  const today = localIso();
  const until = addDays(today, 60);
  const examItems: CalendarItem[] = (exams.data ?? [])
    .filter((e) => e.isActive && localIso(new Date(e.examAt)) >= today && localIso(new Date(e.examAt)) <= until)
    .map((e) => ({ key: `exam:${e.id}`, title: e.title, start: new Date(e.examAt), end: new Date(Date.parse(e.examAt) + 40 * 60_000), alarmMinutes: 24 * 60 }));
  const items = [...(duties ? dutyItems : []), ...(withExams ? examItems : [])];

  const sync = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await syncToPhoneCalendar(items, new Date(`${addDays(today, -7)}T00:00:00`), new Date(`${addDays(until, 1)}T00:00:00`));
      setMessage(
        r === 'ok'
          ? { ok: true, text: `${items.length} kayıt telefon takviminizdeki “Okul Yayın” takvimine yazıldı.` }
          : r === 'denied'
            ? { ok: false, text: 'Takvim izni verilmedi. Telefon ayarlarından Okul Yayın için takvim iznini açın.' }
            : { ok: false, text: 'Bu cihazda telefon takvimi kullanılamıyor.' },
      );
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Takvime yazılamadı' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      back
      title="Telefon takvimine ekle"
      footer={
        <>
          {message && (
            <T size={13} weight="600" color={message.ok ? colors.success : colors.danger} style={{ textAlign: 'center' }}>
              {message.text}
            </T>
          )}
          <Button size="lg" icon="calendar-outline" loading={busy} disabled={!items.length || Platform.OS === 'web'} onPress={() => void sync()}>
            {items.length ? `${items.length} kaydı takvime yaz` : 'Eklenecek kayıt yok'}
          </Button>
        </>
      }
    >
      <ErrorNote error={me.error ?? exams.error} />
      {!data ? (
        <Loading />
      ) : (
        <>
          <T size={14} color={colors.muted}>
            Kayıtlar telefonunuzda ayrı bir “Okul Yayın” takvimine yazılır. Yeniden eşitlediğinizde değişen nöbetler ve ertelenen sınavlar güncellenir; kendi
            kayıtlarınıza dokunulmaz.
          </T>
          <Card style={{ gap: 4 }}>
            <ToggleRow
              label="Bu haftaki nöbetlerim"
              description={`${dutyItems.length} nöbet · 15 dakika önce hatırlatma`}
              value={duties}
              onChange={setDuties}
            />
            <ToggleRow
              label="Yaklaşan sınavlar"
              description={`${examItems.length} sınav · 60 gün içinde · bir gün önce hatırlatma`}
              value={withExams}
              onChange={setWithExams}
            />
          </Card>
          {items.length > 0 && (
            <>
              <SectionTitle>Eklenecekler</SectionTitle>
              <Card style={{ gap: 8 }}>
                {items.map((it) => (
                  <T key={it.key} size={14}>
                    <T size={14} weight="700">
                      {it.title}
                    </T>
                    {`  ${fullDate(localIso(it.start))} · ${clock(it.start.toISOString())}`}
                  </T>
                ))}
              </Card>
            </>
          )}
          {Platform.OS === 'web' && (
            <T size={13} color={colors.warning} style={{ textAlign: 'center' }}>
              Telefon takvimine ekleme yalnızca telefondaki uygulamada çalışır.
            </T>
          )}
        </>
      )}
    </Screen>
  );
}
