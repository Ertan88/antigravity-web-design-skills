package com.okulpano.app

import com.okulpano.core.ActiveEmergency
import com.okulpano.core.Announcement
import com.okulpano.core.AnnouncementDesign
import com.okulpano.core.BellSchedule
import com.okulpano.core.Board
import com.okulpano.core.Candidate
import com.okulpano.core.ControlCenter
import com.okulpano.core.DayHoliday
import com.okulpano.core.DutyDay
import com.okulpano.core.DutyEntry
import com.okulpano.core.DutyGap
import com.okulpano.core.InboxItem
import com.okulpano.core.InboxPage
import com.okulpano.core.Leave
import com.okulpano.core.Lesson
import com.okulpano.core.Me
import com.okulpano.core.MeToday
import com.okulpano.core.Member
import com.okulpano.core.MyDuty
import com.okulpano.core.OfflineScreen
import com.okulpano.core.Pending
import com.okulpano.core.Period
import com.okulpano.core.PlatformSchool
import com.okulpano.core.SchoolAccess
import com.okulpano.core.ScreenDisplay
import com.okulpano.core.ScreenLive
import com.okulpano.core.ScreensSummary
import com.okulpano.core.Signup
import com.okulpano.core.User
import com.okulpano.core.WeekDay
import java.time.Instant

/** Ekran görüntüleri için örnek okul: 4 Kasım 2026 Çarşamba, 10:05 (İstanbul) */
object Fixtures {
  const val SCHOOL = "s1"
  val NOW: Instant = Instant.parse("2026-11-04T07:05:00Z")
  const val TODAY = "2026-11-04"

  private val all = listOf(
    "announcements.manage", "announcements.approve", "emergency.manage", "board.control", "highlights.manage", "ticker.manage", "exams.manage",
    "duties.manage", "leaves.manage", "students.manage", "directory.manage", "schedule.manage", "screens.manage", "settings.manage", "labels.manage", "users.manage",
  )

  fun me(role: String, teacher: Boolean = false, superAdmin: Boolean = false, permissions: List<String> = all): Me {
    val name = when (role) {
      "owner" -> "Okul Müdürü"
      "admin" -> "Hasan Kaya"
      "editor" -> "Zeynep Arslan"
      else -> "Ayşe Yılmaz"
    }
    val user = User("u1", "${role}@ornek.k12.tr", if (superAdmin) "Platform Yöneticisi" else name, superAdmin)
    val school = SchoolAccess(SCHOOL, "Örnek Anadolu Lisesi", "ornek", role = if (role == "teacher") "editor" else role, permissions = permissions, teacherId = if (teacher) "t1" else null)
    return Me(user, if (superAdmin) emptyList() else listOf(school), SCHOOL)
  }

  private val periods = listOf(
    Period(1, "08:30", "09:10"), Period(2, "09:20", "10:00"), Period(3, "10:10", "10:50"), Period(4, "11:00", "11:40"),
    Period(5, "12:30", "13:10"), Period(6, "13:20", "14:00"), Period(7, "14:10", "14:50"),
  )

  val today = MeToday(
    teacher = com.okulpano.core.TeacherRef("t1", "Ayşe Yılmaz"),
    today = TODAY,
    bellSchedules = listOf(BellSchedule("b1", "Hafta içi", listOf(1, 2, 3, 4, 5), periods)),
    holidays = listOf(DayHoliday("2026-11-16", "Birinci Dönem Ara Tatili")),
    lessons = listOf(
      Lesson(3, 1, "10-B", "Matematik"), Lesson(3, 3, "9-A", "Matematik"), Lesson(3, 4, "11-A", "Geometri"), Lesson(3, 6, "12-C", "Matematik"),
      Lesson(1, 1, "9-A", "Matematik"), Lesson(1, 2, "9-A", "Matematik"), Lesson(2, 5, "10-B", "Matematik"), Lesson(4, 2, "11-A", "Geometri"), Lesson(5, 3, "12-C", "Matematik"),
    ),
    week = listOf(
      WeekDay("2026-11-02", 1),
      WeekDay("2026-11-03", 2, duties = listOf(MyDuty("d0", "Kantin önü"))),
      WeekDay("2026-11-04", 3, supervisor = "Hasan Kaya", duties = listOf(MyDuty("d1", "Ana Bina Kat 1", partners = listOf("Mesut Uzunlu")))),
      WeekDay("2026-11-05", 4),
      WeekDay("2026-11-06", 5, duties = listOf(MyDuty("d2", "Ön Bahçe"))),
    ),
  )

  val center = ControlCenter(
    today = TODAY,
    screens = ScreensSummary(3, 2, listOf(OfflineScreen("sc3", "Kantin", "2026-11-04T05:40:00Z"))),
    pending = Pending(2, 1),
    onAir = 7,
    dutyGaps = listOf(DutyGap("d9", "Ön Bahçe", "Selami Çalhan")),
  )

  val emergency = center.copy(emergency = ActiveEmergency("earthquake", "Bahçedeki toplanma alanına çıkın", "2026-11-04T07:01:00Z", "Okul Müdürü"))

  val boards = listOf(
    Board("sc1", "Giriş holü", "Zemin kat", "2026-11-04T07:04:50Z", true, ScreenLive(2, 9, "Veli Toplantısı"), ScreenDisplay()),
    Board("sc2", "Öğretmenler odası", null, "2026-11-04T07:04:55Z", true, ScreenLive(0, 4, "Nöbet çizelgesi", paused = true), ScreenDisplay(mode = "slides")),
    Board("sc3", "Kantin", null, "2026-11-04T05:40:00Z", false, null, ScreenDisplay(orientation = "portrait")),
  )

  val announcements = listOf(
    Announcement("a1", "design", "1. Dönem Veli Toplantısı", design = AnnouncementDesign("parents", "petrol", mapOf("title" to "1. Dönem Veli Toplantısı", "date" to "14 Kasım 2026 Cumartesi", "time" to "14:00", "place" to "Sınıflarda")), approvalStatus = "pending", createdBy = "u1", createdByName = "Ayşe Yılmaz", createdAt = "2026-11-04T06:00:00Z", updatedAt = "2026-11-04T06:00:00Z", endsAt = "2026-11-15T21:00:00Z"),
    Announcement("a2", "design", "Bilim Şenliği", design = AnnouncementDesign("event", "amber", mapOf("title" to "Bilim Şenliği", "date" to "20 Kasım 2026", "place" to "Okul bahçesi")), createdBy = "u1", createdByName = "Ayşe Yılmaz", createdAt = "2026-11-02T09:00:00Z", updatedAt = "2026-11-02T09:00:00Z", endsAt = "2026-11-21T21:00:00Z"),
    Announcement("a3", "text", "Kantinde yeni menü", body = "Pazartesiden itibaren sıcak çorba servisi başlıyor.", approvalStatus = "rejected", reviewNote = "Tarihi ekleyin", createdBy = "u1", createdByName = "Ayşe Yılmaz", createdAt = "2026-11-01T09:00:00Z", updatedAt = "2026-11-01T09:00:00Z"),
    Announcement("a4", "design", "Satranç Turnuvası", design = AnnouncementDesign("congrats", "navy", mapOf("name" to "Satranç Takımımız", "achievement" to "İl Birincisi")), createdBy = "u2", createdByName = "Hasan Kaya", createdAt = "2026-10-30T09:00:00Z", updatedAt = "2026-10-30T09:00:00Z"),
  )

  val leaves = listOf(Leave("l1", "t2", "2026-11-05", "2026-11-06", "Yıllık izin", "pending"))
  val teachers = listOf(com.okulpano.core.Teacher("t2", "Selami Çalhan"))
  val myLeaves = listOf(Leave("l2", "t1", "2026-11-10", "2026-11-10", "Görevlendirme", "approved"), Leave("l3", "t1", "2026-11-19", "2026-11-20", null, "pending"))

  val dutyDay = DutyDay(
    TODAY, 3, supervisor = "Hasan Kaya",
    entries = listOf(
      DutyEntry("d1", "Ana Bina Kat 1", "t1", "Ayşe Yılmaz"),
      DutyEntry("d3", "Ana Bina Kat 1", "t3", "Mesut Uzunlu"),
      DutyEntry("d9", "Ön Bahçe", "t2", "Selami Çalhan", onLeave = true),
      DutyEntry("d4", "Kantin önü", "t4", "Elif Demir"),
    ),
    gaps = listOf("d9"),
    candidates = listOf(Candidate("t5", "Murat Şahin", 1), Candidate("t6", "Fatma Koç", 2)),
  )

  val inbox = InboxPage(
    items = listOf(
      InboxItem("n1", kind = "approval", title = "Onay bekleyen duyuru", body = "Ayşe Yılmaz “1. Dönem Veli Toplantısı” duyurusunu onaya gönderdi.", at = "2026-11-04T06:00:00Z"),
      InboxItem("n2", kind = "duty-gap", title = "Bugün boş nöbet yeri", body = "Ön Bahçe · Selami Çalhan izinli", at = "2026-11-04T05:30:00Z"),
      InboxItem("n3", kind = "approved", title = "Duyurunuz onaylandı", body = "“Bilim Şenliği” panolarda yayında.", at = "2026-11-02T10:00:00Z", readAt = "2026-11-02T11:00:00Z", resolvedAt = "2026-11-02T11:00:00Z"),
    ),
    unread = 2,
    total = 3,
  )

  val members = listOf(
    Member("m1", "u1", "mudur@ornek.k12.tr", "Okul Müdürü", "owner", lastLoginAt = "2026-11-04T06:30:00Z"),
    Member("m2", "u2", "hasan.kaya@ornek.k12.tr", "Hasan Kaya", "admin", lastLoginAt = "2026-11-03T12:00:00Z"),
    Member("m3", "u3", "ayse.yilmaz@ornek.k12.tr", "Ayşe Yılmaz", "editor", listOf("announcements.manage"), teacherId = "t1", teacherName = "Ayşe Yılmaz", lastLoginAt = "2026-11-04T07:00:00Z"),
    Member("m4", "u4", "zeynep.arslan@ornek.k12.tr", "Zeynep Arslan", "editor", listOf("highlights.manage", "ticker.manage"), invitePending = true),
  )

  val schools = listOf(
    PlatformSchool("s1", "Örnek Anadolu Lisesi", city = "İstanbul", plan = "pro", maxScreens = 10, screenCount = 3, member = true, canOpen = true),
    PlatformSchool("s2", "Deneme Ortaokulu", city = "İzmir", plan = "trial", maxScreens = 3, screenCount = 1, trialEndsAt = "2026-11-08T21:00:00Z"),
    PlatformSchool("s3", "Bilim Koleji", city = "Ankara", plan = "basic", maxScreens = 5, screenCount = 4, supportAccessUntil = "2026-11-05T09:00:00Z", canOpen = true),
  )

  val signups = listOf(Signup("g1", "Yeni Umut İlkokulu", "Deniz Ak", "deniz.ak@ornek.test", "Bursa", "2026-11-03T08:00:00Z"))
}
