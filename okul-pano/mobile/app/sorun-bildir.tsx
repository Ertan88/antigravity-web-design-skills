import { ISSUE_CATEGORIES, ISSUE_CATEGORY_KEYS, type IssueCategory } from '@okulpano/shared/issues';
import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Platform, Pressable, View } from 'react-native';
import { api, uploadImage } from '../src/api.ts';
import { useAuth, useSchoolPath } from '../src/auth.tsx';
import { CATEGORY_LOOK } from '../src/issues.tsx';
import { Text } from '../src/text.tsx';
import { colors, tiles } from '../src/theme.ts';
import { Button, Field, Icon, Screen, T } from '../src/ui.tsx';

/** Sorun bildir: kategori, yer, açıklama, isteğe bağlı fotoğraf ve "Acil"; kategori sorumlusuna (yoksa bütün idareye) gider */
export default function SorunBildir() {
  const { school } = useAuth();
  const path = useSchoolPath('issues');
  const qc = useQueryClient();
  const [category, setCategory] = useState<IssueCategory | null>(null);
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (camera: boolean) => {
    setError(null);
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted && Platform.OS !== 'web') return setError(camera ? 'Kamera izni verilmedi.' : 'Galeri izni verilmedi.');
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8 };
    const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    const asset = res.assets?.[0];
    if (res.canceled || !asset || !school) return;
    setUploading(true);
    try {
      const { url } = await uploadImage(school.id, asset as never, 'issues/photo');
      setPhotoUrl(url);
      setPreview(asset.uri);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fotoğraf yüklenemedi');
    } finally {
      setUploading(false);
    }
  };

  const send = async () => {
    if (!category) return setError('Ne ile ilgili olduğunu seçin.');
    setBusy(true);
    setError(null);
    try {
      await api(path, { method: 'POST', body: { category, location, description, urgent, photoUrl } });
      await qc.invalidateQueries({ queryKey: [school?.id, 'issues'] });
      router.replace('/sorunlar');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gönderilemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      back
      title="Sorun bildir"
      subtitle="Okul idaresine iletilir"
      footer={
        <Button icon="send" loading={busy} disabled={!category || !location.trim() || description.trim().length < 3} onPress={() => void send()}>
          İdareye gönder
        </Button>
      }
    >
      <View style={{ flexDirection: 'row', gap: 8, backgroundColor: colors.dangerTint, borderRadius: 14, padding: 10, borderWidth: 1, borderColor: colors.dangerBorder }}>
        <Icon name="alert-triangle" size={17} color={colors.danger} />
        <T size={12.5} color={colors.danger} style={{ flex: 1 }}>
          Acil durumda (yangın, yaralanma, kavga) telefonla arayın ya da Acil durum düğmesini kullanın; bu form geç görülebilir.
        </T>
      </View>
      <T size={12} weight="800" color={colors.muted}>
        NE İLE İLGİLİ?
      </T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {ISSUE_CATEGORY_KEYS.map((k) => {
          const look = CATEGORY_LOOK[k];
          const t = tiles[look.tone];
          const on = category === k;
          return (
            <Pressable
              key={k}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => setCategory(k)}
              style={{ width: '31.5%', alignItems: 'center', gap: 6, paddingVertical: on ? 9 : 10, borderRadius: 16, backgroundColor: colors.card, borderWidth: on ? 2 : 1, borderColor: on ? colors.ink : colors.border }}
            >
              <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={look.icon} size={20} color={t.fg} />
              </View>
              <Text style={{ fontSize: 11.5, fontWeight: '700', color: colors.ink, textAlign: 'center' }} numberOfLines={2}>
                {ISSUE_CATEGORIES[k]}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Field label="Nerede?" value={location} onChangeText={setLocation} maxLength={80} placeholder="ör. 2. kat koridor, 10-B sınıfı, bahçe" />
      <Field label="Açıklama" value={description} onChangeText={setDescription} maxLength={1000} multiline placeholder="Sorunu kısaca anlatın" style={{ minHeight: 90, textAlignVertical: 'top' }} />
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Button variant="secondary" size="sm" icon="camera-outline" loading={uploading} onPress={() => void pick(true)}>
          Fotoğraf çek
        </Button>
        <Button variant="secondary" size="sm" icon="image-outline" onPress={() => void pick(false)}>
          Galeriden
        </Button>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: urgent }}
          onPress={() => setUrgent(!urgent)}
          style={{ height: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 999, backgroundColor: urgent ? colors.danger : colors.card, borderWidth: 1, borderColor: urgent ? colors.danger : colors.dangerBorder }}
        >
          <Icon name="alert-triangle" size={16} color={urgent ? '#fff' : colors.danger} />
          <Text style={{ fontSize: 14, fontWeight: '700', color: urgent ? '#fff' : colors.danger }}>Acil</Text>
        </Pressable>
      </View>
      {preview && (
        <View>
          <Image source={{ uri: preview }} style={{ width: '100%', height: 180, borderRadius: 16 }} resizeMode="cover" />
          <Pressable accessibilityLabel="Fotoğrafı kaldır" onPress={() => { setPhotoUrl(null); setPreview(null); }} style={{ position: 'absolute', top: 8, right: 8, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="close" size={16} color="#fff" />
          </Pressable>
        </View>
      )}
      <T size={12} color={colors.faint}>
        Fotoğrafta öğrenci yüzü ya da kişisel bilgi olmasın. Fotoğraflar sorun çözüldükten 90 gün sonra silinir.
      </T>
      {error && (
        <T size={13} color={colors.danger} weight="600">
          {error}
        </T>
      )}
    </Screen>
  );
}
