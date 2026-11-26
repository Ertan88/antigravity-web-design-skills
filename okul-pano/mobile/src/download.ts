import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { apiFile } from './api.ts';

/**
 * Sunucudan PDF indirir. Web sürümünde dosya tarayıcıya iner; telefonda paylaşım menüsü açılır: "Dosyalara kaydet",
 * yazdırma uygulaması, e-posta ya da WhatsApp seçilebilir.
 */
export async function sharePdf(path: string, name: string): Promise<void> {
  await shareFile(path, name, 'application/pdf', 'com.adobe.pdf');
}

/** Sunucudan dosya indirir; web sürümünde tarayıcıya iner, telefonda paylaşım menüsü açılır ("Dosyalara kaydet") */
export async function shareFile(path: string, name: string, mimeType: string, UTI?: string): Promise<void> {
  const bytes = await apiFile(path);
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
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
  await Sharing.shareAsync(file.uri, { mimeType, UTI, dialogTitle: name });
}

/**
 * Sunucudan PDF'i alıp telefonun yazdırma penceresini açar (yazıcı seçilir; "PDF olarak kaydet" de buradadır).
 * Web sürümünde PDF yeni sekmede açılır; yazdırma oradan yapılır.
 */
export async function printPdf(path: string): Promise<void> {
  const bytes = await apiFile(path);
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  const file = new File(Paths.cache, 'yazdir.pdf');
  if (file.exists) file.delete();
  file.create();
  file.write(new Uint8Array(bytes));
  await Print.printAsync({ uri: file.uri });
}
