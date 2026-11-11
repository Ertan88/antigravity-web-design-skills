import { errorText } from '@okulpano/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { api } from '../src/api.ts';
import { useAuth, useSchoolPath } from '../src/auth.tsx';
import { addDays, dayTitle, localIso } from '../src/day.ts';
import { colors } from '../src/theme.ts';
import { Text } from '../src/text.tsx';
import { Badge, Button, Card, confirm, DeleteIconButton, Empty, ErrorNote, Loading, Screen, T } from '../src/ui.tsx';

/*
 * İzinli öğretmen yerine görevlendirme (yönetim): günün boş dersleri ve nöbet yerleri. Her satırda o gün okulda olup
 * o saatte boş olan öğretmenler önerilir: nöbetçiler önce ("NÖBETÇİ"), sonra o saatte dersi olmayanlar ("DERSİ YOK").
 * Nöbet yerine yalnızca o günün nöbetçileri önerilir. Öğretmenin adına dokunulunca görevlendirme yapılır ve öğretmene
 * bildirim gider.
 */

type Candidate = { teacherId: string; fullName: string; onDuty: boolean; monthCount: number };
interface CoverDay {
  date: string;
  holiday: string | null;
  absent: { teacherId: string; fullName: string }[];
  lessons: {
    periodNo: number;
    start: string | null;
    classGroupId: string;
    className: string;
    subject: string;
    absentName: string;
    cover: { id: string; teacherId: string; fullName: string } | null;
    candidates: Candidate[];
  }[];
  duties: { dutyId: string; area: string; absentName: string; substitute: { id: string; teacherName: string } | null; candidates: Candidate[] }[];
}

const tagStyle = { fontSize: 10, fontWeight: '800', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1, overflow: 'hidden' } as const;

/** Aday çipleri: nöbetçi "NÖBETÇİ"; ders satırında diğerleri "DERSİ YOK" (o gün dersi olan, o saatte boş) */
function Candidates({ list, busy, onPick, freeTag = false }: { list: Candidate[]; busy: boolean; onPick: (id: string) => void; freeTag?: boolean }) {
  const [all, setAll] = useState(false);
  if (!list.length)
    return (
      <T size={13} color={colors.danger} weight="700">
        {freeTag ? 'Okulda olup bu saatte boş olan öğretmen yok.' : 'Görevlendirilebilecek başka nöbetçi yok.'}
      </T>
    );
  const shown = all ? list : list.slice(0, 6);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {shown.map((c) => (
        <Pressable
          key={c.teacherId}
          accessibilityRole="button"
          accessibilityLabel={`${c.fullName}${c.onDuty ? ', nöbetçi' : freeTag ? ', dersi yok' : ''}: görevlendir`}
          disabled={busy}
          onPress={() => onPick(c.teacherId)}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: c.onDuty ? colors.brand : colors.borderStrong,
            backgroundColor: c.onDuty ? colors.infoSoft : colors.card,
            opacity: busy ? 0.5 : pressed ? 0.75 : 1,
          })}
        >
          <Text style={{ fontSize: 13.5, fontWeight: '700', color: colors.ink }}>{c.fullName}</Text>
          {c.onDuty ? (
            <Text style={[tagStyle, { color: '#ffffff', backgroundColor: colors.brand }]}>NÖBETÇİ</Text>
          ) : (
            freeTag && <Text style={[tagStyle, { color: colors.ink, backgroundColor: colors.borderStrong }]}>DERSİ YOK</Text>
          )}
        </Pressable>
      ))}
      {!all && list.length > 6 && (
        <Pressable accessibilityRole="button" onPress={() => setAll(true)} style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text style={{ fontSize: 13.5, fontWeight: '700', color: colors.info }}>+{list.length - 6} öğretmen daha</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function Gorevlendirme() {
  const { school, can } = useAuth();
  const [date, setDate] = useState(() => localIso());
  const path = useSchoolPath(`cover-day?date=${date}`);
  const coversPath = useSchoolPath('covers');
  const subsPath = useSchoolPath('duty-substitutions');
  const qc = useQueryClient();
  const q = useQuery({ queryKey: [school?.id, 'cover-day', date], queryFn: () => api<CoverDay>(path), enabled: Boolean(school) && can('duties.manage') });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await Promise.all([qc.invalidateQueries({ queryKey: [school?.id, 'cover-day'] }), qc.invalidateQueries({ queryKey: [school?.id, 'duty-day'] }), qc.invalidateQueries({ queryKey: [school?.id, 'duty-week'] })]);
    } catch (err) {
      setError(errorText(err, 'Kaydedilemedi'));
    } finally {
      setBusy(false);
    }
  };
  const d = q.data;
  const open = d ? d.lessons.filter((l) => !l.cover).length + d.duties.filter((x) => !x.substitute).length : 0;

  if (!can('duties.manage')) {
    return (
      <Screen back title="Ders görevlendirme">
        <Empty icon="lock-closed-outline" title="Nöbet yetkisi gerekli" text="İzinli öğretmen yerine görevlendirmeyi nöbet çizelgesini yöneten kişiler yapar." />
      </Screen>
    );
  }
  return (
    <Screen back title="Ders görevlendirme" subtitle="İzinli öğretmenin dersleri ve nöbet yeri" refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Button variant="secondary" size="sm" icon="chevron-back" accessibilityLabel="Önceki gün" onPress={() => setDate((x) => addDays(x, -1))} />
        <T size={16} weight="800" style={{ flex: 1, textAlign: 'center' }}>
          {date === localIso() ? 'Bugün · ' : ''}
          {dayTitle(date)}
        </T>
        <Button variant="secondary" size="sm" icon="chevron-forward" accessibilityLabel="Sonraki gün" onPress={() => setDate((x) => addDays(x, 1))} />
      </View>
      {error && <ErrorNote error={new Error(error)} />}
      {q.isLoading ? (
        <Loading />
      ) : !d ? null : d.holiday ? (
        <Card>
          <Empty icon="calendar-outline" title={d.holiday} text="Tatil: görevlendirme yok." />
        </Card>
      ) : !d.lessons.length && !d.duties.length ? (
        <Card>
          <Empty title="Boş ders yok" text="Bu gün izinli öğretmen yok ya da izinli öğretmenin dersi ve nöbeti yok." />
        </Card>
      ) : (
        <>
          <Card style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <T size={16} weight="800">
                Boş kalanlar
              </T>
              {open > 0 ? <Badge tone="danger">{`${open} boş`}</Badge> : <Badge tone="success">hepsi atandı</Badge>}
            </View>
            <T size={13} color={colors.muted}>
              İzinli: {d.absent.map((a) => a.fullName).join(', ')}. Derse o gün okulda olup o saatte boş olan öğretmenler önerilir; nöbetçiler öndedir. Nöbet yerine yalnızca o günün nöbetçileri önerilir.
            </T>
          </Card>
          {d.lessons.map((l) => (
            <Card key={`${l.periodNo}-${l.classGroupId}`} tone={l.cover ? 'default' : 'warning'} style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <T size={15.5} weight="800">
                    {l.periodNo}. ders{l.start ? ` · ${l.start}` : ''} · {l.className}
                  </T>
                  <T size={13} color={colors.muted}>
                    {l.subject} · {l.absentName} yerine
                  </T>
                </View>
                {l.cover && (
                  <DeleteIconButton
                    label="Görevlendirmeyi kaldır"
                    onPress={() => void confirm('Görevlendirme kaldırılsın mı?', `${l.cover!.fullName} bu derse girmeyecek.`, 'Kaldır').then((ok) => { if (ok) void run(() => api(`${coversPath}/${l.cover!.id}`, { method: 'DELETE' })); })}
                  />
                )}
              </View>
              {l.cover ? (
                <T size={14} weight="800" color={colors.success}>
                  ✓ {l.cover.fullName} girecek
                </T>
              ) : (
                <Candidates list={l.candidates} busy={busy} freeTag onPick={(teacherId) => void run(() => api(coversPath, { method: 'POST', body: { date: d.date, periodNo: l.periodNo, classGroupId: l.classGroupId, teacherId } }))} />
              )}
            </Card>
          ))}
          {d.duties.map((x) => (
            <Card key={x.dutyId} tone={x.substitute ? 'default' : 'warning'} style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <T size={15.5} weight="800">
                    Nöbet yeri · {x.area}
                  </T>
                  <T size={13} color={colors.muted}>
                    {x.absentName} yerine
                  </T>
                </View>
                {x.substitute && (
                  <DeleteIconButton
                    label="Görevlendirmeyi kaldır"
                    onPress={() => void confirm('Görevlendirme kaldırılsın mı?', `${x.substitute!.teacherName} bu nöbete görevli olmayacak.`, 'Kaldır').then((ok) => { if (ok) void run(() => api(`${subsPath}/${x.substitute!.id}`, { method: 'DELETE' })); })}
                  />
                )}
              </View>
              {x.substitute ? (
                <T size={14} weight="800" color={colors.success}>
                  ✓ {x.substitute.teacherName}
                </T>
              ) : (
                <Candidates list={x.candidates} busy={busy} onPick={(teacherId) => void run(() => api(subsPath, { method: 'POST', body: { date: d.date, dutyId: x.dutyId, teacherId } }))} />
              )}
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
