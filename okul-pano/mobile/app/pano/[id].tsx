import { errorText } from '@okulpano/shared';
import type { ScreenCommand } from '@okulpano/shared/control';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { api, session } from '../../src/api.ts';
import { useAuth, useSchoolPath } from '../../src/auth.tsx';
import { BoardPreview } from '../../src/BoardPreview';
import { useScreens } from '../../src/data.ts';
import { timeAgo } from '../../src/day.ts';
import { colors } from '../../src/theme.ts';
import { Button, Card, Choice, confirm, Empty, Icon, Loading, Screen, SectionTitle, T, type IconName } from '../../src/ui.tsx';

/** Pano uzaktan kumanda (tasarım 8): canlı önizleme, sonraki / önceki / duraklat, ekran modu, uyut / uyandır */
export default function PanoKumanda() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { school, can } = useAuth();
  const qc = useQueryClient();
  const screens = useScreens(true);
  const s = screens.data?.find((x) => x.id === id);
  const base = useSchoolPath(`screens/${id}`);
  const tokenPath = useSchoolPath('preview-token');
  const preview = useQuery({
    queryKey: [school?.id, 'preview-token'],
    queryFn: () => api<{ token: string }>(tokenPath, { method: 'POST' }),
    staleTime: 20 * 60_000,
    refetchInterval: 25 * 60_000,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const remote = can('board.control') || can('screens.manage');

  // Silme web panelindeki gibi yalnızca panoları yönetme yetkisiyle; TV eşleştirme koduna döner, içerik silinmez
  const remove = async (name: string) => {
    const ok = await confirm({
      title: 'Pano silinsin mi?',
      subtitle: name,
      effects: [
        { text: 'Bu TV panodan çıkarılır ve eşleştirme kodu gösterir' },
        { text: 'Duyurular, kayan yazı ve diğer içerikler silinmez', ok: true },
      ],
      confirmLabel: 'Panoyu sil',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy('delete');
    setMessage(null);
    try {
      await api(base, { method: 'DELETE' });
      await qc.invalidateQueries({ queryKey: [school?.id, 'screens'] });
      if (router.canGoBack()) router.back();
      else router.replace('/panolar');
    } catch (err) {
      setMessage(errorText(err, 'Pano silinemedi'));
      setBusy(null);
    }
  };

  // Durdur / sürdür düğmesi basıldığı anda değişir; panonun bildirdiği durum gelince o geçerli olur
  const [pausedNow, setPausedNow] = useState<boolean | null>(null);
  const livePaused = screens.data?.find((x) => x.id === id)?.live?.paused;
  useEffect(() => setPausedNow(null), [livePaused]);
  const command = async (c: ScreenCommand, done?: string) => {
    if (c === 'pause' || c === 'resume') setPausedNow(c === 'pause');
    setBusy(c);
    setMessage(null);
    if (Platform.OS !== 'web') void Haptics.selectionAsync();
    try {
      const r = await api<{ delivered: boolean }>(`${base}/command`, { method: 'POST', body: { command: c } });
      setMessage(r.delivered ? (done ?? null) : 'Pano şu an çevrimdışı; komut iletilemedi.');
      // Pano gösterdiği slaytı yaklaşık yarım saniyede bildirir: "Şu an gösterilen" önce kısa, sonra bir kez daha tazelenir
      for (const ms of [800, 2500]) setTimeout(() => void qc.invalidateQueries({ queryKey: [school?.id, 'screens'] }), ms);
    } catch (err) {
      setMessage(errorText(err, 'Komut gönderilemedi'));
    } finally {
      setBusy(null);
    }
  };
  const setMode = async (mode: 'board' | 'slides' | 'clock') => {
    setBusy('mode');
    try {
      await api(`${base}/mode`, { method: 'POST', body: { mode } });
      await qc.invalidateQueries({ queryKey: [school?.id, 'screens'] });
    } catch (err) {
      setMessage(errorText(err, 'Değiştirilemedi'));
    } finally {
      setBusy(null);
    }
  };

  if (!s) {
    return (
      <Screen back title="Pano">
        {screens.isLoading ? <Loading /> : <Empty icon="tv-outline" title="Pano bulunamadı" />}
      </Screen>
    );
  }
  const live = s.live;
  const paused = pausedNow ?? Boolean(live?.paused);
  const previewUrl = preview.data ? `${session.server}/display/?preview=${encodeURIComponent(preview.data.token)}&screen=${s.id}&embed=1` : null;

  return (
    <Screen
      back
      title={s.name}
      subtitle={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Icon name="point" size={16} color={s.online ? colors.success : colors.warning} />
          <T size={12} weight="600" color={s.online ? colors.success : colors.warning}>
            {s.online ? 'Canlı' : `Çevrimdışı · ${s.lastSeenAt ? `son görülme ${timeAgo(s.lastSeenAt)}` : 'hiç bağlanmadı'}`}
          </T>
        </View>
      }
    >
      {previewUrl ? <BoardPreview url={previewUrl} portrait={s.display.orientation === 'portrait'} /> : <Loading />}

      {remote && (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T size={12} color={colors.muted}>
              {live ? (live.sleeping ? 'Uyku modunda' : `Şu an gösterilen · ${live.slideCount ? live.slideIndex + 1 : 0} / ${live.slideCount}`) : 'Pano durumu bekleniyor'}
            </T>
            <T weight="700" lines={1}>
              {live?.slideTitle ?? '—'}
            </T>
          </View>
          <RoundButton icon="play-skip-back" label="Önceki" onPress={() => void command('prev')} disabled={!s.online} />
          <RoundButton
            icon={paused ? 'play' : 'pause'}
            label={paused ? 'Sürdür' : 'Bu içerikte durdur'}
            primary
            onPress={() => void command(paused ? 'resume' : 'pause')}
            disabled={!s.online}
          />
          <RoundButton icon="play-skip-forward" label="Sonraki" onPress={() => void command('next')} disabled={!s.online} />
        </Card>
      )}
      {message && (
        <T size={13} color={colors.muted} style={{ textAlign: 'center' }}>
          {message}
        </T>
      )}

      {remote && (
        <>
          <SectionTitle>Ekran modu</SectionTitle>
          <Choice
            value={s.display.mode}
            onChange={(m) => void setMode(m)}
            options={[
              { value: 'board', label: 'Normal pano' },
              { value: 'slides', label: 'Sadece duyuru' },
              { value: 'clock', label: 'Tam ekran saat' },
            ]}
            columns={3}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button variant="secondary" size="sm" style={{ flex: 1 }} icon="refresh" loading={busy === 'reload'} onPress={() => void command('reload', 'Pano yenilendi')}>
              Yenile
            </Button>
            {live?.sleeping ? (
              <Button variant="secondary" size="sm" style={{ flex: 1 }} icon="sunny-outline" loading={busy === 'wake'} onPress={() => void command('wake', 'Pano 2 saatliğine uyandırıldı')}>
                Uyandır
              </Button>
            ) : (
              <Button variant="secondary" size="sm" style={{ flex: 1 }} icon="moon-outline" loading={busy === 'sleep'} onPress={() => void command('sleep', 'Pano uyku moduna alındı')}>
                Uyut
              </Button>
            )}
            <Button variant="secondary" size="sm" style={{ flex: 1 }} icon="eye-outline" loading={busy === 'identify'} onPress={() => void command('identify', 'Panoda 15 saniye adı görünüyor')}>
              Tanımla
            </Button>
          </View>
          <T size={12} color={colors.muted}>
            Uyut: pano ertesi sabaha kadar ekran koruyucuda kalır. Uyandır: uyku saatinde de 2 saat açık tutar.
          </T>
        </>
      )}

      {can('screens.manage') && (
        <Button variant="delete" icon="trash-outline" loading={busy === 'delete'} onPress={() => void remove(s.name)} style={{ marginTop: 8 }}>
          Panoyu sil
        </Button>
      )}
    </Screen>
  );
}

function RoundButton({ icon, label, onPress, primary, disabled }: { icon: IconName; label: string; onPress: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 46,
        height: 46,
        borderRadius: 23,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: primary ? colors.primary : colors.card,
        borderWidth: 1,
        borderColor: primary ? colors.primary : colors.border,
        opacity: disabled ? 0.4 : pressed ? 0.75 : 1,
      })}
    >
      <Icon name={icon} size={20} color={primary ? colors.onPrimary : colors.ink} />
    </Pressable>
  );
}
