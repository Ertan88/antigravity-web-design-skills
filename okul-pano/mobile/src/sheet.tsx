import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from './theme.ts';

/** Alttan açılan sayfa (klavye açılınca yukarı kalkar) */
export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
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
