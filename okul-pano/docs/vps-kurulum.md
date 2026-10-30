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

## Notlar

- Telefon bildirimleri için Expo erişim anahtarı varsa `/opt/okul-pano/.env` dosyasına `PUSH_ACCESS_TOKEN=...`
  ekleyip `sudo docker compose up -d` çalıştırın.
- Kod ana dala (`main`) alınınca kurulum komutundaki dal adını `main` yapın; mevcut kurulumda
  `/opt/okul-pano/.env` içindeki `OKULPANO_BRANCH` satırı yalnızca kaynaktan derleme yapılan kurulumlarda kullanılır.
