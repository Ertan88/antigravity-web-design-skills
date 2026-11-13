# Okul Yayın: geliştirme kuralları

Bu belge projeye eklenen her özellikte ve her değişiklikte uyulacak kuralları toplar. Kaynaklar: OWASP ASVS ve
OWASP Top 10 (web ve API güvenliği), OWASP MASVS (mobil güvenlik), WCAG 2.2 AA (erişilebilirlik), Android ve Google Play
politikaları, KVKK (6698 sayılı Kanun) ve projenin şimdiye kadarki kararları (kök dizindeki `CLAUDE.md`). Belgenin
sonunda Kasım 2026 incelemesinde bulunan açıklar öncelik sırasıyla ve durumlarıyla listelenir.

Çalışma kuralları (fikri onaylamadan önce sorgulama, kodlamadan önce onay, A/B/C tasarım örnekleri) `CLAUDE.md`'de
kalır; burada tekrarlanmaz.

---

## 1. Güvenlik

### 1.1 Kimlik doğrulama ve oturum
- Şifreler yalnızca scrypt ile tuzlanarak saklanır (`apps/api/src/lib/crypto.ts`); düz metin, geri çevrilebilir
  şifreleme ya da hızlı özet (MD5, SHA) kullanılmaz.
- Şifre en az 8 karakterdir; üst sınır 200 karakterdir (uzun girdiyle hizmet dışı bırakma engellenir).
- Kullanıcı yoksa da şifre denetimi yapılmış gibi beklenir (`burnPasswordCheck`): yanıt süresinden e-postanın kayıtlı
  olup olmadığı anlaşılmaz. Hata mesajı "e-posta ya da şifre hatalı" biçiminde tektir.
- Erişim anahtarı (JWT) 15 dakika, yenileme anahtarı 30 gün geçerlidir. Yenileme anahtarı her kullanımda değişir
  (rotation) ve veritabanında yalnızca özeti (`sha256`) tutulur.
- Web'de yenileme anahtarı `HttpOnly`, `Secure`, `SameSite=Lax` çerezde, `/api/auth` yoluna sınırlı durur. Mobilde
  `expo-secure-store` (Android Keystore) içinde tutulur; `AsyncStorage` ya da düz dosya kullanılmaz.
- `JWT_SECRET` üretimde ortam değişkeninden gelir, en az 32 karakterdir; geliştirme değeriyle üretim açılmaz
  (`env.ts` denetler). Gizli anahtarlar depoya, koda ya da istemciye yazılmaz.
- Şifre değişince kullanıcının bütün cihazlardaki oturumları kapanır; çıkışta o cihazın yenileme anahtarı silinir.
  Yönetici bir hesabı kapatınca ya da şifresini sıfırlayınca o hesabın oturumları da silinir.

### 1.2 Yetkilendirme ve okul ayrımı (çok kiracılı yapı)
- Her okul verisi `schoolId` ile süzülür. Okula ait her uç nokta `schoolGuard()` ile korunur ve sorgularda
  `eq(table.schoolId, req.ctx.schoolId)` koşulu bulunur. Kimliği (id) istemciden gelen kayıt, okul koşulu olmadan
  okunmaz ve değiştirilmez.
- Yetki rolden değil, verilen izinden (`can('...')`) okunur. Yeni bir işlem eklenince hangi iznin gerektiği yazılır ve
  testle denenir: yetkisiz kullanıcı 403 almalıdır.
- Arayüzde düğmeyi gizlemek güvenlik sayılmaz; aynı denetim sunucuda da yapılır.
- Destek erişimi (`isSupport`) kişisel verileri (öğrenci devamı, gözlem, rehberlik) göremez.
- Toplu işlemlerde her öğenin okula ve kullanıcının kapsamına ait olduğu tek tek denetlenir.

### 1.3 Girdi, çıktı ve dosyalar
- Bütün istek gövdeleri ve sorgu parametreleri `zod` şemasıyla doğrulanır (`parse(...)`). Şemalar
  `packages/shared` içindedir; istemci ve sunucu aynı şemayı kullanır.
- SQL yalnızca Drizzle sorgu kurucusuyla yazılır; ham SQL'de kullanıcı girdisi birleştirilmez.
- Yüklenen görseller uzantıya göre değil, dosyanın ilk baytlarına göre tanınır (`storage.ts`); yalnızca PNG, JPEG,
  GIF ve WebP kabul edilir, boyut sınırı 10 MB'dir. Yüklenen dosya adı sunucuda rastgele üretilir.
- Kullanıcı metni HTML olarak basılmaz; React kaçışına güvenilir. `dangerouslySetInnerHTML` kullanılmaz.
- Excel ve PDF içe aktarmada satır ve dosya sınırı vardır; hatalı satır bütün aktarımı bozmaz, satır satır bildirilir.
- Hata yanıtları iç ayrıntı (yığın izi, SQL) içermez; kullanıcıya Türkçe, anlaşılır bir mesaj gider.

### 1.4 Kötüye kullanım ve hız sınırı
- Giriş, kayıt, davet, şifre ve eşleştirme uç noktalarında hız sınırı vardır (`config.rateLimit`). Yeni bir herkese
  açık uç nokta eklenince hız sınırı da eklenir.
- Okul ağlarında bütün öğretmenler aynı internet adresinden çıkar: sınırlar yalnızca IP'ye bağlanırsa sabah girişinde
  bütün okul engellenebilir (bkz. bulgular).
- Tek kullanımlık kodlar (eşleştirme, katılım, davet) kısa ömürlüdür ve kullanılınca silinir.

### 1.5 Pano (TV) cihazları
- Pano yalnızca eşleştirilmiş cihaz anahtarıyla veri alır; anahtarın özeti saklanır.
- Pano, eşleşmeyi yalnızca sunucunun açık `device_invalid` yanıtıyla askıya alır. Okul ağından ya da bir vekil
  sunucudan gelen 401 yanıtı bağlantı sorunu sayılır (eşleşme silinmez).
- Geçersiz kılınan anahtarın nedeni (yenilendi, silindi, 30 gün bağlanmadı) saklanır ve eşleştirme ekranında yazılır.
- Panoya kişisel veri (öğrenci adı, devamsızlık, telefon) gitmez.

### 1.6 Bağımlılıklar ve dağıtım
- Paket sürümleri tam sürümle sabitlenir; en az iki haftalık sürümler seçilir. Yeni paket eklemeden önce
  bakımının sürdüğü ve lisansının uygun olduğu kontrol edilir.
- Docker imajı yalnızca derlenmiş dosyaları içerir; geliştirme bağımlılıkları ve kaynak haritaları üretime girmez.
- Üretim veritabanına doğrudan erişilmez; veri değişikliği yalnızca uygulama ya da göç (migration) dosyasıyla yapılır.
  Göçler geri alınabilir ya da `IF NOT EXISTS` ile tekrar çalıştırılabilir yazılır.

---

## 2. KVKK ve kişisel veri
- Gerçek okul belgeleri, öğrenci ya da öğretmen adları, telefon numaraları depoya eklenmez. Testler, örnek veriler,
  ekran görüntüleri ve videolar yalnızca uydurma verilerle hazırlanır.
- En az veri ilkesi: bir özelliğin çalışması için gerekmeyen kişisel veri toplanmaz ve gösterilmez.
- Görme yetkisi daraltılır: öğretmen yalnızca kendi işletmesinin öğrencisini, kendi sınıfının gözlemini görür. Başka
  bir işletmedeki öğrencinin işletme adı gösterilmez ("başka işletmede" yazar).
- Saklama süreleri tanımlıdır (gözlem kayıtları, sorun fotoğrafları); süresi dolan veri her gün otomatik silinir.
  Yeni bir kişisel veri türü eklenince saklama süresi de belirlenir.
- Kişisel veri içeren her dışa aktarma (PDF, Excel) denetim kaydına (`audit`) yazılır.
- Kişisel veri günlüklere (log), hata bildirimlerine, bildirim metinlerine ve URL'lere yazılmaz. Bildirimde yalnızca
  gerekli en kısa bilgi bulunur (ör. "Ayşe Demir 23 Kasım için izin bildirdi").
- Aydınlatma metni ve gizlilik sayfası yeni veri türü eklenince güncellenir.

---

## 3. Tasarım sistemi

### 3.1 Renk, tema ve katman
- Renkler yalnızca belirteçlerden gelir: web'de Tailwind belirteçleri (`apps/admin`), mobilde `colors` ve `tiles`
  (`mobile/src/theme.ts`). Bileşenin içine sabit renk yazılmaz. Acil durum kırmızısı gibi temadan bağımsız
  olması gereken renkler istisnadır ve adlandırılmış sabit olarak tanımlanır.
- Her ekran açık ve koyu temada kontrol edilir.
- Üst katmanlar (pencere, alt sayfa, onay penceresi, açılır menü, bildirim kutusu) arka plandan ve kartlardan belirgin
  ayrılır: mobilde `colors.elevated`, `colors.elevatedBorder`, `colors.scrim`; web'de `bg-elevated`, koyu temada ince
  açık çerçeve ve daha koyu karartma. Ayrıntı `CLAUDE.md` 4. maddede.
- Sil düğmeleri ortak bileşenle yapılır ve "yumuşak kırmızı"dır; dolu kırmızı yalnızca onay penceresindeki son adımdır.

### 3.2 Erişilebilirlik (WCAG 2.2 AA)
- Metin ile zemini arasındaki kontrast normal yazıda en az 4.5:1, 18 pt üstü ya da kalın büyük yazıda en az 3:1
  olur. Ölçüm: `colors.faint` açık temada 4.44 (sınırda), `colors.subtle` 2.3–2.5. Bu yüzden `colors.subtle` yalnızca
  süs, ayırıcı ve devre dışı öğe içindir; okunması gereken metinde kullanılmaz.
- Dokunulan her öğe en az 44×44 pt (Android'de 48×48 dp önerilir) alana sahiptir; küçük simgelerde `hitSlop` verilir.
- Her düğme ve simgede `accessibilityLabel` (web'de `aria-label`) bulunur; durum değiştiren öğelerde
  `accessibilityState` (seçili, açık, devre dışı) verilir.
- Bilgi yalnızca renkle verilmez: renkli rozetin yanında yazı ya da simge bulunur (ör. "2 D", "Kapalı").
- En küçük yazı boyutu: mobilde 11 pt, panoda 18 px (uzaktan okunur). Yazılar telefonun yazı büyütme ayarıyla
  büyüdüğünde taşmaz; sabit yükseklikli kutularda `numberOfLines` ya da `adjustsFontSizeToFit` kullanılır.
- Animasyonlar kısa ve amaca yöneliktir; telefonda "animasyonları azalt" açıksa ve panoda "Hafif" modda kapanır.

### 3.3 Düzen ve içerik
- Panonun genel düzeni (üst bar, yan sütunlar, kayan yazı) hiçbir özellikle bozulamaz (`CLAUDE.md` 4. madde).
- Pano ve mobil ana sayfada uzayan liste yerine sayfalama ya da sayı kullanılır; okul büyüdükçe kart boyu değişmez
  (ör. Panolar kartında yalnızca ilk kapalı pano ve "N pano daha kapalı").
- Boş, yükleniyor ve hata durumu her ekranda tasarlanır; boş durumda ne yapılacağı yazılır.
- Geri alınamayan işlemden önce ortak onay penceresi açılır; çok önemli işlemlerde basılı tutma istenir.
- Tek dokunuşla kayıt değiştiren düğmeler (uzat, görevlendir, sil) yanlışlıkla basılmaya karşı onay ya da geri alma
  sunar.

### 3.4 Türkçe
- Bütün metinler TDK yazımına uyar; devrik cümle kurulmaz (`CLAUDE.md` 4a). Tarihler "23 Kasım", saatler "13:55"
  biçimindedir; kullanıcıya ISO tarihi (2026-11-23) gösterilmez.
- Sayıya ek gerekiyorsa ek yerine cümle kurulur ("Teneffüs: 13:55"), çünkü "13:55'te / 15:30'da" gibi ekler
  okunuşa göre değişir ve kolay yanlış yazılır.

---

## 4. Mobil uygulama (Android)

### 4.1 İzinler ve Google Play politikaları
- Her izin yalnızca gerektiği anda ve nedeni anlatılarak istenir (kamera: QR okutma; bildirim: hatırlatmalar). İzin
  verilmezse uygulama çalışmaya devam eder, ilgili özellik kapalı kalır.
- `POST_NOTIFICATIONS` (Android 13+) çalışma anında istenir.
- Tam zamanlı alarm: Google Play `USE_EXACT_ALARM` iznini yalnızca alarm ve takvim uygulamalarına verir. Play'e
  çıkılacaksa bu izin kaldırılır, yalnızca `SCHEDULE_EXACT_ALARM` (kullanıcı onayıyla) kalır.
- Uygulama düz HTTP trafiğine izin vermez; yalnızca HTTPS kullanılır (bkz. bulgular).
- Yedekleme: oturum anahtarı SecureStore'da olduğundan Android yedeğine düşmez; yeni hassas veri de SecureStore'a
  yazılır.

### 4.2 Bildirimler
- Bildirim kanalı `okul-yayin` (özel ses). Android'de kanalın sesi sonradan değişmez; ses değişecekse yeni kimlikli
  kanal açılır.
- Uygulama açıkken yeni bildirim üstten iner: sıradan bildirim kendiliğinden kalkar, iş isteyen kart kapatılana dek
  kalır, acil durum bandı kendiliğinden kalkmaz. Birden çok bildirim tek kutuda toplanır.
- Sunucudan telefona bildirim için Firebase (FCM) kurulumu gerekir; kurulu olmadan "telefona gider" denmez.
- Hatırlatmalar telefonda yerel kurulur ve internetsiz çalışır; sunucu aynı hatırlatmayı ikinci kez göndermez.

### 4.3 Sürüm ve dağıtım
- Mobil değişiklikten sonra `mobile/app.json` içindeki `version` ve `versionCode` artırılır; commit, push, APK
  derlemesi beklenir ve indirme bağlantısı paylaşılır (`CLAUDE.md` 6. madde).
- APK imzalama anahtarı depoda düz metin durmaz; CI sırlarından gelir.
- Mobil web sürümü (`/app`) aynı kodla çalışır; telefona özgü özellikler (`Platform.OS === 'web'`) web'de düzgün
  kapanır ve nedeni yazılır.

### 4.4 Performans ve dayanıklılık
- Ekran açılırken önce saklanan veri gösterilir, güncel veri arkada gelir.
- Sık yenilenen sorgular (bildirim kutusu, kontrol merkezi) uygulama arka plandayken durur.
- Liste ekranlarında uzun listeler sanal liste ya da sayfalama ile çizilir.

---

## 5. Pano ve TV performansı
Zayıf TV işlemcilerinde edinilen dersler:
- Sürekli animasyonlarda yalnızca `transform` ve `opacity` değiştirilir; genişlik, yükseklik, `left`, `top` gibi
  yerleşimi değiştiren özellikler canlandırılmaz (`transition: all` kullanılmaz).
- Kartlar ve alt bant `contain: layout paint` ile kendi alanına hapsedilir; bir kartın değişimi bütün panoyu yeniden
  hesaplatmaz.
- Kayan yazı öğe öğe akar; binlerce piksellik tek uzun şerit oluşturulmaz.
- `backdrop-filter`, kayan maske (`mask-image`) ve büyük alanlı bulanıklık kullanılmaz.
- TV'de kart sayfaları efektsiz değişir; "Hafif" modda süs animasyonları kapanır.
- Saniyede bir yenilenen öğe (saat) yalnızca kendini yeniden çizdirir; her saniye ölçüm (layout okuma) yapılmaz.

---

## 6. Ürün kuralları
- Hiçbir okula özel sabit (il, ilçe, okul adı, MEM, belirli bir günün durumu) koda yazılmaz; her şey ayardan ya da
  veriden gelir.
- Okul türleri ve uç durumlar her özellikte düşünülür: ikili öğretim, sınıfa özel zil, yarım gün ve tatil, hafta sonu
  kursu (DYK), Mesleki Eğitim Merkezi, birden çok bina, izinli öğretmen.
- Varsayılanlar çoğu okula uyar; seyrek ihtiyaçlar gizlenir ama kaldırılmaz (ör. hafta sonu günleri, "Yalnızca bazı
  sınıflar").

---

## 7. Test ve teslim
- Her API değişikliğinde ilgili test yazılır ya da güncellenir; yetki denemesi (403) ve okul ayrımı denenir.
- Teslimden önce: `tsc` (api, admin, display, mobile), API ve shared testleri temiz geçer.
- Arayüz değişikliği mobil web ya da panelde, uydurma veriyle, açık ve koyu temada ekran görüntüsüyle kontrol edilir.
- Gerçek cihazda (telefon, TV) denenmeyen davranış "denendi" diye bildirilmez; neyin denendiği açıkça yazılır.

---

## 8. Kasım 2026 incelemesinde bulunanlar

| # | Öncelik | Konu | Durum ve öneri |
|---|---|---|---|
| 1 | Yüksek | Mobil uygulama düz HTTP'ye izin veriyordu (`usesCleartextTraffic`) | **Düzeltildi (1.20.53):** ayar kaldırıldı, uygulama yalnızca HTTPS kullanır. |
| 2 | Orta | Giriş hız sınırı yalnızca IP başınaydı | **Düzeltildi:** adres + e-posta başına 10/dk, adres başına 120/dk; bir hesaba art arda 5 hatalı girişte 5 dakika bekleme. |
| 3 | Orta | Panel ve pano sayfalarında İçerik Güvenlik Politikası (CSP) yoktu | **Düzeltildi:** HTML sayfalarına CSP başlığı eklendi (yalnızca kendi betiklerimiz ve YouTube). |
| 4 | Orta | Bağımlılık açığı taraması otomatik değil | `npm audit` elle çalıştırıldı: e-posta paketi (nodemailer, yüksek) 10.2.1'e yükseltildi. Kalan 3 orta düzey açık `@fastify/static` içindeki `glob` paketinde; düzeltilmiş sürüm iki haftayı doldurunca yükseltilecek. Otomatik tarama (Dependabot) depo ayarı gerektirir, kullanıcı onayıyla açılır. |
| 5 | Orta | Play Store'a çıkışta `USE_EXACT_ALARM` reddedilir | Şimdilik APK GitHub'dan dağıtıldığı için sorun yok. Play'e çıkmadan önce kaldırılmalı. |
| 6 | Düşük–orta | Soluk gri metin kontrastı AA altındaydı | **Mobilde düzeltildi:** `colors.faint` açık temada `#6f6863` (5.07:1); `colors.subtle` metinlerden çıkarıldı. Panelde (Tailwind `slate-400` metinler) ayrıca bakılacak. |
| 7 | İşlevsel | Sunucudan telefona bildirim gelmiyor (Firebase kurulu değil) | Acil durum ve onay bildirimleri uygulama kapalıyken telefona ulaşmıyor. Firebase projesi kurulmalı. |
| 8 | Düşük | Yöneticiler için iki adımlı doğrulama yok | Okul müdürü ve platform yöneticisi hesapları için isteğe bağlı iki adımlı doğrulama (TOTP) ileride eklenebilir. |

İyi durumda olanlar: scrypt ile şifre saklama, dönen yenileme anahtarı, SecureStore, `zod` doğrulaması, okul ayrımı
denetimleri, yüklemelerde içerik türü denetimi, gizli anahtarın üretimde zorunlu tutulması, KVKK saklama süresi
görevleri, denetim kaydı ve pano cihaz anahtarının yalnızca özetinin saklanması.
