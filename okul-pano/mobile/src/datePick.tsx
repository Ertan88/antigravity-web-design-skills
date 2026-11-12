import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Sheet } from './sheet.tsx';
import { Text } from './text.tsx';
import { colors } from './theme.ts';
import { Button, Icon } from './ui.tsx';

const WEEK = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'];
const monthFmt = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' });

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * Takvimden gün seçimi (alt sayfa): ay ay ileri / geri, haftalar pazartesiyle başlar. `min` öncesi günler seçilemez.
 * Ek paket gerektirmez; uygulamada ve web sürümünde aynı görünür.
 */
export function DatePickSheet({
  open,
  title,
  value,
  min,
  onPick,
  onClose,
}: {
  open: boolean;
  title: string;
  value: Date | null;
  min?: Date;
  onPick: (day: Date) => void;
  onClose: () => void;
}) {
  const today = startOfDay(new Date());
  const [month, setMonth] = useState(() => {
    const base = value ?? today;
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const lead = (month.getDay() + 6) % 7;
  const daysIn = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))];
  while (cells.length % 7) cells.push(null);
  const floor = min ? startOfDay(min) : null;
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));

  return (
    <Sheet open={open} onClose={onClose}>
      <View style={{ gap: 12 }}>
        <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink }}>{title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Önceki ay" onPress={() => shift(-1)} hitSlop={10} style={{ padding: 6 }}>
            <Icon name="chevron-back" size={22} />
          </Pressable>
          <Text style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800', color: colors.ink }}>{monthFmt.format(month)}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Sonraki ay" onPress={() => shift(1)} hitSlop={10} style={{ padding: 6 }}>
            <Icon name="chevron-forward" size={22} />
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row' }}>
          {WEEK.map((d) => (
            <Text key={d} style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '700', color: colors.faint }}>
              {d}
            </Text>
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {cells.map((d, i) => {
            if (!d) return <View key={`e${i}`} style={{ width: `${100 / 7}%`, height: 44 }} />;
            const disabled = floor ? d < floor : false;
            const selected = value ? sameDay(d, value) : false;
            const isToday = sameDay(d, today);
            return (
              <View key={d.toISOString()} style={{ width: `${100 / 7}%`, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled }}
                  accessibilityLabel={d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' })}
                  disabled={disabled}
                  onPress={() => onPick(d)}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: selected ? colors.primary : 'transparent',
                    borderWidth: isToday && !selected ? 1 : 0,
                    borderColor: colors.borderStrong,
                  }}
                >
                  <Text style={{ fontSize: 15, fontWeight: selected ? '800' : '600', color: selected ? colors.onPrimary : disabled ? colors.subtle : colors.ink, opacity: disabled ? 0.5 : 1 }}>{d.getDate()}</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
        <Button variant="secondary" onPress={onClose}>
          Vazgeç
        </Button>
      </View>
    </Sheet>
  );
}
