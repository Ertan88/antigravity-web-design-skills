import { useEffect, useState } from 'react';
import { useAuth } from '../src/auth.tsx';
import { Platform, Pressable, Switch, View } from 'react-native';
import { showTestNotices } from '../src/inAppNotice.tsx';
import { deviceToken, isMuted, mutePush, PUSH_TEXT, pushStatus, registerForPush, sendTestNotification, setMuted, type PushState } from '../src/push.ts';
import { deviceAccount } from '../src/api.ts';
import { AccountKind } from '../src/accountsSheet.tsx';
import { useReminderSettings, type ReminderSettings } from '../src/reminders.ts';
import { Text } from '../src/text.tsx';
import { colors, tiles, type TileTone } from '../src/theme.ts';
import { Badge, Button, Card, Icon, Label, ListRow, Loading, Screen, switchColors, T, type IconName } from '../src/ui.tsx';

/*
 * Bildirim ayarları: telefon bildirimleri (aç / kapat) ve nöbet hatırlatmaları tek sayfada.
 * Nöbet hatırlatmaları: her biri ayrı açılır, saatleri seçilir. Bildirimleri uygulama telefonun kendisinde kurar
 * (internet gerekmez); ayarlar bu telefonda saklanır.
 */

type Key = keyof ReminderSettings;
interface Row {
  key: Key;
  icon: IconName;
  tone: TileTone;
  title: string;
  text: string;
  choices?: { label: string; value: string | number }[];
  field?: 'time' | 'before';
}

const ROWS: Row[] = [
  {
    key: 'evening',
    icon: 'moon-outline',
    tone: 'sun',
    title: 'Akşamdan haber ver',
    text: '"Yarın nöbetçisiniz · 2. Kat"',
    field: 'time',
    choices: [
      { label: '19:00', value: '19:00' },
      { label: '20:00', value: '20:00' },
      { label: '21:00', value: '21:00' },
    ],
  },
  {
    key: 'morning',
    icon: 'sunny-outline',
    tone: 'peach',
    title: 'Nöbet sabahı',
    text: 'İlk dersten önce; nöbet yeri ve birlikte nöbetçiler',
    field: 'before',
    choices: [
      { label: '30 dk önce', value: 30 },
      { label: '15 dk önce', value: 15 },
      { label: 'Ders başında', value: 0 },
    ],
  },
  { key: 'breaks', icon: 'notifications-outline', tone: 'mint', title: 'Teneffüs başında', text: 'Nöbet günü her teneffüste kısa bir bildirim' },
  { key: 'transport', icon: 'restaurant-outline', tone: 'lilac', title: 'Öğle ve taşımalı nöbeti', text: 'Taşımalı görev günü öğle arasından ve servis saatinden 10 dk önce' },
  { key: 'logbook', icon: 'signature', tone: 'rose', title: 'Gün sonu: nöbet defteri', text: 'Son dersten sonra "Nöbet defterini imzalamayı unutmayın"' },
];

export default function Hatirlatmalar() {
  const [s, save] = useReminderSettings();
  const { isTeacher, me, accounts } = useAuth();
  // Bu telefonda kayıtlı diğer hesaplar: her birinin bildirimi ayrı açılır / kapanır
  const others = accounts.filter((a) => a.userId !== me?.user.id);
  const [otherOn, setOtherOn] = useState<Record<string, boolean>>({});
  const [otherError, setOtherError] = useState<string | null>(null);
  useEffect(() => {
    void Promise.all(others.map(async (a) => [a.userId, !(await isMuted(a.userId))] as const)).then((rows) => setOtherOn(Object.fromEntries(rows)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.length, me?.user.id]);
  const toggleOther = async (userId: string, on: boolean) => {
    const a = others.find((x) => x.userId === userId);
    if (!a) return;
    setOtherError(null);
    setOtherOn((m) => ({ ...m, [userId]: on }));
    try {
      const token = await deviceToken();
      if (a.refresh && token) await deviceAccount(a.server, a.refresh, on ? 'link' : 'unlink', token);
      await setMuted(userId, !on);
    } catch {
      setOtherOn((m) => ({ ...m, [userId]: !on }));
      setOtherError('Kaydedilemedi: internet bağlantınızı kontrol edip yeniden deneyin.');
    }
  };
  const [test, setTest] = useState<string | null>(null);
  const [push, setPush] = useState<PushState | 'error' | null>(null);
  // Sayfaya her girişte telefonun gerçek izin durumu okunur
  useEffect(() => {
    void pushStatus().then(setPush).catch(() => undefined);
  }, []);
  if (!s) {
    return (
      <Screen back title="Bildirim ayarları">
        <Loading />
      </Screen>
    );
  }
  const set = <K extends Key>(key: K, patch: Partial<ReminderSettings[K]>) => save({ ...s, [key]: { ...s[key], ...patch } });

  return (
    <Screen back title="Bildirim ayarları">
      {Platform.OS !== 'web' && (
        <Card style={{ paddingVertical: 4, gap: 0 }}>
          <ListRow
            tile={{ icon: 'phone-portrait-outline', tone: 'sky' }}
            title="Telefon bildirimleri"
            subtitle={push === 'error' ? 'Kaydedilemedi: internet bağlantınızı kontrol edip yeniden deneyin.' : push ? PUSH_TEXT[push] : undefined}
            right={push === 'ok' || push === 'local' ? <Badge tone="success">Açık</Badge> : push === 'off' || push === 'denied' ? <Badge tone="warning">Kapalı</Badge> : undefined}
            // Açıkken dokunmak kapatır, kapalıyken açar
            onPress={() =>
              void (push === 'ok' || push === 'local' ? mutePush().then(() => setPush('off')) : registerForPush().then((r) => setPush(r === 'denied' ? 'denied' : r))).catch(() =>
                setPush('error'),
              )
            }
            last
          />
        </Card>
      )}
      {Platform.OS !== 'web' && others.length > 0 && (
        <>
          <Label>Bu telefondaki diğer hesaplar</Label>
          <Card style={{ paddingVertical: 4, gap: 0 }}>
            {others.map((a, i) => (
              <View key={a.userId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.divider }}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink, flexShrink: 1 }} numberOfLines={1}>
                      {a.fullName}
                    </Text>
                    <AccountKind kind={a.kind} />
                  </View>
                  <T size={12.5} color={colors.muted} lines={1}>
                    {!a.refresh ? 'Oturum kapalı: bildirim için bu hesaba bir kez şifreyle girin' : otherOn[a.userId] === false ? 'Bildirimleri bu telefona gelmiyor' : 'Bildirimleri bu telefona da gelir'}
                  </T>
                </View>
                <Switch
                  accessibilityLabel={`${a.fullName} bildirimleri`}
                  value={Boolean(a.refresh) && otherOn[a.userId] !== false}
                  disabled={!a.refresh}
                  onValueChange={(v) => void toggleOther(a.userId, v)}
                  {...switchColors()}
                />
              </View>
            ))}
          </Card>
          {otherError && (
            <T size={13} color={colors.danger}>
              {otherError}
            </T>
          )}
        </>
      )}
      {isTeacher && <Label>Nöbet hatırlatmaları</Label>}
      {isTeacher && (
      <Card style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
        {ROWS.map((r, i) => {
          const on = s[r.key].on;
          const value = r.field ? (s[r.key] as unknown as Record<string, string | number>)[r.field] : undefined;
          return (
            <View key={r.key} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: colors.divider, paddingVertical: 13, paddingHorizontal: 14, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: tiles[r.tone].bg, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={r.icon} size={21} color={tiles[r.tone].fg} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink }}>{r.title}</Text>
                  <Text style={{ fontSize: 12.5, color: colors.faint, marginTop: 1, lineHeight: 17 }}>{r.text}</Text>
                </View>
                <Switch
                  accessibilityLabel={r.title}
                  value={on}
                  onValueChange={(v) => set(r.key, { on: v } as never)}
                  {...switchColors()}
                />
              </View>
              {on && r.choices && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingLeft: 54 }}>
                  {r.choices.map((c) => {
                    const sel = c.value === value;
                    return (
                      <Pressable
                        key={String(c.value)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: sel }}
                        onPress={() => set(r.key, { [r.field!]: c.value } as never)}
                        style={{ paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: sel ? colors.ink : colors.border, backgroundColor: sel ? colors.ink : colors.card }}
                      >
                        <Text style={{ fontSize: 12.5, fontWeight: '700', color: sel ? colors.onPrimary : colors.muted }}>{c.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}
      </Card>
      )}
      <T size={12.5} color={colors.faint} style={{ lineHeight: 18 }}>
        Değişiklik bildirimleri her zaman açıktır: yerinize birisi görevlendirildiğinde, size yeni görev verildiğinde ya da nöbet çizelgesi değiştiğinde haber verilir.
        Hatırlatmalar bu telefonda kurulur; internet olmasa da gelir.
      </T>
      {Platform.OS === 'web' ? (
        <T size={13} color={colors.muted}>
          Hatırlatmalar telefondaki Okul Yayın uygulamasında çalışır.
        </T>
      ) : (
        <>
          <Button
            variant="secondary"
            icon="notifications-outline"
            onPress={() =>
              void sendTestNotification().then((r) =>
                setTest(r === 'ok' ? 'Deneme bildirimi birkaç saniye içinde gelecek.' : r === 'denied' ? 'Bildirim izni verilmedi: telefon ayarlarından Okul Yayın için bildirimleri açın.' : 'Bu cihazda kullanılamıyor.'),
              )
            }
          >
            Deneme bildirimi gönder
          </Button>
          {test && (
            <T size={13} color={colors.muted} style={{ textAlign: 'center' }}>
              {test}
            </T>
          )}
        </>
      )}
      {/* Uygulama açıkken üstten inen kutular: yalnızca bu telefonda, sunucuya ve başkalarına hiçbir şey gitmez */}
      <Button variant="secondary" icon="notifications-outline" onPress={showTestNotices}>
        Uygulama içi kutuyu dene
      </Button>
      <T size={12.5} color={colors.faint} style={{ textAlign: 'center' }}>
        Uygulama açıkken gelen bildirimlerin görünümü: sıradan, iş isteyen ve acil durum kutuları sırayla gelir. Yalnızca bu telefonda görünür.
      </T>
    </Screen>
  );
}
