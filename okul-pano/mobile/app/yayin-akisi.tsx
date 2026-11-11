import { Redirect } from 'expo-router';

/** Eski "Yayın akışı" ekranı yeni Duyurular ekranında (bölümler, sıralama, işlem sayfası); eski bağlantılar oraya gider */
export default function YayinAkisi() {
  return <Redirect href="/duyurular" />;
}
