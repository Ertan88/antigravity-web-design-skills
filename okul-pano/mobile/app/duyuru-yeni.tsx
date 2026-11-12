import { errorText } from '@okulpano/shared';
import { parseYouTubeUrl } from '@okulpano/shared/youtube';
import { ANNOUNCEMENT_TEMPLATES, designFields, designTemplate, designTitle, type AnnouncementDesign } from '@okulpano/shared/designs';
import { autoSlideSeconds } from '@okulpano/shared/slideDuration';
import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { api, uploadImage } from '../src/api.ts';
import { useAuth, useSchoolPath } from '../src/auth.tsx';
import { useAnnouncementDrafts, useAnnouncements, useScreens, useSchoolInfo, type Announcement, type AnnouncementDraft } from '../src/data.ts';
import { AnnouncementPreview } from '../src/preview.tsx';
import { Text } from '../src/text.tsx';
import { colors } from '../src/theme.ts';
import { Button, Card, Chip, Choice, Field, Icon, Screen, SectionTitle, T, type IconName } from '../src/ui.tsx';

type Kind = 'design' | 'image' | 'text' | 'video';
/** 'keep': düzenlemede yayın planı (web panelinde ayrıntılı ayarlanmış olabilir) aynı kalır */
type Until = '1' | '3' | '7' | 'none' | 'keep';
type Phase = 'any' | 'break' | 'keep';

/*
 * Adım adım duyuru (tasarım A): Tür → İçerik → Nerede ve ne zaman → Kontrol ve gönder. Üstte ilerleme çubuğu ve
 * "Adım 2/4", altta sabit "Devam". Ekrandan yarıda çıkılırsa (bir şey yazıldıysa) duyuru taslak olarak saklanır;
 * Duyurular › Taslaklar'dan kaldığı adımdan devam edilir. Okulda onay açıksa ve kişinin onay yetkisi yoksa son düğme
 * "Onaya gönder" olur.
 */

const STEPS = ['Tür', 'İçerik', 'Nerede ve ne zaman', 'Kontrol ve gönder'] as const;
const KINDS: { value: Kind; label: string; text: string; icon: IconName; bg: string }[] = [
  { value: 'design', label: 'Hazır şablon', text: 'Doldurup gönderin', icon: 'albums-outline', bg: '#d1fae5' },
  { value: 'image', label: 'Fotoğraf', text: 'Fotoğraf ya da afiş', icon: 'image-outline', bg: '#dbeafe' },
  { value: 'text', label: 'Yazı', text: 'Başlık ve kısa yazı', icon: 'text', bg: '#fef3c7' },
  { value: 'video', label: 'YouTube', text: 'Video bağlantısı', icon: 'play', bg: '#fee2e2' },
];
const UNTIL_LABEL: Record<Until, string> = { keep: 'Aynı kalsın', '1': 'Bugün', '3': '3 gün', '7': '1 hafta', none: 'Süresiz' };
const dateText = (iso: string) => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

interface State {
  kind: Kind;
  templateId: string;
  fields: Record<string, string>;
  title: string;
  body: string;
  imageUrl: string | null;
  youtubeUrl: string;
  screenIds: string[];
  phase: Phase;
  until: Until;
  /** Panoda ekranda kalma süresi (sn); boşsa metnin uzunluğuna göre otomatik */
  duration: number | null;
}

const hasContent = (s: State) => Boolean(s.title.trim() || s.body.trim() || s.imageUrl || s.youtubeUrl.trim() || Object.values(s.fields).some((v) => v?.trim()));

/** Seçilen gün sayısı sonunda gece yarısı (telefonun saatiyle) yayından kalkar */
function endOf(until: Until): Date | null {
  if (until === 'none' || until === 'keep') return null;
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + Number(until));
  return end;
}
const localInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T00:00`;

/** Taslak web paneliyle aynı biçimde saklanır (oradan da devam edilebilir) */
function toDraftData(s: State): AnnouncementDraft['data'] {
  const t = designTemplate(s.templateId);
  const end = endOf(s.until);
  return {
    kind: s.kind,
    design: { template: t.id, palette: t.palette, fields: s.fields },
    title: s.title,
    body: s.body,
    imageUrl: s.imageUrl,
    youtubeUrl: s.youtubeUrl,
    screenIds: s.screenIds,
    schedule: { days: [], from: null, to: null, phase: s.phase === 'break' ? 'break' : 'any' },
    endsAt: end ? localInput(end) : '',
    until: s.until === 'keep' ? '7' : s.until,
    durationSec: s.duration ? String(s.duration) : '',
  };
}

export default function DuyuruYeni() {
  const { school, can } = useAuth();
  const qc = useQueryClient();
  const path = useSchoolPath('announcements');
  const draftsPath = useSchoolPath('announcement-drafts');
  // taslak: taslaktan devam; duzenle: var olan duyuru (özet adımından açılır); kopya: benzerini oluştur
  const { taslak, duzenle, kopya } = useLocalSearchParams<{ taslak?: string; duzenle?: string; kopya?: string }>();
  const drafts = useAnnouncementDrafts(Boolean(taslak));
  const announcements = useAnnouncements();
  const [editing, setEditing] = useState<Announcement | null>(null);
  const info = useSchoolInfo();
  const screens = useScreens();
  const [step, setStep] = useState(0);
  // Taslak, ulaşılan en ileri adımdan açılır (geri gelinip çıkılsa da)
  const [furthest, setFurthest] = useState(0);
  useEffect(() => setFurthest((f) => Math.max(f, step)), [step]);
  const [kind, setKind] = useState<Kind>('design');
  const [templateId, setTemplateId] = useState(ANNOUNCEMENT_TEMPLATES[0]!.id);
  // Web panelinde seçilmiş renk (düzenleme ve benzerini oluşturmada korunur; şablon değişince şablonun rengi gelir)
  const [palette, setPalette] = useState<AnnouncementDesign['palette'] | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [screenIds, setScreenIds] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>('any');
  const [until, setUntil] = useState<Until>('7');
  const [duration, setDuration] = useState<number | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Taslaktan devam: bir kez doldurulur, kaldığı adımdan açılır
  const loaded = useRef(false);
  useEffect(() => {
    if (!taslak || loaded.current || !drafts.data) return;
    loaded.current = true;
    const d = drafts.data.find((x) => x.id === taslak);
    if (!d) return;
    const x = d.data;
    setDraftId(d.id);
    if (x.kind) setKind(x.kind);
    if (x.design?.template) setTemplateId(designTemplate(x.design.template).id);
    if (x.design?.palette) setPalette(x.design.palette as AnnouncementDesign['palette']);
    setFields(x.design?.fields ?? {});
    setTitle(x.title ?? '');
    setBody(x.body ?? '');
    setImageUrl(x.imageUrl ?? null);
    setYoutubeUrl(x.youtubeUrl ?? '');
    setScreenIds(x.screenIds ?? []);
    setPhase(x.schedule?.phase === 'break' ? 'break' : 'any');
    setUntil(x.until ?? (x.endsAt ? '7' : 'none'));
    setDuration(x.durationSec ? Number(x.durationSec) || null : null);
    setStep(Math.min(3, Math.max(0, d.step)));
  }, [taslak, drafts.data]);

  // Düzenleme ya da benzerini oluşturma: duyurunun içeriği bir kez doldurulur
  const loadedSrc = useRef(false);
  useEffect(() => {
    const id = duzenle ?? kopya;
    if (!id || loadedSrc.current || !announcements.data) return;
    loadedSrc.current = true;
    const a = announcements.data.find((x) => x.id === id);
    if (!a) return;
    setKind(a.kind);
    if (a.design?.template) setTemplateId(designTemplate(a.design.template).id);
    if (a.design?.palette) setPalette(a.design.palette);
    setFields(a.design?.fields ?? {});
    setTitle(a.kind === 'design' ? '' : a.title);
    setBody(a.body ?? '');
    setImageUrl(a.imageUrl);
    setYoutubeUrl(a.youtubeUrl ?? '');
    setScreenIds(a.screenIds ?? []);
    setDuration(a.durationSec ?? null);
    if (duzenle) {
      setEditing(a);
      setPhase('keep');
      setUntil('keep');
      setStep(3);
    } else {
      setPhase(a.schedule?.phase === 'break' ? 'break' : 'any');
      setStep(1);
    }
  }, [duzenle, kopya, announcements.data]);

  // Ekrandan yarıda çıkılırsa taslak saklanır (geri düğmesi, telefonun geri tuşu, sekme değişimi)
  const state: State = { kind, templateId, fields, title, body, imageUrl, youtubeUrl, screenIds, phase, until, duration };
  const latest = useRef({ state, step: furthest, draftId, draftsPath, schoolId: school?.id, editing: Boolean(duzenle) });
  latest.current = { state, step: furthest, draftId, draftsPath, schoolId: school?.id, editing: Boolean(duzenle) };
  const submitted = useRef(false);
  useEffect(
    () => () => {
      const l = latest.current;
      // Var olan duyurunun düzenlemesi taslak olmaz
      if (submitted.current || l.editing || !hasContent(l.state)) return;
      const body = { step: l.step, data: toDraftData(l.state) };
      void (l.draftId ? api(`${l.draftsPath}/${l.draftId}`, { method: 'PUT', body }) : api(l.draftsPath, { method: 'POST', body }))
        .then(() => qc.invalidateQueries({ queryKey: [l.schoolId, 'announcement-drafts'] }))
        .catch(() => undefined);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const t = designTemplate(templateId);
  const design: AnnouncementDesign = { template: t.id, palette: palette ?? t.palette, fields };
  // Panoda kalma süresi: boşsa metnin uzunluğuna göre (okul varsayılanı ile üst sınır arasında); üst sınırdan uzun
  // süre onay yetkisi olmayanda onaya düşer (sunucu da aynı kuralı uygular)
  const defaultSec = info.data?.settings.slideDurationSec ?? 10;
  const maxSec = info.data?.settings.slideMaxDurationSec ?? 60;
  const approver = can('announcements.approve');
  const autoSec = autoSlideSeconds(kind === 'design' ? { design } : { title, body }, defaultSec, maxSec);
  const tooLong = !approver && duration != null && duration > maxSec;
  const needsApproval = (Boolean(info.data?.settings.requireApproval) && !approver) || tooLong;

  const pick = async (camera: boolean) => {
    setError(null);
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted && Platform.OS !== 'web') return setError(camera ? 'Kamera izni verilmedi.' : 'Galeri izni verilmedi.');
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8, allowsEditing: true, aspect: [16, 9] };
    const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    const asset = res.assets?.[0];
    if (res.canceled || !asset || !school) return;
    setUploading(true);
    try {
      const { url } = await uploadImage(school.id, asset as never);
      setImageUrl(url);
    } catch (err) {
      setError(errorText(err, 'Fotoğraf yüklenemedi'));
    } finally {
      setUploading(false);
    }
  };

  const contentProblem =
    kind === 'design'
      ? fields[t.headline.key]?.trim()
        ? null
        : `"${t.headline.label}" alanını doldurun.`
      : kind === 'video'
        ? !parseYouTubeUrl(youtubeUrl)
          ? 'Geçerli bir YouTube bağlantısı yapıştırın.'
          : !title.trim()
            ? 'Başlık yazın.'
            : null
      : kind === 'image'
        ? !imageUrl
          ? 'Bir fotoğraf seçin.'
          : !title.trim()
            ? 'Başlık yazın.'
            : null
        : !title.trim()
          ? 'Başlık yazın.'
          : null;

  const next = () => {
    setError(null);
    if (step === 1 && contentProblem) return setError(contentProblem);
    setStep(step + 1);
  };

  const submit = async () => {
    if (contentProblem) {
      setError(contentProblem);
      return setStep(1);
    }
    setBusy(true);
    setError(null);
    const end = endOf(until);
    const payload =
      kind === 'design'
        ? { kind, title: designTitle(design), design }
        : kind === 'image'
          ? { kind, title: title.trim(), body: body.trim() || null, imageUrl }
          : kind === 'video'
            ? { kind, title: title.trim(), body: body.trim() || null, youtubeUrl: youtubeUrl.trim() }
            : { kind, title: title.trim(), body: body.trim() || null };
    // Düzenlemede "Aynı kalsın" seçiliyse web panelinde ayarlanmış plan (günler, saatler, başlangıç) korunur
    const schedule = phase === 'keep' ? (editing?.schedule ?? null) : phase === 'break' ? { days: [], from: null, to: null, phase: 'break' } : null;
    const endsAt = until === 'keep' ? (editing?.endsAt ?? null) : end ? end.toISOString() : null;
    const request = {
      ...payload,
      screenIds: screenIds.length ? screenIds : null,
      schedule,
      endsAt,
      durationSec: kind === 'video' ? (editing?.durationSec ?? null) : duration,
      ...(editing ? { startsAt: editing.startsAt } : {}),
    };
    try {
      if (editing) await api(`${path}/${editing.id}`, { method: 'PUT', body: request });
      else await api(path, { method: 'POST', body: request });
      submitted.current = true;
      if (draftId) await api(`${draftsPath}/${draftId}`, { method: 'DELETE' }).catch(() => undefined);
      await Promise.all(['announcements', 'control-center', 'announcement-drafts'].map((k) => qc.invalidateQueries({ queryKey: [school?.id, k] })));
      router.back();
    } catch (err) {
      setError(errorText(err, 'Kaydedilemedi'));
    } finally {
      setBusy(false);
    }
  };

  if (!can('announcements.manage')) {
    return (
      <Screen back title="Yeni duyuru">
        <Card>
          <T>Duyuru eklemek için okul yöneticinizden "Duyurular" yetkisi isteyin.</T>
        </Card>
      </Screen>
    );
  }

  const screenNames = screenIds.map((id) => screens.data?.find((s) => s.id === id)?.name ?? '?');
  const shownTitle = kind === 'design' ? designTitle(design) : title;
  const preview = (
    <View style={{ borderRadius: 16, overflow: 'hidden' }}>
      <AnnouncementPreview kind={kind} title={title || 'Duyuru başlığı'} body={body || null} imageUrl={imageUrl} design={kind === 'design' ? design : null} youtubeUrl={youtubeUrl} height={190} />
    </View>
  );

  return (
    <Screen
      back
      onBack={step > 0 ? () => setStep(step - 1) : undefined}
      title={duzenle ? 'Duyuruyu düzenle' : 'Yeni duyuru'}
      footer={
        <>
          {error && <T color={colors.danger}>{error}</T>}
          {step === 3 && needsApproval && (
            <T size={12} color={colors.muted} style={{ textAlign: 'center' }}>
              Okulunuzda onay açık: yönetici onaylayınca panoya çıkar
            </T>
          )}
          {step < 3 ? (
            <Button size="lg" disabled={uploading} onPress={next}>
              Devam
            </Button>
          ) : (
            <Button size="lg" loading={busy} disabled={uploading} onPress={() => void submit()}>
              {needsApproval ? 'Onaya gönder' : editing ? 'Kaydet' : 'Yayına al'}
            </Button>
          )}
        </>
      }
    >
      <View style={{ gap: 6 }}>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' }}>
          <View style={{ width: `${((step + 1) / STEPS.length) * 100}%`, height: '100%', backgroundColor: colors.brand }} />
        </View>
        <T size={12.5} weight="700" color={colors.muted}>
          Adım {step + 1}/{STEPS.length} · {STEPS[step]}
        </T>
      </View>

      {step === 0 &&
        KINDS.map((k) => {
          const on = k.value === kind;
          return (
            <Pressable
              key={k.value}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => setKind(k.value)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, borderWidth: on ? 2 : 1, borderColor: on ? colors.ink : colors.border, backgroundColor: colors.card }}
            >
              <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: k.bg, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={k.icon} size={20} color="#1c1917" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink }}>{k.label}</Text>
                <Text style={{ fontSize: 13, color: colors.muted }}>{k.text}</Text>
              </View>
              {on && <Icon name="checkmark-circle" size={22} color={colors.ink} />}
            </Pressable>
          );
        })}

      {step === 1 && (
        <>
          {kind === 'design' && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, alignItems: 'center' }}>
              {ANNOUNCEMENT_TEMPLATES.map((x) => (
                <Chip key={x.id} label={x.name} selected={x.id === templateId} onPress={() => (setTemplateId(x.id), setPalette(null))} />
              ))}
            </ScrollView>
          )}
          {preview}
          {kind === 'design' ? (
            designFields(t)
              .filter((f) => f.type !== 'image')
              .map((f) => (
                <Field
                  key={`${t.id}-${f.key}`}
                  label={f.label}
                  value={fields[f.key] ?? ''}
                  onChangeText={(v) => setFields((x) => ({ ...x, [f.key]: v }))}
                  placeholder={f.placeholder}
                  maxLength={f.max}
                  multiline={f.multiline}
                />
              ))
          ) : (
            <>
              {kind === 'image' && (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {Platform.OS !== 'web' && (
                    <Button variant="secondary" icon="camera-outline" style={{ flex: 1 }} loading={uploading} onPress={() => void pick(true)}>
                      Fotoğraf çek
                    </Button>
                  )}
                  <Button variant="secondary" icon="image-outline" style={{ flex: 1 }} loading={uploading} onPress={() => void pick(false)}>
                    Galeriden seç
                  </Button>
                </View>
              )}
              {kind === 'video' && (
                <Field
                  label="YouTube bağlantısı"
                  value={youtubeUrl}
                  onChangeText={setYoutubeUrl}
                  placeholder="https://www.youtube.com/watch?v=…"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  help="youtube.com/watch, youtu.be ve Shorts bağlantıları desteklenir. Video bitince sıradaki slayta geçilir."
                />
              )}
              <Field label="Başlık" value={title} onChangeText={setTitle} maxLength={120} placeholder="ör. Bilim fuarımızdan kareler" />
              <Field label={kind === 'text' ? 'Duyuru metni' : 'Açıklama (isteğe bağlı)'} value={body} onChangeText={setBody} maxLength={600} multiline />
            </>
          )}
          <T size={12} color={colors.muted}>
            Uzun metinleri yazarken telefon klavyesindeki mikrofonla sesli yazabilirsiniz.
          </T>
        </>
      )}

      {step === 2 && (
        <>
          <SectionTitle>Hangi panolarda</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Chip label="Tüm panolar" selected={!screenIds.length} onPress={() => setScreenIds([])} />
            {(screens.data ?? []).map((s) => {
              const on = screenIds.includes(s.id);
              return <Chip key={s.id} label={s.name} selected={on} onPress={() => setScreenIds(on ? screenIds.filter((x) => x !== s.id) : [...screenIds, s.id])} />;
            })}
          </View>
          <SectionTitle>Ne zaman</SectionTitle>
          <Choice
            value={phase}
            onChange={setPhase}
            options={[
              ...(editing ? [{ value: 'keep' as const, label: 'Aynı kalsın' }] : []),
              { value: 'any' as const, label: 'Her zaman' },
              { value: 'break' as const, label: 'Teneffüslerde' },
            ]}
          />
          <SectionTitle>Ne kadar süre</SectionTitle>
          <Choice
            value={until}
            onChange={setUntil}
            columns={editing ? 3 : 4}
            options={(Object.keys(UNTIL_LABEL) as Until[]).filter((u) => editing || u !== 'keep').map((u) => ({ value: u, label: UNTIL_LABEL[u] }))}
          />
          {kind !== 'video' && (
            <>
              <SectionTitle>Ekranda kalma süresi</SectionTitle>
              <Choice
                value={duration ?? 0}
                onChange={(v) => setDuration(v || null)}
                columns={3}
                options={[
                  { value: 0, label: `Otomatik (${autoSec} sn)` },
                  ...[...new Set([20, 30, 45, maxSec, 90, ...(duration ? [duration] : [])])]
                    .filter((n) => n > 0)
                    .sort((x, y) => x - y)
                    .map((n) => ({ value: n, label: !approver && n > maxSec ? `${n} sn · onaya düşer` : `${n} sn` })),
                ]}
              />
              <T size={12} color={colors.muted}>
                {tooLong
                  ? `${maxSec} saniyeden uzun süre onaylayıcının onayına düşer; onaylanınca yayına girer.`
                  : `Otomatik: kısa duyuru ${defaultSec} sn kalır, uzun duyuru metne göre uzar (en çok ${maxSec} sn).`}
              </T>
            </>
          )}
        </>
      )}

      {step === 3 && (
        <>
          {preview}
          <Card style={{ paddingVertical: 4, gap: 0 }}>
            {[
              { label: 'Tür', value: KINDS.find((k) => k.value === kind)!.label, to: 0 },
              { label: 'Başlık', value: shownTitle || '—', to: 1 },
              { label: 'Panolar', value: screenNames.length ? screenNames.join(', ') : 'Tüm panolar', to: 2 },
              {
                label: 'Zaman',
                value:
                  phase === 'keep' && until === 'keep'
                    ? `Plan aynı kalıyor${editing?.endsAt ? ` · ${dateText(editing.endsAt)} tarihine kadar` : ' · süresiz'}`
                    : `${phase === 'break' ? 'Teneffüslerde' : phase === 'keep' ? 'Zamanlama aynı' : 'Her zaman'} · ${until === 'keep' ? (editing?.endsAt ? `${dateText(editing.endsAt)} tarihine kadar` : 'süresiz') : UNTIL_LABEL[until]}`,
                to: 2,
              },
              ...(kind !== 'video' ? [{ label: 'Süre', value: duration ? `${duration} sn${tooLong ? ' · onaya düşer' : ''}` : `Otomatik (${autoSec} sn)`, to: 2 }] : []),
            ].map((r, i) => (
              <View key={r.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.divider }}>
                <Text style={{ width: 70, fontSize: 13, color: colors.muted }}>{r.label}</Text>
                <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: colors.ink }} numberOfLines={2}>
                  {r.value}
                </Text>
                <Pressable accessibilityRole="button" accessibilityLabel={`${r.label}: değiştir`} onPress={() => setStep(r.to)} hitSlop={8}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: colors.brand }}>Değiştir</Text>
                </Pressable>
              </View>
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}
