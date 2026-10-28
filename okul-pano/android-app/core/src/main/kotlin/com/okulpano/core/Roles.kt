package com.okulpano.core

/** Okul içindeki yetkiler (packages/shared/src/permissions.ts ile aynı anahtarlar) */
object Perm {
  const val ANNOUNCEMENTS = "announcements.manage"
  const val APPROVE = "announcements.approve"
  const val EMERGENCY = "emergency.manage"
  const val BOARD = "board.control"
  const val HIGHLIGHTS = "highlights.manage"
  const val TICKER = "ticker.manage"
  const val EXAMS = "exams.manage"
  const val DUTIES = "duties.manage"
  const val LEAVES = "leaves.manage"
  const val STUDENTS = "students.manage"
  const val DIRECTORY = "directory.manage"
  const val SCHEDULE = "schedule.manage"
  const val SCREENS = "screens.manage"
  const val SETTINGS = "settings.manage"
  const val LABELS = "labels.manage"
  const val USERS = "users.manage"

  val LABELS_TR = linkedMapOf(
    ANNOUNCEMENTS to "Duyurular",
    APPROVE to "Duyuruları onaylama",
    EMERGENCY to "Acil durum uyarısı",
    BOARD to "Panoları uzaktan yönetme",
    HIGHLIGHTS to "Başarılar, etkinlikler, haftanın kitabı",
    TICKER to "Kayan yazı",
    EXAMS to "Sınav sayacı",
    DUTIES to "Nöbet çizelgesi",
    LEAVES to "İzinli öğretmenler",
    STUDENTS to "Öğrenciler ve doğum günleri",
    DIRECTORY to "Öğretmenler ve sınıflar",
    SCHEDULE to "Zil saatleri ve ders programı",
    SCREENS to "Ekranlar",
    SETTINGS to "Okul ayarları",
    LABELS to "Başlıkları düzenleme",
    USERS to "Kullanıcılar ve yetkiler",
  )

  /** Editöre verilebilen yetkiler (kullanıcı yönetimi yalnızca sahip ve yöneticide) */
  val GRANTABLE = LABELS_TR.keys.filter { it != USERS }

  /** Yönetici ekranlarını (kontrol merkezi, onaylar, pano kumandası) açan yetkiler */
  val MANAGER = listOf(APPROVE, BOARD, SCREENS, EMERGENCY, DUTIES, LEAVES)

  /** Editörü öğretmenden ayıran içerik yetkileri */
  val CONTENT = listOf(ANNOUNCEMENTS, HIGHLIGHTS, TICKER, EXAMS, STUDENTS) + MANAGER
}

val ROLE_NAMES = mapOf("owner" to "Okul sahibi", "admin" to "Yönetici", "editor" to "Editör")

/**
 * Uygulamadaki rol: menüler buna göre kurulur.
 * Platform yöneticisi kendi okulunda okul sahibidir (her şey açık); "Okulumu aç" ile o görünüme geçer.
 */
enum class AppRole(val label: String) {
  Platform("Platform yöneticisi"),
  Owner("Okul sahibi"),
  Admin("Yönetici"),
  Editor("Editör"),
  Teacher("Öğretmen"),
}

fun SchoolAccess.can(permission: String) = permission in permissions

/**
 * Rolü hesaplar. Duyuru göndermek öğretmenlerde yaygın: öğretmen kaydı olan ve yalnızca duyuru yetkisi olan kişi
 * öğretmen görünümünde kalır.
 */
fun appRole(me: Me?, school: SchoolAccess?, platformMode: Boolean): AppRole = when {
  me?.user?.isSuperAdmin == true && (platformMode || school == null) -> AppRole.Platform
  school?.role == "owner" -> AppRole.Owner
  school?.role == "admin" -> AppRole.Admin
  school != null && Perm.CONTENT.any { school.can(it) && (it != Perm.ANNOUNCEMENTS || school.teacherId == null) } -> AppRole.Editor
  else -> AppRole.Teacher
}
