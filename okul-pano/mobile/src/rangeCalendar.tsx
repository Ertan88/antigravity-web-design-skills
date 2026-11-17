import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { addDays, dayTitle } from './day.ts';
import { Text } from './text.tsx';
import { colors, radius } from './theme.ts';
import { Icon } from './ui.tsx';

const WEEK = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'];
const weekday = (iso: string) => (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7; // Pazartesi = 0
const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
const addMonths = (iso: string, n: number) => {
  const d = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1 + n, 1));
  return d.toISOString().slice(0, 10);
};

/**
 * Takvimde aralık seçimi (yazı kutusu yok): ilk dokunuş başlangıç, ikincisi bitiş; tek gün için aynı güne iki kez
 * dokunulur. `min` öncesi (geçmiş günler) seçilemez; hafta sonları soluk görünür.
 */
export function RangeCalendar({ min, start, end, onChange }: { min: string; start: string; end: string; onChange: (start: string, end: string) => void }) {
  const [month, setMonth] = useState(monthStart(start || min));
  const first = monthStart(month);
  const lead = weekday(first);
  const days: (string | null)[] = [...Array.from({ length: lead }, () => null)];
  for (let d = first; d.slice(0, 7) === first.slice(0, 7); d = addDays(d, 1)) days.push(d);
  while (days.length % 7) days.push(null);
  const canPrev = monthStart(month) > monthStart(min);

  const tap = (d: string) => {
    if (!start || end) return onChange(d, '');
    if (d < start) return onChange(d, '');
    onChange(start, d);
  };
  const lo = start;
  const hi = end || start;

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink }}>{dayTitle(first, { month: 'long', year: 'numeric' })}</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {[
            { label: 'Önceki ay', icon: 'chevron-back' as const, n: -1, ok: canPrev },
            { label: 'Sonraki ay', icon: 'chevron-forward' as const, n: 1, ok: true },
          ].map((b) => (
            <Pressable
              key={b.label}
              accessibilityRole="button"
              accessibilityLabel={b.label}
              disabled={!b.ok}
              onPress={() => setMonth(addMonths(month, b.n))}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', opacity: b.ok ? 1 : 0.35 }}
            >
              <Icon name={b.icon} size={18} color={colors.ink} />
            </Pressable>
          ))}
        </View>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {WEEK.map((w) => (
          <Text key={w} style={{ flex: 1, textAlign: 'center', fontSize: 11.5, fontWeight: '800', color: colors.faint }}>
            {w}
          </Text>
        ))}
      </View>
      {Array.from({ length: days.length / 7 }, (_, r) => (
        <View key={r} style={{ flexDirection: 'row', gap: 3 }}>
          {days.slice(r * 7, r * 7 + 7).map((d, i) => {
            if (!d) return <View key={i} style={{ flex: 1, height: 42 }} />;
            const past = d < min;
            const weekend = weekday(d) >= 5;
            const edgeStart = Boolean(lo) && d === lo;
            const edgeEnd = Boolean(lo) && d === hi;
            const inside = Boolean(lo) && d > lo && d < hi;
            const edge = edgeStart || edgeEnd;
            return (
              <Pressable
                key={d}
                accessibilityRole="button"
                accessibilityLabel={dayTitle(d, { day: 'numeric', month: 'long', weekday: 'long' })}
                accessibilityState={{ selected: edge || inside, disabled: past }}
                disabled={past}
                onPress={() => tap(d)}
                style={{
                  flex: 1,
                  height: 42,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: edge ? colors.primary : inside ? colors.primarySoft : 'transparent',
                  borderTopLeftRadius: edgeStart || !edge ? radius.sm : 4,
                  borderBottomLeftRadius: edgeStart || !edge ? radius.sm : 4,
                  borderTopRightRadius: edgeEnd || !edge ? radius.sm : 4,
                  borderBottomRightRadius: edgeEnd || !edge ? radius.sm : 4,
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: edge ? '800' : '700', color: edge ? colors.onPrimary : past ? colors.border : weekend ? colors.subtle : colors.ink }}>
                  {Number(d.slice(8))}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
