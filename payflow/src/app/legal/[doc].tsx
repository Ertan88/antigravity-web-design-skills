import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { legalDoc, LegalDocId, legalHasPlaceholders, legalUrl } from '../../legal';
import { useTheme } from '../../theme/ThemeProvider';
import { fonts } from '../../theme/tokens';
import { AppText, IconButton } from '../../ui/primitives';

const IDS: LegalDocId[] = ['privacy', 'terms'];

/** Gizlilik Politikası / Kullanım Koşulları — çevrimdışı okunabilir. */
export default function LegalScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ doc?: string }>();
  const id: LegalDocId = IDS.includes(params.doc as LegalDocId) ? (params.doc as LegalDocId) : 'privacy';
  const doc = useMemo(() => legalDoc(id), [id]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: palette.bg }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: insets.bottom + 32, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconButton icon="back" label="Geri" onPress={() => router.back()} />
        <AppText variant="heading" accessibilityRole="header" style={{ flex: 1 }}>
          {doc.title}
        </AppText>
      </View>
      {legalHasPlaceholders() ? (
        <View style={{ backgroundColor: palette.warnBg, borderRadius: 12, padding: 12 }}>
          <AppText variant="caption" color={palette.warn}>
            Taslak: geliştirici bilgileri henüz doldurulmadı.
          </AppText>
        </View>
      ) : null}
      <AppText variant="body" style={{ lineHeight: 22 }}>
        {doc.intro}
      </AppText>
      {doc.sections.map((s) => (
        <View key={s.id} style={{ gap: 8 }}>
          <AppText variant="heading" accessibilityRole="header">
            {s.heading}
          </AppText>
          {s.blocks.map((b, i) =>
            'p' in b ? (
              <AppText key={i} variant="body" muted style={{ lineHeight: 22 }}>
                {b.p}
              </AppText>
            ) : (
              <View key={i} style={{ gap: 6 }}>
                {b.ul.map((li) => (
                  <View key={li} style={{ flexDirection: 'row', gap: 8 }}>
                    <AppText variant="body" color={palette.accent}>
                      •
                    </AppText>
                    <AppText variant="body" muted style={{ flex: 1, lineHeight: 22 }}>
                      {li}
                    </AppText>
                  </View>
                ))}
              </View>
            ),
          )}
        </View>
      ))}
      <Pressable accessibilityRole="link" onPress={() => Linking.openURL(legalUrl(id))} style={{ paddingVertical: 8 }}>
        <AppText variant="label" color={palette.accent} style={{ fontFamily: fonts.bodyBold }}>
          Web'de aç
        </AppText>
      </Pressable>
    </ScrollView>
  );
}
