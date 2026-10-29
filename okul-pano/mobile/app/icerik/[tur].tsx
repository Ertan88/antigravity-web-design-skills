import type { Permission } from '@okulpano/shared/permissions';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Platform, View } from 'react-native';
import { absoluteUrl, api, uploadImage } from '../../src/api.ts';
import { useAuth, useSchoolPath } from '../../src/auth.tsx';
import { useSchoolQuery } from '../../src/data.ts';
import { clock, fullDate, localIso } from '../../src/day.ts';
import { colors } from '../../src/theme.ts';
import { Badge, Button, Card, Choice, confirm, Empty, ErrorNote, Field, Loading, Screen, T, ToggleRow, type IconName } from '../../src/ui.tsx';

type Row = Record<string, unknown> & { id: string; isActive?: boolean };
type FieldDef =
  | { key: string; label: string; type: 'text'; max: number; required?: boolean; multiline?: boolean; placeholder?: string }
  | { key: string; label: string; type: 'date' | 'datetime'; required?: boolean }
  | { key: string; label: string; type: 'choice'; options: { value: string; label: string }[] }
  | { key: string; label: string; type: 'photo'; aspect: [number, number] };

interface Kind {
  title: string;
  newLabel: string;
  icon: IconName;
  permission: Permission;
  fields: FieldDef[];
  defaults?: Record<string, unknown>;
  rowTitle: (r: Row) => string;
  rowSubtitle: (r: Row) => string;
  photoKey?: string;
}

const s = (v: unknown) => (typeof v === 'string' ? v : '');

/** İçerik türleri: panodaki kartların kaynakları (yönetim panelindeki sayfaların cepteki hali) */
const KINDS: Record<string, Kind> = {
  ticker: {
    title: 'Kayan yazı',
    newLabel: 'Yeni satır',
    icon: 'reorder-three-outline',
    permission: 'ticker.manage',
    fields: [{ key: 'text', label: 'Metin', type: 'text', max: 200, required: true, multiline: true, placeholder: 'ör. Kermesimiz cuma günü okul bahçesinde' }],
    rowTitle: (r) => s(r.text),
    rowSubtitle: () => 'Panonun altında kayar',
  },
  achievements: {
    title: 'Başarılar ve ayın öğrencisi',
    newLabel: 'Yeni başarı',
    icon: 'trophy-outline',
    permission: 'highlights.manage',
    defaults: { kind: 'achievement', showCard: true, showSlide: true },
    fields: [
      {
        key: 'kind',
        label: 'Tür',
        type: 'choice',
        options: [
          { value: 'achievement', label: 'Başarı / derece' },
          { value: 'month', label: 'Ayın öğrencisi' },
        ],
      },
      { key: 'photoUrl', label: 'Fotoğraf', type: 'photo', aspect: [1, 1] },
      { key: 'name', label: 'Öğrenci ya da takım', type: 'text', max: 80, required: true },
      { key: 'className', label: 'Sınıf', type: 'text', max: 30, placeholder: 'ör. 10-B' },
      { key: 'title', label: 'Başlık', type: 'text', max: 100, required: true, placeholder: 'ör. İl birinciliği · Satranç' },
      { key: 'description', label: 'Açıklama', type: 'text', max: 200, multiline: true },
    ],
    photoKey: 'photoUrl',
    rowTitle: (r) => `${s(r.name)} · ${s(r.title)}`,
    rowSubtitle: (r) => [r.kind === 'month' ? 'Ayın öğrencisi' : 'Başarı', s(r.className)].filter(Boolean).join(' · '),
  },
  events: {
    title: 'Etkinlik takvimi',
    newLabel: 'Yeni etkinlik',
    icon: 'calendar-number-outline',
    permission: 'highlights.manage',
    fields: [
      { key: 'title', label: 'Etkinlik', type: 'text', max: 100, required: true },
      { key: 'date', label: 'Tarih', type: 'date', required: true },
      { key: 'time', label: 'Saat', type: 'text', max: 20, placeholder: 'ör. 14:00' },
      { key: 'place', label: 'Yer', type: 'text', max: 60, placeholder: 'ör. Konferans salonu' },
      { key: 'organizer', label: 'Düzenleyen', type: 'text', max: 60, placeholder: 'ör. Satranç kulübü' },
    ],
    rowTitle: (r) => s(r.title),
    rowSubtitle: (r) => [r.date ? fullDate(s(r.date)) : null, s(r.time), s(r.place)].filter(Boolean).join(' · '),
  },
  exams: {
    title: 'Sınav sayacı',
    newLabel: 'Yeni sınav',
    icon: 'school-outline',
    permission: 'exams.manage',
    fields: [
      { key: 'title', label: 'Sınav adı', type: 'text', max: 80, required: true, placeholder: 'ör. 1. Dönem 1. Yazılı' },
      { key: 'examAt', label: 'Sınav tarihi', type: 'datetime', required: true },
    ],
    rowTitle: (r) => s(r.title),
    rowSubtitle: (r) => (r.examAt ? `${fullDate(localIso(new Date(s(r.examAt))))} · ${clock(s(r.examAt))}` : ''),
  },
  books: {
    title: 'Haftanın kitabı',
    newLabel: 'Yeni kitap',
    icon: 'book-outline',
    permission: 'highlights.manage',
    fields: [
      { key: 'coverUrl', label: 'Kapak', type: 'photo', aspect: [2, 3] },
      { key: 'title', label: 'Kitap adı', type: 'text', max: 100, required: true },
      { key: 'author', label: 'Yazar', type: 'text', max: 80, required: true },
      { key: 'note', label: 'Kısa not', type: 'text', max: 200, multiline: true },
    ],
    photoKey: 'coverUrl',
    rowTitle: (r) => s(r.title),
    rowSubtitle: (r) => s(r.author),
  },
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** "29.10.2026" ya da "2026-10-29" → ISO tarih */
function parseDate(v: string): string | null {
  const t = v.trim();
  if (ISO.test(t)) return t;
  const m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(t);
  return m ? `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}` : null;
}
const toInput = (iso: string) => (ISO.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : iso);

/**
 * İçerik: kayan yazı, başarılar, etkinlikler, sınavlar, haftanın kitabı. Listeden aç/kapat, düzenle, sil; yeni kayıt
 * ekle. Fotoğraf ve kitap kapağı doğrudan kameradan çekilip panoya gönderilir.
 */
export default function Icerik() {
  const { tur, yeni } = useLocalSearchParams<{ tur: string; yeni?: string }>();
  const kind = KINDS[tur ?? ''];
  const { can } = useAuth();
  const list = useSchoolQuery<Row[]>(tur ?? '', { enabled: Boolean(kind) });
  const path = useSchoolPath(tur ?? '');
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Row | 'new' | null>(yeni ? 'new' : null);
  const refresh = () => qc.invalidateQueries({ predicate: (q) => q.queryKey[1] === tur });
  const toggle = useMutation({ mutationFn: (r: Row) => api(`${path}/${r.id}`, { method: 'PATCH', body: { isActive: !r.isActive } }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (r: Row) => api(`${path}/${r.id}`, { method: 'DELETE' }), onSuccess: refresh });

  if (!kind) {
    return (
      <Screen back title="İçerik">
        <Card>
          <Empty icon="help-circle-outline" title="Bilinmeyen içerik türü" />
        </Card>
      </Screen>
    );
  }
  const writable = can(kind.permission);

  if (editing && writable) {
    return (
      <Editor
        kind={kind}
        row={editing === 'new' ? null : editing}
        path={path}
        onDone={() => {
          setEditing(null);
          void refresh();
        }}
      />
    );
  }

  const rows = list.data ?? [];
  return (
    <Screen
      back
      title={kind.title}
      refreshing={list.isRefetching}
      onRefresh={() => void list.refetch()}
      right={
        writable ? (
          <Button size="sm" icon="add" onPress={() => setEditing('new')}>
            Ekle
          </Button>
        ) : undefined
      }
    >
      <ErrorNote error={list.error ?? toggle.error ?? remove.error} />
      {list.isLoading ? (
        <Loading />
      ) : !rows.length ? (
        <Card>
          <Empty icon={kind.icon} title="Henüz kayıt yok" text={writable ? 'Eklediğiniz kayıtlar panoda hemen görünür.' : undefined} />
        </Card>
      ) : (
        rows.map((r) => {
          const photo = kind.photoKey ? absoluteUrl(s(r[kind.photoKey]) || null) : null;
          return (
            <Card key={r.id} style={{ gap: 8, opacity: r.isActive === false ? 0.6 : 1 }}>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                {photo && (
                  <Image
                    source={{ uri: photo }}
                    style={{ width: 52, height: 52, borderRadius: 10, backgroundColor: '#f1efea' }}
                    accessibilityIgnoresInvertColors
                  />
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T weight="700" lines={2}>
                    {kind.rowTitle(r)}
                  </T>
                  <T size={13} color={colors.muted} lines={2}>
                    {kind.rowSubtitle(r)}
                  </T>
                </View>
                {r.isActive === false && <Badge>Kapalı</Badge>}
              </View>
              {writable && (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button size="sm" variant="secondary" icon="create-outline" onPress={() => setEditing(r)} style={{ flex: 1 }}>
                    Düzenle
                  </Button>
                  <Button size="sm" variant="secondary" loading={toggle.isPending && toggle.variables?.id === r.id} onPress={() => toggle.mutate(r)}>
                    {r.isActive === false ? 'Aç' : 'Kapat'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="trash-outline"
                    onPress={() =>
                      void confirm('Silinsin mi?', `“${kind.rowTitle(r)}” panodan ve listeden kaldırılır.`, 'Sil').then((ok) => ok && remove.mutate(r))
                    }
                  >
                    Sil
                  </Button>
                </View>
              )}
            </Card>
          );
        })
      )}
    </Screen>
  );
}

function Editor({ kind, row, path, onDone }: { kind: Kind; row: Row | null; path: string; onDone: () => void }) {
  const { school } = useAuth();
  const initial = (): Record<string, string> => {
    const v: Record<string, string> = {};
    for (const f of kind.fields) {
      const raw = row?.[f.key] ?? kind.defaults?.[f.key];
      if (f.type === 'datetime') {
        const d = typeof raw === 'string' ? new Date(raw) : null;
        v[f.key] = d ? toInput(localIso(d)) : '';
        v[`${f.key}__time`] = d ? clock(raw as string) : '';
      } else if (f.type === 'date') v[f.key] = typeof raw === 'string' ? toInput(raw) : '';
      else v[f.key] = typeof raw === 'string' ? raw : '';
    }
    return v;
  };
  const [values, setValues] = useState(initial);
  const [active, setActive] = useState(row?.isActive !== false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const set = (k: string, v: string) => setValues((x) => ({ ...x, [k]: v }));

  const pick = async (key: string, aspect: [number, number], camera: boolean) => {
    setError(null);
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted && Platform.OS !== 'web') return setError(camera ? 'Kamera izni verilmedi.' : 'Galeri izni verilmedi.');
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8, allowsEditing: true, aspect };
    const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    const asset = res.assets?.[0];
    if (res.canceled || !asset || !school) return;
    setUploading(key);
    try {
      const { url } = await uploadImage(school.id, asset as never);
      set(key, url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fotoğraf yüklenemedi');
    } finally {
      setUploading(null);
    }
  };

  const save = async () => {
    const body: Record<string, unknown> = { ...kind.defaults, isActive: active };
    for (const f of kind.fields) {
      const v = (values[f.key] ?? '').trim();
      if ('required' in f && f.required && !v) return setError(`${f.label} boş olamaz.`);
      if (f.type === 'date') {
        const d = parseDate(v);
        if (v && !d) return setError(`${f.label} GG.AA.YYYY biçiminde olmalı (ör. 29.10.2026).`);
        body[f.key] = d;
      } else if (f.type === 'datetime') {
        const d = parseDate(v);
        const t = (values[`${f.key}__time`] ?? '').trim() || '09:00';
        if (!d || !/^\d{1,2}[:.]\d{2}$/.test(t)) return setError(`${f.label}: tarihi GG.AA.YYYY, saati SS:DD biçiminde yazın.`);
        const [h, m] = t.split(/[:.]/).map(Number);
        const local = new Date(`${d}T00:00:00`);
        local.setHours(h!, m!, 0, 0);
        body[f.key] = local.toISOString();
      } else body[f.key] = v || null;
    }
    setBusy(true);
    setError(null);
    try {
      await api(row ? `${path}/${row.id}` : path, { method: row ? 'PUT' : 'POST', body: row ? { ...row, ...body, id: undefined } : body });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      back
      title={row ? 'Düzenle' : kind.newLabel}
      footer={
        <>
          {error && (
            <T size={13} weight="600" color={colors.danger} style={{ textAlign: 'center' }}>
              {error}
            </T>
          )}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button variant="secondary" onPress={onDone}>
              Vazgeç
            </Button>
            <Button size="lg" loading={busy} disabled={Boolean(uploading)} onPress={() => void save()} style={{ flex: 1 }}>
              {row ? 'Kaydet' : 'Panoya ekle'}
            </Button>
          </View>
        </>
      }
    >
      {kind.fields.map((f) => {
        if (f.type === 'choice') return <Choice key={f.key} value={values[f.key] ?? ''} onChange={(v) => set(f.key, v)} options={f.options} />;
        if (f.type === 'photo') {
          const url = absoluteUrl(values[f.key] || null);
          return (
            <Card key={f.key} style={{ gap: 10, alignItems: 'center' }}>
              {url ? (
                <Image
                  source={{ uri: url }}
                  style={{ width: 160, height: (160 * f.aspect[1]) / f.aspect[0], borderRadius: 12, backgroundColor: '#f1efea' }}
                  accessibilityLabel={f.label}
                />
              ) : (
                <T color={colors.muted}>{f.label} (isteğe bağlı)</T>
              )}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button size="sm" icon="camera-outline" loading={uploading === f.key} onPress={() => void pick(f.key, f.aspect, true)}>
                  Kamerayla çek
                </Button>
                <Button size="sm" variant="secondary" icon="images-outline" disabled={Boolean(uploading)} onPress={() => void pick(f.key, f.aspect, false)}>
                  Galeriden
                </Button>
              </View>
              {url && (
                <Button size="sm" variant="ghost" onPress={() => set(f.key, '')}>
                  Fotoğrafı kaldır
                </Button>
              )}
            </Card>
          );
        }
        if (f.type === 'date')
          return (
            <Field
              key={f.key}
              label={f.label}
              value={values[f.key]}
              onChangeText={(v) => set(f.key, v)}
              placeholder="29.10.2026"
              keyboardType="numbers-and-punctuation"
              maxLength={10}
            />
          );
        if (f.type === 'datetime')
          return (
            <View key={f.key} style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 3 }}>
                <Field
                  label={f.label}
                  value={values[f.key]}
                  onChangeText={(v) => set(f.key, v)}
                  placeholder="29.10.2026"
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                />
              </View>
              <View style={{ flex: 2 }}>
                <Field
                  label="Saat"
                  value={values[`${f.key}__time`]}
                  onChangeText={(v) => set(`${f.key}__time`, v)}
                  placeholder="09:00"
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                />
              </View>
            </View>
          );
        if (f.type !== 'text') return null;
        return (
          <Field
            key={f.key}
            label={f.label}
            value={values[f.key]}
            onChangeText={(v) => set(f.key, v)}
            maxLength={f.max}
            multiline={f.multiline}
            placeholder={f.placeholder}
            style={f.multiline ? { minHeight: 80, textAlignVertical: 'top' } : undefined}
          />
        );
      })}
      <ToggleRow label="Panoda göster" value={active} onChange={setActive} />
    </Screen>
  );
}
