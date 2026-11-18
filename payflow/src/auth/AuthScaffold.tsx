import { ReactNode, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, TextInputProps, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { fonts, radius } from '../theme/tokens';
import { Icon } from '../ui/icons';
import { AppText } from '../ui/primitives';

export function AuthScaffold({ children }: { children: ReactNode }) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: palette.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, paddingHorizontal: 24, gap: 20 }}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function BrandMark() {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: palette.button, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="logo" size={26} color={palette.onButton} strokeWidth={2.2} />
      </View>
      <AppText variant="title" style={{ fontSize: 26 }}>
        PayFlow
      </AppText>
    </View>
  );
}

/** Tasarımdaki etiketli giriş alanı; şifre alanında göster/gizle düğmesi. */
export function AuthField({
  label,
  error,
  secure,
  ...input
}: TextInputProps & { label: string; error?: string | null; secure?: boolean }) {
  const { palette } = useTheme();
  const [hidden, setHidden] = useState(true);
  return (
    <View style={{ gap: 6 }}>
      <AppText variant="label" muted>
        {label}
      </AppText>
      <View style={{ justifyContent: 'center' }}>
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={palette.muted}
          secureTextEntry={secure && hidden}
          autoCapitalize="none"
          {...input}
          style={{
            height: 50,
            borderRadius: radius.md,
            borderWidth: error ? 1.5 : 1,
            borderColor: error ? palette.danger : palette.line,
            backgroundColor: palette.surface,
            color: palette.text,
            paddingLeft: 16,
            paddingRight: secure ? 52 : 16,
            fontFamily: fonts.bodyMedium,
            fontSize: 15,
          }}
        />
        {secure ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Şifreyi göster' : 'Şifreyi gizle'}
            onPress={() => setHidden((h) => !h)}
            style={{ position: 'absolute', right: 4, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="eye" size={20} color={palette.muted} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <AppText variant="caption" color={palette.danger}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

export function OrDivider() {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: palette.line }} />
      <AppText variant="caption" muted>
        veya
      </AppText>
      <View style={{ flex: 1, height: 1, backgroundColor: palette.line }} />
    </View>
  );
}

export function FormError({ message }: { message: string | null }) {
  const { palette } = useTheme();
  if (!message) return null;
  return (
    <View accessibilityLiveRegion="polite" style={{ backgroundColor: palette.dangerBg, borderRadius: 12, padding: 12 }}>
      <AppText variant="label" color={palette.danger}>
        {message}
      </AppText>
    </View>
  );
}
