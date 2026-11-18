# Yasal metinler — nasıl çalışır, yayından önce ne yapılmalı

> Bu metinler, mevzuat ve mağaza kuralları araştırılarak hazırlanmış **taslaklardır**; hukuki görüş
> değildir. Yayından önce bir avukata (tercihen KVKK alanında) okutman önerilir.

## Dosyalar

| Dosya | İçerik |
|---|---|
| `controller.json` | Veri sorumlusu adı, adresi, e-postası, yürürlük tarihi — **tek doldurulacak yer** |
| `documents.json` | Gizlilik Politikası, KVKK Aydınlatma Metni, Kullanım Koşulları (tek kaynak) |
| `../scripts/build-legal.mjs` | Web sayfalarını üretir → `docs/payflow/*.html` |

Metinler uygulamada **Ayarlar › Yasal** altında ve kayıt/giriş ekranlarındaki bağlantılarda
çevrimdışı gösterilir; aynı içerik web'de yayımlanır. Bir metni değiştirince:

```bash
cd payflow && npm run legal   # web sayfalarını yeniden üretir; testler eskiyse uyarır
```

## Yayından önce senin yapacakların

1. **`controller.json`'u doldur.** Köşeli parantezli alanlar kaldıkça uygulamada ve web'de
   "Taslak" uyarısı görünür. Şahıs olarak yayımlıyorsan veri sorumlusu sensin (ad soyad + tebligat
   adresi); şirket kurarsan şirket unvanı. Mağazadaki geliştirici adıyla tutarlı olmalı.
2. **Web'de yayınla (GitHub Pages):** GitHub › Settings › Pages › *Deploy from a branch* →
   bu çalışmanın olduğu dal (birleştirince `main`) ve klasör **`/docs`**. Adresler:
   - Gizlilik Politikası: `https://ertan88.github.io/antigravity-web-design-skills/payflow/gizlilik.html`
   - Hesap silme (Play "hesap silme bağlantısı"): `.../payflow/hesap-silme.html`
   - KVKK: `.../payflow/kvkk.html` · Koşullar: `.../payflow/kosullar.html`
3. **Yurt dışına aktarım (KVKK m.9):** Hesaplı kullanımda veriler Google Firebase'e (yurt dışı)
   gider. 7499 sayılı Kanun'la (1.6.2024) açık rıza artık sürekli aktarım için dayanak değil;
   uygun güvence olarak **standart sözleşme** gerekir ve imzadan sonra Kurum'a **5 iş günü içinde**
   bildirilmelidir (KVKK "Standart Sözleşme Bildirim Modülü"). Google'ın veri işleme sözleşmesinin
   bu amaçla nasıl kullanılacağı netleştirilmeli — **avukata sorulacak ilk konu bu.**
   Hesapsız mod hiçbir veriyi yurt dışına göndermez.
4. **VERBİS kaydı:** Küçük ölçekli veri sorumluları istisna kapsamında olabilir; durumunu
   KVKK'nın güncel istisna kararlarından kontrol et.
5. **İletişim e-postası:** Hesap silme ve KVKK başvuruları buraya gelecek; 30 gün içinde
   yanıtlanmalı.

## Araştırmada uyulan kurallar

- **KVKK m.10 + Aydınlatma Tebliği:** veri sorumlusu, amaçlar, aktarılan kişiler ve amaçları,
  toplama yöntemi, hukuki sebep, m.11 hakları — aydınlatma verinin toplandığı anda (kayıt ekranı).
- **Aydınlatma ≠ açık rıza:** Aydınlatma metni "okudum, onaylıyorum" kutusuyla onaylatılmaz
  (Kurul 2026/347 ilke kararı: ikisi ayrı düzenlenir; rızaya dayanmayan işlemede rıza istenmez).
  Bu yüzden kayıt ekranında KVKK kutusu kaldırıldı; yerine bilgilendirme bağlantısı ve yalnızca
  Kullanım Koşulları'nın kabulü var.
- **Google Play:** hesap açılabiliyorsa uygulama içi silme + Veri güvenliği formunda **web
  bağlantısı**; sayfa uygulama/geliştirici adını anmalı, silme yolu belirgin olmalı.
- **App Store 5.1.1:** gizlilik politikası bağlantısı (App Store Connect + uygulama içi) ve
  uygulama içinden hesap silme.
