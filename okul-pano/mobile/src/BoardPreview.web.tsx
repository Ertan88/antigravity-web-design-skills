import { View } from 'react-native';

/** Panonun canlı önizlemesi (web sürümü): iframe */
export function BoardPreview({ url, portrait }: { url: string; portrait?: boolean }) {
  return (
    <View style={{ aspectRatio: portrait ? 9 / 16 : 16 / 9, borderRadius: 14, overflow: 'hidden', backgroundColor: '#0b1220' }}>
      <iframe src={url} title="Pano önizlemesi" style={{ width: '100%', height: '100%', border: 0, pointerEvents: 'none' }} />
    </View>
  );
}
