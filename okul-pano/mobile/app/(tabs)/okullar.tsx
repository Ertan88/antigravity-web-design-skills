import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { api } from '../../src/api.ts';
import { usePlatformSchools, type PlatformSchool } from '../../src/data.ts';
import { fullDate } from '../../src/day.ts';
import { useOpenSchool } from '../../src/platform.tsx';
import { colors } from '../../src/theme.ts';
import { Badge, Button, Card, confirm, Empty, ErrorNote, Field, Loading, Screen, Segmented, T } from '../../src/ui.tsx';

const PLAN = { trial: 'Deneme', basic: 'Temel', pro: 'Profesyonel' } as const;
type Filter = 'all' | 'trial' | 'paid' | 'passive';

/** Okullar ve abonelikler: paket, pano sayısı, deneme süresi; destek erişimi süren okula geçiş */
export default function Okullar() {
  const schools = usePlatformSchools();
  const openSchool = useOpenSchool();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api(`/api/platform/schools/${id}`, { method: 'PATCH', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform', 'schools'] }),
  });
  const needle = q.trim().toLocaleLowerCase('tr-TR');
  const list = (schools.data ?? []).filter(
    (s) =>
      (!needle || `${s.name} ${s.city ?? ''}`.toLocaleLowerCase('tr-TR').includes(needle)) &&
      (filter === 'all' || (filter === 'trial' ? s.plan === 'trial' && s.isActive : filter === 'paid' ? s.plan !== 'trial' && s.isActive : !s.isActive)),
  );

  return (
    <Screen title="Okullar" subtitle="Paketler, pano sayısı ve deneme süreleri" refreshing={schools.isRefetching} onRefresh={() => void schools.refetch()}>
      <Field label="Ara" value={q} onChangeText={setQ} placeholder="Okul adı ya da il" />
      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'Tümü' },
          { value: 'trial', label: 'Deneme' },
          { value: 'paid', label: 'Ücretli' },
          { value: 'passive', label: 'Kapalı' },
        ]}
      />
      <ErrorNote error={schools.error ?? patch.error} />
      {schools.isLoading ? (
        <Loading />
      ) : !list.length ? (
        <Card>
          <Empty icon="business-outline" title="Okul bulunamadı" />
        </Card>
      ) : (
        list.map((s) => (
          <SchoolCard
            key={s.id}
            s={s}
            busy={patch.isPending && patch.variables?.id === s.id}
            onPatch={(body) => patch.mutate({ id: s.id, body })}
            onOpen={() => void openSchool(s.id)}
          />
        ))
      )}
    </Screen>
  );
}

function SchoolCard({ s, busy, onPatch, onOpen }: { s: PlatformSchool; busy: boolean; onPatch: (b: Record<string, unknown>) => void; onOpen: () => void }) {
  const trialLeft = s.trialEndsAt ? Math.ceil((Date.parse(s.trialEndsAt) - Date.now()) / 86400_000) : null;
  return (
    <Card style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <T weight="800" style={{ flex: 1 }} lines={2}>
          {s.name}
        </T>
        <Badge tone={!s.isActive ? 'danger' : s.plan === 'trial' ? 'warning' : 'success'}>{!s.isActive ? 'Kapalı' : PLAN[s.plan]}</Badge>
      </View>
      <T size={13} color={colors.muted}>
        {[s.city, `${s.screenCount}/${s.maxScreens} pano`, s.member ? 'üyesiniz' : null].filter(Boolean).join(' · ')}
      </T>
      {s.plan === 'trial' && s.trialEndsAt && (
        <T size={13} color={trialLeft != null && trialLeft < 7 ? colors.warning : colors.muted} weight="600">
          {trialLeft != null && trialLeft < 0 ? `Deneme ${fullDate(s.trialEndsAt)} tarihinde bitti` : `Deneme ${fullDate(s.trialEndsAt)} tarihinde bitiyor`}
        </T>
      )}
      {!s.member && s.supportAccessUntil && Date.parse(s.supportAccessUntil) > Date.now() && (
        <T size={13} color={colors.success} weight="600">
          Destek erişimi {fullDate(s.supportAccessUntil)} tarihine kadar açık
        </T>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {s.plan === 'trial' && (
          <Button size="sm" variant="secondary" icon="add" loading={busy} onPress={() => onPatch({ extendTrialDays: 30 })}>
            Denemeyi 30 gün uzat
          </Button>
        )}
        {s.canOpen && (
          <Button size="sm" variant="secondary" icon="enter-outline" onPress={onOpen}>
            Okulu aç
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onPress={() =>
            void (
              s.isActive
                ? confirm('Okul kapatılsın mı?', `${s.name} panoları ve panel girişi durur. Daha sonra yeniden açabilirsiniz.`, 'Kapat')
                : Promise.resolve(true)
            ).then((ok) => ok && onPatch({ isActive: !s.isActive }))
          }
        >
          {s.isActive ? 'Kapat' : 'Yeniden aç'}
        </Button>
      </View>
    </Card>
  );
}
