import { errorText } from '@okulpano/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { api } from '../src/api.ts';
import { useAuth, useSchoolPath } from '../src/auth.tsx';
import { useInternshipAccess, useSchoolQuery } from '../src/data.ts';
import { Sheet } from '../src/sheet.tsx';
import { Text } from '../src/text.tsx';
import { colors } from '../src/theme.ts';
import { Icon, Button, Card, confirm, Empty, ErrorNote, Field, Loading, Screen, T } from '../src/ui.tsx';

/*
 * İşletmelerim: öğretmenin eklediği ya da koordinatörü olduğu işletmeler (idarede bütün işletmeler). İşletmeye dokununca
 * bilgileri açılır: yetkili, usta öğretici, telefon (dokununca arar), adres (dokununca harita). Bilgiler buradan
 * düzenlenir; işletmeyi idare siler. Devam işaretleri "İşletmede devam" ekranından girilir.
 */

interface Business {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  contactName: string | null;
  trainerName: string | null;
  email: string | null;
  notes: string | null;
  areaName: string | null;
  coordinatorName: string | null;
  students: number;
  canEdit: boolean;
  canManage: boolean;
}
type InfoKey = 'name' | 'contactName' | 'trainerName' | 'phone' | 'email' | 'address' | 'notes';

const INFO_FIELDS: { key: InfoKey; label: string; multiline?: boolean; keyboard?: 'phone-pad' | 'email-address' }[] = [
  { key: 'name', label: 'İşletme adı' },
  { key: 'contactName', label: 'İşletme yetkilisi' },
  { key: 'trainerName', label: 'Usta öğretici / eğitici personel' },
  { key: 'phone', label: 'Telefon', keyboard: 'phone-pad' },
  { key: 'email', label: 'E-posta', keyboard: 'email-address' },
  { key: 'address', label: 'Adres', multiline: true },
  { key: 'notes', label: 'Notlar', multiline: true },
];

export default function Isletmelerim() {
  const { school } = useAuth();
  const access = useInternshipAccess();
  const list = useSchoolQuery<Business[]>('internship/businesses');
  const path = useSchoolPath('internship/businesses');
  const qc = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<Business | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canAdd = Boolean(access.data?.manage || access.data?.teacher);
  const refresh = () => void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === school?.id && String(q.queryKey[1] ?? '').startsWith('internship') });

  const remove = async (b: Business) => {
    if (!(await confirm(`${b.name} silinsin mi?`, 'Öğrencilerin işletme bağı kalkar; geçmiş devam işaretleri silinmez.', 'Sil'))) return;
    setError(null);
    try {
      await api(`${path}/${b.id}`, { method: 'DELETE' });
      setOpen(null);
      refresh();
    } catch (e) {
      setError(errorText(e, 'Silinemedi'));
    }
  };

  return (
    <Screen
      title="İşletmelerim"
      subtitle={access.data?.all ? 'Okulun bütün işletmeleri' : 'Eklediğiniz ve koordinatörü olduğunuz işletmeler'}
      back
      refreshing={list.isRefetching}
      onRefresh={() => void list.refetch()}
      footer={
        canAdd ? (
          <Button icon="add" onPress={() => setEditing('new')}>
            İşletme ekle
          </Button>
        ) : undefined
      }
    >
      <ErrorNote error={list.error} />
      {error && (
        <T size={13} color={colors.danger}>
          {error}
        </T>
      )}
      {!list.data ? (
        <Loading />
      ) : !list.data.length ? (
        <Empty icon="business-outline" title="İşletme yok" text="Eklediğiniz ya da koordinatörü olduğunuz işletme yok. Yeni işletmeyi aşağıdan ekleyebilirsiniz." />
      ) : (
        list.data.map((b) => {
          const expanded = open === b.id;
          return (
            <Card key={b.id} style={{ gap: 8 }}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setOpen(expanded ? null : b.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink }} numberOfLines={1}>
                    {b.name}
                  </Text>
                  <T size={12.5} color={colors.faint}>
                    {b.students} öğrenci · {b.coordinatorName ? `Koordinatör: ${b.coordinatorName}` : 'Koordinatör seçilmedi'}
                  </T>
                </View>
                <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.faint} />
              </Pressable>
              {expanded && (
                <>
                  <InfoRows b={b} />
                  {(b.canEdit || b.canManage) && (
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                      {b.canEdit && (
                        <Button variant="secondary" size="sm" icon="create-outline" onPress={() => setEditing(b)}>
                          Düzenle
                        </Button>
                      )}
                      {b.canManage && (
                        <Button variant="secondary" size="sm" icon="trash-outline" onPress={() => void remove(b)}>
                          Sil
                        </Button>
                      )}
                    </View>
                  )}
                </>
              )}
            </Card>
          );
        })
      )}
      {editing && (
        <InfoSheet
          business={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </Screen>
  );
}

/** İşletme bilgileri: telefon dokununca arar, e-posta yazar, adres haritada açılır */
function InfoRows({ b }: { b: Business }) {
  const rows: [string, string | null, 'tel' | 'mail' | 'map' | null][] = [
    ['Alan', b.areaName, null],
    ['İşletme yetkilisi', b.contactName, null],
    ['Usta öğretici', b.trainerName, null],
    ['Telefon', b.phone, 'tel'],
    ['E-posta', b.email, 'mail'],
    ['Adres', b.address, 'map'],
    ['Notlar', b.notes, null],
  ];
  const open = (kind: 'tel' | 'mail' | 'map', v: string) => {
    if (kind === 'tel') void Linking.openURL(`tel:${v.replace(/[^\d+]/g, '')}`);
    else if (kind === 'mail') void Linking.openURL(`mailto:${v}`);
    else void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${b.name} ${v}`)}`);
  };
  return (
    <View style={{ gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.divider }}>
      {rows.map(([label, v, kind]) => (
        <Pressable key={label} disabled={!v || !kind} onPress={() => v && kind && open(kind, v)} style={{ flexDirection: 'row', gap: 10 }}>
          <Text style={{ width: 112, fontSize: 12.5, fontWeight: '600', color: colors.faint }}>{label}</Text>
          <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '600', color: !v ? colors.subtle : kind ? colors.info : colors.ink }}>{v ?? 'Girilmemiş'}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Ekle ya da düzenle: öğretmenin eklediği işletmenin alanı branşından gelir, koordinatörü kendisi olur */
function InfoSheet({ business, onClose, onSaved }: { business: Business | null; onClose: () => void; onSaved: () => void }) {
  const path = useSchoolPath('internship/businesses');
  const [form, setForm] = useState<Record<InfoKey, string>>(() => Object.fromEntries(INFO_FIELDS.map((f) => [f.key, business?.[f.key] ?? ''])) as Record<InfoKey, string>);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (!form.name.trim()) return setError('İşletme adı gerekli.');
    setBusy(true);
    setError(null);
    try {
      const body = Object.fromEntries(INFO_FIELDS.map((f) => [f.key, form[f.key].trim() || null]));
      if (business) await api(`${path}/${business.id}/info`, { method: 'PATCH', body });
      else await api(path, { method: 'POST', body });
      onSaved();
    } catch (e) {
      setError(errorText(e, 'Kaydedilemedi'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose}>
      <Text style={{ fontSize: 17, fontWeight: '800', color: colors.ink, marginBottom: 4 }}>{business ? business.name : 'İşletme ekle'}</Text>
      {!business && (
        <T size={12.5} color={colors.faint} style={{ marginBottom: 8 }}>
          Alanı öğretmen kadrosundaki branşınızdan gelir; koordinatörü siz olursunuz. Öğrencileri yönetim panelinden seçebilirsiniz.
        </T>
      )}
      <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 440 }} contentContainerStyle={{ gap: 10 }} keyboardShouldPersistTaps="handled">
        {INFO_FIELDS.map((f) => (
          <Field
            key={f.key}
            label={f.label}
            value={form[f.key]}
            onChangeText={(v) => setForm((x) => ({ ...x, [f.key]: v }))}
            multiline={f.multiline}
            keyboardType={f.keyboard}
            autoCapitalize={f.keyboard === 'email-address' ? 'none' : 'sentences'}
          />
        ))}
      </ScrollView>
      {error && (
        <T size={13} color={colors.danger} style={{ marginTop: 8 }}>
          {error}
        </T>
      )}
      <View style={{ marginTop: 12 }}>
        <Button loading={busy} onPress={() => void save()}>
          Kaydet
        </Button>
      </View>
    </Sheet>
  );
}
