# Telefon bildirimleri (Firebase) kurulumu

Sunucu bildirimleri doğrudan Firebase Cloud Messaging'e (FCM v1) gönderir; Expo hesabı gerekmez. Uygulama ve sunucu
hazırdır; yalnızca üç ayar yapılır. Gizli dosyalar (Firebase hizmet hesabı anahtarı) hiçbir zaman depoya, sohbete ya
da e-postaya yazılmaz; yalnızca ilgili sitenin kendi formuna girilir.

## 1. Firebase projesi ve Android uygulaması

1. https://console.firebase.google.com › **Proje ekle** (Google Analytics gerekmez).
2. Proje ana sayfasında **Android** simgesi › paket adı: `com.okulpano.app` (birebir) › **Uygulamayı kaydet**.
3. **google-services.json** dosyasını indirin (gizli sayılmaz ama depoya eklenmez).

## 2. GitHub: uygulamanın Firebase ayarı

1. https://github.com/Ertan88/antigravity-web-design-skills/settings/secrets/actions › **New repository secret**.
2. Ad: `GOOGLE_SERVICES_JSON`, değer: `google-services.json` dosyasının içeriğinin tamamı (Not Defteri'nde açıp
   kopyalayın; `{` ile başlar, `}` ile biter) › **Add secret**.

## 3. Render: sunucunun Firebase anahtarı (gizli)

1. Firebase › ⚙ **Proje ayarları › Hizmet hesapları › Yeni özel anahtar oluştur** › bir JSON dosyası iner.
2. https://dashboard.render.com › `okul-pano` hizmeti › **Environment** › **Add Environment Variable**.
3. Key: `FIREBASE_SERVICE_ACCOUNT`, Value: indirilen JSON dosyasının içeriğinin tamamı › **Save Changes**
   (Render hizmeti kendiliğinden yeniden başlar).
4. Dosyayı bilgisayarınızdan silin; gerekirse Firebase'den yeniden oluşturulur (eski anahtar oradan iptal edilebilir).

## 4. Yeni APK ve deneme

1. GitHub › **Actions › Okul Pano · Android APK › Run workflow** (ya da mobil kodda bir değişiklik).
2. Yeni APK'yı indirip eski uygulamanın üzerine kurun ve bir kez açın.
3. **Menü › Bildirimler › Telefon bildirimleri**: "Açık: bu telefon onay, acil durum ve görev bildirimlerini alır"
   yazmalıdır. "İzin verildi … bu sürümde kurulu değil" yazıyorsa 2. adım (APK'daki Firebase ayarı) eksiktir.
4. Başka bir hesaptan bu hesaba bildirim düşecek bir işlem yapın (ör. izin bildirimi), telefonu kilitleyip bekleyin.
   Bildirim gelmiyorsa 3. adım (Render'daki anahtar) eksik ya da hatalıdır; sunucu günlüğünde
   "Firebase hizmet hesabı tanımlı değil" ya da "Firebase erişim anahtarı alınamadı" yazar.

## Notlar

- iPhone sürümü çıkarsa Apple'ın bildirim anahtarı ayrıca gerekir (bu kurulum yalnızca Android içindir).
- Telefon pil tasarrufundayken Android bildirimleri geciktirebilir; acil durum için uygulamayı pil kısıtlamasından
  muaf tutmak gerekebilir.
- Eski Expo yolu (`PUSH_URL`, `PUSH_ACCESS_TOKEN`) geriye dönük olarak duruyor; Firebase anahtarları için kullanılmaz.
