import type { ComponentRef, RefObject } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

/** Ekranın o anki görüntüsü (geçici dosya). Tema geçişinde eski görünüm bununla yeni görünümün üstünde erir */
export function snapshot(view: RefObject<ComponentRef<typeof View> | null>): Promise<string | null> {
  return captureRef(view, { format: 'jpg', quality: 0.92, result: 'tmpfile' }).catch(() => null);
}
