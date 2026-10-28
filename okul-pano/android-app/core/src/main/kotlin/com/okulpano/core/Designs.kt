package com.okulpano.core

/**
 * Hazır duyuru şablonları (packages/shared/src/designs.ts ile aynı tanımlar): öğretmen yalnızca metinleri yazar,
 * panoda tasarımlı bir slayt oluşur.
 */
data class DesignPalette(val name: String, val from: Long, val to: Long, val accent: Long)

val DESIGN_PALETTES = linkedMapOf(
  "petrol" to DesignPalette("Petrol", 0xFF0D4F66, 0xFF1F8BAD, 0xFFFBBF24),
  "navy" to DesignPalette("Lacivert", 0xFF0F1F45, 0xFF1E4F91, 0xFFF2A900),
  "emerald" to DesignPalette("Zümrüt", 0xFF064E3B, 0xFF0F8A6A, 0xFFFDE047),
  "burgundy" to DesignPalette("Bordo", 0xFF4C0519, 0xFF9F1D35, 0xFFFCD34D),
  "amber" to DesignPalette("Turuncu", 0xFF7C2D12, 0xFFD9640E, 0xFFFEF3C7),
  "red" to DesignPalette("Kırmızı", 0xFF7F1D1D, 0xFFDC2626, 0xFFFFFFFF),
  "slate" to DesignPalette("Gece", 0xFF0B1220, 0xFF334155, 0xFF38BDF8),
)

data class DesignField(val key: String, val label: String, val placeholder: String, val multiline: Boolean = false, val image: Boolean = false, val max: Int)

data class DesignTemplate(
  val id: String,
  val name: String,
  val description: String,
  val kicker: String,
  val palette: String,
  /** "split": solda metin, sağda büyük simge · "center": ortada büyük başlık */
  val layout: String,
  val headline: DesignField,
  val subline: DesignField? = null,
  val info: List<DesignField> = emptyList(),
  val note: DesignField? = null,
  val photo: DesignField? = null,
  val achievementsOnly: Boolean = false,
) {
  /** Şablonun bütün alanları (fotoğraf, başlık, alt satır, bilgiler, not) */
  val fields: List<DesignField> get() = listOfNotNull(photo, headline, subline) + info + listOfNotNull(note)
}

private val DATE = DesignField("date", "Tarih", "14 Kasım 2026 Cuma", max = 40)
private val TIME = DesignField("time", "Saat", "14:00", max = 30)
private val PLACE = DesignField("place", "Yer", "Konferans salonu", max = 60)
private fun note(placeholder: String) = DesignField("note", "Not (isteğe bağlı)", placeholder, multiline = true, max = 160)
private val PHOTO = DesignField("photo", "Fotoğraf (isteğe bağlı)", "", image = true, max = 500)

val DESIGN_TEMPLATES = listOf(
  DesignTemplate(
    "monthStudent", "Ayın öğrencisi", "Fotoğraf, ad, sınıf ve neden", "Ayın Öğrencisi", "amber", "center",
    headline = DesignField("name", "Öğrenci", "Elif Yılmaz", max = 60),
    subline = DesignField("class", "Sınıf", "11-B", max = 30),
    info = listOf(DesignField("month", "Ay", "Ekim 2026", max = 30)),
    note = DesignField("note", "Neden seçildi", "Derslerdeki başarısı, yardımseverliği ve örnek davranışlarıyla.", multiline = true, max = 160),
    photo = PHOTO, achievementsOnly = true,
  ),
  DesignTemplate(
    "achievement", "Başarı / derece", "Fotoğraflı başarı duyurusu", "Gururla Duyururuz", "emerald", "split",
    headline = DesignField("name", "Öğrenci / takım", "Robotik Takımımız", max = 60),
    subline = DesignField("achievement", "Derece", "Türkiye Üçüncüsü", max = 50),
    info = listOf(DesignField("event", "Yarışma", "FIRST LEGO League", max = 70), DesignField("date", "Tarih", "Ekim 2026", max = 40)),
    note = DesignField("note", "Not (isteğe bağlı)", "Takımımızı ve danışman öğretmenlerini kutlarız.", multiline = true, max = 160),
    photo = PHOTO, achievementsOnly = true,
  ),
  DesignTemplate(
    "parents", "Veli toplantısı", "Tarih, saat ve yer bilgisiyle", "Veli Toplantısı", "petrol", "split",
    headline = DesignField("title", "Başlık", "1. Dönem Veli Toplantısı", max = 70),
    info = listOf(DATE, TIME, PLACE.copy(placeholder = "Sınıflarda")),
    note = note("Tüm velilerimizin katılımını bekliyoruz."),
  ),
  DesignTemplate(
    "trip", "Okul gezisi", "Gezi yeri, tarih, buluşma ve katılım", "Okul Gezisi", "emerald", "split",
    headline = DesignField("title", "Gezi yeri", "Çanakkale Şehitliği Gezisi", max = 70),
    info = listOf(DATE, DesignField("meet", "Buluşma", "07:30 · Okul önü", max = 50), DesignField("who", "Katılım", "9. sınıflar · Son kayıt 5 Kasım", max = 60)),
    note = note("Veli izin dilekçesi sınıf öğretmenine teslim edilmelidir."),
  ),
  DesignTemplate(
    "congrats", "Başarı tebriği", "Öğrenci ya da takım, derece ve yarışma", "Tebrikler", "navy", "center",
    headline = DesignField("name", "Öğrenci / takım", "Elif Yılmaz · 11-B", max = 60),
    subline = DesignField("achievement", "Derece", "İl Birincisi", max = 50),
    info = listOf(DesignField("event", "Yarışma / etkinlik", "TÜBİTAK 4006 Bilim Fuarı", max = 70)),
    note = note("Öğrencimizi ve danışman öğretmenini kutlarız."),
  ),
  DesignTemplate(
    "event", "Etkinlik / tören", "Etkinlik adı, tarih, saat ve yer", "Etkinlik", "amber", "split",
    headline = DesignField("title", "Etkinlik adı", "Bilim Şenliği", max = 70),
    info = listOf(DATE, TIME, PLACE.copy(placeholder = "Okul bahçesi")),
    note = note("Tüm öğrencilerimiz davetlidir."),
  ),
  DesignTemplate(
    "exam", "Sınav duyurusu", "Sınav adı, tarih, saat ve salon", "Sınav Duyurusu", "slate", "split",
    headline = DesignField("title", "Sınav", "Matematik Ortak Sınavı", max = 70),
    info = listOf(DATE, TIME.copy(placeholder = "2. ders · 09:20"), PLACE.copy(label = "Salon", placeholder = "Kendi sınıflarında")),
    note = note("Kalem, silgi ve öğrenci kartınızı unutmayın."),
  ),
  DesignTemplate(
    "notice", "Önemli duyuru", "Büyük başlık ve kısa metin", "Önemli Duyuru", "red", "split",
    headline = DesignField("title", "Başlık", "Servis saatleri değişti", max = 70),
    note = DesignField("body", "Metin", "Yarından itibaren servisler 15:40'ta hareket edecektir.", multiline = true, max = 220),
  ),
  DesignTemplate(
    "celebration", "Kutlama / özel gün", "Bayram, anma ve özel günler", "Kutlu Olsun", "burgundy", "center",
    headline = DesignField("title", "Başlık", "23 Nisan Ulusal Egemenlik ve Çocuk Bayramı", max = 70),
    subline = DesignField("sub", "Alt başlık", "Kutlu olsun!", max = 60),
    note = note("Tören saat 09:00'da okul bahçesinde."),
  ),
)

/** Duyuru şablonu seçicisinde görünen şablonlar (başarı / ayın öğrencisi kendi sayfasında) */
val ANNOUNCEMENT_TEMPLATES = DESIGN_TEMPLATES.filterNot { it.achievementsOnly }

fun designTemplate(id: String): DesignTemplate = DESIGN_TEMPLATES.firstOrNull { it.id == id } ?: DESIGN_TEMPLATES.first()

/** Listede ve kayan özetlerde görünen başlık */
fun designTitle(d: AnnouncementDesign): String {
  val t = designTemplate(d.template)
  val head = d.fields[t.headline.key]?.trim().orEmpty()
  return if (head.isEmpty()) t.name else if (t.layout == "center") "${t.kicker}: $head" else head
}
