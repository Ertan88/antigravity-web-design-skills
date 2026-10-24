# Okul Pano

Okullar için **çok okullu (SaaS'a hazır)** dijital pano sistemi: koridordaki TV'ler, uzaktan erişilen bir yönetim paneli ve ileride mobil uygulamanın da kullanacağı tek bir API.

![Pano: ders sırasında](docs/pano-ders.png)

| Teneffüste | TV eşleştirme | Ders programı (panel) | Telefon |
|---|---|---|---|
| ![](docs/pano-teneffus.png) | ![](docs/pano-eslestirme.png) | ![](docs/panel-ders-programi.png) | ![](docs/panel-mobil.png) |

## Pano alanları

| Alan | İçerik |
|---|---|
| **Üst bar** | Solda hava durumu, ortada okul logosu ve adı, sağda saat ve tarih |
| **Sol sütun** | Sınav sayacı (LGS/YKS vb.), bugünün nöbetçi öğretmenleri ve nöbet yerleri, izinli öğretmenler *(gizlenebilir)*, doğum günü kutlamaları *(gizlenebilir)* |
| **Orta alan** | Görselli duyurular, YouTube videoları ve metin duyurular; slayt olarak döner, yayın tarihi planlanabilir |
| **Sağ sütun** | Zil vakti: dersin ya da teneffüsün bitmesine kalan süre. Altında o ders saatinde hangi sınıfta hangi ders ve öğretmen var |
| **Alt bant** | Panelden girilen kısa bilgilerin aktığı kayan yazı |

## Öne çıkan teknik kararlar

- **Gerçek zamanlı:** Panelde yapılan her değişiklik ekranlara Server-Sent Events ile yaklaşık bir saniyede ulaşır. Ekranlar uzaktan yenilenebilir ya da "Tanımla" ile adını gösterebilir.
- **TV'de klavye gerekmez:** Ekran 6 haneli bir kod gösterir; yönetici panele kodu girince ekran kalıcı anahtarını alır (Netflix/Chromecast tarzı eşleştirme).
- **İnternet kesilirse çalışmaya devam eder:** Pano haftalık veriyi (nöbet, ders programı, zil saatleri) önbelleğe alır ve hangi günün gösterileceğine kendisi karar verir.
- **Saat her zaman doğru:** Zil ve geri sayımlar cihaz saatine değil, sunucu saatine ve okulun saat dilimine göre hesaplanır.
- **Her TV'de aynı görünüm:** Pano 1920×1080 tuvalde tasarlanır ve her ekran çözünürlüğüne orantılı ölçeklenir. Görüntü izine karşı içerik birkaç dakikada bir 2-3 piksel kayar. Gece 03:00'te sayfa kendini tazeler.
- **Rol ve yetki:** Okul sahibi ve yönetici her şeyi yönetir. Editörlere bölüm bölüm yetki verilir; örneğin yalnızca duyuru ya da yalnızca nöbet. Editörler kimseye yetki veremez. Her değişiklik etkinlik geçmişine yazılır.
- **Çok okullu (multi-tenant):** Tüm veriler okul kimliğiyle izole edilir; başka okulun kaydına ID bilinse bile erişilemez. Paket ve ekran limiti alanları abonelik sistemine hazırdır.
- **Mobil uygulamaya hazır:** Tipler, doğrulama şemaları ve zil motoru `packages/shared` içindedir. API, mobil istemciler için yenileme anahtarını gövdede döndürür.
- **Küçük ayrıntılar:** Panelde "zaman makinesi" ile panonun herhangi bir anda nasıl görüneceği önizlenir. Aynı öğretmen aynı saatte iki sınıfa yazılamaz. 29 Şubat doğumlular artık olmayan yıllarda 28 Şubat'ta kutlanır. Öğrenci adları KVKK dostu biçimde gösterilir ("Ayşe Y."). Millî bayramlarda bant kırmızı-beyaz olur, 10 Kasım 09.05'te pano saygı ekranına geçer.

## Mimari

```
okul-pano/
├── packages/shared   Ortak TypeScript: Zod şemaları, yetki modeli, zil motoru, saat dilimi
├── apps/api          Fastify + Drizzle ORM · PostgreSQL (geliştirmede gömülü PGlite)
├── apps/admin        Yönetim paneli · React + TanStack Query + Tailwind · /admin/
└── apps/display      Pano · React, düşük güçlü cihazlar için hafif paket · /display/
```

Üretimde tek bir Node süreci API'yi, paneli ve panoyu aynı adresten sunar; önüne otomatik HTTPS veren Caddy konur.

## Hızlı başlangıç (geliştirme)

Gereksinim: Node.js 22.12 veya üzeri. Veritabanı kurmanız gerekmez; gömülü PGlite kullanılır.

```bash
cd okul-pano
npm install
npm run seed      # örnek okul, öğretmenler, ders programı ve afişler
npm run dev       # API :3000, panel :5173/admin/, pano :5174/display/
```

| Hesap | E-posta | Şifre |
|---|---|---|
| Platform yöneticisi | admin@okulpano.local | Pano2026! |
| Okul sahibi | mudur@okulpano.local | Mudur2026! |
| Editör (duyuru + kayan yazı) | editor@okulpano.local | Editor2026! |

`npm run seed` çıktısındaki bağlantı örnek ekranı doğrudan açar. Belirli bir anı denemek için panoya `&at=2026-10-28T09:42:00+03:00` ekleyin.

```bash
npm test          # 28 birim + 26 entegrasyon testi
npm run typecheck
npm run build     # üretim derlemesi
```

## Sunucuya kurulum

```bash
cp deploy/.env.example deploy/.env      # alan adı ve gizli anahtarlar
docker compose --env-file deploy/.env up -d --build
```

Panel `https://alanadiniz/admin/`, pano `https://alanadiniz/display/` adresinde açılır. TV tarafında Chromium'u kiosk modunda çalıştırmanız yeterli; komut paneldeki **Ekranlar** sayfasında yazar.

## Yol haritası

1. **Şimdi (bu sürüm):** 5 alanlı pano, yönetim paneli, yetkiler, ekran eşleştirme, canlı güncelleme.
2. **Sıradaki:** e-posta ile davet ve şifre sıfırlama, duyuru onay akışı (editör hazırlar, müdür onaylar), acil durum modu (tek tuşla deprem/yangın tahliye ekranı), tatil günleri takvimi, ekran başına farklı içerik.
3. **Abonelik:** iyzico/Stripe ile ödeme, paket limitlerinin otomatik uygulanması, okulların kendi kendine kaydı.
4. **Mobil uygulama:** Expo (React Native). `packages/shared` olduğu gibi kullanılır; anlık bildirimle "duyurunuz yayında" ve "ekran çevrimdışı" uyarıları.
