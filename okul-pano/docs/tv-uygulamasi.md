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
sorulur. Seçenekler: panoyu yenile, sunucu adresi, eşleştirmeyi sıfırla, açılışta başlat, ana ekran uygulaması,
uygulama bilgisi, uygulamadan çık.

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
