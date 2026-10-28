package com.okulpano.core

import kotlin.test.Test
import kotlin.test.assertEquals

class MiscTest {
  private fun me(superAdmin: Boolean = false) = Me(User("u", "a@b.c", "Ayşe Yılmaz", superAdmin), emptyList())

  @Test fun roles() {
    val teacherWithAnnouncements = SchoolAccess("s", "Okul", role = "editor", permissions = listOf(Perm.ANNOUNCEMENTS), teacherId = "t")
    assertEquals(AppRole.Teacher, appRole(me(), teacherWithAnnouncements, false))
    assertEquals(AppRole.Editor, appRole(me(), teacherWithAnnouncements.copy(teacherId = null), false))
    assertEquals(AppRole.Editor, appRole(me(), teacherWithAnnouncements.copy(permissions = listOf(Perm.TICKER)), false))
    assertEquals(AppRole.Owner, appRole(me(), teacherWithAnnouncements.copy(role = "owner"), false))
    assertEquals(AppRole.Platform, appRole(me(true), null, false))
    assertEquals(AppRole.Owner, appRole(me(true), teacherWithAnnouncements.copy(role = "owner"), false))
  }

  @Test fun turkishDates() {
    assertEquals("16 Kasım 2026 Pazartesi", fullDate("2026-11-16"))
    assertEquals("16 Kasım 2026 Pazartesi – 20 Kasım 2026 Cuma", dateSpan("2026-11-16", "2026-11-20"))
    assertEquals(java.time.LocalDate.of(2026, 10, 29), parseTrDate("29.10.2026"))
    assertEquals("AY", initials("ayşe yılmaz"))
  }

  @Test fun academicCalendar() {
    val cal = AcademicCalendarData("2026-09-14", "2027-01-22", "2027-02-08", "2027-06-25", listOf(AcademicBreak("Birinci Dönem Ara Tatili", "2026-11-16", "2026-11-20")))
    val summer = summerBreak(cal, 2026)
    // Ders yılı 25 Haziran Cuma biter; 28–30 Haziran seminer, yaz tatili 1 Temmuz Perşembe'den 31 Ağustos Salı'ya
    assertEquals("2027-07-01", summer.start.toString())
    assertEquals("2027-08-31", summer.end.toString())
    assertEquals("2027-01-25", semesterBreak(cal).start.toString())
    assertEquals("Yaz tatili", calendarSummary(cal, 2026).last().first)
  }

  @Test fun designTitles() {
    assertEquals("Kutlu Olsun: 23 Nisan", designTitle(AnnouncementDesign("celebration", "burgundy", mapOf("title" to "23 Nisan"))))
    assertEquals("Veli toplantısı", designTitle(AnnouncementDesign("parents", "petrol")))
    assertEquals(7, ANNOUNCEMENT_TEMPLATES.size)
  }

  @Test fun parsesMeToday() {
    val text = """{"teacher":{"id":"t","fullName":"Elif"},"today":"2026-10-28","timezone":"Europe/Istanbul","lunchThresholdMin":30,
      "bellSchedules":[{"id":"a","name":"H","weekdays":[1,2,3,4,5],"periods":[{"no":1,"start":"08:30","end":"09:10"}],"sortOrder":0}],
      "holidays":[],"halfDays":[{"date":"2026-10-28","name":"Arife"}],"halfDayEnd":"13:00","lessons":[{"weekday":3,"periodNo":1,"className":"9-A","subject":"Mat"}],
      "leaves":[],"week":[{"date":"2026-10-28","weekday":3,"holiday":null,"supervisor":null,"duties":[]}],"extra":1}"""
    val d = json.decodeFromString(MeToday.serializer(), text)
    val day = teacherDay(d, java.time.Instant.parse("2026-10-28T05:35:00Z")) // 08:35 İstanbul
    assertEquals(LessonState.Now, day.lessons.single().state)
    assertEquals("Arife", day.halfDay)
  }
}
