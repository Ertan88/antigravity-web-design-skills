import { normalizeName } from '@okulpano/shared/teachers';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api } from '../../src/api.ts';
import { useAuth, useSchoolPath } from '../../src/auth.tsx';
import { useDutyDay, useMeToday, type DutyDay } from '../../src/data.ts';
import { addDays, dayTitle, WEEKDAY_SHORT } from '../../src/day.ts';
import { colors } from '../../src/theme.ts';
import { Badge, Button, Card, Empty, ErrorNote, Label, Loading, Screen, SectionTitle, Segmented, T } from '../../src/ui.tsx';

/** Nöbet (tasarım 2 ve 10): kendi nöbetlerim ve bugün kim nerede; yetkisi olan boş yere görevlendirir */
export default function Nobet() {
  const { isTeacher } = useAuth();
  const [tab, setTab] = useState<'mine' | 'all'>(isTeacher ? 'mine' : 'all');
  return (
    <Screen title={isTeacher ? 'Nöbetlerim' : 'Bugünün nöbetleri'}>
      {isTeacher && (
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'mine', label: 'Benim Nöbetlerim' },
            { value: 'all', label: 'Kim Nerede' },
          ]}
        />
      )}
      {tab === 'mine' && isTeacher ? <MyDuties /> : <AllDuties />}
    </Screen>
  );
}

function MyDuties() {
  const me = useMeToday();
  const days = (me.data?.week ?? []).filter((d) => d.weekday <= 5).slice(0, 5);
  const [selected, setSelected] = useState<string | null>(null);
  if (me.isLoading || !me.data) return <Loading />;
  const day = days.find((d) => d.date === (selected ?? me.data.today)) ?? days[0];
  const upcoming = me.data.week.filter((d) => d.date > (day?.date ?? '') && d.duties.length && !d.holiday);
  return (
    <>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {days.map((d) => {
          const on = d.date === day?.date;
          const has = d.duties.some((x) => !x.coveredBy);
          return (
            <Pressable
              key={d.date}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${dayTitle(d.date)}${d.holiday ? ', tatil' : has ? ', nöbet var' : ''}`}
              onPress={() => setSelected(d.date)}
              style={{
                flex: 1,
                paddingVertical: 8,
                borderRadius: 12,
                alignItems: 'center',
                backgroundColor: on ? colors.primary : d.holiday ? '#f1f5f8' : '#fff',
                borderWidth: 1,
                borderStyle: d.holiday ? 'dashed' : 'solid',
                borderColor: on ? colors.primary : d.holiday ? '#c6d1d9' : colors.border,
              }}
            >
              <Text style={{ fontSize: 11, color: on ? '#fff' : colors.muted, fontWeight: '600' }}>{WEEKDAY_SHORT[d.weekday]}</Text>
              <Text style={{ fontSize: 18, fontWeight: '800', color: on ? '#fff' : colors.ink }}>{Number(d.date.slice(8))}</Text>
              {d.holiday ? (
                <Text style={{ fontSize: 9, fontWeight: '800', color: on ? '#fff' : colors.faint }}>TATİL</Text>
              ) : (
                <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 3, backgroundColor: has ? (on ? '#fff' : colors.warning) : 'transparent' }} />
              )}
            </Pressable>
          );
        })}
      </View>

      {day && (
        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <Label color={colors.primary}>{day.date === me.data.today ? `Bugün · ${dayTitle(day.date, { weekday: 'long' })}` : dayTitle(day.date)}</Label>
            {day.duties.length > 0 && !day.holiday && <Badge tone="success">Panoda görünüyor</Badge>}
          </View>
          {day.holiday ? (
            <Empty icon="sunny-outline" title="Tatil" text={day.holiday} />
          ) : day.duties.length ? (
            day.duties.map((d) => (
              <View key={d.dutyId} style={{ gap: 8 }}>
                <T size={20} weight="800">
                  {d.area}
                </T>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {d.partners.length > 0 && <Pill>Birlikte: {d.partners.join(', ')}</Pill>}
                  <Pill>Teneffüslerde</Pill>
                  {d.substituteFor && <Pill tone="warning">{d.substituteFor} yerine</Pill>}
                </View>
                {d.coveredBy && (
                  <T size={13} color={colors.warning} weight="600">
                    İzniniz nedeniyle bu nöbeti {d.coveredBy} tutuyor.
                  </T>
                )}
              </View>
            ))
          ) : (
            <T color={colors.muted}>Bu gün nöbetiniz yok.</T>
          )}
          {day.supervisor && (
            <T size={13} color={colors.muted}>
              Nöbetçi müdür yardımcısı: <Text style={{ fontWeight: '700', color: colors.ink }}>{day.supervisor}</Text>
            </T>
          )}
        </Card>
      )}

      {upcoming.slice(0, 3).map((d) => (
        <Card key={d.date} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Label>{dayTitle(d.date)}</Label>
            <T size={16} weight="700">
              {d.duties.map((x) => x.area).join(', ')}
            </T>
          </View>
          <T size={12} color={colors.muted}>
            Teneffüslerde
          </T>
        </Card>
      ))}

      <Button icon="calendar-outline" variant="secondary" onPress={() => router.push('/izin')}>
        İzin bildir
      </Button>
      <T size={12} color={colors.muted} style={{ textAlign: 'center' }}>
        Nöbet günlerinizde ilk dersten 15 dakika önce telefonunuza hatırlatma gelir.
      </T>
    </>
  );
}

function Pill({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'warning' }) {
  return (
    <View style={{ backgroundColor: tone === 'warning' ? colors.warningSoft : '#f1f5f8', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
      <Text style={{ fontSize: 12, color: tone === 'warning' ? '#9a3412' : colors.ink }}>{children}</Text>
    </View>
  );
}

function AllDuties() {
  const { can } = useAuth();
  const [offset, setOffset] = useState(0);
  const today = useMeToday();
  const date = today.data ? addDays(today.data.today, offset) : undefined;
  const q = useDutyDay(date);
  const day = q.data;
  const canAssign = can('duties.manage');

  const areas = useMemo(() => {
    const map = new Map<string, DutyDay['entries']>();
    for (const e of day?.entries ?? []) {
      const k = normalizeName(e.area);
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return [...map.values()];
  }, [day]);

  return (
    <>
      <Segmented
        value={String(offset)}
        onChange={(v) => setOffset(Number(v))}
        options={[
          { value: '0', label: 'Bugün' },
          { value: '1', label: 'Yarın' },
        ]}
      />
      <ErrorNote error={q.error} />
      {!day ? (
        <Loading />
      ) : day.holiday ? (
        <Card>
          <Empty icon="sunny-outline" title="Tatil" text={`${day.holiday}: nöbet yok`} />
        </Card>
      ) : !day.entries.length ? (
        <Card>
          <Empty icon="shield-outline" title="Bu gün için nöbet girilmemiş" text="Nöbet çizelgesi panelden Excel ile yüklenebilir." />
        </Card>
      ) : (
        <>
          {day.gaps.length > 0 &&
            day.entries
              .filter((e) => day.gaps.includes(e.dutyId))
              .map((gap) => <GapCard key={gap.dutyId} day={day} gap={gap} canAssign={canAssign} />)}
          <SectionTitle>{offset ? 'Yarın kim nerede' : 'Bugün kim nerede'}</SectionTitle>
          <Card style={{ paddingVertical: 4, gap: 0 }}>
            {areas.map((list, i) => (
              <View key={list[0]!.dutyId} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: '#eef2f5' }}>
                <T weight="600" style={{ flex: 1 }}>
                  {list[0]!.area}
                </T>
                <T size={13} color={colors.muted} style={{ flexShrink: 1, textAlign: 'right' }}>
                  {list.map((e) => (e.substitute ? `${e.substitute.teacherName} (yerine)` : e.onLeave ? `${e.teacherName} (izinli)` : e.teacherName)).join(', ')}
                </T>
              </View>
            ))}
          </Card>
          {day.supervisor && (
            <T size={13} color={colors.muted}>
              Nöbetçi müdür yardımcısı: <Text style={{ fontWeight: '700', color: colors.ink }}>{day.supervisor}</Text>
            </T>
          )}
        </>
      )}
    </>
  );
}

/** Boş nöbet yeri ve öneriler (tasarım 10): "Ata" ile öğretmene bildirim gider, pano hemen güncellenir */
function GapCard({ day, gap, canAssign }: { day: DutyDay; gap: DutyDay['entries'][number]; canAssign: boolean }) {
  const { school } = useAuth();
  const path = useSchoolPath('duty-substitutions');
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const assign = async (teacherId: string) => {
    setBusy(teacherId);
    setError(null);
    try {
      await api(path, { method: 'POST', body: { date: day.date, dutyId: gap.dutyId, teacherId } });
      await Promise.all([qc.invalidateQueries({ queryKey: [school?.id, 'duty-day'] }), qc.invalidateQueries({ queryKey: [school?.id, 'control-center'] })]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Atanamadı');
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card tone="warning" style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <T size={16} weight="800">
          {gap.area}
        </T>
        <Badge tone="warning">BOŞ</Badge>
      </View>
      <T size={13} color={colors.muted}>
        {gap.teacherName} bu gün izinli.
      </T>
      {canAssign ? (
        <>
          <T size={13} weight="700">
            Önerilenler · o gün nöbeti olmayan, bu ay en az nöbet tutanlar
          </T>
          {day.candidates.slice(0, 4).map((c) => (
            <View key={c.teacherId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, backgroundColor: '#f6f9fa' }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>
                  {c.fullName
                    .split(' ')
                    .map((p) => p.charAt(0))
                    .slice(0, 2)
                    .join('')}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <T weight="700">{c.fullName}</T>
                <T size={12} color={colors.muted}>
                  Bu ay ~{c.monthCount} nöbet
                </T>
              </View>
              <Button size="sm" loading={busy === c.teacherId} onPress={() => void assign(c.teacherId)} style={{ paddingHorizontal: 14 }}>
                Ata
              </Button>
            </View>
          ))}
          {!day.candidates.length && <T color={colors.muted}>Uygun öğretmen bulunamadı.</T>}
          {error && <T color={colors.danger}>{error}</T>}
          <T size={12} color={colors.muted}>
            Atanan öğretmene bildirim gider, pano hemen güncellenir.
          </T>
        </>
      ) : (
        <T size={13} color={colors.muted}>
          Görevlendirmeyi nöbet yetkisi olan yönetici yapar.
        </T>
      )}
    </Card>
  );
}
