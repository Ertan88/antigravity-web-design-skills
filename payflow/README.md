# PayFlow

Faturaları, kredi kartlarını ve günlük harcamaları tek bir akışta takip eden; son ödeme
günlerinde hatırlatan ve kart faizini (TCMB tavan oranları + KKDF/BSMV) tahmin eden
mobil ödeme asistanı. iOS ve Android — Expo + React Native + TypeScript, Firebase.

## Geliştirme

```bash
npm install
npm test          # finans motoru testleri
npm run typecheck
npm start         # telefonda Expo Go uygulamasıyla QR kodu okut
```

## Yapı

| Klasör | İçerik |
|---|---|
| `src/core/money.ts` | Kuruş bazlı tam sayı para işlemleri, `₺` biçimlendirme |
| `src/core/finance/` | Faiz kademeleri, ekstre devri, kart dönemleri, taksitler, simülatör |
| `src/core/reminders.ts` | Son ödeme hatırlatma planı (3 gün / 1 gün / son gün, seçilen saat) |
| `src/core/categories.ts` | Fatura türleri, günlük kategoriler, özel kategori oluşturma |
| `src/core/schedule.ts` | Kalan gün, aciliyet seviyesi, Türkçe tarih/selamlama |
| `src/theme/` | Koyu / açık tema renkleri (tasarımla birebir), sistem/koyu/açık tercih saklama |
| `src/ui/` | İkon seti, temel bileşenler (metin, kart, kategori rozeti, skor halkası), alt menü |
| `src/app/` | Expo Router ekranları — `(tabs)/` alt menü sekmeleri, `add` hızlı ekle modalı |
| `src/data/demo.ts` | Geçici örnek veri (Adım 3'te gerçek veriyle değişecek) |

> Faiz hesapları **tahminidir**. Oranlar TCMB'nin aylık duyurusuna göre güncellenmelidir
> (`src/core/finance/rates.ts`). Kullanıcı kart bazında kendi bankasının oranını girebilir.
