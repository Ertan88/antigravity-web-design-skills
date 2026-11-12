import { errorText } from '@okulpano/shared';
import { parseYouTubeUrl } from '@okulpano/shared/youtube';
import { ANNOUNCEMENT_TEMPLATES, designFields, designTemplate, designTitle, type AnnouncementDesign } from '@okulpano/shared/designs';
import { autoSlideSeconds } from '@okulpano/shared/slideDuration';
import {
  DEFAULT_UNTIL,
  endOfDay,
  hasAdvancedPlan,
  normalizeTime,
  PLAN_WEEKDAYS,
  planConflict,
  planSentence,
  presetEnd,
  UNTIL_PRESETS,
  untilChoiceOf,
  type PlanSchedule,
  type UntilChoice,
} from '@okulpano/shared/announcementPlan';
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
import { DatePickSheet } from '../src/datePick.tsx';
import { Button, Card, Chip, Field, Icon, Screen, SectionTitle, T, type IconName } from '../src/ui.tsx';

type Kind = 'design' | 'image' | 'text' | 'video';
const EMPTY_SCHEDULE: PlanSchedule = { days: [], from: null, to: null, phase: 'any' };

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
const dayText = (d: Date) => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' }).format(d);

interface State {
  kind: Kind;
  templateId: string;
  fields: Record<string, string>;
  title: string;
  body: string;
  imageUrl: string | null;
  youtubeUrl: string;
  screenIds: string[];
  /** Yayın planı (web paneliyle aynı): ne zamana kadar, başlangıç, günler, saatler, zil durumu */
  until: UntilChoice;
  endDate: Date | null;
  startDate: Date | null;
  schedule: PlanSchedule;
  /** Panoda ekranda kalma süresi (sn); boşsa metnin uzunluğuna göre otomatik */
  duration: number | null;
}

const hasContent = (s: State) => Boolean(s.title.trim() || s.body.trim() || s.imageUrl || s.youtubeUrl.trim() || Object.values(s.fields).some((v) => v?.trim()));

const pad = (n: number) => String(n).padStart(2, '0');
/** Web panelinin tarih kutusu biçimi (taslaklar ortak) */
const localInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Taslak web paneliyle aynı biçimde saklanır (oradan da devam edilebilir) */
function toDraftData(s: State): AnnouncementDraft['data'] {
  const t = designTemplate(s.templateId);
  return {
    kind: s.kind,
    design: { template: t.id, palette: t.palette, fields: s.fields },
    title: s.title,
    body: s.body,
    imageUrl: s.imageUrl,
    youtubeUrl: s.youtubeUrl,
    screenIds: s.screenIds,
    schedule: s.schedule,
    startsAt: s.startDate ? localInput(s.startDate) : '',
    endsAt: s.endDate ? localInput(s.endDate) : '',
    until: s.until,
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
  // Ne zamana kadar: varsayılan 1 hafta (web paneliyle aynı)
  const [until, setUntil] = useState<UntilChoice>(DEFAULT_UNTIL);
  const [endDate, setEndDate] = useState<Date | null>(() => presetEnd(7));
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [schedule, setSchedule] = useState<PlanSchedule>(EMPTY_SCHEDULE);
  const [advanced, setAdvanced] = useState(false);
  const [picking, setPicking] = useState<'end' | 'start' | null>(null);
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
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
    const sch = x.schedule ?? EMPTY_SCHEDULE;
    setSchedule(sch);
    setFromText(sch.from ?? '');
    setToText(sch.to ?? '');
    // Hazır süre taslağın açıldığı güne göre yeniden hesaplanır; elle tarih olduğu gibi kalır
    const preset = UNTIL_PRESETS.find((p) => p.key === x.until);
    const end = preset ? presetEnd(preset.days) : x.until === 'none' ? null : x.endsAt ? new Date(x.endsAt) : presetEnd(7);
    setUntil(preset ? preset.key : x.until === 'none' ? 'none' : end ? untilChoiceOf(end) : DEFAULT_UNTIL);
    setEndDate(end);
    const start = x.startsAt ? new Date(x.startsAt) : null;
    setStartDate(start);
    setAdvanced(hasAdvancedPlan(start, sch));
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
    // Yayın planı web panelinde ayarlanmış olabilir: hepsi olduğu gibi yüklenir (günler, saatler, başlangıç, bitiş)
    const sch = a.schedule ?? EMPTY_SCHEDULE;
    setSchedule(sch);
    setFromText(sch.from ?? '');
    setToText(sch.to ?? '');
    if (duzenle) {
      setEditing(a);
      const end = a.endsAt ? new Date(a.endsAt) : null;
      setEndDate(end);
      setUntil(untilChoiceOf(end));
      const start = a.startsAt ? new Date(a.startsAt) : null;
      setStartDate(start);
      setAdvanced(hasAdvancedPlan(start, sch));
      setStep(3);
    } else {
      setAdvanced(hasAdvancedPlan(null, sch));
      setStep(1);
    }
  }, [duzenle, kopya, announcements.data]);

  // Ekrandan yarıda çıkılırsa taslak saklanır (geri düğmesi, telefonun geri tuşu, sekme değişimi)
  const state: State = { kind, templateId, fields, title, body, imageUrl, youtubeUrl, screenIds, until, endDate, startDate, schedule, duration };
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
    // Birbirini dışlayan plan (duyuru hiç görünmez): uyarı kartı bu adımda görünür, düzeltilmeden ilerlenmez
    if (step === 2 && planWarning) return setError(planWarning);
    setStep(step + 1);
  };

  const submit = async () => {
    if (contentProblem) {
      setError(contentProblem);
      return setStep(1);
    }
    setBusy(true);
    setError(null);
    const payload =
      kind === 'design'
        ? { kind, title: designTitle(design), design }
        : kind === 'image'
          ? { kind, title: title.trim(), body: body.trim() || null, imageUrl }
          : kind === 'video'
            ? { kind, title: title.trim(), body: body.trim() || null, youtubeUrl: youtubeUrl.trim() }
            : { kind, title: title.trim(), body: body.trim() || null };
    const request = {
      ...payload,
      screenIds: screenIds.length ? screenIds : null,
      schedule,
      startsAt: startDate ? startDate.toISOString() : null,
      endsAt: endDate ? endDate.toISOString() : null,
      durationSec: kind === 'video' ? (editing?.durationSec ?? null) : duration,
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
  const planText = planSentence(startDate, endDate, schedule, screenNames);
  const planWarning = planConflict(startDate, endDate, schedule);
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
          {/* Tasarım A: üç kısa soru hazır seçeneklerle; seyrek ayarlar "Gelişmiş zamanlama"da; altta tek cümle */}
          <SectionTitle>Nerede</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Chip label="Bütün panolar" selected={!screenIds.length} onPress={() => setScreenIds([])} />
            {(screens.data ?? []).map((s) => {
              const on = screenIds.includes(s.id);
              return <Chip key={s.id} label={s.name} selected={on} onPress={() => setScreenIds(on ? screenIds.filter((x) => x !== s.id) : [...screenIds, s.id])} />;
            })}
          </View>

          <SectionTitle>Ne zamana kadar</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {UNTIL_PRESETS.map((p) => (
              <Chip
                key={p.key}
                label={p.label}
                selected={until === p.key}
                onPress={() => {
                  setUntil(p.key);
                  setEndDate(presetEnd(p.days));
                }}
              />
            ))}
            <Chip
              label="Süresiz"
              selected={until === 'none'}
              onPress={() => {
                setUntil('none');
                setEndDate(null);
              }}
            />
            <Chip
              icon="calendar-outline"
              label={until === 'date' && endDate ? dayText(new Date(endDate.getTime() - 1)) : 'Tarih seç'}
              selected={until === 'date'}
              onPress={() => setPicking('end')}
            />
          </View>

          {kind !== 'video' ? (
            <>
              <SectionTitle>Ekranda kalma</SectionTitle>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Chip label={`Otomatik · ${autoSec} sn`} selected={!duration} onPress={() => setDuration(null)} />
                {[...new Set([20, 30, 45, maxSec, ...(duration ? [duration] : [])])]
                  .sort((x, y) => x - y)
                  .map((n) => (
                    <Chip key={n} label={!approver && n > maxSec ? `${n} sn · onaya düşer` : `${n} sn`} selected={duration === n} onPress={() => setDuration(n)} />
                  ))}
                {!approver && !(duration && duration > maxSec) && <Chip label={`${Math.min(300, maxSec + 30)} sn · onaya düşer`} onPress={() => setDuration(Math.min(300, maxSec + 30))} />}
              </View>
              <T size={12} color={tooLong ? colors.warning : colors.muted}>
                {tooLong
                  ? `${maxSec} saniyeden uzun süre onaylayıcının onayına düşer; onaylanınca yayına girer.`
                  : `Otomatik: kısa duyuru ${defaultSec} sn kalır, uzun duyuru metne göre uzar (en çok ${maxSec} sn).`}
              </T>
            </>
          ) : (
            <T size={13} color={colors.muted}>
              Video duyurusu panoda video bitene kadar kalır.
            </T>
          )}

          <Card style={{ paddingVertical: 4, gap: 0 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: advanced }}
              onPress={() => setAdvanced((x) => !x)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink }}>Gelişmiş zamanlama</Text>
                <Text style={{ fontSize: 12.5, color: colors.muted }}>Başlangıç, günler, saatler, yalnızca teneffüste</Text>
              </View>
              <Icon name={advanced ? 'chevron-down' : 'chevron-forward'} size={20} color={colors.faint} />
            </Pressable>
            {advanced && (
              <View style={{ gap: 12, paddingBottom: 14, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 12 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: colors.muted }}>Başlangıç</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <Chip label="Hemen" selected={!startDate || startDate.getTime() <= Date.now()} onPress={() => setStartDate(null)} />
                  <Chip
                    icon="calendar-outline"
                    label={startDate && startDate.getTime() > Date.now() ? dayText(startDate) : 'Tarih seç'}
                    selected={Boolean(startDate && startDate.getTime() > Date.now())}
                    onPress={() => setPicking('start')}
                  />
                </View>
                <Text style={{ fontSize: 13, fontWeight: '800', color: colors.muted }}>Haftanın günleri</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {PLAN_WEEKDAYS.map((d, i) => {
                    const on = schedule.days.includes(i + 1);
                    return (
                      <Chip
                        key={d}
                        label={d}
                        selected={on}
                        onPress={() => setSchedule({ ...schedule, days: on ? schedule.days.filter((x) => x !== i + 1) : [...schedule.days, i + 1].sort() })}
                      />
                    );
                  })}
                </View>
                <T size={12} color={colors.muted}>
                  Hiçbiri seçili değilse her gün.
                </T>
                <Text style={{ fontSize: 13, fontWeight: '800', color: colors.muted }}>Günün saatleri</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Field
                      label="Şu saatten"
                      value={fromText}
                      onChangeText={setFromText}
                      onBlur={() => {
                        const v = normalizeTime(fromText);
                        setFromText(v ?? '');
                        setSchedule({ ...schedule, from: v });
                      }}
                      placeholder="08:30"
                      keyboardType="numbers-and-punctuation"
                      maxLength={5}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field
                      label="Şu saate kadar"
                      value={toText}
                      onChangeText={setToText}
                      onBlur={() => {
                        const v = normalizeTime(toText);
                        setToText(v ?? '');
                        setSchedule({ ...schedule, to: v });
                      }}
                      placeholder="16:00"
                      keyboardType="numbers-and-punctuation"
                      maxLength={5}
                    />
                  </View>
                </View>
                <Text style={{ fontSize: 13, fontWeight: '800', color: colors.muted }}>Zil durumu</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {(
                    [
                      ['any', 'Her zaman'],
                      ['break', 'Yalnızca teneffüste'],
                      ['lesson', 'Yalnızca derste'],
                    ] as const
                  ).map(([value, label]) => (
                    <Chip key={value} label={label} selected={schedule.phase === value} onPress={() => setSchedule({ ...schedule, phase: value })} />
                  ))}
                </View>
              </View>
            )}
          </Card>

          <Card tone={planWarning ? 'warning' : undefined}>
            <T weight="700">{planWarning ?? planText}</T>
            {!planWarning && kind !== 'video' && (
              <T size={12} color={colors.muted}>
                Her gösterimde {duration ? `${duration} saniye` : `${autoSec} saniye (metnin uzunluğuna göre)`} ekranda kalır.
              </T>
            )}
          </Card>

          <DatePickSheet
            open={picking !== null}
            title={picking === 'start' ? 'Yayın ne zaman başlasın' : 'Hangi günün sonuna kadar'}
            value={picking === 'start' ? startDate : endDate ? new Date(endDate.getTime() - 1) : null}
            min={picking === 'end' && startDate ? startDate : new Date()}
            onClose={() => setPicking(null)}
            onPick={(day) => {
              if (picking === 'start') setStartDate(day);
              else {
                setUntil('date');
                setEndDate(endOfDay(day));
              }
              setPicking(null);
            }}
          />
        </>
      )}

      {step === 3 && (
        <>
          {preview}
          <Card style={{ paddingVertical: 4, gap: 0 }}>
            {[
              { label: 'Tür', value: KINDS.find((k) => k.value === kind)!.label, to: 0 },
              { label: 'Başlık', value: shownTitle || '—', to: 1 },
              { label: 'Yayın', value: planWarning ?? planText, to: 2 },
              ...(kind !== 'video' ? [{ label: 'Süre', value: duration ? `${duration} sn${tooLong ? ' · onaya düşer' : ''}` : `Otomatik (${autoSec} sn)`, to: 2 }] : []),
            ].map((r, i) => (
              <View key={r.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.divider }}>
                <Text style={{ width: 70, fontSize: 13, color: colors.muted }}>{r.label}</Text>
                <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: colors.ink }} numberOfLines={r.label === 'Yayın' ? undefined : 2}>
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
