import { Redirect } from 'expo-router';

/** Eski "Kullanıcı ekle" bağlantısı: hesaplar artık tek "Hesap aç" ekranından açılır */
export default function Yeni() {
  return <Redirect href="/hesap-ac" />;
}
