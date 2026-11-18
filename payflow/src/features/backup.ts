import * as DocumentPicker from 'expo-document-picker';
import { cacheDirectory, readAsStringAsync, writeAsStringAsync } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import { Dispatch } from 'react';
import { BackupError, backupFileName, backupSummary, makeBackup, parseBackup } from '../core/backup';
import { AppState } from '../core/model';
import { Action } from '../store/reducer';

/** Tüm verileri tek bir .json dosyasına yazar ve paylaşım menüsünü açar (Drive, iCloud, e-posta…). */
export async function exportBackup(state: AppState) {
  const now = new Date();
  const uri = `${cacheDirectory ?? ''}${backupFileName(now)}`;
  await writeAsStringAsync(uri, makeBackup(state, now));
  if (!(await Sharing.isAvailableAsync())) {
    Alert.alert('Paylaşım kullanılamıyor', 'Bu cihazda dosya paylaşımı desteklenmiyor.');
    return;
  }
  await Sharing.shareAsync(uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Yedeği kaydet' });
}

/** Yedek dosyasını seçtirir, onay alır ve mevcut verilerin yerine yükler. */
export async function importBackup(current: AppState, dispatch: Dispatch<Action>) {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.length) return;
  try {
    const { state, exportedAt } = parseBackup(await readAsStringAsync(res.assets[0].uri));
    Alert.alert(
      'Yedeği geri yükle',
      `${exportedAt.toLocaleDateString('tr-TR')} tarihli yedek: ${backupSummary(state)}.\n\nBu telefondaki mevcut veriler (${backupSummary(current)}) bunlarla değiştirilecek.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Geri yükle', style: 'destructive', onPress: () => dispatch({ type: 'hydrate', state }) },
      ],
    );
  } catch (e) {
    Alert.alert('Yedek yüklenemedi', e instanceof BackupError ? e.message : 'Dosya okunamadı.');
  }
}
