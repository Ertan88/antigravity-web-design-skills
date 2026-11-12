# Okul Yayın Pano: TV uygulaması

TV'de panoyu tam ekran açan küçük Android TV uygulaması (`tv/`). Pano sayfasının kendisi sunucudadır; uygulama
onu kesintisiz ve kumandayla çıkılamaz biçimde açık tutar. Pano güncellendiğinde uygulamayı güncellemek gerekmez.

## Kurulum (Android TV / Google TV)

1. TV'nin uygulama mağazasından **Downloader** uygulamasını kurun.
2. TV ayarlarında Downloader için **bilinmeyen kaynaklardan yükleme** iznini açın.
3. Downloader'a sunucunuzun kısa adresini yazın: `okul-pano.onrender.com/tv` (kendi alan adınız varsa `alanadi/tv`).
4. İnen **Okul Yayın Pano**'yu kurup açın.
5. İlk açılışta "Açılışta kendiliğinden başlasın mı?" sorusuna **İzin ver** deyin ve açılan ekranda uygulamanın
   iznini açın (Geri ile dönün).
6. Ekranda çıkan 6 haneli kodu telefonda **Panolar › QR okut** ile ya da panelde **Panolar › Pano ekle** ile girin.
7. Panelde **Panolar › Pano ayarları › TV uygulaması** bölümünden bir **gizli ayarlar şifresi** belirleyin.

TV'nin kendi ayarlarında **otomatik bekleme / enerji tasarrufu** kapatılmalı, açılış-kapanış için TV'nin
zamanlayıcısı kullanılmalıdır (uygulama ekranı kapatamaz; panonun gece modu ekranı karartır).

## Gizli ayarlar

Kumandada **OK** tuşuna 5 saniye basılı tutun ya da **Geri**'ye 3 saniye içinde 5 kez basın. Şifre belirlendiyse
sorulur (şifre: panel › Panolar › Görünüm ve Akış › TV uygulaması). Seçenekler: panoyu yenile, bağlantı testi,
sunucu adresi, eşleştirmeyi sıfırla, açılışta başlat, ana ekran uygulaması, panoya geri dönüş, kiosk modu,
TV ayarlarını aç (bakım için; pano 15 dakika sonra geri gelir), uygulama bilgisi, uygulamadan çık.

## Panodan çıkılmasın

- **Panoya geri dönüş** (varsayılan açık): Ana ekran ya da kaynak tuşuyla panodan çıkılırsa pano 2 dakika sonra
  kendiliğinden geri gelir. Android 10 ve sonrasında "diğer uygulamaların üzerinde göster" izni gerekir (menüde
  "izin gerekli" yazar). Gizli ayarlardan "Uygulamadan çık" seçilirse geri gelmez.
- **Kiosk modu** (en sağlam yol): Ana ekran ve son uygulamalar tuşları panodan hiç çıkaramaz. Bir bilgisayardan
  bir kez açılır; aşağıya bakın.

## Kiosk modu (bilgisayardan bir kez)

Gerekenler: TV ile aynı ağda bir bilgisayar ve Google'ın "SDK Platform Tools" paketi (adb). Paket
developer.android.com/tools/releases/platform-tools adresinden indirilir, kurulum gerektirmez.

1. **TV'de geliştirici seçeneklerini açın:** Ayarlar › Sistem (ya da Cihaz Tercihleri) › Hakkında › **Android TV
   işletim sistemi derlemesi**'ne 7 kez basın.
2. **Hata ayıklamayı açın:** Ayarlar › Sistem › Geliştirici seçenekleri › **USB hata ayıklama** (ve varsa **Kablosuz /
   ağ hata ayıklama**). TV'nin IP adresi Ayarlar › Ağ ve İnternet › bağlı ağın ayrıntılarında yazar.
3. **TV'deki hesapları kaldırın:** Ayarlar › Hesaplar bölümünde Google hesabı varsa kaldırın. Android, hesap varken
   uygulamayı cihaz sahibi yapmaya izin vermez. (Kiosk açıldıktan sonra hesap yeniden eklenebilir.)
4. **Bilgisayarda** Platform Tools klasöründe bir komut penceresi açıp:
   ```
   adb connect TV_IP_ADRESI
   adb shell dpm set-device-owner com.okulyayin.pano/.AdminReceiver
   ```
   İlk bağlantıda TV ekranında "hata ayıklamaya izin verilsin mi?" sorusu çıkar; **İzin ver**'i seçin.
   "Success: Device owner set to package" yazısı kiosk modunun açıldığını gösterir.
5. Panoyu açın: gizli ayarlarda "Kiosk modu: Açık" yazar. Ana ekran tuşu artık panodan çıkaramaz.

Sık hatalar:
- `Not allowed to set the device owner because there are already some accounts on the device`: 3. adımı yapın.
- `... already several users on the device`: TV'de ikinci bir kullanıcı ya da misafir profili vardır; kaldırın.
- `device unauthorized`: TV ekranındaki izin sorusunu onaylayın, sonra komutu yeniden çalıştırın.

**Kapatmak:** gizli ayarlar (şifreyle) › Kiosk modu › Kapat. Kiosk açıkken uygulama kaldırılamaz; önce kapatılır.
Bakım için TV ayarlarına "TV ayarlarını aç" ile gidilir; pano 15 dakika sonra kendiliğinden geri gelir.

## Açılışta başlamıyorsa

Android 10 ve sonrası uygulamaların kendiliğinden açılmasını kısıtlar. Sırayla:

1. Gizli ayarlar › **Açılışta başlat**: "izin gerekli" yazıyorsa izni verin.
2. TV izni menüde göstermiyorsa gizli ayarlar › **Ana ekran uygulaması**'nı açın; Ana ekran tuşuna basınca
   "Okul Yayın Pano" ve "Her zaman"ı seçin.
3. O da olmuyorsa aynı ağdaki bir bilgisayardan bir kez:
   `adb shell appops set com.okulyayin.pano SYSTEM_ALERT_WINDOW allow`

## Derleme ve imza

GitHub Actions › **Okul Pano · TV uygulaması** APK'yı derler ve Releases › `okul-pano-tv` sürümüne yükler.

- Varsayılan sunucu: Actions değişkeni `PANOKUL_API_URL` (yoksa `https://okul-pano.onrender.com`). TV'de gizli
  ayarlardan değiştirilebilir.
- İmza: `TV_KEYSTORE_BASE64`, `TV_KEYSTORE_PASSWORD`, `TV_KEY_ALIAS`, `TV_KEY_PASSWORD` gizli değişkenleri
  tanımlıysa kalıcı anahtarla; yoksa depodaki geliştirme anahtarıyla (`tv/keystore/pano-dev.keystore`) imzalanır.
  Okullara dağıtmadan önce kalıcı anahtar tanımlayın: anahtar değişirse TV'lerde uygulamanın kaldırılıp yeniden
  kurulması gerekir.
- Sunucudaki `/tv` adresi `TV_APK_URL` ortam değişkenine yönlendirir.
