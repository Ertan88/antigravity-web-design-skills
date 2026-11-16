# Telefon bildirimleri (Firebase + Expo) kurulumu

Uygulama ve sunucu hazırdır; yalnızca üç hesap ayarı yapılır. Gizli dosyalar (Firebase hizmet hesabı anahtarı)
hiçbir zaman depoya, sohbete ya da e-postaya yazılmaz; yalnızca ilgili sitenin kendi formuna yüklenir.

## 1. Expo projesi (bildirimleri telefona ileten hizmet)

1. https://expo.dev adresinde ücretsiz hesap açın.
2. **Projects › Create a project**: ad `okul-yayin`.
3. Proje sayfasındaki **Project ID** değerini kopyalayın (gizli değildir).
4. GitHub › depo › **Settings › Secrets and variables › Actions › Variables** › **New repository variable**:
   ad `EXPO_PROJECT_ID`, değer kopyaladığınız kimlik.

## 2. Firebase projesi (Android bildirim altyapısı)

1. https://console.firebase.google.com › **Proje ekle** (Google Analytics gerekmez).
2. Proje ana sayfasında **Android** simgesi › paket adı: `com.okulpano.app` › **Uygulamayı kaydet**.
3. **google-services.json** dosyasını indirin.
4. GitHub › **Settings › Secrets and variables › Actions › Secrets** › **New repository secret**:
   ad `GOOGLE_SERVICES_JSON`, değer dosyanın içeriğinin tamamı (metin düzenleyicide açıp kopyalayın).

## 3. Firebase anahtarını Expo'ya tanıtma

1. Firebase › **Proje ayarları › Hizmet hesapları › Yeni özel anahtar oluştur** (bir JSON dosyası iner; gizlidir).
2. expo.dev › `okul-yayin` projesi › **Credentials › Android** › `com.okulpano.app` ›
   **FCM V1 service account key › Add** › indirdiğiniz dosyayı yükleyin.
3. Dosyayı yükledikten sonra bilgisayarınızdan silebilirsiniz (Firebase'den yeniden oluşturulabilir).

## 4. Yeni APK ve deneme

1. GitHub › **Actions › Okul Pano · Android APK › Run workflow** (ya da mobil kodda bir değişiklik).
2. Yeni APK'yı indirip eski uygulamanın üzerine kurun.
3. Uygulamada **Menü › Bildirimler › Telefon bildirimleri**: "Açık: bu telefon onay, acil durum ve görev
   bildirimlerini alır" yazmalıdır ("İzin verildi … bu sürümde kurulu değil" yazıyorsa 1. ve 2. adımlar eksiktir).
4. Başka bir hesaptan bu hesaba bildirim düşecek bir işlem yapın (ör. izin bildirimi) ve telefonu kilitleyip bekleyin.

## Notlar

- Sunucu varsayılan olarak Expo'nun bildirim adresini kullanır (`PUSH_URL`). Expo'da "Enhanced push security"
  açılırsa Render › Environment'a `PUSH_ACCESS_TOKEN` (Expo erişim anahtarı) eklenir; kapalıysa gerekmez.
- Telefon kapalıyken ya da pil tasarrufundayken bildirimler gecikebilir (Android'in kendi kuralı).
- Uygulamayı kalıcı imza anahtarıyla dağıtmadan önce `APP_KEYSTORE_*` gizli değerleri de tanımlanmalıdır
  (bkz. iş akışı dosyası); bildirimler için şart değildir.
