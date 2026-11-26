import { compareClassNames, errorText, parseClassName, trCompare } from '@okulpano/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { api } from './api.ts';
import { useAuth, useSchoolPath } from './auth.tsx';
import { useSchoolQuery } from './data.ts';
import { DatePickSheet } from './datePick.tsx';
import { Sheet, SheetScroll } from './sheet.tsx';
import { Text } from './text.tsx';
import { colors } from './theme.ts';
import { Badge, Button, Card, Chip, Empty, Field, Icon, Loading, T } from './ui.tsx';

/*
 * İşletmeler ekranının idare sekmeleri (webdeki gibi, 1A): Koordinatörler ve Ayarlar. Alanlar ve meslek öğretmenlerinin
 * branşları uzun bir liste olduğu için webde düzenlenir. Açılır seçimler alt sayfa yerine yerinde açılır (alt sayfanın
 * içinde de kullanılabilsin).
 */

/** Yerinde açılan seçim: "Etiket: değer ▾"; dokununca seçenekler altta listelenir */
export function InlineSelect<V extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: V;
  options: { value: V; label: string; count?: number }[];
  onChange: (v: V) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value) ?? options[0];
  return (
    <View style={{ gap: 6 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${label}: ${current?.label ?? ''}`}
        onPress={() => setOpen(!open)}
        style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.card }}
      >
        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.muted }}>{label}:</Text>
        <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '700', color: colors.ink }} numberOfLines={1}>
          {current?.label}
        </Text>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.faint} />
      </Pressable>
      {open && (
        <View style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, overflow: 'hidden' }}>
          {options.map((o, i) => {
            const on = o.value === value;
            return (
              <Pressable
                key={o.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderTopColor: colors.divider }}
              >
                <Text style={{ flex: 1, fontSize: 14, fontWeight: on ? '800' : '600', color: on ? colors.primary : colors.ink }} numberOfLines={1}>
                  {o.label}
                </Text>
                {o.count != null && <Text style={{ fontSize: 12.5, fontWeight: '700', color: colors.faint }}>{o.count}</Text>}
                {on && <Icon name="checkmark" size={16} color={colors.primary} />}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

/** Arama kutusu (etiketsiz) */
export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <View style={{ minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.card }}>
      <Icon name="search" size={17} color={colors.faint} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        accessibilityLabel={placeholder}
        style={{ flex: 1, fontSize: 14, color: colors.ink, paddingVertical: 8 }}
      />
    </View>
  );
}

type CoordinatorTeacher = { id: string; fullName: string; branchName: string | null; designated: boolean };

const groupByArea = (list: CoordinatorTeacher[]) =>
  [
    ...list.reduce((m, t) => {
      const area = t.branchName || 'Alan girilmemiş';
      return m.set(area, [...(m.get(area) ?? []), t]);
    }, new Map<string, CoordinatorTeacher[]>()),
  ]
    .map(([area, ts]) => [area, ts.sort((a, b) => trCompare(a.fullName, b.fullName))] as const)
    .sort((a, b) => trCompare(a[0], b[0]));

/** Koordinatörler sekmesi: alan alan seçilen öğretmenler ve işletme sayıları; "Değiştir" seçim sayfasını açar */
export function CoordinatorsTab({ businessCounts, editing, onCloseEdit }: { businessCounts: Map<string, number>; editing: boolean; onCloseEdit: () => void }) {
  const q = useSchoolQuery<{ teachers: CoordinatorTeacher[] }>('internship/coordinators');
  const list = q.data?.teachers ?? [];
  const groups = groupByArea(list.filter((t) => t.designated));
  return (
    <>
      <T size={13} color={colors.muted}>
        Yalnızca seçilen meslek öğretmenleri mesleki eğitimi görür; kendi işletmelerini ve öğrencilerini girebilir, işletmelere koordinatör olarak atanabilir.
      </T>
      {!q.data ? (
        <Loading />
      ) : !list.length ? (
        <Empty icon="people-outline" title="Meslek öğretmeni yok" text="Öğretmenlerin branşları web panelindeki İşletmeler › Ayarlar sekmesinden girilir." />
      ) : !groups.length ? (
        <Empty icon="people-outline" title="Koordinatör seçilmedi" text="Aşağıdaki “Değiştir” ile meslek öğretmenlerini seçin." />
      ) : (
        groups.map(([area, ts]) => (
          <View key={area} style={{ gap: 6 }}>
            <Text style={{ fontSize: 11.5, fontWeight: '800', letterSpacing: 0.4, color: colors.muted }}>{area.toLocaleUpperCase('tr-TR')}</Text>
            <Card style={{ paddingVertical: 4, gap: 0 }}>
              {ts.map((t, i) => {
                const n = businessCounts.get(t.id) ?? 0;
                return (
                  <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderTopColor: colors.divider }}>
                    <Text style={{ flex: 1, fontSize: 14.5, fontWeight: '700', color: colors.ink }} numberOfLines={1}>
                      {t.fullName}
                    </Text>
                    <Text style={{ fontSize: 12.5, fontWeight: '600', color: colors.faint }}>{n ? `${n} işletme` : 'İşletme yok'}</Text>
                  </View>
                );
              })}
            </Card>
          </View>
        ))
      )}
      {editing && q.data && <CoordinatorsSheet teachers={list} businessCounts={businessCounts} onClose={onCloseEdit} />}
    </>
  );
}

/** Koordinatör seçimi (webdeki pencerenin aynısı): arama, alana göre gruplu onay kutuları, birlikte kaydedilir */
function CoordinatorsSheet({ teachers: list, businessCounts, onClose }: { teachers: CoordinatorTeacher[]; businessCounts: Map<string, number>; onClose: () => void }) {
  const { school } = useAuth();
  const path = useSchoolPath('internship/coordinators');
  const qc = useQueryClient();
  const [picked, setPicked] = useState(() => new Set(list.filter((t) => t.designated).map((t) => t.id)));
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needle = q.trim().toLocaleLowerCase('tr-TR');
  const shown = groupByArea(list)
    .map(([area, ts]) => [area, ts, needle ? ts.filter((t) => t.fullName.toLocaleLowerCase('tr-TR').includes(needle) || area.toLocaleLowerCase('tr-TR').includes(needle)) : ts] as const)
    .filter(([, , vis]) => vis.length);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(path, { method: 'PUT', body: { teacherIds: [...picked] } });
      await qc.invalidateQueries({ predicate: (x) => x.queryKey[0] === school?.id && String(x.queryKey[1] ?? '').startsWith('internship') });
      onClose();
    } catch (e) {
      setError(errorText(e, 'Kaydedilemedi'));
    } finally {
      setBusy(false);
    }
  };
  const dropsBusiness = list.some((t) => t.designated && !picked.has(t.id) && (businessCounts.get(t.id) ?? 0) > 0);
  return (
    <Sheet open onClose={onClose}>
      <Text style={{ fontSize: 17, fontWeight: '800', color: colors.ink, marginBottom: 8 }}>Koordinatör öğretmenler</Text>
      <SearchBox value={q} onChange={setQ} placeholder="Öğretmen ya da alan ara" />
      <SheetScroll style={{ maxHeight: 380, marginTop: 10 }} contentContainerStyle={{ gap: 10 }}>
        {!shown.length ? (
          <T size={13.5} color={colors.muted}>
            Aramaya uyan öğretmen yok.
          </T>
        ) : (
          shown.map(([area, ts, vis]) => (
            <View key={area} style={{ gap: 2 }}>
              <Text style={{ fontSize: 11.5, fontWeight: '800', letterSpacing: 0.4, color: colors.muted }}>
                {area.toLocaleUpperCase('tr-TR')} · {ts.filter((t) => picked.has(t.id)).length}/{ts.length}
              </Text>
              {vis.map((t) => {
                const on = picked.has(t.id);
                const n = businessCounts.get(t.id) ?? 0;
                return (
                  <Pressable
                    key={t.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    onPress={() =>
                      setPicked((p) => {
                        const next = new Set(p);
                        if (on) next.delete(t.id);
                        else next.add(t.id);
                        return next;
                      })
                    }
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 }}
                  >
                    <View style={{ width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: on ? colors.primary : colors.borderStrong, backgroundColor: on ? colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {on && <Icon name="checkmark" size={15} color={colors.onPrimary} strokeWidth={3} />}
                    </View>
                    <Text style={{ flex: 1, fontSize: 14.5, fontWeight: '600', color: colors.ink }} numberOfLines={1}>
                      {t.fullName}
                    </Text>
                    {n > 0 && <Badge tone="primary">{`${n} işletme`}</Badge>}
                  </Pressable>
                );
              })}
            </View>
          ))
        )}
      </SheetScroll>
      {dropsBusiness && (
        <T size={12.5} weight="600" color={colors.warning} style={{ marginTop: 8 }}>
          Çıkardığınız öğretmenin işletmeleri ona atanmış olarak kalır; koordinatörü web panelindeki işletme düzenlemesinden değiştirebilirsiniz.
        </T>
      )}
      {error && (
        <T size={13} color={colors.danger} style={{ marginTop: 8 }}>
          {error}
        </T>
      )}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <Button variant="secondary" onPress={onClose} style={{ flex: 1 }}>
          Vazgeç
        </Button>
        <Button loading={busy} onPress={() => void save()} style={{ flex: 1 }}>
          Kaydet
        </Button>
      </View>
    </Sheet>
  );
}

interface InternshipSettings {
  internshipManagerUserId: string | null;
  internshipProgramName: string;
  internshipTechnical: { classIds: string[]; start: string | null; end: string | null };
  canPickManager: boolean;
}

const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const trDay = (iso: string | null) => (iso ? new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`)) : 'Seçin');

/**
 * Ayarlar sekmesi: koordinatör müdür yardımcısı, program adı, teknik program stajı (yalnızca ATP sınıfları ve tarihler).
 */
export function SettingsTab() {
  const { school } = useAuth();
  const path = useSchoolPath('internship');
  const qc = useQueryClient();
  const q = useSchoolQuery<InternshipSettings>('internship/settings');
  const people = useSchoolQuery<{ userId: string; fullName: string }[]>('internship/manager-candidates');
  const classes = useSchoolQuery<{ id: string; name: string }[]>('classes');
  const [v, setV] = useState<Omit<InternshipSettings, 'canPickManager'> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [picking, setPicking] = useState<'start' | 'end' | null>(null);
  useEffect(() => {
    if (q.data && !v) setV({ internshipManagerUserId: q.data.internshipManagerUserId, internshipProgramName: q.data.internshipProgramName, internshipTechnical: q.data.internshipTechnical });
  }, [q.data, v]);
  const tech = v?.internshipTechnical;
  const badRange = Boolean(tech?.start && tech?.end && tech.start > tech.end);
  // Teknik program stajı ATP (Anadolu Teknik Programı) sınıfları içindir; daha önce seçilmiş başka sınıf kaybolmasın
  const list = [...(classes.data ?? [])].filter((c) => parseClassName(c.name)?.program === 'ATP' || tech?.classIds.includes(c.id)).sort((a, b) => compareClassNames(a.name, b.name));

  const save = async () => {
    if (!v || badRange) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api(`${path}/settings`, {
        method: 'PUT',
        body: {
          ...(q.data?.canPickManager ? { internshipManagerUserId: v.internshipManagerUserId } : {}),
          internshipProgramName: v.internshipProgramName,
          internshipTechnical: v.internshipTechnical,
        },
      });
      await qc.invalidateQueries({ predicate: (x) => x.queryKey[0] === school?.id && String(x.queryKey[1] ?? '').startsWith('internship') });
      setNotice('Kaydedildi.');
    } catch (e) {
      setError(errorText(e, 'Kaydedilemedi'));
    } finally {
      setBusy(false);
    }
  };
  if (!v || !tech) return q.error ? <T color={colors.danger}>{errorText(q.error, 'Ayarlar açılamadı')}</T> : <Loading />;
  return (
    <>
      {q.data?.canPickManager ? (
        <InlineSelect
          label="Koordinatör müdür yardımcısı"
          value={v.internshipManagerUserId ?? ''}
          options={[{ value: '', label: 'Seçilmedi' }, ...(people.data ?? []).map((p) => ({ value: p.userId, label: p.fullName }))]}
          onChange={(id) => setV({ ...v, internshipManagerUserId: id || null })}
        />
      ) : null}
      <T size={12} color={colors.faint}>
        Koordinatör müdür yardımcısı bütün işletmeleri ve öğrencileri görür; devamsızlık ve rapor bildirimlerini alır.
      </T>
      <Field label="Program adı" value={v.internshipProgramName} onChangeText={(t) => setV({ ...v, internshipProgramName: t })} maxLength={80} help="Günlük rehberlik formunda okul adının yanına yazılır." />
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 14, fontWeight: '800', color: colors.ink }}>Teknik program stajı</Text>
        <T size={12.5} color={colors.muted}>
          Anadolu Teknik Programı (ATP) sınıfları listelenir. Seçilen sınıflar staj tarihleri arasında her iş günü işletmededir.
        </T>
        {!list.length ? (
          <T size={13} color={colors.muted}>
            Okulda ATP sınıfı yok. Sınıf adları e-Okul'daki gibi "ATP 12-A" biçiminde olmalıdır.
          </T>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {list.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                selected={tech.classIds.includes(c.id)}
                onPress={() => setV({ ...v, internshipTechnical: { ...tech, classIds: tech.classIds.includes(c.id) ? tech.classIds.filter((x) => x !== c.id) : [...tech.classIds, c.id] } })}
              />
            ))}
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['start', 'end'] as const).map((k) => (
            <Pressable
              key={k}
              accessibilityRole="button"
              onPress={() => setPicking(k)}
              style={{ flex: 1, gap: 2, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.card }}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.muted }}>{k === 'start' ? 'Staj başlangıcı' : 'Staj bitişi'}</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: tech[k] ? colors.ink : colors.faint }}>{trDay(tech[k])}</Text>
            </Pressable>
          ))}
        </View>
        {badRange && (
          <T size={12.5} weight="700" color={colors.warning}>
            Bitiş tarihi başlangıçtan önce olamaz.
          </T>
        )}
      </View>
      <Card tone="warning">
        <T size={12.5} color={colors.muted}>
          Alanlar ve meslek öğretmenlerinin branşları uzun bir liste olduğu için web panelindeki İşletmeler › Ayarlar sekmesinden düzenlenir.
        </T>
      </Card>
      {error && (
        <T size={13} color={colors.danger}>
          {error}
        </T>
      )}
      {notice && (
        <T size={13} weight="700" color={colors.success}>
          {notice}
        </T>
      )}
      <Button loading={busy} disabled={badRange} onPress={() => void save()}>
        Kaydet
      </Button>
      {picking && (
        <DatePickSheet
          open
          title={picking === 'start' ? 'Staj başlangıcı' : 'Staj bitişi'}
          value={tech[picking] ? new Date(`${tech[picking]}T12:00:00`) : null}
          onPick={(d) => {
            setV({ ...v, internshipTechnical: { ...tech, [picking]: isoOf(d) } });
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      )}
    </>
  );
}
