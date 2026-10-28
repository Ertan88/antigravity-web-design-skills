package com.okulpano.core

import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

val TR: Locale = Locale.forLanguageTag("tr-TR")
private val FULL = DateTimeFormatter.ofPattern("d MMMM yyyy EEEE", TR)
private val DAY_MONTH_WEEKDAY = DateTimeFormatter.ofPattern("d MMMM EEEE", TR)
private val DAY_MONTH = DateTimeFormatter.ofPattern("d MMMM", TR)
private val CLOCK = DateTimeFormatter.ofPattern("HH:mm", TR)

val WEEKDAY_SHORT = listOf("", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz")
val WEEKDAY_LONG = listOf("", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar")

/** "2026-11-16" ya da tarih-saat → telefonun saat dilimindeki gün */
fun localDateOf(iso: String, zone: ZoneId = ZoneId.systemDefault()): LocalDate =
  if (iso.length <= 10) LocalDate.parse(iso) else Instant.parse(iso).atZone(zone).toLocalDate()

/** Kısaltmasız, yıl ve gün adıyla: "16 Kasım 2026 Pazartesi" */
fun fullDate(iso: String): String = localDateOf(iso).format(FULL)

fun fullDate(d: LocalDate): String = d.format(FULL)

/** "16 Kasım 2026 Pazartesi – 20 Kasım 2026 Cuma" (aynı günse tek tarih) */
fun dateSpan(a: String, b: String): String = if (a == b) fullDate(a) else "${fullDate(a)} – ${fullDate(b)}"

/** "29 Ekim Perşembe" */
fun dayTitle(iso: String): String = localDateOf(iso).format(DAY_MONTH_WEEKDAY)

fun dayMonth(iso: String): String = localDateOf(iso).format(DAY_MONTH)

/** Tarih-saatin telefonun saatine göre saat kısmı: "14:05" */
fun clockOf(iso: String, zone: ZoneId = ZoneId.systemDefault()): String = Instant.parse(iso).atZone(zone).format(CLOCK)

fun timeAgo(iso: String?, now: Instant = Instant.now()): String {
  if (iso.isNullOrBlank()) return "hiç"
  val min = Duration.between(Instant.parse(iso), now).toMinutes()
  return when {
    min < 1 -> "az önce"
    min < 60 -> "$min dk önce"
    min < 60 * 24 -> "${(min + 30) / 60} saat önce"
    else -> "${(min + 720) / (60 * 24)} gün önce"
  }
}

fun greeting(hour: Int): String = when {
  hour < 11 -> "Günaydın"
  hour < 17 -> "İyi günler"
  else -> "İyi akşamlar"
}

/** "29.10.2026" ya da "2026-10-29" → tarih */
fun parseTrDate(v: String): LocalDate? {
  val t = v.trim()
  runCatching { return LocalDate.parse(t) }
  val m = Regex("""^(\d{1,2})[./](\d{1,2})[./](\d{4})$""").matchEntire(t) ?: return null
  return runCatching { LocalDate.of(m.groupValues[3].toInt(), m.groupValues[2].toInt(), m.groupValues[1].toInt()) }.getOrNull()
}

fun trDateInput(d: LocalDate): String = "%02d.%02d.%04d".format(d.dayOfMonth, d.monthValue, d.year)

fun initials(name: String): String = name.split(Regex("\\s+")).filter { it.isNotEmpty() }.take(2).joinToString("") { it.take(1).uppercase(TR) }
