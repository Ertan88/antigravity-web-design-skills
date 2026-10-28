package com.okulpano.core

import kotlinx.serialization.Serializable

/** Bir ders saati. `no`, ders programı kayıtlarının bağlandığı kalıcı numaradır. */
@Serializable
data class Period(val no: Int, val start: String, val end: String, val label: String? = null)

@Serializable
data class BellSchedule(
  val id: String,
  val name: String,
  /** ISO hafta günleri: 1 = Pazartesi … 7 = Pazar */
  val weekdays: List<Int>,
  val periods: List<Period>,
  val sortOrder: Int = 0,
)

/** Zilin şu anki durumu */
sealed interface BellStatus {
  data object Off : BellStatus
  data class Before(val next: Period, val remainingSec: Int) : BellStatus
  data class Lesson(val period: Period, val next: Period?, val remainingSec: Int, val totalSec: Int) : BellStatus
  data class Break(val isLunch: Boolean, val prev: Period, val next: Period, val remainingSec: Int, val totalSec: Int) : BellStatus
  data class After(val last: Period) : BellStatus
}

fun periodLabel(p: Period): String = p.label?.trim()?.takeIf { it.isNotEmpty() } ?: "${p.no}. Ders"

fun sortPeriods(periods: List<Period>): List<Period> = periods.sortedBy { parseClock(it.start) }

/**
 * Bugünün hafta gününe uyan zil çizelgesi. Birden çok çizelge aynı günü kapsıyorsa daha az gün kapsayan (daha özel)
 * olan geçerlidir: "Hafta içi" yanında "Cuma" çizelgesi varsa cuma günü "Cuma" kullanılır.
 */
fun pickSchedule(schedules: List<BellSchedule>, weekday: Int): BellSchedule? =
  schedules
    .filter { weekday in it.weekdays && it.periods.isNotEmpty() }
    .sortedWith(compareBy<BellSchedule> { it.weekdays.size }.thenBy { it.sortOrder })
    .firstOrNull()

/** İki ders arasındaki boşluk `lunchThresholdMin` dakikadan uzunsa öğle arası, değilse teneffüs. */
fun computeBellStatus(periods: List<Period>, secondsOfDay: Int, lunchThresholdMin: Int = 30): BellStatus {
  val sorted = sortPeriods(periods)
  val first = sorted.firstOrNull() ?: return BellStatus.Off
  val last = sorted.last()
  val firstStart = parseClock(first.start)
  if (secondsOfDay < firstStart) return BellStatus.Before(first, firstStart - secondsOfDay)
  sorted.forEachIndexed { i, p ->
    val start = parseClock(p.start)
    val end = parseClock(p.end)
    if (secondsOfDay in start until end) return BellStatus.Lesson(p, sorted.getOrNull(i + 1), end - secondsOfDay, end - start)
    val next = sorted.getOrNull(i + 1)
    if (next != null) {
      val nextStart = parseClock(next.start)
      if (secondsOfDay in end until nextStart) {
        val total = nextStart - end
        return BellStatus.Break(total >= lunchThresholdMin * 60, p, next, nextStart - secondsOfDay, total)
      }
    }
  }
  return BellStatus.After(last)
}
