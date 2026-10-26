# Okul Pano'yu ücretsiz yayına alma (Render + Neon)

Kredi kartı gerekmez; iki hesabı da GitHub ile açarsınız. Sonunda şu adresler çalışır
(`okul-pano` kısmı Render'ın verdiği ada göre değişebilir):

| Ne | Adres |
|---|---|
| Yönetim paneli | `https://okul-pano.onrender.com/admin/` |
| Pano (TV'ler) | `https://okul-pano.onrender.com/display/` |
| Mobil uygulamanın web sürümü | `https://okul-pano.onrender.com/app/` |
| Android uygulamada "Sunucu adresi" | `https://okul-pano.onrender.com` |

## 1. Veritabanı: Neon (ücretsiz PostgreSQL)

1. [neon.tech](https://neon.tech) › **Sign up** › GitHub ile giriş.
2. **Create project**: ad `okul-pano`, Postgres sürümü varsayılan, bölge **AWS Europe Central (Frankfurt)**.
3. Proje açılınca **Connect** düğmesi › bağlantı adresini kopyalayın. `postgresql://...neon.tech/neondb?sslmode=require...`
   ile başlayan satırın tamamı. Bu adresi kimseyle paylaşmayın.

## 2. Uygulama: Render (ücretsiz web sunucusu)

1. [render.com](https://render.com) › **Get Started** › GitHub ile giriş; GitHub'da Render'a
   `antigravity-web-design-skills` deposuna erişim izni verin.
2. Panelde **New** › **Blueprint** › depoyu seçin. Dal (branch) olarak `claude/okul-dijital-pano-4oao0y`
   seçin (kod ana dala alınmışsa `main`).
3. Render depodaki `render.yaml` dosyasını okur ve üç bilgi sorar:
   - `DATABASE_URL`: 1. adımda kopyaladığınız Neon adresi
   - `SEED_SUPERADMIN_EMAIL`: kendi e-postanız (platform yöneticisi olacaksınız)
   - `SEED_SUPERADMIN_PASSWORD`: güçlü bir şifre (en az 12 karakter)
4. **Apply**. İlk derleme 10-15 dakika sürer (Logs sekmesinden izlenir). Logda
   `İlk açılış: platform yöneticisi ve örnek okul oluşturuldu` yazısını görünce hazırdır.
5. Üstteki `https://...onrender.com` adresine `/admin/` ekleyip girin.

### Giriş hesapları

| Hesap | E-posta | Şifre |
|---|---|---|
| Platform yöneticisi (siz) | 3. adımda yazdığınız e-posta | 3. adımdaki şifre |
| Örnek okul müdürü | `mudur@okulpano.local` | aynı şifre |
| Örnek öğretmen (mobil) | `ogretmen@okulpano.local` | aynı şifre |
| Örnek editör | `editor@okulpano.local` | aynı şifre |

Örnek okul tanıtım içindir. Gerçek okul için platform yöneticisi olarak panelden yeni okul açın; örnek okulu
istediğiniz zaman silebilirsiniz. Örnek okul hiç kurulmasın isterseniz Render'da `SEED_DEMO` değerini
`false` yapın (yalnızca veritabanı boşken, ilk açılışta etkilidir).

## 3. TV'ler ve telefonlar

- **TV:** tarayıcıda `https://...onrender.com/display/` adresini açın; ekranda çıkan 6 haneli kodu panelde
  **Panolar** › **Pano ekle** ile girin.
- **Android uygulama:** girişte sunucu adresine `https://...onrender.com` yazın.
- **Uygulama kurmadan:** `https://...onrender.com/app/` telefonda tarayıcıdan açılır; "Ana ekrana ekle" ile
  uygulama gibi kullanılır.

## Ücretsiz planın sınırları

- **Uyku:** Render'ın ücretsiz sunucusu 15 dakika hiç istek gelmezse uyur; ilk açılış yaklaşık 1 dakika sürer.
  Açık bir pano (TV) sunucuyla sürekli bağlantıda kaldığı için gün içinde uyumaz. Gece panolar kapalıyken
  uyuyabilir; sabah ilk açılan pano onu uyandırır.
- **Aylık süre:** ücretsiz planda ayda 750 saat çalışma hakkı vardır; tek sunucu için bütün ay yeter.
- **Veritabanı:** Neon ücretsiz planı 0,5 GB. Görseller de veritabanında durduğu için duyuru görsellerini
  makul boyutta tutun (panel 10 MB'a kadar kabul eder; 1-2 MB yeterlidir).
- **Telefon bildirimleri:** Expo hesabı bağlanana kadar uzaktan bildirim gitmez (bkz. `mobile/README.md`).

## Kod güncellenince

`render.yaml` içinde `autoDeploy: true` olduğu için GitHub'a gönderilen her değişiklik birkaç dakika içinde
kendiliğinden yayına girer. Veritabanı değişiklikleri (migration) açılışta otomatik uygulanır; veriler korunur.

## Okullara satmaya başlayınca

- Render'da **Starter** plana geçmek (aylık ~7 $) uykuyu kaldırır; Neon'da veri büyüdükçe ücretli plana geçilir.
- Ya da kendi sunucunuz (VPS): depo kökündeki `docker-compose.yml` ile PostgreSQL + uygulama + otomatik
  HTTPS tek komutla kurulur (README › Sunucuya kurulum). Oracle Cloud'un "Always Free" sanal sunucusu da
  ücretsiz ve her zaman açıktır, ancak kayıtta kredi kartı doğrulaması ister.
- Kendi alan adınız (ör. `pano.sirketiniz.com`) Render'da **Settings › Custom Domains** ile eklenir.
