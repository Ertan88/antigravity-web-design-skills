# PayFlow

Faturaları, kredi kartlarını ve günlük harcamaları tek bir akışta takip eden; son ödeme
günlerinde hatırlatan ve kart faizini (TCMB tavan oranları + KKDF/BSMV) tahmin eden
mobil ödeme asistanı. iOS ve Android — Expo + React Native + TypeScript, Firebase.

## Geliştirme

```bash
npm install
npm test          # finans motoru testleri
npm run typecheck
npm start         # telefonda Expo Go uygulamasıyla QR kodu okut
```

## Yapı

| Klasör | İçerik |
|---|---|
| `src/core/money.ts` | Kuruş bazlı tam sayı para işlemleri, `₺` biçimlendirme |
| `src/core/finance/` | Faiz kademeleri, ekstre devri, kart dönemleri, taksitler, simülatör |
| `src/core/reminders.ts` | Son ödeme hatırlatma planı (3 gün / 1 gün / son gün, seçilen saat) |
| `src/core/categories.ts` | Fatura türleri, günlük kategoriler, özel kategori oluşturma |
| `src/core/schedule.ts` | Kalan gün, aciliyet seviyesi, Türkçe tarih/selamlama |
| `src/theme/` | Koyu / açık tema renkleri (tasarımla birebir), sistem/koyu/açık tercih saklama |
| `src/ui/` | İkon seti, temel bileşenler (metin, kart, kategori rozeti, skor halkası), alt menü |
| `src/app/` | Expo Router ekranları — `(tabs)/` alt menü sekmeleri; `card/[id]` kart ve ekstre, `card-pay` ödeme, `simulator`, `flow-settings`; `add` (Kart / Fatura / Günlük, fatura düzenleme), `card-new` (ekle/düzenle), `category-new` |
| `src/core/model.ts` | Kalıcı veri modeli: kart, fatura, harcama, kart ödemesi, ayarlar |
| `src/core/ledger.ts` | Kart ekstre defteri (devir zinciri) ve fatura vade hesabı |
| `src/core/parse.ts` | Türkçe tutar/faiz girişi okuma, tuş takımı |
| `src/store/` | Durum ağacı + AsyncStorage kalıcılığı, ana sayfa seçicileri, Zaman Nehri projeksiyonu, raporlar (Ödeme Sağlığı Skoru, aylık rapor, abonelik dedektörü, ev bütçesi), CSV/PDF çıktısı, örnek veri |
| `src/notifications/` | Bildirim planı (3 gün / 1 gün / son gün + ekstre kesimi), kurulum, izin, Ödedim/Ertele butonları |
| `src/auth/` | Kimlik doğrulama arayüzü, Firebase uygulaması, bulut yedek senkronu, Google düğmesi, Face ID kilidi |
| `src/features/` | Harcama ve fatura formları, kategori ızgarası, hatırlatma seçici |

> Faiz hesapları **tahminidir**. Oranlar TCMB'nin aylık duyurusuna göre güncellenmelidir
> (`src/core/finance/rates.ts`). Kullanıcı kart bazında kendi bankasının oranını girebilir.

## Hesap ve bulut yedek (Firebase) kurulumu

Firebase ayarı girilmeden uygulama **hesapsız modda** çalışır (veriler yalnızca cihazda).
Hesapları açmak için:

1. [Firebase Console](https://console.firebase.google.com)'da proje oluştur.
2. **Authentication → Sign-in method**: *E-posta/Şifre* ve *Google* sağlayıcılarını aç.
3. **Firestore Database** oluştur, **Rules** sekmesine `firestore.rules` içeriğini yapıştır.
4. **Proje ayarları → Uygulamalarınız → Web uygulaması ekle** → çıkan `firebaseConfig` değerlerini
   `.env.example` dosyasını `.env` olarak kopyalayıp doldur.
5. Google ile giriş için Google Cloud Console'da iOS ve Android OAuth istemci kimliklerini oluştur
   (paket adı `app.payflow.mobile`), `.env`'e ekle. Google ile giriş **Expo Go'da çalışmaz**;
   geliştirme derlemesi gerekir: `npx eas-cli@latest build --profile development`.

Yedek, `users/{uid}` belgesinde tutulur; kurallar her kullanıcının yalnızca kendi belgesine
erişmesine izin verir.

## APK oluşturma (Android'e doğrudan kurulum)

Derleme Expo'nun bulut sunucularında yapılır; bilgisayarına Android Studio kurman gerekmez.

```bash
cd payflow
npm install
npx eas-cli@latest login            # ücretsiz Expo hesabınla
npx eas-cli@latest init             # projeyi Expo hesabına bağlar (ilk sefer)
npx eas-cli@latest build -p android --profile preview
```

İlk derlemede imza anahtarı sorulursa "Generate a new keystore" seç. Derleme bitince
terminalde ve expo.dev'de **APK indirme bağlantısı / QR kodu** çıkar; telefonda açıp
kurabilirsin (bilinmeyen kaynaklardan yüklemeye izin vermen gerekebilir).

- `preview` → kurulabilir APK (Google ile giriş dahil tüm özellikler)
- `development` → geliştirme sürümü (Expo Go yerine)
- `production` → Google Play için AAB

Firebase kullanacaksan değerleri derlemeye ver: `.env` dosyası git'e eklenmediği için EAS onu
bulut derlemesine göndermez. Her değişken için bir kez şunu çalıştır (değerler gizli değildir):

```bash
npx eas-cli@latest env:create --environment preview --visibility plaintext \
  --name EXPO_PUBLIC_FIREBASE_API_KEY --value "..."
```

Firebase olmadan derlersen uygulama hesapsız modda çalışır.
