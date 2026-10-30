import { normalizeName } from '@okulpano/shared/teachers';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '../../src/text.tsx';
import { api } from '../../src/api.ts';
import { useAuth, useSchoolPath } from '../../src/auth.tsx';
import { useDutyDay, useMeToday, useMyDuties, type DutyDay, type MyDuties, type ScheduleStatus } from '../../src/data.ts';
import { addDays, dayTitle } from '../../src/day.ts';
import { colors, tiles } from '../../src/theme.ts';
import { Badge, Banner, BentoRow, Button, Card, Empty, ErrorNote, Icon, Label, Loading, Screen, Segmented, T, Tile } from '../../src/ui.tsx';

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

const monthName = (m: string) => new Intl.DateTimeFormat('tr-TR', { month: 'long', timeZone: 'UTC' }).format(new Date(`${m}-15T12:00:00Z`));
const WEEKDAY_LONG_TR = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

/** Ayın çizelgesi girilmemişse son girilen ayınki gösterilir: kullanıcı bilsin */
function ScheduleNote({ schedule }: { schedule?: ScheduleStatus }) {
  if (!schedule || schedule.entered) return null;
  return (
    <Banner
      icon="alert-circle-outline"
      tone="warning"
      title={`${monthName(schedule.month)} nöbet çizelgesi henüz girilmedi`}
      text={schedule.usedMonth ? `${monthName(schedule.usedMonth)} çizelgesine göre gösteriliyor; değişebilir.` : 'Nöbetler okul yönetimi çizelgeyi girince görünür.'}
    />
  );
}

/**
 * Benim nöbetlerim: bu ayın bugünden sonraki nöbet günleri (okul içi nöbet yeri, taşımalı öğrenci görevi), birlikte
 * nöbetçi olanlar ve o günün nöbetçi müdür yardımcısı. Bilgiler sistemdeki çizelgeden (Excel ya da elle) gelir.
 */
function MyDuties() {
  const q = useMyDuties();
  const d = q.data;
  if (!d) return q.error ? <ErrorNote error={q.error} /> : <Loading />;
  const dutyDays = d.days.filter((x) => !x.holiday);
  const showingNext = d.showing !== d.month;
  const transportDays = dutyDays.filter((x) => x.transport).length;
  return (
    <>
      {showingNext ? (
        <Banner icon="calendar-outline" tone="primary" title={`${monthName(d.month)} ayında kalan nöbetiniz yok`} text={`${monthName(d.showing)} nöbetleriniz aşağıda.`} />
      ) : (
        <ScheduleNote schedule={d.schedule} />
      )}
      {!showingNext && d.nextMonth.soon && !d.nextMonth.entered && (
        <Banner icon="calendar-outline" tone="primary" title={`${monthName(d.nextMonth.month)} nöbet çizelgesi henüz girilmedi`} text="Girildiğinde nöbetleriniz burada görünür." />
      )}
      <BentoRow>
        <Tile tone="ink" icon="shield-checkmark-outline" label={showingNext ? monthName(d.showing) : `${monthName(d.month)} · kalan`} value={dutyDays.filter((x) => x.duties.length).length} caption="nöbet günü" style={{ flex: 1, minHeight: 116 }} />
        <Tile tone="sun" icon="bus-outline" label="Taşımalı · öğle" value={transportDays} caption="servis · öğle yemeği" style={{ flex: 1, minHeight: 116 }} />
      </BentoRow>
      {!d.teacher ? (
        <Card>
          <Empty icon="person-outline" title="Öğretmen kaydı bağlı değil" text="Okul yönetimi hesabınızı öğretmen kaydınızla eşleştirince nöbetleriniz görünür." />
        </Card>
      ) : !d.days.length ? (
        <Card>
          <Empty icon="checkmark-circle-outline" title={showingNext ? `${monthName(d.showing)} ayında da nöbetiniz yok` : 'Bu ay kalan nöbetiniz yok'} />
        </Card>
      ) : (
        d.days.map((day) => <MyDutyCard key={day.date} day={day} today={d.today} teacherName={d.teacherName} />)
      )}

      <Button icon="calendar-outline" variant="secondary" onPress={() => router.push('/izin')}>
        İzin bildir
      </Button>
      <T size={12} color={colors.muted} style={{ textAlign: 'center' }}>
        Nöbet günlerinizde ilk dersten 15 dakika önce telefonunuza hatırlatma gelir.
      </T>
    </>
  );
}

function MyDutyCard({ day, today, teacherName }: { day: MyDuties['days'][number]; today: string; teacherName: string | null }) {
  const isToday = day.date === today;
  const label = isToday ? `Bugün · ${WEEKDAY_LONG_TR[day.weekday]}` : dayTitle(day.date);
  if (day.holiday) {
    return (
      <Card style={{ gap: 4, borderStyle: 'dashed', borderWidth: 1, borderColor: colors.borderStrong }}>
        <Label>{label}</Label>
        <T size={15} weight="700">
          Tatil · nöbet yok
        </T>
        <T size={13} color={colors.muted}>
          {day.holiday}
        </T>
      </Card>
    );
  }
  return (
    <Card style={{ gap: 10 }}>
      <Label color={isToday ? colors.primary : colors.muted}>{label}</Label>
      {day.duties.map((x) => (
        <View key={x.dutyId} style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="location-outline" size={18} color={colors.primary} />
            <T size={18} weight="800" style={{ flex: 1 }}>
              {x.area}
            </T>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {x.partners.length > 0 && <Pill>Birlikte: {x.partners.join(', ')}</Pill>}
            {x.substituteFor && <Pill tone="warning">{x.substituteFor} yerine</Pill>}
          </View>
          {x.coveredBy && (
            <T size={13} color={colors.warning} weight="600">
              İzniniz nedeniyle bu nöbeti {x.coveredBy} tutuyor.
            </T>
          )}
        </View>
      ))}
      {day.transport && (
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: tiles.sun.bg, borderRadius: 14, padding: 12 }}>
          <Icon name="bus-outline" size={18} color={tiles.sun.fg} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: tiles.sun.fg, marginBottom: 2 }}>Taşımalı ve öğle yemeği nöbeti</Text>
            {[teacherName ?? 'Siz', ...day.transport.partners].map((name, i) => (
              <Text key={`${i}${name}`} style={{ fontSize: 13, fontWeight: i === 0 ? '700' : '600', color: i === 0 ? tiles.sun.fg : tiles.sun.sub }}>
                {i + 1}. Nöbetçi: {name}
              </Text>
            ))}
          </View>
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.divider }}>
        <Icon name="person-circle-outline" size={16} color={colors.muted} />
        <T size={13} color={colors.muted}>
          Nöbetçi müdür yardımcısı: <Text style={{ fontWeight: '700', color: day.supervisor ? colors.ink : colors.faint }}>{day.supervisor ?? 'girilmemiş'}</Text>
        </T>
      </View>
    </Card>
  );
}

function Pill({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'warning' }) {
  return (
    <View style={{ backgroundColor: tone === 'warning' ? colors.warningSoft : colors.primarySoft, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
      <Text style={{ fontSize: 12, color: tone === 'warning' ? colors.warning : colors.ink }}>{children}</Text>
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

  const weekend = day ? day.weekday >= 6 : false;
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
      ) : (
        <>
          {day.supervisor && (
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Icon name="person-circle-outline" size={22} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <T size={12.5} color={colors.muted} weight="600">
                  Nöbetçi müdür yardımcısı
                </T>
                <T size={15.5} weight="800">
                  {day.supervisor}
                </T>
              </View>
            </Card>
          )}
          {day.holiday ? (
            <Card>
              <Empty icon="sunny-outline" title={`${WEEKDAY_LONG_TR[day.weekday]} · tatil`} text={`${day.holiday} nedeniyle nöbet yok.`} />
            </Card>
          ) : !day.entries.length ? (
            <Card>
              {weekend ? (
                <Empty icon="cafe-outline" title={`${WEEKDAY_LONG_TR[day.weekday]} · hafta sonu`} text="Okul kapalı, nöbet yok." />
              ) : (
                <Empty icon="shield-outline" title="Bu gün için nöbet girilmemiş" text="Nöbet çizelgesi panelden Excel ile ya da elle girilebilir." />
              )}
            </Card>
          ) : (
            <>
              <ScheduleNote schedule={day.schedule} />
              {day.gaps.length > 0 &&
                day.entries
                  .filter((e) => day.gaps.includes(e.dutyId))
                  .map((gap) => <GapCard key={gap.dutyId} day={day} gap={gap} canAssign={canAssign} />)}
              <Card style={{ paddingVertical: 4, gap: 0 }}>
                {areas.map((list, i) => (
                  <View key={list[0]!.dutyId} style={{ paddingVertical: 12, gap: 3, borderTopWidth: i ? 1 : 0, borderTopColor: colors.divider }}>
                    <T size={15.5} weight="800">
                      {list.map((e) => (e.substitute ? `${e.substitute.teacherName} (yerine)` : e.onLeave ? `${e.teacherName} (izinli)` : e.teacherName)).join(', ')}
                    </T>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Icon name="location-outline" size={14} color={colors.muted} />
                      <T size={13} weight="600" color={colors.muted}>
                        {list[0]!.area}
                      </T>
                    </View>
                  </View>
                ))}
              </Card>
            </>
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
            <View key={c.teacherId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, backgroundColor: colors.primarySoft }}>
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
