import { useState } from 'react';
import { Platform, Pressable, Switch, View } from 'react-native';
import { sendTestNotification } from '../src/push.ts';
import { useReminderSettings, type ReminderSettings } from '../src/reminders.ts';
import { Text } from '../src/text.tsx';
import { colors, tiles, type TileTone } from '../src/theme.ts';
import { Button, Card, Icon, Loading, Screen, switchColors, T, type IconName } from '../src/ui.tsx';

/*
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
  const [test, setTest] = useState<string | null>(null);
  if (!s) {
    return (
      <Screen back title="Nöbet hatırlatmaları">
        <Loading />
      </Screen>
    );
  }
  const set = <K extends Key>(key: K, patch: Partial<ReminderSettings[K]>) => save({ ...s, [key]: { ...s[key], ...patch } });

  return (
    <Screen back title="Nöbet hatırlatmaları" subtitle="Telefonunuza bildirim olarak gelir">
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
    </Screen>
  );
}
