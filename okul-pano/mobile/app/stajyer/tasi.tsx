import { errorText, INTERN_END_REASONS, INTERN_END_REASON_KEYS, type InternEndReason } from '@okulpano/shared';
import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { api } from '../../src/api.ts';
import { useAuth, useSchoolPath } from '../../src/auth.tsx';
import { useInternshipAccess, useSchoolQuery } from '../../src/data.ts';
import { DatePickSheet } from '../../src/datePick.tsx';
import { InlineSelect } from '../../src/internshipManage.tsx';
import { Text } from '../../src/text.tsx';
import { colors } from '../../src/theme.ts';
import { Button, Card, Chip, Screen, T } from '../../src/ui.tsx';

/*
 * İşletme değiştir (mobil; webdeki pencerenin aynısı): başka işletmeye taşı ya da işletmeden çıkar; tarih ve isteğe
 * bağlı neden (sabit seçenekler, KVKK). Yerleştirilmeyi bekleyen öğrencide (yerlestir=1) yalnızca yerleştirme vardır.
 * Eski ve yeni koordinatöre ve koordinatör müdür yardımcısına bildirim gider (sunucu).
 */

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dm = (v: string) => `${Number(v.slice(8, 10))} ${MONTHS[Number(v.slice(5, 7)) - 1]}`;
const dayBefore = (v: string) => {
  const d = new Date(`${v}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

type BusinessLite = { id: string; name: string; canEdit: boolean; coordinatorName: string | null };

export default function OgrenciTasi() {
  const p = useLocalSearchParams<{ id: string; ad?: string; isletme?: string; isletmeAd?: string; yerlestir?: string }>();
  const place = p.yerlestir === '1';
  const { school } = useAuth();
  const path = useSchoolPath('internship/students/assign');
  const qc = useQueryClient();
  const access = useInternshipAccess();
  const biz = useSchoolQuery<BusinessLite[]>('internship/businesses');
  const [mode, setMode] = useState<'move' | 'remove'>('move');
  const [to, setTo] = useState('');
  const [date, setDate] = useState(iso(new Date()));
  const [picking, setPicking] = useState(false);
  const [reason, setReason] = useState<InternEndReason | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const removing = mode === 'remove' && !place;
  // Hedef: düzenleyebildiği işletmeler; alan şefi bekleyen öğrenciyi alanındaki herhangi bir işletmeye yerleştirir
  const options = (biz.data ?? [])
    .filter((b) => b.id !== p.isletme && (b.canEdit || (place && access.data?.areaHead)))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  const chosen = options.find((b) => b.id === to);
  const ready = removing || Boolean(chosen);

  const save = async () => {
    if (!ready || !p.id) return;
    setBusy(true);
    setError(null);
    try {
      await api(path, { method: 'POST', body: { studentIds: [p.id], businessId: removing ? null : to, from: date, reason: place ? null : reason } });
      await qc.invalidateQueries({ predicate: (x) => x.queryKey[0] === school?.id && String(x.queryKey[1] ?? '').startsWith('internship') });
      router.back();
    } catch (e) {
      setError(errorText(e, 'Kaydedilemedi'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      back
      title={place ? 'Yerleştir' : 'İşletme değiştir'}
      subtitle={p.ad}
      footer={
        <Button variant={removing ? 'delete' : 'primary'} loading={busy} disabled={!ready} onPress={() => void save()}>
          {removing ? 'İşletmeden çıkar' : place ? 'Yerleştir' : 'Taşı'}
        </Button>
      }
    >
      <T size={13} color={colors.muted}>
        {p.isletmeAd ? `Şu an: ${p.isletmeAd}` : 'Öğrencinin şu an işletmesi yok.'}
      </T>
      {!place && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(
            [
              ['move', 'Başka işletmeye taşı', 'Yeni işletmede devam eder'],
              ['remove', 'İşletmeden çıkar', 'Bekleyenlere düşer'],
            ] as const
          ).map(([m, title, text]) => {
            const on = mode === m;
            return (
              <Pressable
                key={m}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => setMode(m)}
                style={{ flex: 1, gap: 2, padding: 12, borderRadius: 16, borderWidth: on ? 2 : 1, borderColor: on ? colors.primary : colors.borderStrong, backgroundColor: colors.card }}
              >
                <Text style={{ fontSize: 14, fontWeight: '800', color: colors.ink }}>{title}</Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>{text}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {!removing &&
        (options.length ? (
          <InlineSelect label="Yeni işletme" value={to} onChange={setTo} options={[{ value: '', label: 'Seçin' }, ...options.map((b) => ({ value: b.id, label: b.coordinatorName ? `${b.name} · ${b.coordinatorName}` : b.name }))]} />
        ) : (
          <Card tone="warning">
            <T size={13}>Taşıyabileceğiniz başka işletme yok. Başka koordinatörün işletmesine taşımayı idare yapar.</T>
          </Card>
        ))}
      <Pressable accessibilityRole="button" onPress={() => setPicking(true)} style={{ gap: 2, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.card }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.muted }}>{removing ? 'Ayrılış tarihi' : place ? 'Başlangıç tarihi' : 'Geçiş tarihi'}</Text>
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink }}>{dm(date)} {date.slice(0, 4)}</Text>
      </Pressable>
      {!place && (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.muted }}>Neden (isteğe bağlı)</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {INTERN_END_REASON_KEYS.map((k) => (
              <Chip key={k} label={INTERN_END_REASONS[k]} selected={reason === k} onPress={() => setReason(reason === k ? null : k)} />
            ))}
          </View>
        </View>
      )}
      {!place && (
        <Card tone="warning">
          <T size={12.5}>
            {removing
              ? `${p.isletmeAd ?? 'Eski işletme'} çizelgesi ${dm(dayBefore(date))}'de kapanır; öğrenci yerleştirilmeyi bekleyenlere düşer. Geçmiş devam işaretleri silinmez.`
              : `${p.isletmeAd ?? 'Eski işletme'} çizelgesi ${dm(dayBefore(date))}'de kapanır; ${dm(date)}'den itibaren ${chosen?.name ?? 'yeni işletmede'} devam eder. Geçmiş devam işaretleri silinmez.`}
          </T>
        </Card>
      )}
      {error && (
        <T size={13} color={colors.danger}>
          {error}
        </T>
      )}
      {picking && (
        <DatePickSheet
          open
          title={removing ? 'Ayrılış tarihi' : 'Tarih'}
          value={new Date(`${date}T12:00:00`)}
          onPick={(d) => {
            setDate(iso(d));
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </Screen>
  );
}
