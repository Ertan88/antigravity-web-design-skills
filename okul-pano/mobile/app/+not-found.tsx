import { Redirect } from 'expo-router';

/** Bulunamayan bir ekran açılmaya çalışılırsa İngilizce hata sayfası yerine ana sayfa açılır */
export default function NotFound() {
  return <Redirect href="/" />;
}
