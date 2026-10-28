package com.okulpano.core

import java.time.Instant
import java.time.LocalDate

enum class LessonState { Past, Now, Next, Later }

data class DayLesson(val period: Period, val className: String, val subject: String, val state: LessonState)

/** Öğretmenin bugünü: zil durumu ve dersleri (panoyla aynı hesap) */
data class TeacherDay(
  val now: ZonedParts,
  val periods: List<Period>,
  val bell: BellStatus,
  val holiday: String?,
  /** Arife (yarım gün): dersler [endsAt] saatinde biter */
  val halfDay: String?,
  val endsAt: String?,
  val lessons: List<DayLesson>,
)

fun teacherDay(data: MeToday, instant: Instant): TeacherDay {
  val now = zonedParts(instant, data.timezone)
  // Panoyla aynı hesap: tatilde ders yok, arifede dersler yarım gün saatinde biter
  val day = schoolDay(now.date, data.calendar)
  val bell = if (day.periods.isNotEmpty()) computeBellStatus(day.periods, now.secondsOfDay, data.lunchThresholdMin) else BellStatus.Off
  val currentNo = (bell as? BellStatus.Lesson)?.period?.no
  val nextNo = when (bell) {
    is BellStatus.Lesson -> bell.next?.no
    is BellStatus.Break -> bell.next.no
    is BellStatus.Before -> bell.next.no
    else -> null
  }
  val byNo = day.periods.associateBy { it.no }
  var seenNext = false
  val lessons = data.lessons
    .filter { it.weekday == now.weekday && byNo.containsKey(it.periodNo) }
    .sortedBy { it.periodNo }
    .map { l ->
      val period = byNo.getValue(l.periodNo)
      val ended = parseClock(period.end) <= now.secondsOfDay
      var state = if (ended) LessonState.Past else if (l.periodNo == currentNo) LessonState.Now else LessonState.Later
      if (state == LessonState.Later && !seenNext && (nextNo == null || l.periodNo >= nextNo)) {
        state = LessonState.Next
        seenNext = true
      }
      DayLesson(period, l.className, l.subject, state)
    }
  return TeacherDay(now, day.periods, bell, day.holiday, day.halfDay, day.endsAt, lessons)
}

/** Zil kartındaki başlık ve geri sayım */
data class BellHeadline(val title: String, val caption: String, val remaining: Int?, val progress: Float?, val next: String?)

fun bellHeadline(b: BellStatus): BellHeadline = when (b) {
  is BellStatus.Lesson -> BellHeadline(
    "Şu an · ${periodLabel(b.period)}",
    if (b.next != null) "teneffüse kalan" else "günün bitmesine",
    b.remainingSec,
    1f - b.remainingSec.toFloat() / b.totalSec,
    b.next?.let { "Sıradaki: ${periodLabel(it)} ${it.start}" } ?: "Son ders",
  )
  is BellStatus.Break -> BellHeadline(
    if (b.isLunch) "Öğle arası" else "Teneffüs",
    "${periodLabel(b.next)} başlamasına",
    b.remainingSec,
    1f - b.remainingSec.toFloat() / b.totalSec,
    "${periodLabel(b.next)} ${b.next.start} – ${b.next.end}",
  )
  is BellStatus.Before -> BellHeadline("Günaydın", "derslerin başlamasına", b.remainingSec, null, "İlk ders ${b.next.start}")
  is BellStatus.After -> BellHeadline("Dersler bitti", "Son ders ${b.last.end}'de bitti", null, null, null)
  BellStatus.Off -> BellHeadline("Bugün ders yok", "İyi dinlenmeler", null, null, null)
}

/** 1125 → "18:45"; bir saatten uzunsa "1 sa 05 dk" */
fun countdownText(sec: Int): String {
  val s = maxOf(0, sec)
  val h = s / 3600
  val m = (s % 3600) / 60
  return if (h > 0) "$h sa %02d dk".format(m) else "%02d:%02d".format(m, s % 60)
}

/** O gün için zil çizelgesi (panoyla aynı seçim) */
fun periodsFor(data: MeToday, date: LocalDate): List<Period> = pickSchedule(data.bellSchedules, isoWeekday(date))?.let { sortPeriods(it.periods) } ?: emptyList()
