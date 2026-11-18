# Yasal metinler

> Mevzuat ve mağaza kuralları araştırılarak hazırlanmış taslaklardır; hukuki görüş değildir.

Sürüm 1.0 **yalnızca cihazda** çalışır (hesap yok, sunucu yok). Bu yüzden iki metin yeterli:
**Gizlilik Politikası** (KVKK bölümü içinde) ve **Kullanım Koşulları**.

| Dosya | İçerik |
|---|---|
| `controller.json` | Geliştirici adı, iletişim e-postası, yürürlük tarihi — **tek doldurulacak yer** |
| `documents.json` | Metinlerin tek kaynağı |
| `../scripts/build-legal.mjs` | Web sayfalarını üretir → `docs/payflow/*.html` (`npm run legal`) |

## Yayından önce

1. `controller.json`'daki köşeli parantezli alanları doldur, `npm run legal` çalıştır.
   Doldurulana kadar uygulamada ve web'de "Taslak" uyarısı görünür.
2. GitHub › Settings › Pages › *Deploy from a branch* → bu dal (birleştirince `main`), klasör `/docs`.
   Gizlilik Politikası adresi: `https://ertan88.github.io/antigravity-web-design-skills/payflow/gizlilik.html`

## Neden KVKK aydınlatma metni, standart sözleşme, VERBİS yok?

Uygulamaya girilen bilgiler cihazdan çıkmaz ve geliştirici bunlara erişmez; geliştirici açısından
bir kişisel veri işleme faaliyeti yoktur, yurt dışına aktarım da yoktur. Gizlilik Politikası'ndaki
"Kişisel verilerin korunması (KVKK)" bölümü bunu açıkça yazar. Bize e-posta ile yazanların
adresi yalnızca yanıt için kullanılır.

## Bulut (hesap) açılırsa geri gelecekler

`CLOUD_ENABLED = true` yapılırsa önce: ayrı KVKK aydınlatma metni (m.10), Firebase için KVKK m.9
standart sözleşme + 5 iş günü içinde Kurum'a bildirim, hesap silme web sayfası (Google Play),
uygulama içi hesap silme (hazır) ve iOS'ta Apple ile giriş. Avukat görüşü önerilir.
