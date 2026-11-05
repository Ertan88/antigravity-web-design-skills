import { SUPPORT_AREAS, SUPPORT_KIND_KEYS, SUPPORT_KINDS, type SupportArea, type SupportKind, type SupportTicket } from '@okulpano/shared/issues';
import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Platform, Pressable, View } from 'react-native';
import { api, uploadImage } from '../../src/api.ts';
import { useAuth, useSchoolPath } from '../../src/auth.tsx';
import { KIND_LOOK } from '../../src/support.tsx';
import { Text } from '../../src/text.tsx';
import { colors, tiles } from '../../src/theme.ts';
import { Button, Chip, Field, Icon, Screen, T } from '../../src/ui.tsx';

/** Yeni destek talebi: tür, konu, açıklama, ilgili bölüm ve isteğe bağlı ekran görüntüsü */
export default function YeniTalep() {
  const { school } = useAuth();
  const path = useSchoolPath('support');
  const qc = useQueryClient();
  const [kind, setKind] = useState<SupportKind>('problem');
  const [area, setArea] = useState<SupportArea>('mobile');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const attach = async () => {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted && Platform.OS !== 'web') return setError('Galeri izni verilmedi.');
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    const asset = res.assets?.[0];
    if (res.canceled || !asset || !school) return;
    setUploading(true);
    try {
      const { url } = await uploadImage(school.id, asset as never, 'uploads');
      setAttachmentUrl(url);
      setPreview(asset.uri);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Görsel yüklenemedi');
    } finally {
      setUploading(false);
    }
  };

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const t = await api<SupportTicket>(path, { method: 'POST', body: { kind, area, subject, body, attachmentUrl } });
      await qc.invalidateQueries({ queryKey: [school?.id, 'support'] });
      router.replace(`/talep/${t.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gönderilemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      back
      title="Yeni talep"
      subtitle="Okul Yayın ekibine iletilir"
      footer={
        <Button icon="send" loading={busy} disabled={subject.trim().length < 3 || body.trim().length < 5 || uploading} onPress={() => void send()}>
          Gönder
        </Button>
      }
    >
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {SUPPORT_KIND_KEYS.map((k) => {
          const look = KIND_LOOK[k];
          const t = tiles[look.tone];
          const on = kind === k;
          return (
            <Pressable
              key={k}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => setKind(k)}
              style={{ flex: 1, alignItems: 'center', gap: 6, paddingVertical: on ? 9 : 10, borderRadius: 16, backgroundColor: colors.card, borderWidth: on ? 2 : 1, borderColor: on ? colors.ink : colors.border }}
            >
              <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={look.icon} size={20} color={t.fg} />
              </View>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink }}>{SUPPORT_KINDS[k]}</Text>
            </Pressable>
          );
        })}
      </View>
      <Field label="Konu" value={subject} onChangeText={setSubject} maxLength={120} placeholder="Kısaca ne oldu?" />
      <Field label="Açıklama" value={body} onChangeText={setBody} maxLength={4000} multiline placeholder="Ne yaptınız, ne bekliyordunuz, ne oldu?" style={{ minHeight: 110, textAlignVertical: 'top' }} />
      <T size={12} weight="800" color={colors.muted}>
        İLGİLİ BÖLÜM
      </T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(Object.keys(SUPPORT_AREAS) as SupportArea[]).map((a) => (
          <Chip key={a} label={SUPPORT_AREAS[a]} selected={area === a} onPress={() => setArea(a)} />
        ))}
      </View>
      {preview ? (
        <View>
          <Image source={{ uri: preview }} style={{ width: '100%', height: 180, borderRadius: 16 }} resizeMode="cover" />
          <Pressable accessibilityLabel="Eki kaldır" onPress={() => { setAttachmentUrl(null); setPreview(null); }} style={{ position: 'absolute', top: 8, right: 8, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="close" size={16} color="#fff" />
          </Pressable>
        </View>
      ) : (
        <Button variant="secondary" size="sm" icon="paperclip" loading={uploading} onPress={() => void attach()} style={{ alignSelf: 'flex-start' }}>
          Ekran görüntüsü ekle
        </Button>
      )}
      <T size={12} color={colors.faint}>
        Ekran görüntüsünde öğrenci adı ya da kişisel bilgi görünmesin.
      </T>
      {error && (
        <T size={13} color={colors.danger} weight="600">
          {error}
        </T>
      )}
    </Screen>
  );
}
