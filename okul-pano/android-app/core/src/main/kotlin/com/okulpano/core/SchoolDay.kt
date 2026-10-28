package com.okulpano.core

import kotlinx.serialization.Serializable
import java.time.LocalDate

/**
 * Okul günü: tatil, arife (yarım gün). Arifede dersler okulun belirlediği saatte (varsayılan 13:00) biter; o saatten
 * sonra başlayan dersler yapılmaz, taşan ders o saatte biter. Panodaki ve paneldeki hesapla aynıdır.
 */
@Serializable
data class DayHoliday(val date: String, val name: String)

const val HALF_DAY_END_DEFAULT = "13:00"

/** Yarım günde kısalan dersin bu süreden kısa kalan kısmı yapılmaz (dakika) */
private const val MIN_CLIPPED_MIN = 20

fun halfDayPeriods(periods: List<Period>, end: String): List<Period> {
  val limit = parseClock(end)
  return sortPeriods(periods).mapNotNull { p ->
    val start = parseClock(p.start)
    if (start >= limit) return@mapNotNull null
    val stop = minOf(parseClock(p.end), limit)
    val clipped = stop < parseClock(p.end)
    if (clipped && stop - start < MIN_CLIPPED_MIN * 60) null else if (clipped) p.copy(end = formatClock(stop)) else p
  }
}

data class SchoolDay(
  val date: LocalDate,
  val weekday: Int,
  /** Tam gün tatil adı */
  val holiday: String?,
  /** Arife (yarım gün) adı */
  val halfDay: String?,
  /** O gün çalan ders saatleri: tatilde boş, arifede kısaltılmış */
  val periods: List<Period>,
  /** Arifede derslerin bittiği saat */
  val endsAt: String?,
)

data class SchoolCalendar(
  val schedules: List<BellSchedule>,
  val holidays: List<DayHoliday>,
  val halfDays: List<DayHoliday>,
  val halfDayEnd: String? = null,
)

fun schoolDay(date: LocalDate, cal: SchoolCalendar): SchoolDay {
  val iso = date.toString()
  val weekday = isoWeekday(date)
  val holiday = cal.holidays.firstOrNull { it.date == iso }?.name
  val halfDay = if (holiday != null) null else cal.halfDays.firstOrNull { it.date == iso }?.name
  val schedule = if (holiday != null) null else pickSchedule(cal.schedules, weekday)
  val end = cal.halfDayEnd?.takeIf { it.isNotBlank() } ?: HALF_DAY_END_DEFAULT
  val periods = when {
    schedule == null -> emptyList()
    halfDay != null -> halfDayPeriods(schedule.periods, end)
    else -> sortPeriods(schedule.periods)
  }
  return SchoolDay(date, weekday, holiday, halfDay, periods, if (halfDay != null) end else null)
}
