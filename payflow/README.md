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
| `src/app/` | Expo Router ekranları — `(tabs)/` alt menü sekmeleri; `card/[id]` kart ve ekstre, `card-pay` ödeme, `simulator`, `flow-settings`; `add` (Kart / Fatura / Günlük, fatura düzenleme), `card-new` (ekle/düzenle), `category-new` |
| `src/core/model.ts` | Kalıcı veri modeli: kart, fatura, harcama, kart ödemesi, ayarlar |
| `src/core/ledger.ts` | Kart ekstre defteri (devir zinciri) ve fatura vade hesabı |
| `src/core/parse.ts` | Türkçe tutar/faiz girişi okuma, tuş takımı |
| `src/store/` | Durum ağacı + AsyncStorage kalıcılığı, ana sayfa seçicileri, Zaman Nehri projeksiyonu, örnek veri |
| `src/notifications/` | Bildirim planı (3 gün / 1 gün / son gün + ekstre kesimi), kurulum, izin, Ödedim/Ertele butonları |
| `src/features/` | Harcama ve fatura formları, kategori ızgarası, hatırlatma seçici |

> Faiz hesapları **tahminidir**. Oranlar TCMB'nin aylık duyurusuna göre güncellenmelidir
> (`src/core/finance/rates.ts`). Kullanıcı kart bazında kendi bankasının oranını girebilir.
