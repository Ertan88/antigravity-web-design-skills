import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { DAILY_CATEGORIES } from '../core/categories';
import { monthName, uid } from '../core/dates';
import { statementCutFor } from '../core/finance/billingCycle';
import { PaymentSource } from '../core/model';
import { formatTL } from '../core/money';
import { applyKey, displayKeypad, parseAmount } from '../core/parse';
import { useStore } from '../store/StoreProvider';
import { useTheme } from '../theme/ThemeProvider';
import { fonts, radius } from '../theme/tokens';
import { ChoiceChip, Keypad, SectionLabel } from '../ui/form';
import { AppText, PrimaryButton } from '../ui/primitives';
import { CategoryGrid } from './shared';

const INSTALLMENTS = [1, 2, 3, 4, 6, 9, 12];
const DAYS = [
  { offset: 0, label: 'Bugün' },
  { offset: -1, label: 'Dün' },
  { offset: -2, label: '2 gün önce' },
];

const sourceKey = (s: PaymentSource) => (s.type === 'card' ? `card:${s.cardId}` : s.type);

/**
 * Harcama girişi. mode='card' kart harcaması (kaynak kredi kartı, taksit seçilebilir),
 * mode='daily' günlük harcama (nakit / banka kartı; kredi kartı da seçilebilir).
 */
export function ExpenseForm({ mode }: { mode: 'card' | 'daily' }) {
  const { palette } = useTheme();
  const { state, dispatch } = useStore();
  const cards = state.cards;

  const [text, setText] = useState('');
  const [source, setSource] = useState<PaymentSource>(
    mode === 'card' && cards[0] ? { type: 'card', cardId: cards[0].id } : { type: 'cash' },
  );
  const [categoryId, setCategoryId] = useState('grocery');
  const [installments, setInstallments] = useState(1);
  const [dayOffset, setDayOffset] = useState(0);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const categories = useMemo(() => [...DAILY_CATEGORIES, ...state.customCategories.filter((c) => c.kind === 'daily')], [state.customCategories]);
  const amount = parseAmount(displayKeypad(text)) ?? 0;
  const card = source.type === 'card' ? cards.find((c) => c.id === source.cardId) : undefined;

  const date = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    return d;
  }, [dayOffset]);

  if (mode === 'card' && cards.length === 0) {
    return (
      <View style={{ gap: 14 }}>
        <AppText variant="body" muted>
          Kart harcaması girmek için önce bir kredi kartı ekle. Hesap kesim ve son ödeme gününü girmen, harcamanın doğru ekstreye yazılmasını sağlar.
        </AppText>
        <PrimaryButton title="Kart ekle" onPress={() => router.push('/card-new')} />
      </View>
    );
  }

  const sources: { key: string; label: string; value: PaymentSource }[] = [
    ...(mode === 'daily'
      ? [
          { key: 'cash', label: 'Nakit', value: { type: 'cash' } as PaymentSource },
          { key: 'debit', label: 'Banka kartı', value: { type: 'debit' } as PaymentSource },
        ]
      : []),
    ...cards.map((c) => ({ key: `card:${c.id}`, label: `${c.name} •${c.last4}`, value: { type: 'card', cardId: c.id } as PaymentSource })),
  ];

  const save = () => {
    if (amount <= 0) return setError('Tutar gir');
    dispatch({
      type: 'expense/add',
      expense: {
        id: uid('exp'),
        amount,
        categoryId,
        date: date.toISOString(),
        source,
        installments: source.type === 'card' ? installments : 1,
        note: note.trim() || undefined,
      },
    });
    router.back();
  };

  return (
    <View style={{ gap: 16 }}>
      <View style={{ alignItems: 'center', paddingVertical: 4 }}>
        <AppText variant="caption" muted>
          Tutar
        </AppText>
        <AppText variant="display" style={{ fontSize: 46 }} accessibilityLabel={`Tutar ${formatTL(amount)}`}>
          ₺{displayKeypad(text)}
        </AppText>
        {error ? (
          <AppText variant="caption" color={palette.danger}>
            {error}
          </AppText>
        ) : null}
      </View>

      <View style={{ gap: 8 }}>
        <SectionLabel>{mode === 'card' ? 'HANGİ KART?' : 'NEREDEN ÖDENDİ?'}</SectionLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {sources.map((s) => (
            <ChoiceChip key={s.key} label={s.label} selected={sourceKey(source) === s.key} onPress={() => setSource(s.value)} />
          ))}
        </View>
        {card ? (
          <AppText variant="caption" muted>
            Bu harcama <AppText variant="caption" style={{ fontFamily: fonts.bodyBold }}>{monthName(statementCutFor(date, card))} ekstresine</AppText> yazılır.
          </AppText>
        ) : null}
      </View>

      {card ? (
        <View style={{ gap: 8 }}>
          <SectionLabel>TAKSİT</SectionLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {INSTALLMENTS.map((n) => (
              <ChoiceChip key={n} label={n === 1 ? 'Tek çekim' : `${n} taksit`} selected={installments === n} onPress={() => setInstallments(n)} />
            ))}
          </View>
          {installments > 1 && amount > 0 ? (
            <AppText variant="caption" muted>
              {installments} × ≈ {formatTL(Math.floor(amount / installments))} · gelecek ekstrelere otomatik dağıtılır
            </AppText>
          ) : null}
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        <SectionLabel>KATEGORİ</SectionLabel>
        <CategoryGrid categories={categories} value={categoryId} onChange={setCategoryId} kind="daily" />
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {DAYS.map((d) => (
          <ChoiceChip key={d.offset} label={d.label} selected={dayOffset === d.offset} onPress={() => setDayOffset(d.offset)} />
        ))}
      </View>
      <TextInput
        accessibilityLabel="Not"
        placeholder="Not ekle (ör. Kasım alışverişi)"
        placeholderTextColor={palette.muted}
        value={note}
        onChangeText={setNote}
        style={{ height: 46, borderRadius: radius.md, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surface, color: palette.text, paddingHorizontal: 14, fontFamily: fonts.body }}
      />

      <Keypad
        onKey={(k) => {
          setError(null);
          setText((t) => applyKey(t, k));
        }}
      />
      <PrimaryButton title="Kaydet" onPress={save} />
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={{ alignSelf: 'center', padding: 8 }}>
        <AppText variant="label" muted>
          Vazgeç
        </AppText>
      </Pressable>
    </View>
  );
}
