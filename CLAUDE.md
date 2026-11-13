# Çalışma kuralları (Okul Yayın / okul-pano)

Ayrıntılı teknik kurallar (güvenlik, KVKK, tasarım ve erişilebilirlik, mobil, pano performansı):
`okul-pano/docs/KURALLAR.md`. Yeni özellik ve değişiklikte bu belge de uygulanır.

Bu kurallar her oturumda geçerlidir. Yanıtlar her zaman Türkçe yazılır.

## 1. Fikirleri onaylamadan önce sorgula (en önemli kural)

Kullanıcının verdiği her fikir ya da istekte önce şunlara bakılır:

- **Çelişki:** İstek, projedeki mevcut bir özellikle, daha önce verilmiş bir kararla ya da kendi içindeki başka bir maddeyle çelişiyor mu?
- **Olmayacak durum:** Teknik olarak yapılamayan, güvenilir çalışmayan ya da gerçek okul işleyişinde karşılığı olmayan bir varsayım var mı? (ör. 1. dersten önce "teneffüs" yoktur; telefon kapalıyken anlık bildirim gecikebilir.)
- **Uç durumlar:** İzinli öğretmen, ikili öğretim, sınıfa özel zil, tatil ve yarım gün, birden fazla okul, yetki ve KVKK.
- **Daha iyi bir yol:** Aynı amaca daha basit ya da daha sağlam ulaşan bir yöntem var mı?

Böyle bir durum varsa kullanıcı **onaylanmaz**. Yanlış açıkça söylenir; karşı argümanlar ve önerilen çözüm, "Dikkat edilmesi gerekenler" başlığıyla raporlanır. Kararı kullanıcı verir, ama sorun hiçbir zaman sessizce geçiştirilmez. "Harika fikir" gibi boş onaylar yazılmaz.

## 2. Kodlamadan önce onay

- Kullanıcı onay ya da düzeltme vermeden kodlamaya geçilmez.
- Arayüz değişikliklerinde önce tasarım örnekleri ve alternatifler gösterilir (A / B / C), seçim beklenir.

## 3. Ürün satılacak: hiçbir okula özel sabit yok

- İl, ilçe, okul adı, MEM adı ya da belirli bir okulun özel durumu koda sabit yazılmaz; her şey ayardan ya da veriden gelir.
- Kullanıcının örnek olsun diye verdiği günler ya da durumlar ürün kuralına dönüştürülmez.

## 4. Ortak görünüm kuralları

- **Sil düğmeleri** (silme, kaldırma, çıkarma) her yerde kırmızıdır ve ortak bileşenle yapılır; tek tek renk
  verilmez. Görünüş "yumuşak kırmızı"dır: açık kırmızı zemin, kırmızı yazı, ince kırmızı çerçeve; koyu temada
  koyu kırmızı zemin, açık kırmızı yazı. İki temada da kontrol edilir.
  - Web (panel): yazılı düğme `<Button variant="delete">`, çöp kutusu simgesi `DeleteButton` ya da
    `<IconButton tone="delete">`, özel düğmede `DELETE_TONE` sınıfları (`apps/admin/src/components/ui.tsx`).
  - Mobil: yazılı düğme `<Button variant="delete">`, çöp kutusu simgesi `DeleteIconButton` (`mobile/src/ui.tsx`).
  - Dolu kırmızı (`variant="danger"`) yalnızca onay penceresindeki son adım gibi kesin işlem düğmesindir.
- **Katmanlar iki temada da ayrışır.** Pencere, alt sayfa, onay penceresi, açılır menü ve bildirim kutusu gibi üst
  katmanlar arka plandan ve arkadaki kartlardan belirgin biçimde ayrılır. Koyu temada bunun için arkadaki kartlardan daha
  açık bir yüzey, ince açık bir çerçeve ve daha koyu bir karartma kullanılır; gölge tek başına yetmez.
  - Web (panel): yüzey `bg-elevated`, koyu temada `dark:ring-1 dark:ring-white/12` ya da `dark:border-white/15`,
    karartma `bg-black/40 dark:bg-black/65`. Ortak `Modal`, `confirm` ve açılır menüler bunu kullanır.
  - Mobil (uygulama ve web sürümü `/app`): `colors.elevated`, `colors.elevatedBorder`, `colors.scrim`. Ortak `Sheet`
    ve `confirm` bunu kullanır.
  - Üst katmanın içindeki düğme, kutu ve satırlar da bu yüzeyde görünür kalır (ör. ikincil düğme `colors.card` zemin
    ve `borderStrong` çerçeveyle).
  - Yeni eklenen ya da değiştirilen her ekran ve pencere açık ve koyu temada kontrol edilir.
- **Panonun genel düzeni bozulamaz.** Üst bar (okul adı, saat, hava), sol ve sağ sütundaki kartlar ve alttaki
  kayan yazı her zaman yerinde kalır. Hiçbir özellik, slayt ya da değişiklik bunları gizleyemez, küçültemez ya da
  kaplayamaz; böyle bir seçenek önerilmez bile. Slaytlar (duyurular, "Bugünkü sınavlar" vb.) yalnızca ortadaki
  duyuru alanının içinde tasarlanır. (Acil durum ekranı ve panelden seçilen "Yalnızca duyurular / Tam ekran saat"
  biçimleri okulun kendi seçimidir, bu kuralın dışındadır.)

## 4a. Türkçe yazım

- Arayüzdeki bütün metinler (web, mobil, pano, bildirim, e-posta, Excel) Türkçe yazım kurallarına uyar
  (TDK yazımı, büyük harf, bağlaç "de/da" ve soru eki "mi" ayrı, kesme işareti vb.).
- Devrik cümle kullanılmaz; yüklem sondadır. Örnek: "Bugün: Ayşe Yılmaz izinli. 2 dersi ve 1 nöbet yeri boş."
  (Yanlış: "Bugün 3 boş: 2 ders, 1 nöbet yeri · Ayşe Yılmaz izinli".)
- Yeni metin eklerken ve var olan bir metne dokunurken bu kural kontrol edilir.

## 5. KVKK

- Gerçek okul belgeleri ve kişisel veriler depoya eklenmez.
- Testler, videolar ve ekran görüntüleri yalnızca uydurma (sentetik) verilerle hazırlanır.

## 6. Teslim

- Mobil değişikliklerden sonra `mobile/app.json` içindeki version ve versionCode artırılır, commit ve push yapılır, APK derlemesi beklenir ve indirme bağlantısı paylaşılır.
- Pull request yalnızca kullanıcı isterse açılır.
