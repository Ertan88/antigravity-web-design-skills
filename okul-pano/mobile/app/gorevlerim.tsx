import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { api } from '../src/api.ts';
import { useAuth, useSchoolPath } from '../src/auth.tsx';
import { dayTitle, localIso } from '../src/day.ts';
import { colors } from '../src/theme.ts';
import { BentoRow, Button, Card, Empty, Loading, Screen, T, Tile } from '../src/ui.tsx';

/** Öğretmenin kendi görevleri: izinli yerine girdiği dersler (ay / toplam) ve taşımalı görev sayıları */
interface MyCovers {
  today: string;
  monthCount: number;
  total: number;
  transportMonth: number;
  transportTotal: number;
  items: { id: string; date: string; periodNo: number; subject: string; className: string; absentName: string }[];
}

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const shiftMonth = (m: string, by: number) => {
  const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + by, 1));
  return d.toISOString().slice(0, 7);
};

export default function Gorevlerim() {
  const { school } = useAuth();
  const [month, setMonth] = useState(() => localIso().slice(0, 7));
  const path = useSchoolPath(`my-covers?month=${month}`);
  const q = useQuery({ queryKey: [school?.id, 'my-covers', month], queryFn: () => api<MyCovers>(path), enabled: Boolean(school?.teacherId) });
  const d = q.data;
  const monthName = MONTHS[Number(month.slice(5, 7)) - 1]!;
  return (
    <Screen back title="Görevlerim" subtitle="İzinli yerine girdiğiniz dersler ve taşımalı" refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Button variant="secondary" size="sm" icon="chevron-back" accessibilityLabel="Önceki ay" onPress={() => setMonth((m) => shiftMonth(m, -1))} />
        <T size={16} weight="800" style={{ flex: 1, textAlign: 'center' }}>
          {monthName} {month.slice(0, 4)}
        </T>
        <Button variant="secondary" size="sm" icon="chevron-forward" accessibilityLabel="Sonraki ay" onPress={() => setMonth((m) => shiftMonth(m, 1))} />
      </View>
      {!school?.teacherId ? (
        <Card>
          <Empty icon="person-outline" title="Öğretmen kaydı yok" text="Hesabınız kadrodaki bir öğretmene bağlı değil." />
        </Card>
      ) : q.isLoading || !d ? (
        <Loading />
      ) : (
        <>
          <BentoRow>
            <Tile tone="sky" icon="school-outline" label={`${monthName} · derse girdiğim`} value={d.monthCount} unit=" saat" caption={`Toplam ${d.total} saat`} />
            <Tile tone="lilac" icon="bus-outline" label={`${monthName} · taşımalı`} value={d.transportMonth} unit=" gün" caption={`Toplam ${d.transportTotal} gün`} />
          </BentoRow>
          <Card style={{ gap: 10 }}>
            <T size={15} weight="800">
              {monthName} · ders görevlendirmeleri
            </T>
            {!d.items.length ? (
              <T size={13.5} color={colors.muted}>
                Bu ay görevlendirme yok.
              </T>
            ) : (
              d.items.map((i) => (
                <View key={i.id} style={{ padding: 10, borderRadius: 12, backgroundColor: i.date === d.today ? colors.infoSoft : colors.primarySoft }}>
                  <T size={14.5} weight="800">
                    {i.date === d.today ? 'Bugün' : dayTitle(i.date)} · {i.periodNo}. ders · {i.className}
                  </T>
                  <T size={13} color={colors.muted}>
                    {i.subject}
                    {i.absentName ? ` · ${i.absentName} yerine` : ''}
                  </T>
                </View>
              ))
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}
