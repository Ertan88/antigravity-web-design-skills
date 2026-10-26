import { ANNOUNCEMENT_TEMPLATES, designFields, designTemplate, designTitle, type AnnouncementDesign } from '@okulpano/shared/designs';
import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { api, uploadImage } from '../src/api.ts';
import { useAuth, useSchoolPath } from '../src/auth.tsx';
import { useScreens, useSchoolInfo } from '../src/data.ts';
import { AnnouncementPreview } from '../src/preview.tsx';
import { colors } from '../src/theme.ts';
import { Button, Card, Chip, Choice, Field, Screen, SectionTitle, Segmented, T } from '../src/ui.tsx';

type Kind = 'design' | 'image' | 'text';
type Until = '1' | '3' | '7' | 'none';
type Phase = 'any' | 'break';

/**
 * Hızlı duyuru (tasarım 3): hazır şablon ya da telefonla çekilen fotoğraf; panodaki görünüm canlı önizlenir.
 * Okulda onay açıksa ve kişinin onay yetkisi yoksa "Onaya gönder" olur.
 */
export default function DuyuruYeni() {
  const { school, can } = useAuth();
  const qc = useQueryClient();
  const path = useSchoolPath('announcements');
  const info = useSchoolInfo();
  const screens = useScreens();
  const [kind, setKind] = useState<Kind>('design');
  const [templateId, setTemplateId] = useState(ANNOUNCEMENT_TEMPLATES[0]!.id);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [screenIds, setScreenIds] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>('any');
  const [until, setUntil] = useState<Until>('7');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const t = designTemplate(templateId);
  const design: AnnouncementDesign = { template: t.id, palette: t.palette, fields };
  const needsApproval = Boolean(info.data?.settings.requireApproval) && !can('announcements.approve');

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
      setKind('image');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fotoğraf yüklenemedi');
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    // Seçilen gün sayısı sonunda gece yarısı (telefonun saatiyle) yayından kalkar
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + Number(until));
    const endsAt = until === 'none' ? null : end.toISOString();
    const payload =
      kind === 'design'
        ? { kind, title: designTitle(design), design }
        : kind === 'image'
          ? { kind, title: title.trim(), body: body.trim() || null, imageUrl }
          : { kind, title: title.trim(), body: body.trim() || null };
    try {
      await api(path, {
        method: 'POST',
        body: {
          ...payload,
          screenIds: screenIds.length ? screenIds : null,
          schedule: phase === 'break' ? { days: [], from: null, to: null, phase: 'break' } : null,
          endsAt,
        },
      });
      await Promise.all(['announcements', 'control-center'].map((k) => qc.invalidateQueries({ queryKey: [school?.id, k] })));
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi');
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

  const ready = kind === 'design' ? Boolean(fields[t.headline.key]?.trim()) : kind === 'image' ? Boolean(imageUrl && title.trim()) : Boolean(title.trim());

  return (
    <Screen
      back
      title="Yeni duyuru"
      footer={
        <>
          {error && <T color={colors.danger}>{error}</T>}
          {needsApproval && (
            <T size={12} color={colors.muted} style={{ textAlign: 'center' }}>
              Okulunuzda onay açık: yönetici onaylayınca panoya çıkar
            </T>
          )}
          <Button size="lg" loading={busy} disabled={!ready || uploading} onPress={() => void submit()}>
            {needsApproval ? 'Onaya gönder' : 'Yayınla'}
          </Button>
        </>
      }
    >
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: 'design', label: 'Hazır şablon' },
          { value: 'image', label: 'Fotoğraf' },
          { value: 'text', label: 'Yazı' },
        ]}
      />

      {kind === 'design' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {ANNOUNCEMENT_TEMPLATES.map((x) => (
            <Chip key={x.id} label={x.name} selected={x.id === templateId} onPress={() => setTemplateId(x.id)} />
          ))}
        </ScrollView>
      )}

      <View style={{ borderRadius: 16, overflow: 'hidden' }}>
        <AnnouncementPreview kind={kind} title={title || 'Duyuru başlığı'} body={body || null} imageUrl={imageUrl} design={kind === 'design' ? design : null} height={190} />
      </View>

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
          <Field label="Başlık" value={title} onChangeText={setTitle} maxLength={120} placeholder="ör. Bilim fuarımızdan kareler" />
          <Field label="Açıklama (isteğe bağlı)" value={body} onChangeText={setBody} maxLength={600} multiline />
        </>
      )}
      <T size={12} color={colors.muted}>
        Uzun metinleri yazarken telefon klavyesindeki mikrofonla sesli yazabilirsiniz.
      </T>

      <SectionTitle>Hangi panolarda</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Chip label="Tüm panolar" selected={!screenIds.length} onPress={() => setScreenIds([])} />
        {(screens.data ?? []).map((s) => {
          const on = screenIds.includes(s.id);
          return <Chip key={s.id} label={s.name} selected={on} onPress={() => setScreenIds(on ? screenIds.filter((x) => x !== s.id) : [...screenIds, s.id])} />;
        })}
      </View>

      <SectionTitle>Yayın zamanı</SectionTitle>
      <Choice
        value={phase}
        onChange={setPhase}
        options={[
          { value: 'any', label: 'Her zaman' },
          { value: 'break', label: 'Teneffüslerde' },
        ]}
      />
      <Choice
        value={until}
        onChange={setUntil}
        columns={4}
        options={[
          { value: '1', label: 'Bugün' },
          { value: '3', label: '3 gün' },
          { value: '7', label: '1 hafta' },
          { value: 'none', label: 'Süresiz' },
        ]}
      />
    </Screen>
  );
}
