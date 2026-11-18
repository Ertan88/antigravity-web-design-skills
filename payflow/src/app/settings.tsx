import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { biometricsAvailable } from '../auth/AppLock';
import { useAuth } from '../auth/AuthProvider';
import { useCloudSync } from '../auth/CloudSync';
import { useNotifications } from '../notifications/NotificationsProvider';
import { useStore } from '../store/StoreProvider';
import { ThemeMode, useTheme } from '../theme/ThemeProvider';
import { fonts } from '../theme/tokens';
import { ChoiceChip, SectionLabel, TextField, ToggleRow } from '../ui/form';
import { AnyIconKey, Icon } from '../ui/icons';
import { AppText, IconButton, Surface } from '../ui/primitives';

const timeFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function SettingsScreen() {
  const { palette, mode, setMode } = useTheme();
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useStore();
  const { status, user, available, signOut } = useAuth();
  const sync = useCloudSync();
  const { permission } = useNotifications();
  const [bio, setBio] = useState(false);
  const [member, setMember] = useState('');
  const members = state.settings.household?.members ?? [];
  const setMembers = (m: string[]) => dispatch({ type: 'settings/update', settings: { household: { members: m } } });
  const addMember = () => {
    const n = member.trim();
    if (!n || n === 'Ben' || members.includes(n)) return;
    setMembers([...members, n]);
    setMember('');
  };

  useEffect(() => {
    biometricsAvailable().then(setBio);
  }, []);

  const doSignOut = () =>
    Alert.alert('Çıkış yap', 'Bu cihazdaki veriler ne olsun? Bulutta yedeğin duruyor.', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Verileri tut', onPress: () => signOut() },
      {
        text: 'Sil ve çık',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          dispatch({ type: 'reset' });
        },
      },
    ]);

  const syncText =
    sync.status === 'saving' ? 'Kaydediliyor…' : sync.status === 'checking' ? 'Kontrol ediliyor…' : sync.status === 'error' ? 'Yedeklenemedi — bağlantı gelince tekrar denenecek' : sync.lastSyncedAt ? `Son yedek: ${timeFmt.format(new Date(sync.lastSyncedAt))}` : 'Yedeklendi';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: palette.bg }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: insets.bottom + 32, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton icon="back" label="Geri" onPress={() => router.back()} />
        <AppText variant="heading" accessibilityRole="header">
          Ayarlar
        </AppText>
        <View style={{ width: 44 }} />
      </View>

      <SectionLabel>HESAP</SectionLabel>
      <Surface style={{ padding: 16, gap: 10 }}>
        {status === 'signedIn' && user ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center' }}>
                <AppText variant="heading">{(user.displayName || user.email || '?').charAt(0).toLocaleUpperCase('tr-TR')}</AppText>
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong">{user.displayName || 'PayFlow kullanıcısı'}</AppText>
                <AppText variant="caption" muted>
                  {user.email} · {user.provider === 'google' ? 'Google' : 'E-posta'}
                </AppText>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name={sync.status === 'error' ? 'alert' : 'check'} size={16} color={sync.status === 'error' ? palette.danger : palette.accent} />
              <AppText variant="caption" muted>
                Bulut yedek · {syncText}
              </AppText>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Pressable accessibilityRole="button" onPress={doSignOut} style={{ paddingVertical: 6 }}>
                <AppText variant="label" color={palette.danger}>
                  Çıkış yap
                </AppText>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => router.push('/delete-account')} style={{ paddingVertical: 6 }}>
                <AppText variant="label" muted>
                  Hesabımı sil
                </AppText>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <AppText variant="bodyStrong">Hesapsız kullanıyorsun</AppText>
            <AppText variant="label" muted style={{ fontFamily: fonts.body }}>
              Verilerin yalnızca bu cihazda. {available ? 'Hesap oluşturursan buluta yedeklenir ve başka telefonda da açılır.' : 'Hesap sistemi henüz bağlanmadı.'}
            </AppText>
            {available ? (
              <Pressable accessibilityRole="button" onPress={() => signOut()} style={{ paddingVertical: 6 }}>
                <AppText variant="label" color={palette.accent}>
                  Hesap oluştur veya giriş yap
                </AppText>
              </Pressable>
            ) : null}
          </>
        )}
      </Surface>

      <SectionLabel>GÖRÜNÜM</SectionLabel>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(
          [
            ['system', 'Sistem'],
            ['dark', 'Koyu'],
            ['light', 'Açık'],
          ] as [ThemeMode, string][]
        ).map(([m, label]) => (
          <ChoiceChip key={m} label={label} selected={mode === m} onPress={() => setMode(m)} />
        ))}
      </View>

      <SectionLabel>GÜVENLİK</SectionLabel>
      <ToggleRow
        title="Face ID / parmak izi kilidi"
        subtitle={bio ? 'Açılışta ve 1 dakikadan uzun arka planda kalınca sorulur' : 'Bu cihazda biyometrik kimlik kurulu değil'}
        value={!!state.settings.appLock}
        onChange={(v) => bio && dispatch({ type: 'settings/update', settings: { appLock: v } })}
      />

      <SectionLabel>EV BÜTÇESİ</SectionLabel>
      <Surface style={{ padding: 14, gap: 10 }}>
        <AppText variant="label" muted style={{ fontFamily: fonts.body }}>
          Faturayı eklerken "Ev bütçesiyle paylaş"ı açarsan, ödendi işaretlerken kimin ödediği sorulur; Raporlar'da kimin kime ne borçlu olduğu çıkar.
        </AppText>
        {members.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {members.map((m) => (
              <Pressable
                key={m}
                accessibilityRole="button"
                accessibilityLabel={`${m}, kaldırmak için basılı tut`}
                onLongPress={() =>
                  Alert.alert(m, 'Ev bütçesinden çıkarılsın mı?', [
                    { text: 'Vazgeç', style: 'cancel' },
                    { text: 'Çıkar', style: 'destructive', onPress: () => setMembers(members.filter((x) => x !== m)) },
                  ])
                }
                style={{ paddingHorizontal: 14, minHeight: 40, borderRadius: 20, backgroundColor: palette.infoBg, justifyContent: 'center' }}
              >
                <AppText variant="label" color={palette.info}>
                  {m}
                </AppText>
              </Pressable>
            ))}
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
          <TextField style={{ flex: 1 }} label="Üye ekle" placeholder="Ör. Ayşe" value={member} onChangeText={setMember} onSubmitEditing={addMember} />
          <Pressable accessibilityRole="button" accessibilityLabel="Üyeyi ekle" onPress={addMember} style={{ height: 50, paddingHorizontal: 16, borderRadius: 14, backgroundColor: palette.button, justifyContent: 'center' }}>
            <AppText variant="bodyStrong" color={palette.onButton}>
              Ekle
            </AppText>
          </Pressable>
        </View>
        <AppText variant="caption" muted>
          Şimdilik bu cihazda tutulur; üyelerin kendi telefonundan ortak görmesi sonraki sürümde.
        </AppText>
      </Surface>

      <SectionLabel>YASAL</SectionLabel>
      <Surface style={{ overflow: 'hidden' }}>
        <Row icon="shield" label="Gizlilik Politikası" onPress={() => router.push('/legal/privacy')} />
        <Row icon="doc" label="KVKK Aydınlatma Metni" onPress={() => router.push('/legal/kvkk')} />
        <Row icon="book" label="Kullanım Koşulları" onPress={() => router.push('/legal/terms')} last />
      </Surface>

      <SectionLabel>DİĞER</SectionLabel>
      <Surface style={{ overflow: 'hidden' }}>
        <Row icon="bell" label="Bildirimler" value={permission === 'granted' ? 'Açık' : 'Kapalı'} onPress={() => router.push('/notifications')} />
        <Row icon="wallet" label="Bakiye ve maaş" onPress={() => router.push('/flow-settings')} />
        <Row icon="doc" label="Kurulumu tekrar göster" onPress={() => router.push('/onboarding')} last />
      </Surface>

      <Pressable
        accessibilityRole="button"
        onPress={() =>
          Alert.alert('Tüm verileri sil', status === 'signedIn' ? 'Bu cihazdaki ve buluttaki tüm kayıtlar silinir.' : 'Bu cihazdaki tüm kayıtlar silinir.', [
            { text: 'Vazgeç', style: 'cancel' },
            { text: 'Sil', style: 'destructive', onPress: () => dispatch({ type: 'reset' }) },
          ])
        }
        style={{ alignSelf: 'center', padding: 12 }}
      >
        <AppText variant="label" color={palette.danger}>
          Tüm verileri sil
        </AppText>
      </Pressable>
    </ScrollView>
  );
}

function Row({ icon, label, value, onPress, last }: { icon: AnyIconKey; label: string; value?: string; onPress: () => void; last?: boolean }) {
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: last ? 0 : 1, borderBottomColor: palette.line }}
    >
      <Icon name={icon} size={20} color={palette.muted} />
      <AppText variant="bodyStrong" style={{ flex: 1 }}>
        {label}
      </AppText>
      {value ? (
        <AppText variant="label" muted>
          {value}
        </AppText>
      ) : null}
      <Icon name="chevronRight" size={18} color={palette.muted} />
    </Pressable>
  );
}
