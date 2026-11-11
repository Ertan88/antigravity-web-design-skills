// Tabler simgeleri tek tek içe aktarılır (@tabler/icons-react-native/IconTrash); paket bu yollar için tür vermiyor
declare module '@tabler/icons-react-native/*' {
  import type { ComponentType } from 'react';
  import type { SvgProps } from 'react-native-svg';
  const Icon: ComponentType<SvgProps & { size?: number | string; strokeWidth?: number | string; color?: string; title?: string }>;
  export default Icon;
}
