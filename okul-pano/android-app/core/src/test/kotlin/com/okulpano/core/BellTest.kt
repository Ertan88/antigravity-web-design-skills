package com.okulpano.core

import java.time.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class BellTest {
  private val periods = listOf(
    Period(1, "08:30", "09:10"),
    Period(2, "09:20", "10:00"),
    Period(3, "10:10", "10:50"),
    Period(4, "11:00", "11:40"),
    Period(5, "12:30", "13:10"),
    Period(6, "13:20", "14:00"),
  )
  private val weekdays = BellSchedule("a", "Hafta içi", listOf(1, 2, 3, 4, 5), periods)

  @Test fun beforeLessonAndBreakAndLunch() {
    assertIs<BellStatus.Before>(computeBellStatus(periods, parseClock("08:00")))
    val l = computeBellStatus(periods, parseClock("08:40"))
    assertIs<BellStatus.Lesson>(l)
    assertEquals(30 * 60, l.remainingSec)
    val b = computeBellStatus(periods, parseClock("09:15"))
    assertIs<BellStatus.Break>(b)
    assertEquals(false, b.isLunch)
    val lunch = computeBellStatus(periods, parseClock("12:00"))
    assertIs<BellStatus.Break>(lunch)
    assertTrue(lunch.isLunch)
    assertIs<BellStatus.After>(computeBellStatus(periods, parseClock("15:00")))
  }

  @Test fun specificScheduleWins() {
    val friday = BellSchedule("b", "Cuma", listOf(5), listOf(Period(1, "09:00", "09:40")))
    assertEquals("b", pickSchedule(listOf(weekdays, friday), 5)?.id)
    assertEquals("a", pickSchedule(listOf(weekdays, friday), 4)?.id)
    assertNull(pickSchedule(listOf(weekdays), 6))
  }

  @Test fun halfDayClipsAndDrops() {
    // 12:30–13:10 dersi 13:00'te biter ama 30 dakikadan kısa kalırsa yapılmaz (20 dk kuralı: 30 dk kalır, yapılır)
    val half = halfDayPeriods(periods, "13:00")
    assertEquals(listOf(1, 2, 3, 4, 5), half.map { it.no })
    assertEquals("13:00", half.last().end)
    // 12:50'de biterse 20 dakika kalır: yapılır; 12:45'te biterse 15 dakika: yapılmaz
    assertEquals(5, halfDayPeriods(periods, "12:50").size)
    assertEquals(4, halfDayPeriods(periods, "12:45").size)
  }

  @Test fun schoolDayHolidayAndHalfDay() {
    val cal = SchoolCalendar(listOf(weekdays), listOf(DayHoliday("2026-10-29", "Cumhuriyet Bayramı")), listOf(DayHoliday("2026-10-28", "Cumhuriyet Bayramı Arifesi")))
    val holiday = schoolDay(LocalDate.parse("2026-10-29"), cal)
    assertEquals("Cumhuriyet Bayramı", holiday.holiday)
    assertTrue(holiday.periods.isEmpty())
    val half = schoolDay(LocalDate.parse("2026-10-28"), cal)
    assertEquals("13:00", half.endsAt)
    assertEquals("13:00", half.periods.last().end)
    assertEquals(6, schoolDay(LocalDate.parse("2026-10-27"), cal).periods.size)
  }

  @Test fun countdownAndClock() {
    assertEquals("18:45", countdownText(1125))
    assertEquals("1 sa 05 dk", countdownText(3900))
    assertEquals("08:30", formatClock(parseClock("8:30")))
  }
}
