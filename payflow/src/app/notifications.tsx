import { router } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sameDay } from '../core/dates';
import { openTarget, useNotifications } from '../notifications/NotificationsProvider';
import { buildInbox, InboxItem, InboxStatus } from '../notifications/plan';
import { useStore } from '../store/StoreProvider';
import { useTheme } from '../theme/ThemeProvider';
import { fonts, Palette } from '../theme/tokens';
import { Icon } from '../ui/icons';
import { AppText, Chip, IconButton, PrimaryButton, Surface } from '../ui/primitives';

const timeFmt = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });

function groupLabel(d: Date, now: Date) {
  if (sameDay(d, now)) return 'Bugün';
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameDay(d, y)) return 'Dün';
  return dayFmt.format(d);
}

function statusChip(s: InboxStatus, p: Palette) {
  switch (s) {
    case 'paid':
      return { text: 'Ödendi', fg: p.accent, bg: p.glow };
    case 'logged':
      return { text: 'Girildi', fg: p.accent, bg: p.glow };
    case 'overdue':
      return { text: 'Gecikti', fg: p.danger, bg: p.dangerBg };
    default:
      return { text: 'Bekliyor', fg: p.warn, bg: p.warnBg };
  }
}

/**
 * Bildirim kutusu: yalnızca zamanı gelmiş (gönderilmiş) hatırlatmalar, en yenisi üstte.
 * Dokununca ilgili ödemeye / karta / gelir girişine gider.
 */
export default function NotificationsScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useStore();
  const { permission, request } = useNotifications();
  const now = useMemo(() => new Date(), []);
  const items = useMemo(() => buildInbox(state, now), [state, now]);
  const seenAt = useRef(state.settings.inboxSeenAt);

  // Kutu açıldı: okunmamış rozetini sıfırla (bu oturumda yeni olanlar yine vurgulu kalır).
  useEffect(() => {
    dispatch({ type: 'settings/update', settings: { inboxSeenAt: new Date().toISOString() } });
  }, [dispatch]);

  const groups: { label: string; items: InboxItem[] }[] = [];
  for (const it of items) {
    const label = groupLabel(it.fireAt, now);
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.items.push(it);
    else groups.push({ label, items: [it] });
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: palette.bg }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: insets.bottom + 32, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton icon="back" label="Geri" onPress={() => router.back()} />
        <AppText variant="heading" accessibilityRole="header">
          Bildirimler
        </AppText>
        <View style={{ width: 44 }} />
      </View>

      {permission !== 'granted' && permission !== 'unsupported' ? (
        <Surface style={{ padding: 14, gap: 8 }}>
          <AppText variant="bodyStrong">Hatırlatmalar kapalı</AppText>
          <AppText variant="label" muted style={{ fontFamily: fonts.body }}>
            {permission === 'denied' ? 'Telefonun ayarlarından PayFlow için bildirimlere izin ver.' : 'Son ödeme günlerinde, seçtiğin saatte telefonuna bildirim gelsin.'}
          </AppText>
          <PrimaryButton title={permission === 'denied' ? 'Ayarları aç' : 'Bildirimlere izin ver'} onPress={() => (permission === 'denied' ? Linking.openSettings() : request())} />
        </Surface>
      ) : null}

      {items.length === 0 ? (
        <View style={{ alignItems: 'center', gap: 10, paddingVertical: 48 }}>
          <Icon name="bell" size={32} color={palette.muted} />
          <AppText variant="bodyStrong">Henüz bildirim yok</AppText>
          <AppText variant="label" muted style={{ textAlign: 'center', fontFamily: fonts.body }}>
            Zamanı gelen hatırlatmalar burada birikir. Dokununca ilgili ödemeye gidersin.
          </AppText>
        </View>
      ) : (
        groups.map((g) => (
          <View key={g.label} style={{ gap: 8 }}>
            <AppText variant="label" muted style={{ marginTop: 6 }}>
              {g.label}
            </AppText>
            {g.items.map((it) => {
              const chip = statusChip(it.status, palette);
              const unread = !seenAt.current || it.fireAt.getTime() > new Date(seenAt.current).getTime();
              const icon = it.data.kind === 'card' || it.data.kind === 'statement' ? 'card' : it.data.kind === 'income' ? 'wallet' : 'doc';
              return (
                <Pressable
                  key={it.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${it.title}. ${it.body}. ${chip.text}`}
                  accessibilityHint="İlgili ödemeyi açar"
                  onPress={() => openTarget(it.data)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    gap: 12,
                    backgroundColor: palette.surface,
                    borderRadius: 16,
                    padding: 12,
                    borderWidth: 1,
                    borderColor: unread ? palette.accent : palette.line,
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: chip.bg, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={icon} size={19} color={chip.fg} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                      <AppText variant="bodyStrong" style={{ flex: 1, fontSize: 14 }}>
                        {it.title}
                      </AppText>
                      <AppText variant="caption" muted>
                        {timeFmt.format(it.fireAt)}
                      </AppText>
                    </View>
                    <AppText variant="caption" muted>
                      {it.body}
                    </AppText>
                    <View style={{ marginTop: 4 }}>
                      <Chip text={chip.text} color={chip.fg} background={chip.bg} />
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))
      )}
    </ScrollView>
  );
}
