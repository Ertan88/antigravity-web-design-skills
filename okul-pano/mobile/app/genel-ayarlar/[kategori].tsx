import { errorText } from '@okulpano/shared';
import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { api } from '../../src/api.ts';
import { useAuth, useSchoolPath } from '../../src/auth.tsx';
import { useSchoolInfo } from '../../src/data.ts';
import { BackupCard } from '../../src/backup.tsx';
import { SettingsTab } from '../../src/internshipManage.tsx';
import { SETTINGS_CATEGORIES, type SettingsCategory } from '../../src/settingsCategories.ts';
import { Text } from '../../src/text.tsx';
import { colors } from '../../src/theme.ts';
import { Badge, Button, Card, confirm, Field, ListRow, Loading, Screen, T, ToggleRow } from '../../src/ui.tsx';

/*
 * Genel ayarlar › kategori (mobil, A). Telefona uygun ayarlar burada değişir; altta tek "Kaydet". Uzun listeler (görev
 * dağılımı, sorun sorumluları, görev → rol, alanlar, KVKK metni, RSS) "Webde" etiketiyle yalnızca anılır.
 * Kaydetmeden çıkılırsa sorulur.
 */

type Settings = Record<string, unknown> & {
  requireApproval?: boolean;
  internshipEnabled?: boolean;
  hasTransport?: boolean;
  followMebCalendar?: boolean;
  halfDayEnd?: string;
  lunchThresholdMin?: number;
  conductRetention?: 'year' | 'keep';
  conductAlert?: { enabled: boolean; days: number; minus: number };
  specialDays?: { enabled: boolean } & Record<string, unknown>;
  tickerWeatherAlerts?: boolean;
  tickerHistory?: boolean;
  tickerQuote?: boolean;
};
type Info = { name: string; institutionCode?: string | null; city?: string | null; settings: Settings };
type Draft = { name: string; institutionCode: string; city: string; settings: Settings };

/** Kategorinin değiştirdiği ayar anahtarları (yalnızca bunlar gönderilir) */
const KEYS: Partial<Record<SettingsCategory, string[]>> = {
  moduller: ['requireApproval', 'internshipEnabled', 'hasTransport'],
  takvim: ['followMebCalendar', 'halfDayEnd', 'lunchThresholdMin'],
  ogrenci: ['conductRetention', 'conductAlert'],
  pano: ['specialDays', 'tickerWeatherAlerts', 'tickerHistory', 'tickerQuote'],
};

const toDraft = (i: Info): Draft => ({ name: i.name, institutionCode: i.institutionCode ?? '', city: i.city ?? '', settings: i.settings ?? {} });

/** "Webde" satırı: telefonda düzenlenmeyen ayar */
function WebRow({ title, text, last }: { title: string; text: string; last?: boolean }) {
  return <ListRow title={title} subtitle={text} right={<Badge tone="warning">Webde</Badge>} last={last} />;
}

export default function AyarKategorisi() {
  const { kategori } = useLocalSearchParams<{ kategori: SettingsCategory }>();
  const cat = SETTINGS_CATEGORIES.find((c) => c.key === kategori);
  const { school } = useAuth();
  const path = useSchoolPath();
  const qc = useQueryClient();
  const info = useSchoolInfo();
  const data = info.data as unknown as Info | undefined;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (data && !draft) setDraft(toDraft(data));
  }, [data, draft]);
  const base = data ? toDraft(data) : null;
  const dirty = Boolean(draft && base && JSON.stringify(draft) !== JSON.stringify(base));

  // Kaydetmeden çıkılırsa sorulur (geri düğmesi, telefonun geri tuşu, kaydırma)
  type NavAction = { type: string; payload?: object };
  type BeforeRemove = { preventDefault: () => void; data: { action: NavAction } };
  const navigation = useNavigation() as unknown as { addListener: (type: 'beforeRemove', cb: (e: BeforeRemove) => void) => () => void; dispatch: (action: NavAction) => void };
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (!dirtyRef.current) return;
        e.preventDefault();
        void confirm('Değişiklikler kaydedilmedi', 'Kaydetmeden çıkarsanız yaptığınız değişiklikler kaybolur.', 'Çık').then((ok) => {
          if (!ok) return;
          dirtyRef.current = false;
          navigation.dispatch(e.data.action);
        });
      }),
    [navigation],
  );

  if (!cat) return <Screen back title="Genel ayarlar"><T>Kategori bulunamadı.</T></Screen>;
  const s = draft?.settings ?? {};
  const set = (patch: Partial<Settings>) => draft && setDraft({ ...draft, settings: { ...draft.settings, ...patch } });

  const save = async () => {
    if (!draft) return;
    if (kategori === 'takvim' && draft.settings.halfDayEnd && !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.settings.halfDayEnd)) return setError('Arife saati 13:00 biçiminde olmalı.');
    setBusy(true);
    setError(null);
    try {
      const body =
        kategori === 'okul'
          ? { name: draft.name.trim(), institutionCode: draft.institutionCode, city: draft.city.trim() || null }
          : { settings: Object.fromEntries((KEYS[kategori] ?? []).map((k) => [k, draft.settings[k]])) };
      await api(path, { method: 'PATCH', body });
      await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === school?.id });
      dirtyRef.current = false;
      setDraft(null);
      router.back();
    } catch (e) {
      setError(errorText(e, 'Kaydedilemedi'));
    } finally {
      setBusy(false);
    }
  };

  const editable = kategori !== 'gorev' && kategori !== 'mesleki';
  const alert = s.conductAlert ?? { enabled: true, days: 7, minus: 3 };
  const num = (v: string, min: number, max: number, fallback: number) => {
    const n = Number(v.replace(/\D/g, ''));
    return Number.isFinite(n) && n >= min ? Math.min(n, max) : fallback;
  };

  return (
    <Screen
      back
      title={cat.title}
      subtitle="Genel ayarlar"
      footer={
        editable ? (
          <Button loading={busy} disabled={!dirty} onPress={() => void save()}>
            Kaydet
          </Button>
        ) : undefined
      }
    >
      {!draft ? (
        <Loading />
      ) : kategori === 'okul' ? (
        <>
          <Field label="Okul adı" value={draft.name} onChangeText={(t) => setDraft({ ...draft, name: t })} maxLength={120} />
          <Field label="Kurum kodu" value={draft.institutionCode} onChangeText={(t) => setDraft({ ...draft, institutionCode: t.replace(/\D/g, '').slice(0, 6) })} keyboardType="number-pad" help="MEBBİS'teki 6 haneli kurum kodu." />
          <Field label="Panoda görünen yer adı" value={draft.city} onChangeText={(t) => setDraft({ ...draft, city: t })} maxLength={80} help="Hava durumunun konumu webde haritadan seçilir." />
          <Card style={{ paddingVertical: 4, gap: 0 }}>
            <WebRow title="Logo, okul türü, il ve ilçe" text="Resmî belgelerde ve panoda kullanılır" />
            <WebRow title="Hava durumu konumu" text="Şehir araması ve koordinatlar" />
            <WebRow title="KVKK aydınlatma metni" text="Okulun kişisel veri metni" last />
          </Card>
          <BackupCard />
        </>
      ) : kategori === 'gorev' ? (
        <>
          <Card style={{ paddingVertical: 4, gap: 0 }}>
            <WebRow title="Görev dağılımı" text="Hangi işin bildirimi ve onayı hangi yöneticiye gider" />
            <WebRow title="Okul sorunları sorumluları" text="Her sorun kategorisinde bildirimi alan idareci" />
            <WebRow title="Görev → hesap rolü" text="Hesap açılırken göreve göre önerilen rol" last />
          </Card>
          <T size={12.5} color={colors.muted}>
            Bu ayarlar uzun tablolar olduğu için web panelindeki Genel Ayarlar › Görev dağılımı sekmesinden düzenlenir.
          </T>
        </>
      ) : kategori === 'moduller' ? (
        <Card style={{ gap: 14 }}>
          <ToggleRow label="Duyurular onaydan sonra yayınlansın" description="Öğretmenin duyurusu idare onaylayınca panoya çıkar." value={Boolean(s.requireApproval)} onChange={(v) => set({ requireApproval: v })} />
          <ToggleRow label="İşletmelerde mesleki eğitim" description="İşletmeler, devam ve formlar." value={Boolean(s.internshipEnabled)} onChange={(v) => set({ internshipEnabled: v })} />
          <ToggleRow label="Taşımalı eğitim" description="Servis ve öğle yemeği görevlileri; panoda nöbet kartında görünür." value={Boolean(s.hasTransport)} onChange={(v) => set({ hasTransport: v })} />
        </Card>
      ) : kategori === 'takvim' ? (
        <>
          <Card style={{ gap: 14 }}>
            <ToggleRow label="MEB takvimindeki tatilleri uygula" description="Ara tatiller, yarıyıl ve yaz tatili okulda tatil sayılır." value={s.followMebCalendar !== false} onChange={(v) => set({ followMebCalendar: v })} />
          </Card>
          <Field label="Arifede son zil" value={s.halfDayEnd ?? '13:00'} onChangeText={(t) => set({ halfDayEnd: t })} maxLength={5} placeholder="13:00" help="Kamuda arife 13:00'ten itibaren tatildir." />
          <Field label="Öğle arası eşiği (dakika)" value={String(s.lunchThresholdMin ?? 30)} onChangeText={(t) => set({ lunchThresholdMin: num(t, 10, 180, s.lunchThresholdMin ?? 30) })} keyboardType="number-pad" help="Günün en uzun arası bundan uzunsa panoda 'Öğle Arası' yazar." />
          <Card style={{ paddingVertical: 4, gap: 0 }}>
            <ListRow title="Eğitim düzeni" subtitle="Tam gün ya da ikili eğitim, Zil saatleri ekranında" onPress={() => router.push('/zil-saatleri')} last />
          </Card>
        </>
      ) : kategori === 'ogrenci' ? (
        <>
          <Card style={{ gap: 14 }}>
            <ToggleRow
              label="Öğretim yılı sonunda kayıtları sil"
              description="1 Eylül'de önceki yılın gözlem kayıtları ve rehberlik uyarıları silinir (KVKK). Ayın öğrencisi seçimleri kalır."
              value={(s.conductRetention ?? 'year') === 'year'}
              onChange={(v) => set({ conductRetention: v ? 'year' : 'keep' })}
            />
            <ToggleRow label="Rehberlik uyarısı" description="Kısa sürede çok eksi alan öğrenci için rehber öğretmene uyarı." value={alert.enabled} onChange={(v) => set({ conductAlert: { ...alert, enabled: v } })} />
          </Card>
          {alert.enabled && (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Field label="Gün içinde" value={String(alert.days)} onChangeText={(t) => set({ conductAlert: { ...alert, days: num(t, 1, 60, alert.days) } })} keyboardType="number-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="En az eksi" value={String(alert.minus)} onChangeText={(t) => set({ conductAlert: { ...alert, minus: num(t, 1, 20, alert.minus) } })} keyboardType="number-pad" />
              </View>
            </View>
          )}
        </>
      ) : kategori === 'mesleki' ? (
        <SettingsTab />
      ) : kategori === 'pano' ? (
        <>
          <Card style={{ gap: 14 }}>
            <ToggleRow
              label="Özel gün mesajları"
              description="Uygulamada özel günlerde şerit ve mesaj penceresi."
              value={s.specialDays?.enabled !== false}
              onChange={(v) => set({ specialDays: { ...(s.specialDays ?? { signature: '', days: {} }), enabled: v } })}
            />
            <ToggleRow label="Hava durumu uyarıları" description="Kayan yazıda: yoğun kar, aşırı sıcak ya da soğuk, fırtına." value={s.tickerWeatherAlerts !== false} onChange={(v) => set({ tickerWeatherAlerts: v })} />
            <ToggleRow label="Bugün tarihte" description="Kayan yazıda günün tarihî olayı." value={Boolean(s.tickerHistory)} onChange={(v) => set({ tickerHistory: v })} />
            <ToggleRow label="Günün sözü" description="Kayan yazıda her gün bir söz." value={Boolean(s.tickerQuote)} onChange={(v) => set({ tickerQuote: v })} />
          </Card>
          <Card style={{ paddingVertical: 4, gap: 0 }}>
            <WebRow title="Özel gün metinleri ve RSS kaynakları" text="Mesaj, görsel ve haber bağlantıları" />
            <WebRow title="Pano görünümü" text="Renkler, uyku saatleri, slayt süreleri (Panolar)" last />
          </Card>
        </>
      ) : null}
      {error && (
        <Text style={{ fontSize: 13, color: colors.danger }}>{error}</Text>
      )}
    </Screen>
  );
}
