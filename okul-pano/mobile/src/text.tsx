import { createContext, useContext, type ComponentProps } from 'react';
import { StyleSheet, Text as RNText, TextInput as RNTextInput, type TextProps, type TextStyle } from 'react-native';

/**
 * Uygulamanın yazı tipi (Plus Jakarta Sans). Her kalınlık ayrı bir dosya olarak yüklenir; Text ve TextInput
 * stildeki fontWeight'e göre doğru dosyayı seçer, böylece telefon yapay kalınlaştırma yapmaz.
 */
export const FONT_FILES = {
  '400': 'PlusJakartaSans_400Regular',
  '500': 'PlusJakartaSans_500Medium',
  '600': 'PlusJakartaSans_600SemiBold',
  '700': 'PlusJakartaSans_700Bold',
  '800': 'PlusJakartaSans_800ExtraBold',
} as const;

type Weight = keyof typeof FONT_FILES;

export function fontFor(weight?: TextStyle['fontWeight']): string {
  const w = weight === 'bold' ? '700' : weight === 'normal' || weight == null ? '400' : String(weight);
  const n = Math.min(800, Math.max(400, Math.round(Number(w) / 100) * 100 || 400));
  return FONT_FILES[String(n) as Weight];
}

function fontStyle(style: TextProps['style'], inherit: boolean) {
  const flat = StyleSheet.flatten(style) ?? {};
  if (flat.fontFamily) return style;
  // İç içe yazıda kalınlık verilmemişse dıştaki yazının yazı tipi aynen devralınır
  if (inherit && flat.fontWeight == null) return style;
  return [style, { fontFamily: fontFor(flat.fontWeight), fontWeight: '400' as const }];
}

/**
 * Baloncuk ve rozet içindeki yazıyı (sayı) dikeyde tam ortalar:
 * - Android'in yazıya eklediği üst / alt boşluk kapatılır (includeFontPadding), yoksa sayı ~%10 aşağı kayar;
 * - satır yüksekliği yazı tipinin gövdesi kadardır (Plus Jakarta Sans: 1,038 + 0,222 = 1,26 em).
 * Tarayıcıda ölçüldü: 20 px baloncukta rakamın merkezi baloncuğun merkezinden 0,1 px'ten az sapar.
 * Kapsayan kutu alignItems / justifyContent 'center' olmalıdır.
 */
export function centeredText(fontSize: number): TextStyle {
  return {
    fontSize,
    lineHeight: Math.round(fontSize * 1.26),
    includeFontPadding: false,
    textAlignVertical: 'center',
    textAlign: 'center',
  };
}

const Nested = createContext(false);

export function Text(props: TextProps) {
  const nested = useContext(Nested);
  const el = <RNText {...props} style={fontStyle(props.style, nested)} />;
  return nested ? el : <Nested.Provider value>{el}</Nested.Provider>;
}

export function TextInput(props: ComponentProps<typeof RNTextInput>) {
  return <RNTextInput {...props} style={fontStyle(props.style, false)} />;
}
