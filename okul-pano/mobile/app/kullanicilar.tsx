import { applyPersonRole, DUTY_PACKAGES, normalizeName, PERSON_ROLES, PERSON_STATUS, toggleDuty, type DutyKey, type Person } from '@okulpano/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { api } from '../src/api.ts';
import { useAuth } from '../src/auth.tsx';
import { STATUS_BADGE, usePeople } from '../src/people.ts';
import { Sheet } from '../src/sheet.tsx';
import { Text } from '../src/text.tsx';
import { colors, radius } from '../src/theme.ts';
import { Avatar, Badge, Button, Card, Chip, confirm, Empty, ErrorNote, Field, Icon, Loading, Screen, Segmented, T } from '../src/ui.tsx';

type Filter = 'all' | 'none' | 'invited' | 'pending' | 'management';
type Tab = 'people' | 'duties';

const dutyLabel = Object.fromEntries(DUTY_PACKAGES.map((d) => [d.key, d.label])) as Record<DutyKey, string>;

/**
 * Kişiler ve Yetkiler (panelle aynı): kadrodaki öğretmenler ve kadro dışı kişiler tek listede; kişiye dokununca kişi
 * ekranı açılır. Görevler sekmesi iş bölümünü gösterir. Hesap tek "Hesap aç" ekranından açılır.
 */
export default function Kisiler() {
  const { filtre } = useLocalSearchParams<{ filtre?: string }>();
  const { people, allowed, full, loading, refreshing, error, refresh, membersPath } = usePeople();
  const [tab, setTab] = useState<Tab>('people');
  const [filter, setFilter] = useState<Filter>(filtre === 'onay' ? 'pending' : 'all');
  const [q, setQ] = useState('');

  if (!allowed) {
    return (
      <Screen back title="Kişiler ve yetkiler">
        <Card>
          <Empty icon="lock-closed-outline" title="Bu ekran için yetkiniz yok" text="Okul müdüründen “Öğretmen hesabı açma” yetkisini isteyin." />
        </Card>
      </Screen>
    );
  }

  const counts: Record<Filter, number> = {
    all: people.length,
    none: people.filter((p) => p.status === 'none' || p.status === 'code').length,
    invited: people.filter((p) => p.status === 'invited').length,
    pending: people.filter((p) => p.status === 'pending').length,
    management: people.filter((p) => p.role === 'owner' || p.role === 'admin').length,
  };
  const needle = normalizeName(q);
  const visible = people.filter((p) => {
    if (filter === 'none' && !(p.status === 'none' || p.status === 'code')) return false;
    if (filter === 'invited' && p.status !== 'invited') return false;
    if (filter === 'pending' && p.status !== 'pending') return false;
    if (filter === 'management' && !(p.role === 'owner' || p.role === 'admin')) return false;
    return !needle || normalizeName(`${p.fullName} ${p.sub} ${p.duties.map((d) => dutyLabel[d]).join(' ')}`).includes(needle);
  });
  const promotions = people.filter((p) => p.member?.promotionRequest).length;

  return (
    <Screen
      back
      title="Kişiler ve yetkiler"
      subtitle={people.length ? `${people.length} kişi · ${counts.none} kişinin hesabı yok` : undefined}
      refreshing={refreshing}
      onRefresh={refresh}
      right={
        <Button size="sm" icon="person-add-outline" onPress={() => router.push('/hesap-ac')}>
          Hesap aç
        </Button>
      }
    >
      {full && (
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'people', label: 'Kişiler' },
            { value: 'duties', label: 'Görevler' },
          ]}
        />
      )}
      <ErrorNote error={error} />
      {counts.pending > 0 && filter !== 'pending' && tab === 'people' && (
        <Pressable onPress={() => setFilter('pending')} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: colors.warningSoft, borderRadius: 18, padding: 12 }}>
          <Icon name="time-outline" size={22} color={colors.warning} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: colors.ink }}>{counts.pending} kişi onay bekliyor</Text>
            <T size={12.5} color={colors.muted}>
              Toplantı QR'ı ile hesap açtı; dokunun ve kontrol edin
            </T>
          </View>
        </Pressable>
      )}
      {promotions > 0 && (
        <T size={13} color={colors.warning} weight="700">
          {promotions} kişi için Müdür yardımcısı önerisi var; kişinin ekranından karar verin.
        </T>
      )}

      {loading ? (
        <Loading />
      ) : tab === 'duties' ? (
        <Duties people={people} membersPath={membersPath} refresh={refresh} />
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, alignItems: 'center' }}>
            {(
              [
                ['all', 'Tümü'],
                ['none', 'Hesabı yok'],
                ['invited', 'Davet bekliyor'],
                ['pending', 'Onay bekliyor'],
                ['management', 'Yönetim'],
              ] as const
            ).map(([k, label]) => (
              <Chip key={k} label={`${label} (${counts[k]})`} selected={filter === k} onPress={() => setFilter(k)} />
            ))}
          </ScrollView>
          <Field label="Ara" value={q} onChangeText={setQ} placeholder="Ad, branş ya da görev" />
          {visible.length ? (
            <Card style={{ paddingVertical: 4, gap: 0 }}>
              {visible.map((p, i) => (
                <PersonRow key={p.key} p={p} last={i === visible.length - 1} onPress={() => router.push({ pathname: '/kullanici/[id]', params: { id: p.key } })} />
              ))}
            </Card>
          ) : (
            <Card>
              <Empty icon="people-outline" title={people.length ? 'Bu süzgeçte kimse yok' : 'Kadroda öğretmen yok'} text={people.length ? undefined : 'Önce Öğretmen Kadrosu’na öğretmenleri ekleyin.'} />
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}

function PersonRow({ p, last, onPress }: { p: Person; last: boolean; onPress: () => void }) {
  const st = PERSON_STATUS[p.status];
  const duties = p.role === 'owner' || p.role === 'admin' ? 'Tüm bölümler' : p.duties.map((d) => dutyLabel[d]).join(', ');
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 })}
    >
      <Avatar name={p.fullName} size={40} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink }} numberOfLines={1}>
          {p.fullName}
        </Text>
        <Text style={{ fontSize: 12.5, color: colors.muted }} numberOfLines={1}>
          {[PERSON_ROLES[p.role].label, duties || null, p.sub].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 3 }}>
        <Badge tone={STATUS_BADGE[st.tone]}>{st.label}</Badge>
        {p.member?.promotionRequest && (
          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.warning }}>Öneri bekliyor</Text>
        )}
      </View>
    </Pressable>
  );
}

type Target = { kind: 'management' } | { kind: 'counsel' } | { kind: 'duty'; key: DutyKey; label: string };

/** Görevler: her görevin sorumluları; ＋ ile kişi eklenir, × ile çıkarılır (panelle aynı) */
function Duties({ people, membersPath, refresh }: { people: Person[]; membersPath: string; refresh: () => void }) {
  const { me, role: myRole } = useAuth();
  const iAmOwner = myRole === 'owner';
  const [picking, setPicking] = useState<Target | null>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState<unknown>(null);
  const accounts = people.filter((p) => p.member);
  const editors = accounts.filter((p) => p.member!.role === 'editor' && p.member!.userId !== me?.user.id);
  const withDuty = (key: DutyKey) => {
    const pkg = DUTY_PACKAGES.find((d) => d.key === key)!;
    return accounts.filter((p) => p.member!.role === 'editor' && (pkg.permissions as readonly string[]).some((x) => p.member!.permissions.includes(x)));
  };

  const call = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      refresh();
    } catch (e) {
      setError(e);
    }
  };
  const patch = (p: Person, body: unknown) => call(() => api(`${membersPath}/${p.member!.id}`, { method: 'PATCH', body }));

  const add = async (t: Target, p: Person) => {
    setPicking(null);
    const m = p.member!;
    if (t.kind === 'management') {
      if (!iAmOwner) return call(() => api(`${membersPath}/${m.id}/promotion-request`, { body: {} }));
      if (!(await confirm({ title: `${p.fullName} müdür yardımcısı yapılsın mı?`, message: 'Bütün bölümleri düzenler, kullanıcı ekler ve bütün gözlem kayıtlarını görür.', tone: 'warning', icon: 'shield-outline', confirmLabel: 'Müdür yardımcısı yap' }))) return;
      return patch(p, applyPersonRole('admin', m.permissions));
    }
    if (t.kind === 'counsel') return patch(p, applyPersonRole('counselor', m.permissions));
    return patch(p, { permissions: toggleDuty(m.permissions, t.key, true) });
  };
  const remove = async (t: Target, p: Person) => {
    const m = p.member!;
    if (t.kind === 'management') {
      if (!(await confirm({ title: `${p.fullName} yönetimden çıkarılsın mı?`, message: 'Öğretmen olur; görevleri ayrıca verilir.', tone: 'warning', icon: 'shield-outline', confirmLabel: 'Çıkar' }))) return;
      return patch(p, applyPersonRole(p.teacherId ? 'teacher' : 'staff', []));
    }
    if (t.kind === 'counsel') return patch(p, applyPersonRole(p.teacherId ? 'teacher' : 'staff', m.permissions));
    return patch(p, { permissions: toggleDuty(m.permissions, t.key, false) });
  };
  const candidates = (t: Target) => {
    const base = t.kind === 'management' ? editors.filter((p) => !p.member!.promotionRequest) : t.kind === 'counsel' ? editors.filter((p) => p.role !== 'counselor') : editors.filter((p) => !p.duties.includes(t.key));
    const needle = normalizeName(q);
    return base.filter((p) => !needle || normalizeName(`${p.fullName} ${p.sub}`).includes(needle));
  };

  const Group = ({ title, text, t, list, removable = true }: { title: string; text: string; t: Target; list: Person[]; removable?: boolean }) => (
    <Card style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <T weight="800" size={15.5}>
            {title}
          </T>
          <T size={12.5} color={colors.muted}>
            {text}
          </T>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${title}: kişi ekle`}
          onPress={() => {
            setQ('');
            setPicking(t);
          }}
          style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="add" size={20} />
        </Pressable>
      </View>
      {list.length ? (
        list.map((p) => {
          const partial = t.kind === 'duty' && !p.duties.includes(t.key);
          const canRemove = removable && p.member!.userId !== me?.user.id && p.role !== 'owner';
          return (
            <View key={p.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Avatar name={p.fullName} size={32} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <T weight="700" size={14} lines={1}>
                  {p.fullName}
                </T>
                {(partial || p.member?.promotionRequest) && (
                  <T size={11.5} color={colors.warning}>
                    {partial ? 'Kısmen (eski seçim) · kişi ekranından tamamlanır' : 'Müdür yardımcısı önerisi bekliyor'}
                  </T>
                )}
              </View>
              {canRemove && (
                <Pressable accessibilityRole="button" accessibilityLabel={`${p.fullName} çıkar`} onPress={() => void remove(t, p)} hitSlop={10}>
                  <Icon name="close" size={18} color={colors.muted} />
                </Pressable>
              )}
            </View>
          );
        })
      ) : (
        <T size={12.5} color={colors.subtle}>
          Kimse yok · yönetim yapar
        </T>
      )}
    </Card>
  );

  const pickTitle = picking?.kind === 'management' ? (iAmOwner ? 'Müdür yardımcısı ekle' : 'Müdür yardımcısı öner') : picking?.kind === 'counsel' ? 'Rehber öğretmen ekle' : picking?.kind === 'duty' ? `${picking.label} görevi` : '';
  return (
    <>
      <ErrorNote error={error} />
      <T size={12.5} color={colors.muted}>
        Görev yalnızca hesabı olan kişiye verilir.
      </T>
      <Group
        title="Yönetim · bütün bölümler"
        text={iAmOwner ? 'Okul müdürü ve müdür yardımcıları. Müdür yardımcısını siz atarsınız.' : 'Müdür yardımcısını müdür atar; ＋ ile müdüre önerirsiniz.'}
        t={{ kind: 'management' }}
        list={accounts.filter((p) => p.role === 'owner' || p.role === 'admin')}
        removable={iAmOwner}
      />
      <Group title="Rehberlik" text="Bütün öğrencilerin gözlem kayıtlarını görür" t={{ kind: 'counsel' }} list={accounts.filter((p) => p.role === 'counselor')} />
      {DUTY_PACKAGES.map((d) => (
        <Group key={d.key} title={d.label} text={d.text} t={{ kind: 'duty', key: d.key, label: d.label }} list={withDuty(d.key)} />
      ))}

      <Sheet open={picking !== null} onClose={() => setPicking(null)}>
        <Text style={{ fontSize: 17, fontWeight: '800', color: colors.ink }}>{pickTitle}</Text>
        {picking?.kind === 'management' && !iAmOwner && (
          <T size={12.5} color={colors.muted}>
            Seçtiğiniz kişi müdürün onayına gönderilir.
          </T>
        )}
        <Field label="Ara" value={q} onChangeText={setQ} placeholder="Ad ya da branş" />
        <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 4, maxHeight: 380 }} keyboardShouldPersistTaps="handled">
          {picking &&
            candidates(picking).map((p) => (
              <Pressable key={p.key} accessibilityRole="button" onPress={() => void add(picking, p)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
                <Avatar name={p.fullName} size={34} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T weight="700" size={14.5} lines={1}>
                    {p.fullName}
                  </T>
                  <T size={12} color={colors.muted} lines={1}>
                    {p.sub}
                  </T>
                </View>
              </Pressable>
            ))}
          {picking && !candidates(picking).length && (
            <View style={{ padding: 16, borderRadius: radius.md }}>
              <T size={13.5} color={colors.muted} style={{ textAlign: 'center' }}>
                Eklenebilecek kişi yok.
              </T>
            </View>
          )}
        </ScrollView>
      </Sheet>
    </>
  );
}
