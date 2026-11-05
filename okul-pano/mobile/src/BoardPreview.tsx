import { View } from 'react-native';
import { WebView } from 'react-native-webview';

/** Panonun canlı önizlemesi (telefonda): panonun kendisi küçültülmüş olarak, yalnızca görüntü */
export function BoardPreview({ url, portrait }: { url: string; portrait?: boolean }) {
  return (
    <View style={{ aspectRatio: portrait ? 9 / 16 : 16 / 9, borderRadius: 14, overflow: 'hidden', backgroundColor: '#0b1220' }} pointerEvents="none">
      <WebView source={{ uri: url }} style={{ flex: 1, backgroundColor: '#0b1220' }} scrollEnabled={false} javaScriptEnabled domStorageEnabled mediaPlaybackRequiresUserAction />
    </View>
  );
}
