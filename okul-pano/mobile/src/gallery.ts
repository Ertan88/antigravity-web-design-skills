import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

/**
 * Galeriden fotoğraf seçme izni. Android'de galeri sistemin fotoğraf seçicisiyle açılır ve izin gerekmez: uygulama
 * depolama ya da medya iznini hiç istemez (güvenlik uygulamaları gereksiz izinleri şüpheli sayar). iPhone'da sorulur.
 */
export async function galleryPermission(): Promise<{ granted: boolean }> {
  if (Platform.OS !== 'ios') return { granted: true };
  return ImagePicker.requestMediaLibraryPermissionsAsync();
}
