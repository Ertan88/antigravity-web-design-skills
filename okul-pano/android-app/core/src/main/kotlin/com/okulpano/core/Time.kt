package com.okulpano.core

import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime

/** Okulun saat dilimine göre "duvar saati": cihaz saati yanlış ayarlı olsa da zil okulun saatine göre hesaplanır. */
data class ZonedParts(
  val date: LocalDate,
  /** ISO hafta günü: 1 = Pazartesi … 7 = Pazar */
  val weekday: Int,
  val hour: Int,
  val minute: Int,
  val second: Int,
) {
  /** Gece yarısından bu yana geçen saniye */
  val secondsOfDay: Int get() = hour * 3600 + minute * 60 + second
  val isoDate: String get() = date.toString()
}

fun zonedParts(instant: Instant, timeZone: String): ZonedParts {
  val z: ZonedDateTime = instant.atZone(runCatching { ZoneId.of(timeZone) }.getOrDefault(ZoneId.of("Europe/Istanbul")))
  return ZonedParts(z.toLocalDate(), z.dayOfWeek.value, z.hour, z.minute, z.second)
}

/** "08:30" → 30600 (gece yarısından itibaren saniye) */
fun parseClock(value: String): Int {
  val m = Regex("""^(\d{1,2}):(\d{2})$""").matchEntire(value.trim()) ?: throw IllegalArgumentException("Geçersiz saat: $value")
  val h = m.groupValues[1].toInt()
  val min = m.groupValues[2].toInt()
  require(h <= 23 && min <= 59) { "Geçersiz saat: $value" }
  return h * 3600 + min * 60
}

fun formatClock(secondsOfDay: Int): String {
  val h = (secondsOfDay / 3600) % 24
  val m = (secondsOfDay % 3600) / 60
  return "%02d:%02d".format(h, m)
}

/** Kalan süre: "MM:SS", bir saati aşarsa "S:MM:SS" */
fun formatDuration(totalSeconds: Int): String {
  val s = maxOf(0, totalSeconds)
  val h = s / 3600
  val m = (s % 3600) / 60
  val sec = s % 60
  return if (h > 0) "%d:%02d:%02d".format(h, m, sec) else "%02d:%02d".format(m, sec)
}

/** ISO hafta günü (1 = Pazartesi … 7 = Pazar) */
fun isoWeekday(date: LocalDate): Int = date.dayOfWeek.value

fun isWeekend(date: LocalDate) = date.dayOfWeek == DayOfWeek.SATURDAY || date.dayOfWeek == DayOfWeek.SUNDAY
