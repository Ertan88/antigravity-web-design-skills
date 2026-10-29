import { CONDUCT_GROUPS } from '@okulpano/shared/conduct';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../src/api.ts';
import { useAuth, useSchoolPath } from '../../src/auth.tsx';
import { useConductAlerts, useConductClass, useConductClasses, useMeToday, useNow, type ConductCriterion, type ConductGroup } from '../../src/data.ts';
import { teacherDay } from '../../src/day.ts';
import { Text, TextInput } from '../../src/text.tsx';
import { colors, radius, tiles } from '../../src/theme.ts';
import { Sheet } from '../../src/sheet.tsx';
import { Avatar, Empty, ErrorNote, HeaderButton, Icon, Loading, Screen, T } from '../../src/ui.tsx';

/** Kaydettikten sonra "Geri al" bu kadar görünür */
const UNDO_MS = 10_000;

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

/**
 * Gözlem (hızlı giriş): öğretmen dersteyken sınıf ders programından kendiliğinden gelir. Öğrenciye dokun → kriter
 * seç → kaydet. Birkaç öğrenci ya da bütün sınıf birlikte seçilebilir. Kaydedince 10 saniye "Geri al" çıkar.
 * Kutulardaki rakam öğrencinin bu ayki net puanıdır (yalnızca öğretmenler, rehber ve idare görür).
 */
export default function Gozlem() {
  const { me, can } = useAuth();
  const counsel = can('conduct.counsel') || can('conduct.manage');
  const alerts = useConductAlerts('open', counsel);
  const path = useSchoolPath('conduct');
  const qc = useQueryClient();
  const today = useMeToday();
  const now = useNow(60_000);
  const classes = useConductClasses();
  const [classId, setClassId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [multi, setMulti] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [sheet, setSheet] = useState(false);
  const [query, setQuery] = useState('');
  const [undo, setUndo] = useState<{ batchId: string; text: string } | null>(null);

  // Şu anki (yoksa sıradaki) dersin sınıfı
  const lesson = useMemo(() => {
    if (!today.data?.teacher) return null;
    const d = teacherDay(today.data, now);
    return d.lessons.find((l) => l.state === 'now') ?? null;
  }, [today.data, now]);
  const lessonClassId = classes.data?.find((c) => lesson && c.name.toLocaleUpperCase('tr-TR') === lesson.className.toLocaleUpperCase('tr-TR'))?.id ?? null;
  const activeId = classId ?? lessonClassId ?? classes.data?.find((c) => c.students > 0)?.id ?? null;
  const screen = useConductClass(activeId);
  const s = screen.data;

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(t);
  }, [undo]);

  const refresh = () => void qc.invalidateQueries({ predicate: (q) => String(q.queryKey[1] ?? '').startsWith('conduct/') });
  const needle = query.trim().toLocaleLowerCase('tr-TR');
  const list = (s?.students ?? []).filter((st) => !needle || `${st.schoolNo} ${st.fullName}`.toLocaleLowerCase('tr-TR').includes(needle));
  const chosen = (s?.students ?? []).filter((st) => selected.includes(st.id));

  const tapStudent = (id: string) => {
    if (multi) setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
    else {
      setSelected([id]);
      setSheet(true);
    }
  };
  const isLesson = Boolean(lesson && activeId === lessonClassId);

  return (
    <View style={{ flex: 1 }}>
    <Screen
      title="Gözlem"
      subtitle={me?.user.fullName}
      right={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {counsel && <HeaderButton icon="heart-outline" label="Rehberlik uyarıları" badge={alerts.data?.open} onPress={() => router.push('/rehberlik')} />}
          <HeaderButton icon="speedometer-outline" label="Dönem göstergesi" onPress={() => router.push('/donem')} />
        </View>
      }
      refreshing={screen.isRefetching} onRefresh={() => void screen.refetch()}>
      <ErrorNote error={classes.error ?? screen.error} />
      {/* Sınıf: dersteyken ders programından; "Sınıf değiştir" ile okuldaki her sınıf seçilebilir */}
      <View style={{ backgroundColor: tiles.ink.bg, borderRadius: radius.lg, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: tiles.ink.sub, fontSize: 12.5, fontWeight: '700' }}>{isLesson ? `Şu an · ${lesson!.period.no}. ders` : 'Sınıf'}</Text>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: -0.6 }} numberOfLines={1}>
            {s ? `${s.class.name}${isLesson ? ` · ${lesson!.subject}` : ''}` : classes.isLoading ? '…' : 'Sınıf seçin'}
          </Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => setPicking(true)} style={{ backgroundColor: tiles.ink.chip, borderRadius: radius.pill, paddingHorizontal: 13, paddingVertical: 8 }}>
          <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '800' }}>Sınıf değiştir</Text>
        </Pressable>
      </View>

      {s && s.students.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <ToolChip
            dark
            icon="people"
            label="Tüm sınıfa"
            onPress={() => {
              setSelected(s.students.map((x) => x.id));
              setSheet(true);
            }}
          />
          <ToolChip
            icon={multi ? 'close' : 'checkbox-outline'}
            label={multi ? 'Seçimi bitir' : 'Birkaç kişi seç'}
            onPress={() => {
              setMulti((m) => !m);
              setSelected([]);
            }}
          />
          <View style={{ flex: 1, minWidth: 120, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 6 }}>
            <Icon name="search" size={16} color={colors.faint} />
            <TextInput value={query} onChangeText={setQuery} placeholder="Ad ya da no" placeholderTextColor={colors.subtle} style={{ flex: 1, fontSize: 13.5, color: colors.ink, paddingVertical: 0 }} accessibilityLabel="Öğrenci ara" />
          </View>
        </View>
      )}

      {!s ? (
        classes.data && !classes.data.length ? <Empty icon="people-outline" title="Sınıf yok" text="Okulunuz panelden öğrencileri sınıflarıyla birlikte eklemeli." /> : <Loading />
      ) : !s.students.length ? (
        <Empty icon="people-outline" title="Bu sınıfta öğrenci yok" />
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {list.map((st) => {
            const on = selected.includes(st.id) && (multi || sheet);
            return (
              <Pressable
                key={st.id}
                accessibilityRole="button"
                accessibilityLabel={`${st.fullName}, numara ${st.schoolNo}, bu ay ${signed(st.net)}`}
                onPress={() => tapStudent(st.id)}
                onLongPress={() => router.push(`/ogrenci/${st.id}` as never)}
                style={({ pressed }) => ({
                  width: '31.8%',
                  backgroundColor: colors.card,
                  borderRadius: 18,
                  borderWidth: on ? 2 : 1,
                  borderColor: on ? colors.ink : colors.border,
                  padding: on ? 9 : 10,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Avatar name={st.fullName} size={32} />
                  <NetChip n={st.net} />
                </View>
                <Text style={{ marginTop: 7, fontSize: 12.5, fontWeight: '800', color: colors.ink, lineHeight: 16 }} numberOfLines={2}>
                  {st.fullName}
                </Text>
                <Text style={{ fontSize: 11, fontWeight: '600', color: colors.faint }}>No {st.schoolNo}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {s && s.students.length > 0 && (
        <T size={12} color={colors.faint} style={{ textAlign: 'center' }}>
          Öğrenci kartı için öğrenciye basılı tutun.
        </T>
      )}

      {multi && selected.length > 0 && (
        <Pressable accessibilityRole="button" onPress={() => setSheet(true)} style={{ height: 50, borderRadius: 25, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.onPrimary, fontSize: 15, fontWeight: '800' }}>{selected.length} öğrenciye puan ver</Text>
        </Pressable>
      )}

      <ClassPicker
        open={picking}
        classes={classes.data ?? []}
        current={activeId}
        lessonClassId={lessonClassId}
        onPick={(id) => {
          setClassId(id);
          setSelected([]);
          setMulti(false);
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
      <EntrySheet
        open={sheet}
        criteria={s?.criteria ?? []}
        names={chosen.map((c) => c.fullName)}
        net={chosen.length === 1 ? chosen[0]!.net : null}
        className={s?.class.name ?? ''}
        onClose={() => setSheet(false)}
        onSave={async (criterion, note) => {
          const r = await api<{ batchId: string; count: number; label: string; points: number; names: string[] }>(`${path}/entries`, {
            body: { studentIds: selected, criterionId: criterion.id, note: note || null },
          });
          setSheet(false);
          setMulti(false);
          setSelected([]);
          setUndo({ batchId: r.batchId, text: r.count === 1 ? `${r.names[0]} · ${signed(r.points)} ${r.label}` : `${r.count} öğrenciye ${signed(r.points)} ${r.label}` });
          refresh();
        }}
      />
    </Screen>
      {/* Ekranın altında, kaydırmadan bağımsız */}
      {undo && (
        <UndoBar
          text={undo.text}
          onUndo={async () => {
            const id = undo.batchId;
            setUndo(null);
            await api(`${path}/batches/${id}`, { method: 'DELETE' }).catch(() => undefined);
            refresh();
          }}
        />
      )}
    </View>
  );
}

function NetChip({ n }: { n: number }) {
  const bg = n > 0 ? colors.successSoft : n < 0 ? colors.dangerSoft : colors.primarySoft;
  const fg = n > 0 ? colors.success : n < 0 ? colors.danger : colors.faint;
  return (
    <View style={{ backgroundColor: bg, borderRadius: 9, paddingHorizontal: 7, paddingVertical: 2 }}>
      <Text style={{ color: fg, fontSize: 11, fontWeight: '800' }}>{signed(n)}</Text>
    </View>
  );
}

function ToolChip({ label, icon, onPress, dark }: { label: string; icon: Parameters<typeof Icon>[0]['name']; onPress: () => void; dark?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 40,
        paddingHorizontal: 13,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: dark ? colors.primary : colors.border,
        backgroundColor: dark ? colors.primary : pressed ? colors.primarySoft : colors.card,
      })}
    >
      <Icon name={icon} size={16} color={dark ? colors.onPrimary : colors.ink} />
      <Text style={{ fontSize: 13, fontWeight: '700', color: dark ? colors.onPrimary : colors.ink }}>{label}</Text>
    </Pressable>
  );
}

/** Alttan açılan pencere (sınıf seçimi, puan verme) */
function ClassPicker({
  open,
  classes,
  current,
  lessonClassId,
  onPick,
  onClose,
}: {
  open: boolean;
  classes: { id: string; name: string; students: number }[];
  current: string | null;
  lessonClassId: string | null;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose}>
      <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink, marginBottom: 4 }}>Sınıf seçin</Text>
      <T size={12.5} color={colors.faint}>
        Okuldaki her sınıfa puan verebilirsiniz (ör. nöbette koridorda gördüğünüz davranış).
      </T>
      <ScrollView style={{ marginTop: 12 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 8 }}>
        {classes.map((c) => {
          const on = c.id === current;
          return (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              onPress={() => onPick(c.id)}
              style={{ minWidth: 76, paddingHorizontal: 14, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.primary : colors.primarySoft }}
            >
              <Text style={{ fontSize: 14, fontWeight: '800', color: on ? colors.onPrimary : colors.ink }}>
                {c.name}
                {c.id === lessonClassId ? ' · şimdi' : ''}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </Sheet>
  );
}

function EntrySheet({
  open,
  criteria,
  names,
  net,
  className,
  onClose,
  onSave,
}: {
  open: boolean;
  criteria: ConductCriterion[];
  names: string[];
  net: number | null;
  className: string;
  onClose: () => void;
  onSave: (c: ConductCriterion, note: string) => Promise<void>;
}) {
  const [pick, setPick] = useState<ConductCriterion | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setPick(null);
      setNote('');
      setError(null);
    }
    wasOpen.current = open;
  }, [open]);
  const groups = (Object.keys(CONDUCT_GROUPS) as ConductGroup[]).map((g) => ({ g, items: criteria.filter((c) => c.group === g) })).filter((x) => x.items.length);
  const title = names.length === 1 ? names[0]! : `${names.length} öğrenci`;
  const save = async () => {
    if (!pick) return;
    if (pick.noteRequired && !note.trim()) return setError('Bu kriter için kısa bir not yazın.');
    setBusy(true);
    setError(null);
    try {
      await onSave(pick, note.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {names.length === 1 ? <Avatar name={names[0]} size={40} /> : <Icon name="people" size={26} />}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: colors.ink }} numberOfLines={1}>
            {title}
          </Text>
          <Text style={{ fontSize: 12, color: colors.faint, fontWeight: '600' }}>
            {className}
            {net !== null ? ` · bu ay ${signed(net)}` : ''}
          </Text>
        </View>
      </View>
      <ScrollView style={{ marginTop: 6 }} keyboardShouldPersistTaps="handled">
        {!criteria.length && <T color={colors.faint}>Bu sınıfın düzeyi için kriter tanımlanmamış. Okul yönetimi panelden Gözlem Kriterleri'ni eklemeli.</T>}
        {groups.map(({ g, items }) => (
          <View key={g}>
            <Text style={{ fontSize: 11.5, fontWeight: '800', color: colors.faint, marginTop: 12, marginBottom: 6, letterSpacing: 0.3 }}>{CONDUCT_GROUPS[g].toLocaleUpperCase('tr-TR')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {items.map((c) => {
                const good = c.points > 0;
                const on = pick?.id === c.id;
                return (
                  <Pressable
                    key={c.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => setPick(on ? null : c)}
                    style={{
                      paddingHorizontal: 11,
                      paddingVertical: 9,
                      borderRadius: 14,
                      backgroundColor: good ? colors.successSoft : colors.dangerSoft,
                      borderWidth: 2,
                      borderColor: on ? (good ? colors.success : colors.danger) : 'transparent',
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '700', color: good ? colors.success : colors.danger }}>
                      {signed(c.points)} {c.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={pick?.noteRequired ? 'Not (zorunlu)' : 'Not (isteğe bağlı)'}
          placeholderTextColor={colors.subtle}
          maxLength={200}
          style={{ marginTop: 14, height: 46, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 14, fontSize: 14.5, color: colors.ink, backgroundColor: colors.card }}
        />
        {error && <T color={colors.danger} size={13} style={{ marginTop: 8 }}>{error}</T>}
        <Pressable
          accessibilityRole="button"
          disabled={!pick || busy}
          onPress={() => void save()}
          style={{ marginTop: 12, height: 50, borderRadius: 25, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', opacity: !pick || busy ? 0.45 : 1 }}
        >
          <Text style={{ color: colors.onPrimary, fontSize: 15.5, fontWeight: '800' }}>{pick ? `Kaydet · ${signed(pick.points)}` : 'Kriter seçin'}</Text>
        </Pressable>
      </ScrollView>
    </Sheet>
  );
}

function UndoBar({ text, onUndo }: { text: string; onUndo: () => void }) {
  return (
    <View
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: 16,
        backgroundColor: '#1c1917',
        borderRadius: 18,
        paddingVertical: 12,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <Icon name="checkmark-circle" size={18} color="#4ade80" />
      <Text style={{ flex: 1, color: '#fff', fontSize: 13, fontWeight: '700' }} numberOfLines={2}>
        {text}
      </Text>
      <Pressable accessibilityRole="button" onPress={onUndo} hitSlop={10}>
        <Text style={{ color: '#fde68a', fontSize: 13.5, fontWeight: '800' }}>Geri al</Text>
      </Pressable>
    </View>
  );
}
