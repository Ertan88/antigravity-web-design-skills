import { errorText, mondayOf, trDate } from '@okulpano/shared';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { openChoice } from './confirm.tsx';
import { sharePdf } from './download.ts';
import { useSchoolPath } from './auth.tsx';
import { useSchoolQuery } from './data.ts';
import { Sheet, SheetScroll } from './sheet.tsx';
import { Text } from './text.tsx';
import { colors } from './theme.ts';
import { Button, Icon, Loading, Segmented, T } from './ui.tsx';

/*
 * İşletmelerde mesleki eğitim formları (mobil): görev günü seçimi ve form yazdırma sayfası. PDF sunucuda hazırlanır
 * (her form A5, ikisi bir A4'te); telefonda paylaşım menüsüyle kaydedilir ya da yazdırılır.
 */

export const VISIT_DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'];
const VISIT_SHORT = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu'];
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

/** Görev günü: haftada bir gün; seçili güne yeniden dokununca kalkar */
export function VisitDayPicker({ value, editable, onChange }: { value: number | null; editable: boolean; onChange: (v: number | null) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }} accessibilityRole="radiogroup" accessibilityLabel="Görev günü">
      {VISIT_SHORT.map((d, i) => {
        const on = value === i + 1;
        return (
          <Pressable
            key={d}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, disabled: !editable }}
            accessibilityLabel={VISIT_DAYS[i]}
            disabled={!editable}
            onPress={() => onChange(on ? null : i + 1)}
            style={{
              width: 40,
              height: 34,
              borderRadius: 10,
              borderWidth: 1,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: on ? colors.primary : colors.card,
              borderColor: on ? colors.primary : colors.borderStrong,
            }}
          >
            <Text style={{ fontSize: 12.5, fontWeight: '800', color: on ? colors.onPrimary : editable ? colors.muted : colors.subtle }}>{d}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type FormType = 'daily' | 'attendance' | 'report';

interface FormItem {
  id: string;
  name: string;
  coordinatorName: string | null;
  students: number;
  visitWeekday: number | null;
  date?: string | null;
  holiday?: string | null;
  dates?: string[];
  /** Devam çizelgesi: kontrol edilmemiş (?) yarım günler */
  unchecked?: { halves: number; students: number } | null;
}

const TITLES: Record<FormType, string> = {
  daily: 'Günlük rehberlik formu',
  attendance: 'Aylık devam-devamsızlık çizelgesi',
  report: 'Aylık rehberlik raporu',
};

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const localToday = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
};
const addMonths = (month: string, n: number) => {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};
const dayMonth = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
const monthName = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

/** Form yazdır: tür, hafta ya da ay, işletmeler; PDF paylaşım menüsüyle açılır */
export function FormsSheet({ onClose }: { onClose: () => void }) {
  const path = useSchoolPath('internship');
  const [type, setType] = useState<FormType>('daily');
  const [week, setWeek] = useState(() => mondayOf(localToday()));
  const [month, setMonth] = useState(() => localToday().slice(0, 7));
  const daily = type === 'daily';
  const attendance = type === 'attendance';
  const q = useSchoolQuery<{ items: FormItem[]; monthOpen?: boolean; today?: string; settings: { programName: string; district: string; province: string } }>(
    `internship/forms?type=${type}&${daily ? `week=${week}` : `month=${month}`}`,
  );
  const items = useMemo(() => q.data?.items ?? [], [q.data]);
  // Devam çizelgesi görev gününe bağlı değildir: öğrencisi olan her işletme
  const usable = (b: FormItem) => (daily ? Boolean(b.date) : attendance ? b.students > 0 : Boolean(b.dates?.length));
  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => {
    setPicked(new Set(items.filter((b) => usable(b) && !b.holiday).map((b) => b.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);
  const shown = items.filter(usable).sort((a, b) => (daily ? (a.date ?? '').localeCompare(b.date ?? '') : 0));
  const noDay = attendance ? 0 : items.filter((b) => !b.visitWeekday).length;
  const settings = q.data?.settings;
  const placeMissing = type === 'report' && settings && (!settings.province || !settings.district);
  const chosen = shown.filter((b) => picked.has(b.id));
  const formCount = type === 'attendance' ? chosen.reduce((n, b) => n + Math.max(1, Math.ceil(b.students / 5)), 0) : chosen.length;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const share = async () => {
    // Devam çizelgesinde boş kalacak günler: kontrol edilmemişler ve ay bitmediyse bugünden sonrası
    if (attendance) {
      const halves = chosen.reduce((n, b) => n + (b.unchecked?.halves ?? 0), 0);
      const open = Boolean(q.data?.monthOpen);
      if (halves || open) {
        const days = String(halves / 2).replace('.', ',');
        const lines = [
          halves ? `${chosen.filter((b) => b.unchecked).length} işletmede ${days} gün kontrol edilmedi; bu günler çizelgede boş kalır.` : null,
          open && q.data?.today ? `Ay henüz bitmedi: ${dayMonth(q.data.today)} sonrası boş kalır.` : null,
        ].filter(Boolean);
        const c = await openChoice({
          title: 'Çizelgede boş günler kalacak',
          message: lines.join(' '),
          tone: 'warning',
          cancelLabel: 'Vazgeç',
          choices: [
            ...(halves ? [{ value: 'go' as const, label: "İşletmede Devam'a git", kind: 'secondary' as const }] : []),
            { value: 'print' as const, label: 'Yine de yazdır', kind: 'primary' as const },
          ],
        });
        if (c === 'go') {
          onClose();
          router.push('/isletme-devam');
          return;
        }
        if (c !== 'print') return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      const period = daily ? `week=${week}` : `month=${month}`;
      const label = daily ? `Günlük Rehberlik Formu ${trDate(week)}` : `${type === 'attendance' ? 'Aylık Devam Çizelgesi' : 'Aylık Rehberlik Raporu'} ${monthName(month)}`;
      await sharePdf(`${path}/forms.pdf?type=${type}&${period}&ids=${chosen.map((b) => b.id).join(',')}`, `${label}.pdf`);
    } catch (e) {
      setError(errorText(e, 'PDF hazırlanamadı'));
    } finally {
      setBusy(false);
    }
  };

  const fri = addDays(week, 4);
  const period = daily ? (week.slice(5, 7) === fri.slice(5, 7) ? `${Number(week.slice(8, 10))}–${dayMonth(fri)}` : `${dayMonth(week)} – ${dayMonth(fri)}`) : monthName(month);

  return (
    <Sheet open onClose={onClose}>
      <Text style={{ fontSize: 17, fontWeight: '800', color: colors.ink }}>Form yazdır</Text>
      <T size={12.5} color={colors.faint} style={{ marginTop: 2, marginBottom: 10 }}>
        Her form A5 boyutundadır; iki form bir A4 kâğıda sığar. Yazdırırken ölçeği “Gerçek boyut” (%100) seçin.
      </T>
      <Segmented
        options={[
          { value: 'daily', label: 'Günlük' },
          { value: 'attendance', label: 'Devam' },
          { value: 'report', label: 'Rapor' },
        ]}
        value={type}
        onChange={setType}
      />
      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.muted, marginTop: 8 }}>{TITLES[type]}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
        <Button variant="secondary" size="sm" icon="chevron-back" accessibilityLabel={daily ? 'Önceki hafta' : 'Önceki ay'} onPress={() => (daily ? setWeek(addDays(week, -7)) : setMonth(addMonths(month, -1)))} />
        <Text style={{ flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '800', color: colors.ink }}>{period}</Text>
        <Button variant="secondary" size="sm" icon="chevron-forward" accessibilityLabel={daily ? 'Sonraki hafta' : 'Sonraki ay'} onPress={() => (daily ? setWeek(addDays(week, 7)) : setMonth(addMonths(month, 1)))} />
      </View>
      <SheetScroll style={{ maxHeight: 340, marginTop: 10 }} contentContainerStyle={{ gap: 8 }}>
        {!q.data ? (
          <Loading />
        ) : !shown.length ? (
          <T size={13.5} color={colors.muted}>
            {items.length ? (daily ? 'Bu hafta görev günü olan işletme yok.' : 'Bu ayda görev tarihi olan işletme yok.') : 'Henüz işletme yok.'}
          </T>
        ) : (
          shown.map((b) => {
            const on = picked.has(b.id);
            return (
              <Pressable
                key={b.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                onPress={() =>
                  setPicked((s) => {
                    const n = new Set(s);
                    if (on) n.delete(b.id);
                    else n.add(b.id);
                    return n;
                  })
                }
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 12,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: b.holiday ? colors.danger : colors.borderStrong,
                  backgroundColor: colors.card,
                }}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 7,
                    borderWidth: 1.5,
                    borderColor: on ? colors.primary : colors.borderStrong,
                    backgroundColor: on ? colors.primary : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {on && <Icon name="checkmark" size={15} color={colors.onPrimary} strokeWidth={3} />}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  {daily && b.date && (
                    <Text style={{ fontSize: 12.5, fontWeight: '800', color: colors.muted }}>
                      {VISIT_DAYS[(b.visitWeekday ?? 1) - 1]} {trDate(b.date)}
                    </Text>
                  )}
                  <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink }} numberOfLines={1}>
                    {b.name}
                  </Text>
                  <T size={12.5} color={colors.faint}>
                    {b.coordinatorName ?? 'Koordinatör seçilmedi'} · {b.students} öğrenci
                  </T>
                  {attendance && b.unchecked && (
                    <T size={12.5} weight="700" color={colors.warning}>
                      {b.unchecked.students} öğrencide {b.unchecked.halves} yarım gün kontrol edilmedi
                    </T>
                  )}
                  {type === 'report' && b.dates && (
                    <T size={12.5} color={colors.faint}>
                      Görev tarihleri: {b.dates.map((d) => Number(d.slice(8, 10))).join(', ')} {MONTHS[Number(month.slice(5, 7)) - 1]}
                    </T>
                  )}
                  {b.holiday && (
                    <T size={12.5} weight="700" color={colors.danger}>
                      Tatil: {b.holiday}
                    </T>
                  )}
                </View>
              </Pressable>
            );
          })
        )}
        {attendance && q.data?.monthOpen && q.data.today && (
          <T size={12.5} weight="700" color={colors.warning}>
            Ay henüz bitmedi: {dayMonth(q.data.today)} sonrası çizelgede boş kalır.
          </T>
        )}
        {placeMissing && (
          <T size={12.5} weight="700" color={colors.warning}>
            Okul Ayarları'nda il ve ilçe girilmemiş; raporda boş kalır.
          </T>
        )}
        {noDay > 0 && (
          <T size={12.5} color={colors.faint}>
            Görev günü seçilmemiş {noDay} işletme listede yok. Görev günü işletmenin kartından seçilir.
          </T>
        )}
      </SheetScroll>
      {error && (
        <T size={13} color={colors.danger} style={{ marginTop: 8 }}>
          {error}
        </T>
      )}
      <View style={{ marginTop: 12 }}>
        <Button icon="share-outline" loading={busy} disabled={!formCount} onPress={() => void share()}>
          {formCount ? `PDF'i paylaş / kaydet · ${formCount} form` : 'Seçili form yok'}
        </Button>
      </View>
    </Sheet>
  );
}
