import type { ComponentRef, RefObject } from 'react';
import type { View } from 'react-native';

/** Web'de ekran görüntüsü alınmaz (tema geçişi eski yolla yapılır) */
export function snapshot(_view: RefObject<ComponentRef<typeof View> | null>): Promise<string | null> {
  return Promise.resolve(null);
}
