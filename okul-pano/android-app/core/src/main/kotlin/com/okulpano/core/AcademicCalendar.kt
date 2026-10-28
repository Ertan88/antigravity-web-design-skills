package com.okulpano.core

import java.time.LocalDate

/** "2026-2027" */
fun academicYearLabel(startYear: Int) = "$startYear-${startYear + 1}"

/** Bir tarihin ait olduğu eğitim yılı (1 Eylül başlangıç): 2027-03-10 → 2026 */
fun academicYearOf(d: LocalDate) = if (d.monthValue >= 9) d.year else d.year - 1

data class DateSpan(val start: LocalDate, val end: LocalDate)

/** Aralığın başındaki ve sonundaki hafta sonu günlerini atar (MEB tatilleri iş günleriyle duyurur) */
private fun trimWeekends(start: LocalDate, end: LocalDate): DateSpan {
  var s = start
  var e = end
  while (s < e && isWeekend(s)) s = s.plusDays(1)
  while (e > s && isWeekend(e)) e = e.minusDays(1)
  return DateSpan(s, e)
}

/** Yarıyıl tatili: birinci dönemin bitişi ile ikinci dönemin başlangıcı arasındaki iş günleri */
fun semesterBreak(cal: AcademicCalendarData) = trimWeekends(LocalDate.parse(cal.term1End).plusDays(1), LocalDate.parse(cal.term2Start).minusDays(1))

/** Öğretmenlerin mesleki çalışma (seminer) dönemleri: duyuruda yazıyorsa o, yoksa yönetmelikteki kural */
fun seminarPeriods(cal: AcademicCalendarData, startYear: Int): List<DateSpan> {
  cal.seminars?.takeIf { it.isNotEmpty() }?.let { list -> return list.map { DateSpan(LocalDate.parse(it.start), LocalDate.parse(it.end)) } }
  val lessonsStart = LocalDate.parse(cal.lessonsStart)
  val lessonsEnd = LocalDate.parse(cal.lessonsEnd)
  val out = mutableListOf<DateSpan>()
  val first = trimWeekends(LocalDate.of(startYear, 9, 1), lessonsStart.minusDays(1))
  if (first.start < lessonsStart && !isWeekend(first.start)) out += first
  val juneEnd = LocalDate.of(startYear + 1, 6, 30)
  val last = trimWeekends(lessonsEnd.plusDays(1), juneEnd)
  if (last.start <= juneEnd && !isWeekend(last.start)) out += last
  return out
}

/** Yaz tatili: yıl sonu seminerinin ertesinden 31 Ağustos'a kadar */
fun summerBreak(cal: AcademicCalendarData, startYear: Int): DateSpan {
  val lessonsEnd = LocalDate.parse(cal.lessonsEnd)
  val lastSeminarEnd = seminarPeriods(cal, startYear).filter { it.start > lessonsEnd }.maxOfOrNull { it.end }
  return trimWeekends((lastSeminarEnd ?: lessonsEnd).plusDays(1), LocalDate.of(startYear + 1, 8, 31))
}

fun spanText(s: DateSpan) = if (s.start == s.end) fullDate(s.start) else "${fullDate(s.start)} – ${fullDate(s.end)}"

/** Takvimin satır satır özeti: tarihler kısaltmasız, yıl ve gün adıyla */
fun calendarSummary(cal: AcademicCalendarData, startYear: Int): List<Pair<String, String>> {
  val sem = semesterBreak(cal)
  val summer = summerBreak(cal, startYear)
  return buildList {
    add("Dersler başlar" to fullDate(cal.lessonsStart))
    cal.breaks.filter { it.start < cal.term1End }.forEach { add(it.name to dateSpan(it.start, it.end)) }
    add("Birinci dönem biter" to fullDate(cal.term1End))
    add("Yarıyıl tatili" to spanText(sem))
    add("İkinci dönem başlar" to fullDate(cal.term2Start))
    cal.breaks.filter { it.start > cal.term1End }.forEach { add(it.name to dateSpan(it.start, it.end)) }
    add("Ders yılı biter" to fullDate(cal.lessonsEnd))
    add("Yaz tatili" to spanText(summer))
  }
}
