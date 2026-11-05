# Çalışma kuralları (Okul Yayın / okul-pano)

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

## 4. KVKK

- Gerçek okul belgeleri ve kişisel veriler depoya eklenmez.
- Testler, videolar ve ekran görüntüleri yalnızca uydurma (sentetik) verilerle hazırlanır.

## 5. Teslim

- Mobil değişikliklerden sonra `mobile/app.json` içindeki version ve versionCode artırılır, commit ve push yapılır, APK derlemesi beklenir ve indirme bağlantısı paylaşılır.
- Pull request yalnızca kullanıcı isterse açılır.
