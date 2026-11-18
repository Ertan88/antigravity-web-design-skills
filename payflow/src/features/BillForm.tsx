import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { BILL_TYPES } from '../core/categories';
import { fromISODate, toISODate, uid } from '../core/dates';
import { Bill } from '../core/model';
import { toLira } from '../core/money';
import { clampedDate, startOfDay } from '../core/finance/billingCycle';
import { parseAmount } from '../core/parse';
import { ReminderSettings } from '../core/reminders';
import { formatLongDate } from '../core/schedule';
import { useStore } from '../store/StoreProvider';
import { useTheme } from '../theme/ThemeProvider';
import { Segmented, SectionLabel, Stepper, TextField, ToggleRow } from '../ui/form';
import { Icon } from '../ui/icons';
import { AppText, PrimaryButton } from '../ui/primitives';
import { CategoryGrid, ReminderPicker } from './shared';

/** Seçilen gün bu ay geçtiyse gelecek aya düşen ilk tarih. */
export function nextDateForDay(day: number, now: Date): Date {
  const today = startOfDay(now);
  const thisMonth = clampedDate(today.getFullYear(), today.getMonth(), day);
  return thisMonth.getTime() >= today.getTime() ? thisMonth : clampedDate(today.getFullYear(), today.getMonth() + 1, day);
}

export function BillForm({ initial }: { initial?: Bill } = {}) {
  const { palette } = useTheme();
  const { state, dispatch } = useStore();
  const types = useMemo(() => [...BILL_TYPES, ...state.customCategories.filter((c) => c.kind === 'bill')], [state.customCategories]);

  const [typeId, setTypeId] = useState(initial?.typeId ?? 'electricity');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [institution, setInstitution] = useState(initial?.institution ?? '');
  const [subscriberNo, setSubscriberNo] = useState(initial?.subscriberNo ?? '');
  const [amountText, setAmountText] = useState(initial ? toLira(initial.amount).toLocaleString('tr-TR', { maximumFractionDigits: 2 }) : '');
  const [variable, setVariable] = useState(initial?.variableAmount ?? false);
  const [recurrence, setRecurrence] = useState<'monthly' | 'once'>(initial?.recurrence.type ?? 'monthly');
  const [dueDay, setDueDay] = useState(
    initial ? (initial.recurrence.type === 'monthly' ? initial.recurrence.dueDay : fromISODate(initial.recurrence.dueDate).getDate()) : Math.min(new Date().getDate() + 3, 28),
  );
  const [reminders, setReminders] = useState<ReminderSettings>(initial?.reminders ?? state.settings.defaultReminders);
  const [shared, setShared] = useState(initial?.shared ?? false);
  const [errors, setErrors] = useState<{ amount?: string }>({});

  const type = types.find((t) => t.id === typeId) ?? types[0];
  const nextDue = nextDateForDay(dueDay, new Date());

  const save = () => {
    const amount = parseAmount(amountText);
    if (amount === null || amount <= 0) return setErrors({ amount: 'Geçerli bir tutar gir (ör. 845,30)' });
    dispatch({
      type: initial ? 'bill/update' : 'bill/add',
      bill: {
        id: initial?.id ?? uid('bill'),
        typeId,
        title: title.trim() || type.name,
        institution: institution.trim() || undefined,
        subscriberNo: subscriberNo.trim() || undefined,
        amount,
        variableAmount: variable,
        recurrence: recurrence === 'monthly' ? { type: 'monthly', dueDay } : { type: 'once', dueDate: toISODate(nextDue) },
        reminders,
        shared,
        paidPeriods: initial?.paidPeriods ?? [],
        createdAt: initial?.createdAt ?? toISODate(new Date()),
      },
    });
    router.back();
  };

  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 8 }}>
        <SectionLabel>FATURA TÜRÜ</SectionLabel>
        <CategoryGrid categories={types} value={typeId} onChange={setTypeId} kind="bill" columns={4} />
      </View>

      <TextField label="Ad" placeholder={type.name} value={title} onChangeText={setTitle} />
      <TextField label="Kurum" placeholder="Ör. elektrik dağıtım şirketi" value={institution} onChangeText={setInstitution} />
      <TextField label="Abone / sözleşme no" placeholder="İsteğe bağlı" value={subscriberNo} onChangeText={setSubscriberNo} keyboardType="number-pad" />
      <TextField
        label="Tutar (₺)"
        placeholder="845,30"
        value={amountText}
        onChangeText={(t) => {
          setAmountText(t);
          setErrors({});
        }}
        keyboardType="decimal-pad"
        error={errors.amount}
      />
      <ToggleRow title="Tutar her ay değişir" subtitle="Toplamlarda bu tutar tahmin olarak kullanılır" value={variable} onChange={setVariable} />

      <Segmented
        label="Tekrar"
        value={recurrence}
        onChange={setRecurrence}
        options={[
          { value: 'monthly', label: 'Her ay' },
          { value: 'once', label: 'Tek seferlik' },
        ]}
      />
      <Stepper label="Son ödeme günü" value={dueDay} min={1} max={31} onChange={setDueDay} />
      <AppText variant="caption" muted>
        {recurrence === 'monthly' ? 'İlk son ödeme: ' : 'Son ödeme: '}
        {formatLongDate(nextDue)}
        {dueDay > 28 && recurrence === 'monthly' ? ' · kısa aylarda ayın son günü' : ''}
      </AppText>

      <ReminderPicker value={reminders} onChange={setReminders} />

      <ToggleRow
        title="Ev bütçesiyle paylaş"
        subtitle="Kim öderse işaretler (paylaşım Adım 7'de)"
        value={shared}
        onChange={setShared}
        left={<Icon name="users" size={20} color={palette.info} />}
      />

      <PrimaryButton title="Faturayı kaydet" onPress={save} />
      {initial ? (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            Alert.alert(initial.title, 'Fatura silinsin mi?', [
              { text: 'Vazgeç', style: 'cancel' },
              {
                text: 'Sil',
                style: 'destructive',
                onPress: () => {
                  dispatch({ type: 'bill/remove', id: initial.id });
                  router.back();
                },
              },
            ])
          }
          style={{ alignSelf: 'center', padding: 10 }}
        >
          <AppText variant="label" color={palette.danger}>
            Faturayı sil
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

