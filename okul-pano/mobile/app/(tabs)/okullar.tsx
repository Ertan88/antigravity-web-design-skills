import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { api } from '../../src/api.ts';
import { usePlatformSchools, type PlatformSchool } from '../../src/data.ts';
import { fullDate } from '../../src/day.ts';
import { useOpenSchool } from '../../src/platform.tsx';
import { Sheet } from '../../src/sheet.tsx';
import { Text } from '../../src/text.tsx';
import { colors, dark, radius } from '../../src/theme.ts';
import { Button, Card, Chip, confirm, Empty, ErrorNote, Icon, Loading, Screen, Segmented, T } from '../../src/ui.tsx';

/*
 * Abonelikler (platform yöneticisi): her okul tek satır (baş harf rozeti, ad, il, pano kullanımı, paket ve denemede
 * kalan gün). Satıra dokununca alttan pencere: paket, deneme uzatma (+7 / +30 gün), pano sınırı, Kaydet, Okulu aç,
 * Okulu kapat / yeniden aç.
 */

type Plan = PlatformSchool['plan'];
const PLAN: Record<Plan, string> = { trial: 'Deneme', basic: 'Temel', pro: 'Profesyonel' };
type Filter = 'all' | 'trial' | 'paid' | 'passive';

/** Paket renkleri (açık / koyu tema) */
function planTone(plan: Plan | 'off') {
  const light = { pro: ['#ede9fe', '#5b21b6'], basic: ['#e0f2fe', '#075985'], trial: ['#fef3c7', '#92400e'], off: ['#fee2e2', '#b91c1c'] } as const;
  const night = { pro: ['#3b2a6b', '#ddd6fe'], basic: ['#0c3a5a', '#bae6fd'], trial: ['#5a430c', '#fde68a'], off: ['#5a1a1a', '#fecaca'] } as const;
  const [bg, fg] = (dark ? night : light)[plan];
  return { bg, fg };
}

const daysLeft = (iso: string | null) => (iso ? Math.ceil((Date.parse(iso) - Date.now()) / 86400_000) : null);
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toLocaleUpperCase('tr-TR'))
    .join('');

export default function Abonelikler() {
  const schools = usePlatformSchools();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<string | null>(null);
  const all = schools.data ?? [];
  const needle = q.trim().toLocaleLowerCase('tr-TR');
  const match = (s: PlatformSchool, f: Filter) =>
    f === 'all' || (f === 'trial' ? s.plan === 'trial' && s.isActive : f === 'paid' ? s.plan !== 'trial' && s.isActive : !s.isActive);
  const list = all.filter((s) => (!needle || `${s.name} ${s.city ?? ''}`.toLocaleLowerCase('tr-TR').includes(needle)) && match(s, filter));
  const active = all.filter((s) => s.isActive);
  const screens = active.reduce((n, s) => n + s.screenCount, 0);
  const current = all.find((s) => s.id === open) ?? null;

  return (
    <Screen title="Abonelikler" subtitle={schools.data ? `${all.length} okul · ${active.length} etkin · ${screens} pano` : undefined} refreshing={schools.isRefetching} onRefresh={() => void schools.refetch()}>
      <View style={{ height: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 8 }}>
        <Icon name="search" size={16} color={colors.faint} />
        <TextInput value={q} onChangeText={setQ} placeholder="Okul adı ya da il" placeholderTextColor={colors.subtle} style={{ flex: 1, fontSize: 14, color: colors.ink, paddingVertical: 0 }} accessibilityLabel="Okul ara" />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6 }}>
        {(
          [
            ['all', 'Tümü'],
            ['trial', 'Deneme'],
            ['paid', 'Ücretli'],
            ['passive', 'Kapalı'],
          ] as const
        ).map(([v, label]) => (
          <Chip key={v} label={`${label} ${all.filter((s) => match(s, v)).length}`} selected={filter === v} onPress={() => setFilter(v)} />
        ))}
      </ScrollView>
      <ErrorNote error={schools.error} />
      {schools.isLoading ? (
        <Loading />
      ) : !list.length ? (
        <Card>
          <Empty icon="business-outline" title="Okul bulunamadı" />
        </Card>
      ) : (
        <Card style={{ paddingVertical: 2 }}>
          {list.map((s, i) => (
            <SchoolRow key={s.id} s={s} last={i === list.length - 1} onPress={() => setOpen(s.id)} />
          ))}
        </Card>
      )}
      {current && <SchoolSheet key={current.id} s={current} onClose={() => setOpen(null)} />}
    </Screen>
  );
}

function SchoolRow({ s, last, onPress }: { s: PlatformSchool; last: boolean; onPress: () => void }) {
  const left = s.plan === 'trial' ? daysLeft(s.trialEndsAt) : null;
  const tone = planTone(s.isActive ? s.plan : 'off');
  const badge = !s.isActive ? 'Kapalı' : left != null ? `${PLAN[s.plan]} · ${left < 0 ? 'bitti' : `${left} g`}` : PLAN[s.plan];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${s.name}, ${badge}`}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.divider, opacity: pressed ? 0.7 : 1 })}
    >
      <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: planTone(s.plan).bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 14, fontWeight: '800', color: planTone(s.plan).fg }}>{initials(s.name)}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14.5, fontWeight: '800', color: colors.ink }} numberOfLines={1}>
          {s.name}
        </Text>
        <Text style={{ fontSize: 12.5, fontWeight: '600', color: colors.faint }} numberOfLines={1}>
          {[s.city, `${s.screenCount}/${s.maxScreens} pano`, s.member ? 'üyesiniz' : null].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: tone.bg }}>
        <Text style={{ fontSize: 11.5, fontWeight: '800', color: left != null && left < 7 && s.isActive ? (dark ? '#fecaca' : '#b91c1c') : tone.fg }}>{badge}</Text>
      </View>
      <Icon name="chevron-forward" size={16} color={colors.subtle} />
    </Pressable>
  );
}

/** Okulun aboneliği: paket, deneme uzatma, pano sınırı; okulu aç, kapat / yeniden aç */
function SchoolSheet({ s, onClose }: { s: PlatformSchool; onClose: () => void }) {
  const qc = useQueryClient();
  const openSchool = useOpenSchool();
  const [plan, setPlan] = useState<Plan>(s.plan);
  const [maxScreens, setMaxScreens] = useState(s.maxScreens);
  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => api(`/api/platform/schools/${s.id}`, { method: 'PATCH', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform', 'schools'] }),
  });
  const left = daysLeft(s.trialEndsAt);
  const dirty = plan !== s.plan || maxScreens !== s.maxScreens;
  const tone = planTone(s.plan);
  const label = (t: string) => (
    <Text style={{ fontSize: 11.5, fontWeight: '800', color: colors.faint, letterSpacing: 0.3 }}>{t}</Text>
  );
  const save = async () => {
    await patch.mutateAsync({ ...(plan !== s.plan ? { plan } : {}), ...(maxScreens !== s.maxScreens ? { maxScreens } : {}) });
    onClose();
  };
  return (
    <Sheet open onClose={onClose}>
      <View style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 46, height: 46, borderRadius: 13, backgroundColor: tone.bg, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: tone.fg }}>{initials(s.name)}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: colors.ink }} numberOfLines={2}>
              {s.name}
            </Text>
            <T size={12.5} color={colors.faint}>
              {[s.city, `kayıt ${fullDate(s.createdAt).replace(/\s\S+$/, '')}`, `${s.screenCount}/${s.maxScreens} pano`].filter(Boolean).join(' · ')}
            </T>
          </View>
        </View>
        {!s.isActive && (
          <T size={13} color={colors.danger} weight="700">
            Okul kapalı: panolar ve panel girişi durdu.
          </T>
        )}

        <View style={{ gap: 6 }}>
          {label('PAKET')}
          <Segmented<Plan>
            value={plan}
            onChange={setPlan}
            options={[
              { value: 'trial', label: 'Deneme' },
              { value: 'basic', label: 'Temel' },
              { value: 'pro', label: 'Profesyonel' },
            ]}
          />
        </View>

        {s.plan === 'trial' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}>
              {label('DENEME')}
              <T size={14} weight="800" color={left != null && left < 7 ? colors.danger : colors.ink}>
                {s.trialEndsAt ? (left != null && left < 0 ? `${fullDate(s.trialEndsAt)} bitti` : `${fullDate(s.trialEndsAt)} · ${left} gün`) : 'Bitiş tarihi yok'}
              </T>
            </View>
            {[7, 30].map((d) => (
              <Button key={d} size="sm" variant="secondary" loading={patch.isPending && patch.variables?.extendTrialDays === d} onPress={() => patch.mutate({ extendTrialDays: d })}>
                +{d} gün
              </Button>
            ))}
          </View>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1 }}>
            {label('PANO SINIRI')}
            <T size={12.5} color={colors.faint}>
              {s.screenCount} pano kullanılıyor
            </T>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: 'hidden' }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Pano sınırını azalt" disabled={maxScreens <= Math.max(1, s.screenCount)} onPress={() => setMaxScreens((n) => n - 1)} style={{ paddingHorizontal: 15, paddingVertical: 9, backgroundColor: colors.primarySoft, opacity: maxScreens <= Math.max(1, s.screenCount) ? 0.4 : 1 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: colors.ink }}>−</Text>
            </Pressable>
            <Text style={{ minWidth: 48, textAlign: 'center', fontSize: 17, fontWeight: '800', color: colors.ink }}>{maxScreens}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Pano sınırını artır" disabled={maxScreens >= 500} onPress={() => setMaxScreens((n) => n + 1)} style={{ paddingHorizontal: 15, paddingVertical: 9, backgroundColor: colors.primarySoft }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: colors.ink }}>+</Text>
            </Pressable>
          </View>
        </View>

        {!s.member && s.supportAccessUntil && Date.parse(s.supportAccessUntil) > Date.now() && (
          <T size={12.5} color={colors.success} weight="700">
            Destek erişimi {fullDate(s.supportAccessUntil)} tarihine kadar açık
          </T>
        )}
        <ErrorNote error={patch.error} />

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button disabled={!dirty} loading={patch.isPending && !patch.variables?.extendTrialDays && patch.variables?.isActive === undefined} onPress={() => void save()}>
              Kaydet
            </Button>
          </View>
          {s.canOpen && (
            <View style={{ flex: 1 }}>
              <Button variant="secondary" icon="enter-outline" onPress={() => void openSchool(s.id)}>
                Okulu aç
              </Button>
            </View>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            void (s.isActive ? confirm('Okul kapatılsın mı?', `${s.name} panoları ve panel girişi durur. Daha sonra yeniden açabilirsiniz.`, 'Kapat') : Promise.resolve(true)).then(
              (ok) => ok && patch.mutate({ isActive: !s.isActive }),
            )
          }
          style={{ alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 12 }}
        >
          <Text style={{ fontSize: 13.5, fontWeight: '800', color: s.isActive ? colors.danger : colors.success }}>{s.isActive ? 'Okulu kapat' : 'Okulu yeniden aç'}</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}
