import { useCallback, useEffect, useRef, type ComponentRef, type ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from './theme.ts';
import { FocusRevealContext, revealFocused } from './ui.tsx';

/** Alttan açılan sayfa (klavye açılınca yukarı kalkar) */
export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      {/* Android'de de: kenardan kenara çizimde pencere klavyeyle küçülmez, sayfa klavyenin üstüne kendisi kalkar */}
      <KeyboardAvoidingView behavior="padding" enabled={Platform.OS !== 'web'} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityLabel="Kapat"
          onPress={onClose}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.35)',
          }}
        />
        <View
          style={{
            backgroundColor: colors.card,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingHorizontal: 16,
            paddingTop: 10,
            paddingBottom: 18 + insets.bottom,
            maxHeight: '85%',
          }}
        >
          <View
            style={{
              width: 40,
              height: 5,
              borderRadius: 3,
              backgroundColor: colors.borderStrong,
              alignSelf: 'center',
              marginBottom: 10,
            }}
          />
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * Alttan açılan sayfanın içindeki form alanı: yer kalmazsa küçülür (klavye açılınca sayfa taşmaz) ve odaktaki
 * yazı kutusunu klavyenin üstünde gösterir ("İleri" ile kutudan kutuya geçerken de).
 */
export function SheetScroll({ children, style, contentContainerStyle }: { children: ReactNode; style?: StyleProp<ViewStyle>; contentContainerStyle?: StyleProp<ViewStyle> }) {
  const ref = useRef<ComponentRef<typeof ScrollView>>(null);
  const height = useRef(0);
  const offset = useRef(0);
  const reveal = useCallback(() => {
    setTimeout(() => revealFocused(ref.current, height.current, offset.current, 32), 150);
  }, []);
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', reveal);
    return () => sub.remove();
  }, [reveal]);
  return (
    <FocusRevealContext.Provider value={reveal}>
      <ScrollView
        ref={ref}
        style={[{ flexShrink: 1 }, style]}
        contentContainerStyle={contentContainerStyle}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={50}
        onLayout={(e) => (height.current = e.nativeEvent.layout.height)}
        onScroll={(e) => (offset.current = e.nativeEvent.contentOffset.y)}
      >
        {children}
      </ScrollView>
    </FocusRevealContext.Provider>
  );
}
