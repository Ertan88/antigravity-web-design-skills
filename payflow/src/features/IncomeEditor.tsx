import { Pressable, View } from 'react-native';
import { uid } from '../core/dates';
import { IncomeSource } from '../core/model';
import { toLira } from '../core/money';
import { parseAmount } from '../core/parse';
import { useTheme } from '../theme/ThemeProvider';
import { fonts } from '../theme/tokens';
import { ChoiceChip, Stepper, TextField, ToggleRow } from '../ui/form';
import { AppText, Surface } from '../ui/primitives';

export interface IncomeDraft {
  id: string;
  name: string;
  day: number;
  amountText: string;
  variable: boolean;
}

export const toDrafts = (list: IncomeSource[]): IncomeDraft[] =>
  list.map((i) => ({ id: i.id, name: i.name, day: i.day, variable: i.variable, amountText: i.amount ? toLira(i.amount).toLocaleString('tr-TR', { maximumFractionDigits: 2 }) : '' }));

/** Taslakları doğrular; hata varsa ilk hatanın mesajını döner. */
export function fromDrafts(drafts: IncomeDraft[]): { incomes: IncomeSource[]; error: string | null } {
  const incomes: IncomeSource[] = [];
  for (const d of drafts) {
    const name = d.name.trim();
    if (!name) return { incomes: [], error: 'Her gelire bir ad ver (ör. Maaş, Ek ders)' };
    const amount = d.amountText.trim() ? parseAmount(d.amountText) : 0;
    if (amount === null) return { incomes: [], error: `${name}: geçerli bir tutar gir` };
    if (!amount && !d.variable) return { incomes: [], error: `${name}: tutarı gir` };
    incomes.push({ id: d.id, name, day: d.day, amount, variable: d.variable });
  }
  return { incomes, error: null };
}

const PRESETS: { name: string; day: number; variable: boolean }[] = [
  { name: 'Maaş', day: 15, variable: false },
  { name: 'Ek ders', day: 1, variable: true },
  { name: 'Diğer gelir', day: 1, variable: true },
];

/** Gelir kaynakları: ad, yattığı gün, net tutar, her ay değişir mi. */
export function IncomeEditor({ value, onChange }: { value: IncomeDraft[]; onChange: (v: IncomeDraft[]) => void }) {
  const { palette } = useTheme();
  const update = (id: string, patch: Partial<IncomeDraft>) => onChange(value.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  const add = (p: (typeof PRESETS)[number]) => onChange([...value, { id: uid('inc'), name: p.name, day: p.day, amountText: '', variable: p.variable }]);

  return (
    <View style={{ gap: 12 }}>
      {value.map((d) => (
        <Surface key={d.id} style={{ padding: 12, gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
            <TextField style={{ flex: 1 }} label="Gelir adı" value={d.name} onChangeText={(name) => update(d.id, { name })} />
            <Pressable accessibilityRole="button" accessibilityLabel={`${d.name || 'Geliri'} kaldır`} onPress={() => onChange(value.filter((x) => x.id !== d.id))} style={{ height: 50, justifyContent: 'center', paddingHorizontal: 6 }}>
              <AppText variant="label" color={palette.danger}>
                Kaldır
              </AppText>
            </Pressable>
          </View>
          <Stepper label="Yattığı gün" value={d.day} min={1} max={31} onChange={(day) => update(d.id, { day })} />
          <TextField
            label={d.variable ? 'Tahmini net tutar (₺) — isteğe bağlı' : 'Net tutar (₺)'}
            placeholder={d.variable ? 'Örn. 6.000' : 'Örn. 46.000'}
            value={d.amountText}
            onChangeText={(amountText) => update(d.id, { amountText })}
            keyboardType="decimal-pad"
          />
          <ToggleRow title="Her ay değişir" subtitle="Yattığı gün tutarı sorarız; tahmin girdiğin tutarların ortalamasıdır" value={d.variable} onChange={(variable) => update(d.id, { variable })} />
        </Surface>
      ))}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {PRESETS.map((p) => (
          <ChoiceChip key={p.name} label={`+ ${p.name}`} selected={false} onPress={() => add(p)} />
        ))}
      </View>
      <AppText variant="caption" muted style={{ fontFamily: fonts.body, lineHeight: 18 }}>
        Hesabına yatan <AppText variant="caption" style={{ fontFamily: fonts.bodyBold }}>net</AppText> tutarı gir; vergi kesintisini ayrıca hesaplaman gerekmez. Ek ders gibi her ay değişen gelirlerde "Her ay değişir"i aç.
      </AppText>
    </View>
  );
}
