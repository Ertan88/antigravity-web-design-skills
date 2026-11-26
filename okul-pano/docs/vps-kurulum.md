# Okul Pano'yu Türkiye'deki bir sunucuya (VPS) kurma

Gerçek okul verisi (öğrenci adı, doğum günü, fotoğraf) girilecekse sunucunun Türkiye'de olması KVKK açısından en
sade yoldur; devlet okulları için ayrıca beklenir. Kurulum tek komuttur; ortalama 10 dakika sürer.

## 1. Sunucu kiralayın

| Özellik | Öneri |
|---|---|
| Lokasyon | Türkiye (tercihen İstanbul) |
| Sanallaştırma | **KVM** (Docker için gerekli; OpenVZ olmaz) |
| İşletim sistemi | **Ubuntu 24.04** (22.04 da olur) |
| İşlemci / bellek | 2 çekirdek, 2-4 GB (başlangıçta onlarca okula yeter) |
| Disk | 40 GB NVMe / SSD |

Sağlayıcı size bir **IP adresi** ve **root şifresi** (ya da SSH anahtarı) verir.

## 2. Alan adını sunucuya yönlendirin

Alan adınızın DNS ayarlarında (ör. `pano.sirketiniz.com`) bir **A kaydı** açıp değerine sunucunun IP adresini
yazın. Yayılması birkaç dakika sürebilir. HTTPS sertifikası bu kayıtla otomatik alınır.

## 3. Kurulum komutu

Bilgisayarınızdan sunucuya bağlanın (Windows'ta PowerShell ya da PuTTY):

```bash
ssh root@SUNUCU_IP_ADRESI
```

Sonra tek satır:

```bash
curl -fsSL https://raw.githubusercontent.com/Ertan88/antigravity-web-design-skills/claude/okul-dijital-pano-4oao0y/okul-pano/deploy/kurulum.sh | sudo bash
```

Betik dört şey sorar: alan adı, yönetici e-postası, yönetici şifresi (en az 12 karakter), örnek okul istenip
istenmediği. Gerisini kendisi yapar:

- Docker'ı kurar; bellek 3 GB'tan azsa 2 GB takas alanı ekler, güvenlik duvarında 80/443'ü açar
- Hazır uygulama imajını indirir (GitHub'da derlenir, sunucuda derleme beklenmez)
- PostgreSQL + Okul Pano + otomatik HTTPS (Caddy) başlatır
- Rastgele veritabanı şifresi ve oturum anahtarı üretir; ilk yönetici oluştuktan sonra şifreyi sunucudan siler
- Her gece 03.30'da veritabanını (görseller dahil) yedekler, son 14 günü tutar

Bitince adresler ekrana yazılır: `https://alanadiniz/admin/` (panel), `/display/` (TV), `/app/` (mobil web).

## Günlük işler

| Ne | Komut |
|---|---|
| Uygulamayı güncelle | `sudo /opt/okul-pano/guncelle.sh` (önce yedek alır) |
| Elle yedek al | `sudo /opt/okul-pano/yedekle.sh` |
| Yedekten geri dön | `sudo /opt/okul-pano/geri-yukle.sh /opt/okul-pano/yedekler/<dosya>.dump` |
| Kayıtlara bak | `cd /opt/okul-pano && sudo docker compose logs -f app` |
| Yeniden başlat | `cd /opt/okul-pano && sudo docker compose restart` |

Yedekler sunucunun kendi diskindedir. Sunucu tamamen kaybolursa yedekler de gider; haftada bir yedek dosyasını
bilgisayarınıza indirin (`scp root@SUNUCU_IP_ADRESI:/opt/okul-pano/yedekler/*.dump .`) ya da sağlayıcının
"otomatik yedek / snapshot" hizmetini açın. Yedekleri Türkiye dışındaki bir servise koymayın (KVKK).

## Sunucu taşırken

Veritabanını yeni sunucuya taşımak yetmez; eski sunucunun **oturum anahtarı** (`JWT_SECRET`) da taşınmalıdır.
Panelden girilen e-posta (Brevo) anahtarı ve iki adımlı doğrulama bilgileri bu anahtarla şifreli saklanır.
Kurulum betiği yeni sunucuda yeni bir anahtar üretir; eskisi taşınmazsa:

- Panele girilmiş e-posta anahtarı çözülemez, e-posta gönderilmez (Platform › E-posta ayarları sayfası
  "Kayıtlı anahtar çözülemedi" der).
- İki adımlı doğrulamayı açmış kişilerin uygulamadaki kodları kabul edilmez; ancak kurtarma koduyla girebilirler.
- Herkesin oturumu kapanır, yeniden giriş yapılır.

Sıra:

1. Eski sunucuda son bir yedek alın (`sudo /opt/okul-pano/yedekle.sh`) ve yedek dosyasını yeni sunucuya kopyalayın.
2. Eski sunucudaki `/opt/okul-pano/.env` dosyasından `JWT_SECRET` satırını not edin. Değeri kimseyle paylaşmayın;
   sohbete ya da e-postaya yazmayın.
3. Yeni sunucuda kurulum komutunu çalıştırın, sonra `/opt/okul-pano/.env` içindeki `JWT_SECRET` değerini eskisiyle
   değiştirin. `.env`'de `BREVO_API_KEY`, `SMTP_*` ya da `FIREBASE_SERVICE_ACCOUNT` kullandıysanız onları da taşıyın.
4. Yedeği geri yükleyin (`sudo /opt/okul-pano/geri-yukle.sh <dosya>.dump`) ve
   `cd /opt/okul-pano && sudo docker compose up -d` ile yeniden başlatın.
5. Brevo'da IP kısıtlaması açıksa Security › Authorised IPs sayfasında yeni sunucunun IP adresini onaylayın,
   eskisini kaldırın.
6. Platform › E-posta ayarları sayfasından **Deneme gönder** ile e-postayı deneyin.
7. Alan adının DNS kaydını yeni sunucunun IP adresine çevirin.

Eski `JWT_SECRET` kaybolduysa: Brevo'da yeni bir API anahtarı oluşturup Platform › E-posta ayarları sayfasına
girin; iki adımlı doğrulama kullananlar kurtarma koduyla girip doğrulamayı yeniden kurar.

## Notlar

- **Telefon bildirimleri (Firebase):** Firebase hizmet hesabı JSON'unu tek satır hâlinde, tek tırnak içinde
  `/opt/okul-pano/.env` dosyasına ekleyin: `FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'`. Sonra
  `cd /opt/okul-pano && sudo docker compose up -d`. Değeri kimseyle paylaşmayın; sohbete ya da e-postaya yazmayın.
- **E-posta:** Platform hesabıyla Panel › E-posta ayarları sayfasından girilir (ya da `.env`'de `SMTP_*`).
- **Telefon ve TV uygulamaları:** GitHub deposunda Settings › Secrets and variables › Actions › **Variables**
  sekmesinde `PANOKUL_API_URL` değişkenini yeni adres yapın (ör. `https://pano.alanadiniz.com.tr`); sonraki
  derlemede uygulamalar bu adresle çıkar. Telefonda eski Render adresi kayıtlıysa uygulama açılışta yeni adrese
  kendiliğinden geçer (kişi bir kez yeniden giriş yapar).
- Kod ana dala (`main`) alınınca kurulum komutundaki dal adını `main` yapın; mevcut kurulumda
  `/opt/okul-pano/.env` içindeki `OKULPANO_BRANCH` satırı yalnızca kaynaktan derleme yapılan kurulumlarda kullanılır.
