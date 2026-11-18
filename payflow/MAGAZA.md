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

## 3. Firebase'e eklenecek SHA-1 parmak izleri (Google ile giriş için)

Firebase › Proje ayarları › Android uygulaması › **Parmak izi ekle**:

1. Test derlemeleri: `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`
2. EAS yükleme anahtarı: `npx eas-cli@latest credentials` → Android → production → SHA-1
3. Google Play uygulama imzalama anahtarı: Play Console › Uygulama › **Test ve yayınla › Uygulama bütünlüğü › Uygulama imzalama** › SHA-1

Üçü de eklenmezse Google ile giriş o derlemede "geliştirici hatası" verir.

iOS'ta Google ile giriş için Firebase'e **iOS uygulaması** (bundle kimliği aynı) eklenip
`EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` doldurulmalı.

## 4. Mağaza kuralları — durum

| Gereklilik | Durum |
|---|---|
| Uygulama içinden hesap silme | ✅ Ayarlar › Hesabımı sil |
| Hesap silme için **web bağlantısı** (Play zorunlu) | ⏳ Gizlilik politikası sayfasında "hesap silme talebi" bölümü + e-posta |
| Gizlilik politikası URL'si | ⏳ Hukuki metin — senin/uzmanın yazması gerekiyor |
| KVKK aydınlatma metni | ⏳ Kayıt ekranındaki bağlantı bu metne yönlenecek |
| **Apple ile giriş** (Google girişi sunan iOS uygulamaları için) | ⏳ Apple geliştirici hesabı açılınca eklenecek |
| Face ID kullanım açıklaması | ✅ |
| Şifreleme beyanı (ITSAppUsesNonExemptEncryption) | ✅ standart HTTPS, beyan "hayır" |
| Uygulama ikonu, uyarlanabilir ikon, bildirim ikonu, açılış ekranı | ✅ `assets/` |
| Bildirim izni yalnızca kullanıcı isteyince | ✅ |
| Tahmini faiz uyarısı | ✅ ekranlarda "≈ tahmini" ve oran kaynağı |

## 5. Google Play "Veri güvenliği" formu — taslak

| Veri | Toplanıyor mu | Amaç | Paylaşılıyor mu |
|---|---|---|---|
| Ad, e-posta | Evet (hesap açılırsa) | Hesap yönetimi | Hayır |
| Kullanıcının girdiği finansal bilgiler (kart limiti, harcama, fatura tutarları) | Evet (hesap açılırsa, bulut yedek) | Uygulama işlevi | Hayır |
| Kart numarası, banka şifresi | **Hayır** (yalnızca kartın son 4 hanesi, isteğe bağlı) | — | — |
| Konum, kişiler, fotoğraf | Hayır | — | — |

- Veriler aktarımda şifreli (HTTPS/TLS) — **Evet**
- Kullanıcı verilerinin silinmesini isteyebilir — **Evet** (uygulama içi + web)
- Hesapsız kullanımda veriler yalnızca cihazda kalır.

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
- Hesapsız kullanım veya bulut yedekli hesap; Face ID kilidi

PayFlow bir banka uygulaması değildir; banka şifren istenmez, ödeme yapmaz. Faiz tutarları
TCMB azami oranlarına göre tahminidir.

**Kategori:** Finans · **İçerik derecelendirmesi:** herkes

## 7. İnceleme notu (Apple / Google'a)

İnceleyicinin her ekranı görebilmesi için: *"Giriş ekranında 'Hesapsız devam et' → Ana Sayfa'da
'Örnek verilerle dene'."* Hesaplı akış için bir test hesabı (e-posta/şifre) da verilmeli.

## 8. Ekran görüntüleri

Tasarım canvas'ındaki 12 ekran (koyu + açık) referans. Mağaza görüntüleri gerçek cihaz/emülatörde
örnek veriyle alınmalı: Ana Sayfa, Zaman Nehri, Kart & Ekstre, Simülatör, Raporlar, Bildirim.
