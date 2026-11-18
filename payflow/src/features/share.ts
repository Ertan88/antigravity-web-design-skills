import { cacheDirectory, writeAsStringAsync } from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import { HealthReport, MonthReport } from '../store/analytics';
import { monthCsv, monthHtml } from '../store/exportReport';

const fileStem = (r: MonthReport) => `PayFlow-${r.month.getFullYear()}-${String(r.month.getMonth() + 1).padStart(2, '0')}`;

async function share(uri: string, mimeType: string, UTI: string) {
  if (!(await Sharing.isAvailableAsync())) {
    Alert.alert('Paylaşım kullanılamıyor', 'Bu cihazda dosya paylaşımı desteklenmiyor.');
    return;
  }
  await Sharing.shareAsync(uri, { mimeType, UTI, dialogTitle: 'Raporu paylaş' });
}

export async function shareMonthPdf(r: MonthReport, h: HealthReport) {
  const { uri } = await Print.printToFileAsync({ html: monthHtml(r, h) });
  await share(uri, 'application/pdf', 'com.adobe.pdf');
}

export async function shareMonthCsv(r: MonthReport) {
  const uri = `${cacheDirectory ?? ''}${fileStem(r)}.csv`;
  await writeAsStringAsync(uri, monthCsv(r));
  await share(uri, 'text/csv', 'public.comma-separated-values-text');
}
