# Okul Yayın · Android (Kotlin + Jetpack Compose)

Mobil uygulamanın yerel Android sürümü. Arayüz Material Design 3 ile Jetpack Compose'da yazıldı; renkler yalnızca
`MaterialTheme.colorScheme` üzerinden okunur ve telefonun açık / koyu tema ayarını izler. iPhone ve tarayıcı için
Expo uygulaması (`../mobile`) sürüyor; iki uygulama aynı API'yi kullanır.

## Yapı

```
android-app/
├── core/   Android'den bağımsız Kotlin: API modelleri, zil / okul günü / MEB takvimi hesabı, duyuru şablonları,
│           OkHttp API istemcisi (anahtar yenileme), rol hesabı. Kendi başına derlenir ve test edilir.
└── app/    Android uygulaması (Compose, Material 3)
    ├── ui/theme       Renk şeması (açık / koyu), tipografi, şekiller
    ├── ui/components  Scaffold + TopAppBar iskeleti, kartlar, rozetler, boş / hata durumları
    ├── ui/nav         Role göre alt menü (NavigationBar), ekran yolları, okulpano://eslestir bağlantısı
    ├── ui/screens     Bütün ekranlar
    ├── data           Oturum, önbellekli sorgular
    └── platform       Kamera / galeri, QR (CameraX + ML Kit), Android takvimi, nöbet hatırlatmaları
```

## Rollere göre alt menü

| Rol | Alt menü (NavigationBar) |
|---|---|
| Platform yöneticisi | Platform · Okullar · Takvim · Bildirimler |
| Okul sahibi / yönetici | Merkez · Onaylar · Panolar · Nöbet · Acil |
| Editör | İçerik + yetkilerinden gelen en çok 3 sekme + Bildirimler |
| Öğretmen | Bugün · Nöbetim · Duyurular · İzin · Profil |

Diğer ekranlar sağ üstteki Menü'dedir; herkes Hesabım'dan profilini günceller, şifresini değiştirir ve çıkış yapar.

## Derleme

GitHub Actions ("Okul Pano · Compose APK") her değişiklikte çekirdek testlerini çalıştırır, APK'yı derler ve ekran
görüntülerini (açık ve koyu tema, örnek verilerle) üretir; hepsi `okul-pano-compose` sürüm sayfasına yüklenir.

Yerelde (Android SDK kurulu bir bilgisayarda):

```bash
./gradlew -p core test               # çekirdek testleri
./gradlew :app:assembleRelease       # APK: app/build/outputs/apk/release
./gradlew :app:testDebugUnitTest     # ekran görüntüleri: app/build/outputs/roborazzi
```

- Sunucu adresi derlemede `API_URL` ile verilir (girişte "Farklı sunucu" ile değiştirilebilir).
- Uygulama Expo sürümüyle aynı paket adını (`com.okulpano.app`) ve deneme imzasını kullanır; telefondaki uygulamanın
  üzerine güncelleme olarak kurulur. Mağaza sürümü için `RELEASE_KEYSTORE`, `RELEASE_KEYSTORE_PASSWORD`,
  `RELEASE_KEY_ALIAS`, `RELEASE_KEY_PASSWORD` ortam değişkenleriyle gerçek anahtar verilmelidir.
- Nöbet hatırlatmaları telefonda yerel kurulur. Sunucudan gelen anlık bildirimler (onay, acil durum) için Firebase
  Cloud Messaging entegrasyonu henüz bu sürümde yok; bildirimler uygulamanın Bildirimler ekranında görünür.
