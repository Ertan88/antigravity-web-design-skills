package com.okulpano.core

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/* API yanıtları: sunucudaki (apps/api) ve Expo uygulamasındaki (mobile/src/data.ts) tiplerin Kotlin karşılığı.
   Bilinmeyen alanlar yok sayılır; yeni alan eklenmesi eski uygulamayı bozmaz. */

@Serializable
data class User(val id: String, val email: String, val fullName: String, val isSuperAdmin: Boolean = false)

@Serializable
data class SchoolAccess(
  val id: String,
  val name: String,
  val slug: String = "",
  val logoUrl: String? = null,
  val isActive: Boolean = true,
  val role: String,
  val permissions: List<String> = emptyList(),
  /** Bağlı öğretmen kaydı: kendi nöbetleri ve ders programı */
  val teacherId: String? = null,
  /** Üyelik yok; okulun (müdürün) verdiği süreli destek erişimi */
  val support: Boolean? = null,
)

@Serializable
data class Me(val user: User, val schools: List<SchoolAccess>, val lastSchoolId: String? = null)

@Serializable
data class SchoolSettings(val requireApproval: Boolean? = null, val schoolType: String? = null, val lunchThresholdMin: Int? = null)

@Serializable
data class SchoolInfo(
  val id: String,
  val name: String,
  val logoUrl: String? = null,
  val timezone: String = "Europe/Istanbul",
  val supportAccessUntil: String? = null,
  val settings: SchoolSettings = SchoolSettings(),
)

@Serializable
data class Lesson(val weekday: Int, val periodNo: Int, val className: String, val subject: String)

@Serializable
data class MyLeave(val id: String, val startDate: String, val endDate: String, val note: String? = null, val status: String = "pending")

@Serializable
data class MyDuty(val dutyId: String, val area: String, val partners: List<String> = emptyList(), val substituteFor: String? = null, val coveredBy: String? = null)

@Serializable
data class WeekDay(val date: String, val weekday: Int, val holiday: String? = null, val supervisor: String? = null, val duties: List<MyDuty> = emptyList())

@Serializable
data class TeacherRef(val id: String, val fullName: String)

@Serializable
data class MeToday(
  val teacher: TeacherRef? = null,
  val today: String,
  val timezone: String = "Europe/Istanbul",
  val lunchThresholdMin: Int = 30,
  val bellSchedules: List<BellSchedule> = emptyList(),
  val holidays: List<DayHoliday> = emptyList(),
  val halfDays: List<DayHoliday> = emptyList(),
  val halfDayEnd: String? = null,
  val lessons: List<Lesson> = emptyList(),
  val leaves: List<MyLeave> = emptyList(),
  val week: List<WeekDay> = emptyList(),
) {
  val calendar: SchoolCalendar get() = SchoolCalendar(bellSchedules, holidays, halfDays, halfDayEnd)
}

@Serializable
data class ActiveEmergency(val type: String, val message: String? = null, val startedAt: String, val startedBy: String? = null)

@Serializable
data class OfflineScreen(val id: String, val name: String, val lastSeenAt: String? = null)

@Serializable
data class ScreensSummary(val total: Int = 0, val online: Int = 0, val offline: List<OfflineScreen> = emptyList())

@Serializable
data class Pending(val announcements: Int = 0, val leaves: Int = 0) {
  val total get() = announcements + leaves
}

@Serializable
data class EndingToday(val id: String, val title: String, val endsAt: String)

@Serializable
data class DutyGap(val dutyId: String, val area: String, val teacherName: String)

@Serializable
data class ControlCenter(
  val today: String,
  val emergency: ActiveEmergency? = null,
  val screens: ScreensSummary = ScreensSummary(),
  val pending: Pending = Pending(),
  val onAir: Int = 0,
  val endingToday: List<EndingToday> = emptyList(),
  val dutyGaps: List<DutyGap> = emptyList(),
  val holiday: String? = null,
)

@Serializable
data class ScreenLive(
  val slideIndex: Int = 0,
  val slideCount: Int = 0,
  val slideTitle: String? = null,
  val paused: Boolean = false,
  val sleeping: Boolean = false,
  val mode: String = "board",
)

@Serializable
data class ScreenDisplay(val orientation: String = "landscape", val mode: String = "board")

@Serializable
data class Board(
  val id: String,
  val name: String,
  val location: String? = null,
  val lastSeenAt: String? = null,
  val online: Boolean = false,
  val live: ScreenLive? = null,
  val display: ScreenDisplay = ScreenDisplay(),
)

@Serializable
data class AnnouncementDesign(val template: String, val palette: String, val fields: Map<String, String> = emptyMap())

@Serializable
data class AnnouncementSchedule(val days: List<Int> = emptyList(), val from: String? = null, val to: String? = null, val phase: String = "any")

@Serializable
data class Announcement(
  val id: String,
  val kind: String,
  val title: String,
  val body: String? = null,
  val imageUrl: String? = null,
  val design: AnnouncementDesign? = null,
  val screenIds: List<String>? = null,
  val schedule: AnnouncementSchedule? = null,
  val approvalStatus: String = "approved",
  val reviewNote: String? = null,
  val startsAt: String? = null,
  val endsAt: String? = null,
  val isActive: Boolean = true,
  val sortOrder: Int = 0,
  val createdBy: String? = null,
  val createdByName: String? = null,
  val createdAt: String = "",
  val updatedAt: String = "",
)

@Serializable
data class Leave(
  val id: String,
  val teacherId: String,
  val startDate: String,
  val endDate: String,
  val note: String? = null,
  val approvalStatus: String = "pending",
  val createdAt: String = "",
)

@Serializable
data class Substitute(val id: String, val teacherId: String, val teacherName: String)

@Serializable
data class DutyEntry(
  val dutyId: String,
  val area: String,
  val teacherId: String,
  val teacherName: String,
  val onLeave: Boolean = false,
  val leavePending: Boolean = false,
  val substitute: Substitute? = null,
)

@Serializable
data class Candidate(val teacherId: String, val fullName: String, val monthCount: Int = 0)

@Serializable
data class DutyDay(
  val date: String,
  val weekday: Int,
  val holiday: String? = null,
  val supervisor: String? = null,
  val entries: List<DutyEntry> = emptyList(),
  val gaps: List<String> = emptyList(),
  val candidates: List<Candidate> = emptyList(),
)

@Serializable
data class InboxItem(
  val id: String,
  val key: String = "",
  val kind: String,
  val title: String,
  val body: String = "",
  val at: String,
  val to: String = "/",
  val readAt: String? = null,
  val resolvedAt: String? = null,
)

@Serializable
data class InboxPage(val items: List<InboxItem> = emptyList(), val unread: Int = 0, val total: Int = 0, val nextBefore: String? = null)

@Serializable
data class Teacher(val id: String, val fullName: String, val isActive: Boolean = true)

@Serializable
data class Member(
  val id: String,
  val userId: String,
  val email: String,
  val fullName: String,
  val role: String,
  val permissions: List<String> = emptyList(),
  val effectivePermissions: List<String> = emptyList(),
  val teacherId: String? = null,
  val teacherName: String? = null,
  val lastLoginAt: String? = null,
  val invitePending: Boolean = false,
)

@Serializable
data class UpcomingHoliday(val id: String? = null, val date: String, val name: String, val source: String)

@Serializable
data class BridgeDay(val date: String, val near: String)

@Serializable
data class HolidayList(
  val holidays: List<UpcomingHoliday> = emptyList(),
  val halfDays: List<DayHoliday> = emptyList(),
  val bridges: List<BridgeDay> = emptyList(),
)

@Serializable
data class AuditRow(val id: String, val action: String, val entity: String, val summary: String? = null, val createdAt: String, val userName: String? = null)

@Serializable
data class PlatformSchool(
  val id: String,
  val name: String,
  val slug: String = "",
  val city: String? = null,
  val plan: String = "trial",
  val maxScreens: Int = 0,
  val isActive: Boolean = true,
  val trialEndsAt: String? = null,
  val supportAccessUntil: String? = null,
  val screenCount: Int = 0,
  val createdAt: String = "",
  val member: Boolean = false,
  val canOpen: Boolean = false,
)

@Serializable
data class Signup(
  val id: String,
  val schoolName: String,
  val ownerName: String,
  val email: String,
  val city: String? = null,
  val createdAt: String = "",
  val expired: Boolean = false,
)

@Serializable
data class AcademicBreak(val name: String, val start: String, val end: String)

@Serializable
data class SeminarSpan(val start: String, val end: String)

@Serializable
data class AcademicCalendarData(
  val lessonsStart: String,
  val term1End: String,
  val term2Start: String,
  val lessonsEnd: String,
  val breaks: List<AcademicBreak> = emptyList(),
  val seminars: List<SeminarSpan>? = null,
)

@Serializable
data class PendingCalendar(val data: AcademicCalendarData, val sourceUrl: String = "", val foundAt: String = "")

@Serializable
data class CalendarRow(
  val startYear: Int,
  val label: String,
  val data: AcademicCalendarData,
  val source: String = "builtin",
  val sourceUrl: String? = null,
  val status: String = "confirmed",
  val pending: PendingCalendar? = null,
  val checkedAt: String? = null,
)

@Serializable
data class ScanResult(val outcome: String = "", val message: String = "")

@Serializable
data class Student(val id: String, val fullName: String, val birthDate: String, val classGroupId: String? = null)

@Serializable
data class ClassGroup(val id: String, val name: String)

@Serializable
data class Exam(val id: String, val title: String, val examAt: String, val isActive: Boolean = true)

@Serializable
data class SchoolEvent(
  val id: String,
  val title: String,
  val organizer: String? = null,
  val date: String,
  val time: String? = null,
  val place: String? = null,
  val isActive: Boolean = true,
)

/** İçerik ekranındaki kayıtlar (kayan yazı, başarı, kitap…): alanları türüne göre değişir */
typealias ContentRow = JsonObject

@Serializable
data class Tokens(val accessToken: String, val refreshToken: String)

@Serializable
data class UploadResult(val url: String)

@Serializable
data class CommandResult(val delivered: Boolean = false)

@Serializable
data class PreviewToken(val token: String)

@Serializable
data class ApprovalResult(val approvalStatus: String = "pending")

@Serializable
data class InviteInfo(val emailed: Boolean = false, val inviteUrl: String = "")

@Serializable
data class AddMemberResult(val id: String = "", val existingUser: Boolean = false, val invite: InviteInfo? = null)

@Serializable
data class PasswordResult(val ok: Boolean = true, val refreshToken: String? = null)

@Serializable
data class ApiErrorBody(val message: String? = null, @SerialName("error") val error: String? = null)
