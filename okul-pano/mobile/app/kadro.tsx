import { errorText, normalizeName } from '@okulpano/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { api } from '../src/api.ts';
import { useAuth, useSchoolPath } from '../src/auth.tsx';
import { useSchoolQuery } from '../src/data.ts';
import { Sheet, SheetScroll } from '../src/sheet.tsx';
import { Text } from '../src/text.tsx';
import { colors, radius } from '../src/theme.ts';
import { Avatar, Badge, Button, Card, Chip, confirm, EditIconButton, Empty, ErrorNote, Field, Icon, Loading, Screen, T, ToggleRow } from '../src/ui.tsx';

/** Kadrodaki öğretmen (iletişim bilgileri yalnızca kadro ya da kullanıcı yönetimi yetkisi olana dolu gelir) */
interface Teacher {
  id: string;
  fullName: string;
  branchId: string | null;
  titleId: string | null;
  branch: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  isActive: boolean;
}
interface Option {
  id: string;
  name: string;
}

/**
 * Öğretmen kadrosu (paneldeki sayfanın karşılığı): arama, branşa göre süzme, ekle. Satıra dokunmak bir şey açmaz;
 * iletişim dahil bütün bilgiler yalnızca kalem (Düzenle) ile açılan pencerede görünür. Excel'den içe aktarma ve
 * branş / ünvan listelerinin düzenlenmesi panelde kalır.
 */
export default function Kadro() {
  const { can } = useAuth();
  const allowed = can('directory.manage');
  const teachers = useSchoolQuery<Teacher[]>('teachers', { enabled: allowed });
  const branches = useSchoolQuery<Option[]>('teacher-branches', { enabled: allowed });
  const titles = useSchoolQuery<Option[]>('teacher-titles', { enabled: allowed });
  const [q, setQ] = useState('');
  const [branch, setBranch] = useState<string | null>(null);
  const [editing, setEditing] = useState<Teacher | 'new' | null>(null);

  if (!allowed) {
    return (
      <Screen title="Öğretmen kadrosu" back>
        <Empty icon="lock-closed-outline" title="Yetkiniz yok" text="Öğretmen kadrosunu kadro yetkisi olan kişiler yönetir." />
      </Screen>
    );
  }

  const all = [...(teachers.data ?? [])].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.fullName.localeCompare(b.fullName, 'tr'));
  const needle = normalizeName(q);
  const visible = all.filter(
    (t) => (!branch || t.branchId === branch) && (!needle || normalizeName(`${t.fullName} ${t.branch ?? ''} ${t.title ?? ''}`).includes(needle)),
  );
  // Branş çipleri: kadroda en çok öğretmeni olan branşlar önce
  const counts = new Map<string, number>();
  for (const t of all) if (t.branchId) counts.set(t.branchId, (counts.get(t.branchId) ?? 0) + 1);
  const branchChips = (branches.data ?? []).filter((b) => counts.has(b.id)).sort((a, b) => counts.get(b.id)! - counts.get(a.id)! || a.name.localeCompare(b.name, 'tr'));
  const passive = all.filter((t) => !t.isActive).length;

  return (
    <Screen
      title="Öğretmen kadrosu"
      subtitle={teachers.data ? `${all.length} öğretmen${passive ? ` · ${passive} pasif` : ''}` : undefined}
      back
      right={
        <Button size="sm" icon="add" onPress={() => setEditing('new')}>
          Ekle
        </Button>
      }
      refreshing={teachers.isRefetching}
      onRefresh={() => void teachers.refetch()}
    >
      <ErrorNote error={teachers.error} />
      <Field label="Ara" value={q} onChangeText={setQ} placeholder="Ad, branş ya da ünvan" autoCapitalize="none" />
      {branchChips.length > 1 && (
        // Yatay kaydırma: çipler ekranın altına doğru uzamasın
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8 }}>
          <Chip label={`Tümü ${all.length}`} selected={!branch} onPress={() => setBranch(null)} />
          {branchChips.map((b) => (
            <Chip key={b.id} label={`${b.name} ${counts.get(b.id)}`} selected={branch === b.id} onPress={() => setBranch(branch === b.id ? null : b.id)} />
          ))}
        </ScrollView>
      )}
      {!teachers.data ? (
        <Loading />
      ) : !all.length ? (
        <Empty icon="school-outline" title="Kadro boş" text="Öğretmenleri “Ekle” ile tek tek ekleyebilir ya da yönetim panelinden Excel ile toplu yükleyebilirsiniz." />
      ) : !visible.length ? (
        <Empty icon="search" title="Eşleşen öğretmen yok" text="Aramayı ya da branş seçimini değiştirin." />
      ) : (
        <Card style={{ paddingVertical: 4, gap: 0 }}>
          {visible.map((t, i) => (
            <TeacherRow key={t.id} t={t} last={i === visible.length - 1} onEdit={() => setEditing(t)} />
          ))}
        </Card>
      )}
      {editing && (
        <EditSheet
          teacher={editing === 'new' ? null : editing}
          branches={branches.data ?? []}
          titles={titles.data ?? []}
          onClose={() => setEditing(null)}
        />
      )}
    </Screen>
  );
}

/** Satır yalnızca bilgi gösterir; sağdaki kalem düzenleme penceresini açar */
function TeacherRow({ t, last, onEdit }: { t: Teacher; last: boolean; onEdit: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border }}>
      <Avatar name={t.fullName} size={40} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 15, fontWeight: '800', color: t.isActive ? colors.ink : colors.faint }} numberOfLines={1}>
          {t.fullName}
        </Text>
        <Text style={{ fontSize: 12.5, color: colors.muted }} numberOfLines={1}>
          {[t.title ?? 'Ünvan yok', t.branch ?? 'Branş yok'].join(' · ')}
        </Text>
      </View>
      {!t.isActive && <Badge tone="muted">Pasif</Badge>}
      <EditIconButton label={`${t.fullName} düzenle`} onPress={onEdit} />
    </View>
  );
}

/** Ekle / düzenle: ad soyad, branş, ünvan, iletişim, aktif; mevcut öğretmende Sil */
function EditSheet({ teacher, branches, titles, onClose }: { teacher: Teacher | null; branches: Option[]; titles: Option[]; onClose: () => void }) {
  const { school } = useAuth();
  const qc = useQueryClient();
  const path = useSchoolPath('teachers');
  const [form, setForm] = useState({
    fullName: teacher?.fullName ?? '',
    branchId: teacher?.branchId ?? null,
    titleId: teacher?.titleId ?? null,
    email: teacher?.email ?? '',
    phone: teacher?.phone ?? '',
    isActive: teacher?.isActive ?? true,
  });
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  // Kadro birçok ekranı besler (nöbet, program, kişiler): okulun bütün verisi tazelenir
  const refresh = () => void qc.invalidateQueries({ queryKey: [school?.id] });

  const save = async () => {
    if (form.fullName.trim().length < 2) return setError('Ad soyad gerekli.');
    setBusy('save');
    setError(null);
    try {
      const body = { ...form, fullName: form.fullName.trim(), email: form.email.trim() || null, phone: form.phone.trim() || null };
      if (teacher) await api(`${path}/${teacher.id}`, { method: 'PUT', body });
      else await api(path, { method: 'POST', body });
      refresh();
      onClose();
    } catch (e) {
      setError(errorText(e, 'Kaydedilemedi'));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!teacher) return;
    const ok = await confirm({
      title: `${teacher.fullName} kadrodan silinsin mi?`,
      message: 'Öğretmenin nöbet ve izin kayıtları da silinir; ders programında öğretmen alanı boşalır. Okuldan ayrılan öğretmen için silmek yerine “Aktif”i kapatabilirsiniz.',
      confirmLabel: 'Sil',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy('delete');
    setError(null);
    try {
      await api(`${path}/${teacher.id}`, { method: 'DELETE' });
      refresh();
      onClose();
    } catch (e) {
      setError(errorText(e, 'Silinemedi'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet open onClose={onClose}>
      <Text style={{ fontSize: 17, fontWeight: '800', color: colors.ink }}>{teacher ? teacher.fullName : 'Öğretmen ekle'}</Text>
      <T size={12.5} color={colors.faint} style={{ marginBottom: 8 }}>
        {teacher ? 'Kadro bilgilerini düzenle' : 'Kadroya yeni öğretmen'}
      </T>
      <SheetScroll style={{ maxHeight: 470 }} contentContainerStyle={{ gap: 10 }}>
        <Field label="Ad soyad" value={form.fullName} onChangeText={(v) => set('fullName', v)} autoCapitalize="words" />
        <OptionPicker label="Branş" empty="Branş yok" value={form.branchId} options={branches} onChange={(v) => set('branchId', v)} />
        <OptionPicker label="Ünvan" empty="Ünvan yok" value={form.titleId} options={titles} onChange={(v) => set('titleId', v)} />
        <Field label="E-posta (isteğe bağlı)" value={form.email} onChangeText={(v) => set('email', v)} keyboardType="email-address" autoCapitalize="none" />
        <Field label="Telefon (isteğe bağlı)" value={form.phone} onChangeText={(v) => set('phone', v)} keyboardType="phone-pad" />
        <ToggleRow label="Aktif" description="Pasif öğretmen nöbet, ders programı ve hesap açmada seçilmez." value={form.isActive} onChange={(v) => set('isActive', v)} />
      </SheetScroll>
      {error && (
        <T size={13} color={colors.danger} style={{ marginTop: 8 }}>
          {error}
        </T>
      )}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        {teacher && (
          <Button variant="delete" icon="trash-outline" loading={busy === 'delete'} disabled={busy !== null} onPress={() => void remove()}>
            Sil
          </Button>
        )}
        <View style={{ flex: 1 }}>
          <Button loading={busy === 'save'} disabled={busy !== null} onPress={() => void save()}>
            Kaydet
          </Button>
        </View>
      </View>
    </Sheet>
  );
}

/** Okulun branş / ünvan listesinden seçim (liste panelde düzenlenir); uzun listede arama */
function OptionPicker({ label, empty, value, options, onChange }: { label: string; empty: string; value: string | null; options: Option[]; onChange: (id: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const current = options.find((o) => o.id === value);
  const needle = normalizeName(query);
  const list = options.filter((o) => !needle || normalizeName(o.name).includes(needle));
  const pick = (id: string | null) => {
    setOpen(false);
    setQuery('');
    onChange(id);
  };
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.muted }}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.name ?? empty}`}
        onPress={() => setOpen((o) => !o)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.card, paddingHorizontal: 14 }}
      >
        <Text style={{ flex: 1, fontSize: 15, color: current ? colors.ink : colors.subtle }} numberOfLines={1}>
          {current?.name ?? empty}
        </Text>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
      </Pressable>
      {open && (
        <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
          {options.length > 8 && (
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={`${label} ara`}
              placeholderTextColor={colors.subtle}
              style={{ height: 44, paddingHorizontal: 14, fontSize: 15, color: colors.ink, borderBottomWidth: 1, borderBottomColor: colors.divider, backgroundColor: colors.card }}
            />
          )}
          <ScrollView nestedScrollEnabled style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled">
            {[{ id: null as string | null, name: empty }, ...list].map((o) => {
              const on = o.id === value;
              return (
                <Pressable
                  key={o.id ?? '_'}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => pick(o.id)}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.divider, backgroundColor: colors.card }}
                >
                  <Text style={{ flex: 1, fontSize: 15, fontWeight: on ? '800' : '500', color: o.id ? colors.ink : colors.muted }}>{o.name}</Text>
                  {on && <Icon name="checkmark" size={18} color={colors.primary} />}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
}
