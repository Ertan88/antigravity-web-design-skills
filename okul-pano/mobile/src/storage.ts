import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/** Oturum bilgisi: telefonda şifreli depoda, web önizlemesinde tarayıcı deposunda */
export const storage = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    }
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string | null): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      } catch {
        /* gizli pencere */
      }
      return;
    }
    if (value === null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  },
};
