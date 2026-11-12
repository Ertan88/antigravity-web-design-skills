import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { apiFile } from './api.ts';

/**
 * Sunucudan PDF indirir. Web sürümünde dosya tarayıcıya iner; telefonda paylaşım menüsü açılır: "Dosyalara kaydet",
 * yazdırma uygulaması, e-posta ya da WhatsApp seçilebilir.
 */
export async function sharePdf(path: string, name: string): Promise<void> {
  const bytes = await apiFile(path);
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const file = new File(Paths.cache, name.replace(/[\\/:*?"<>|]+/g, ' '));
  if (file.exists) file.delete();
  file.create();
  file.write(new Uint8Array(bytes));
  if (!(await Sharing.isAvailableAsync())) throw new Error('Bu cihazda dosya paylaşımı kullanılamıyor.');
  await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: name });
}
