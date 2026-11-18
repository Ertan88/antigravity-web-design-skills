# PayFlow — Mağazaya çıkış kontrol listesi

Paket / bundle kimliği: **`com.ertan88.odemeasistani`** (yayından sonra değiştirilemez).
Görünen ad şimdilik **PayFlow** — PayPal'ın "Payflow" ürünüyle karışma riski var; mağaza sayfası
hazırlanırken ad netleştirilecek (ad, kimlikten farklı olarak sonradan da değişebilir).

## 1. Hesaplar (senin yapacakların)

| Hesap | Ücret | Neden |
|---|---|---|
| [Google Play Console](https://play.google.com/console) | 25 $ tek sefer | Android yayını |
| [Apple Developer Program](https://developer.apple.com/programs/) | 99 $ / yıl | iOS yayını, Apple ile giriş |
| [Expo](https://expo.dev/signup) | ücretsiz | Bulutta derleme (Mac gerekmez), imza anahtarlarının güvenli saklanması |

> Yeni kişisel Google Play hesaplarında, uygulama herkese açılmadan önce **en az 12 test
> kullanıcısıyla 14 gün kapalı test** zorunludur. Erken başlamak gerekir.

## 2. İmza anahtarı ve derleme

Test APK'ları (GitHub Actions → Releases) herkesin bildiği ortak test anahtarıyla imzalıdır;
**mağazaya bunlar yüklenmez.** Mağaza sürümü EAS ile derlenir, anahtarı EAS üretip saklar:

```bash
cd payflow
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest build -p android --profile production   # Play için .aab
npx eas-cli@latest build -p ios --profile production       # App Store için
npx eas-cli@latest submit -p android --profile production  # Play "iç test" kanalına taslak
npx eas-cli@latest submit -p ios --profile production      # TestFlight
```

Sürüm numaraları (versionCode / buildNumber) EAS sunucusunda tutulur ve her üretim
derlemesinde otomatik artar. Görünen sürüm `app.json › version` (şu an 1.0.0).

## 3. Veri yaklaşımı: yalnızca cihazda (1.0)

İlk sürümde hesap ve bulut **kapalı** (`src/config/env.ts › CLOUD_ENABLED = false`). Hiçbir veri
cihazdan çıkmaz. Bu sayede şunlara **gerek yok**: Firebase, yurt dışı aktarım / standart sözleşme,
VERBİS, uygulama içi hesap silme, Apple ile giriş, KVKK aydınlatma metni (geliştirici veri işlemiyor).
Telefon değişiminde veriler telefonun kendi yedeğiyle (Android `allowBackup`, iCloud) veya
Ayarlar › **Yedekle / Geri yükle** dosyasıyla taşınır.

Bulut ileride açılırsa: `CLOUD_ENABLED = true`, Firebase kurulumu (README), KVKK aydınlatma metni +
yurt dışı aktarım adımları, hesap silme web sayfası ve Apple ile giriş geri gelir.

## 4. Mağaza kuralları — durum

| Gereklilik | Durum |
|---|---|
| Gizlilik politikası URL'si | ✅ `docs/payflow/gizlilik.html` — ⏳ `legal/controller.json` doldurulacak, GitHub Pages açılacak |
| Kullanım koşulları | ✅ `docs/payflow/kosullar.html` |
| Hesap silme (uygulama içi + web) | Gerekmez — hesap yok |
| Apple ile giriş | Gerekmez — üçüncü taraf giriş yok |
| Face ID kullanım açıklaması | ✅ |
| Şifreleme beyanı (ITSAppUsesNonExemptEncryption) | ✅ "hayır" |
| İkonlar, açılış ekranı, bildirim ikonu | ✅ |
| Tahmini faiz uyarısı | ✅ ekranlarda ve Kullanım Koşulları'nda |

## 5. Mağaza veri formları

- **Google Play › Veri güvenliği:** "Uygulama kullanıcı verisi topluyor veya paylaşıyor mu?" → **Hayır**.
  (Veriler yalnızca cihazda işlenir; geliştiriciye/sunucuya aktarılmaz — Google'ın tanımına göre bu
  "toplama" sayılmaz.) Gizlilik politikası: `https://ertan88.github.io/antigravity-web-design-skills/payflow/gizlilik.html`
- **App Store › App Privacy:** **"Data Not Collected"**.

## 6. Mağaza metni — taslak

**Kısa açıklama (80 karakter):**
Faturalar, kredi kartları ve harcamalar tek akışta. Son ödeme günü hatırlatır.

**Uzun açıklama:**
PayFlow faturalarını, kredi kartı ekstrelerini ve günlük harcamalarını tek bir akışta toplar.
- Son ödeme gününden 3 gün önce, 1 gün önce ve son gün, seçtiğin saatte hatırlatma
- Kredi kartında devreden borç, akdi/gecikme faizi ve KKDF/BSMV tahmini
- Asgari Tuzağı Simülatörü: sadece asgari ödersen borcun kaç ayda biter, ne kadar faiz ödersin
- Zaman Nehri: önümüzdeki 60 günde bakiyenin eksiye düşeceği günü önceden gösterir
- Taksitleri gelecek ekstrelere otomatik dağıtır
- Abonelik dedektörü, ay sonu raporu, PDF / Excel dışa aktarma
- Ev bütçesi: paylaşılan faturalarda kim kime ne borçlu
- Verilerin yalnızca telefonunda kalır: hesap yok, reklam yok, takip yok
- Yedekle / Geri yükle ile yeni telefona taşı; Face ID kilidi

PayFlow bir banka uygulaması değildir; banka şifren istenmez, ödeme yapmaz. Faiz tutarları
TCMB azami oranlarına göre tahminidir.

**Kategori:** Finans · **İçerik derecelendirmesi:** herkes

## 7. İnceleme notu (Apple / Google'a)

İnceleyicinin her ekranı görebilmesi için: *"İlk kurulumu 'Şimdilik atla' ile geç → Ana Sayfa'da
'Örnek verilerle dene'. Uygulama hesap gerektirmez; tüm veriler cihazda tutulur."*

## 8. Ekran görüntüleri

Tasarım canvas'ındaki 12 ekran (koyu + açık) referans. Mağaza görüntüleri gerçek cihaz/emülatörde
örnek veriyle alınmalı: Ana Sayfa, Zaman Nehri, Kart & Ekstre, Simülatör, Raporlar, Bildirim.
