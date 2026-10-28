package com.okulpano.app.ui.nav

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Apartment
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.EditNote
import androidx.compose.material.icons.filled.EventBusy
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Tv
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.outlined.Apartment
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Campaign
import androidx.compose.material.icons.outlined.Dashboard
import androidx.compose.material.icons.outlined.DoneAll
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material.icons.outlined.Tv
import androidx.compose.material.icons.outlined.Warning
import androidx.compose.material.icons.filled.DoneAll
import androidx.compose.ui.graphics.vector.ImageVector
import com.okulpano.app.data.AuthState
import com.okulpano.core.AppRole
import com.okulpano.core.Perm

/** Alt menü sekmesi */
data class Tab(val route: String, val label: String, val icon: ImageVector, val selectedIcon: ImageVector, val danger: Boolean = false)

object R {
  const val HOME = "home"
  const val SCHOOLS = "okullar"
  const val MEB = "takvim"
  const val APPROVALS = "onaylar"
  const val ANNOUNCEMENTS = "duyurular"
  const val BOARDS = "panolar"
  const val DUTIES = "nobet"
  const val LEAVES = "izinlerim"
  const val EMERGENCY = "acil"
  const val INBOX_TAB = "kutu"
  const val MENU = "menu"

  const val INBOX = "bildirimler"
  const val LEAVE_NEW = "izin"
  const val ANNOUNCEMENT_NEW = "duyuru-yeni"
  const val SCHEDULE_FEED = "yayin-akisi"
  const val BOARD = "pano/{id}"
  const val USERS = "kullanicilar"
  const val SUPPORT = "destek"
  const val HOLIDAYS = "tatiller"
  const val AUDIT = "gecmis"
  const val CONTENT = "icerik/{tur}?yeni={yeni}"
  const val BIRTHDAYS = "dogum-gunleri"
  const val UPCOMING = "yaklasanlar"
  const val TIMETABLE = "programim"
  const val CALENDAR_EXPORT = "takvime-ekle"
  const val PROFILE = "hesap/profil"
  const val PASSWORD = "hesap/sifre"
  const val QR = "qr"
  const val PAIR = "eslestir/{kod}"

  fun board(id: String) = "pano/$id"
  fun content(tur: String, new: Boolean = false) = "icerik/$tur?yeni=${if (new) 1 else 0}"
  fun pair(code: String) = "eslestir/$code"
}

private val home = mapOf(
  AppRole.Platform to Triple("Platform", Icons.Outlined.Dashboard, Icons.Filled.Dashboard),
  AppRole.Owner to Triple("Merkez", Icons.Outlined.Dashboard, Icons.Filled.Dashboard),
  AppRole.Admin to Triple("Merkez", Icons.Outlined.Dashboard, Icons.Filled.Dashboard),
  AppRole.Editor to Triple("İçerik", Icons.Outlined.EditNote, Icons.Filled.EditNote),
  AppRole.Teacher to Triple("Bugün", Icons.Outlined.Home, Icons.Filled.Home),
)

private val all = mapOf(
  R.SCHOOLS to Tab(R.SCHOOLS, "Okullar", Icons.Outlined.Apartment, Icons.Filled.Apartment),
  R.MEB to Tab(R.MEB, "Takvim", Icons.Outlined.CalendarMonth, Icons.Filled.CalendarMonth),
  R.APPROVALS to Tab(R.APPROVALS, "Onaylar", Icons.Outlined.DoneAll, Icons.Filled.DoneAll),
  R.ANNOUNCEMENTS to Tab(R.ANNOUNCEMENTS, "Duyurular", Icons.Outlined.Campaign, Icons.Filled.Campaign),
  R.BOARDS to Tab(R.BOARDS, "Panolar", Icons.Outlined.Tv, Icons.Filled.Tv),
  R.DUTIES to Tab(R.DUTIES, "Nöbet", Icons.Outlined.Shield, Icons.Filled.Shield),
  R.LEAVES to Tab(R.LEAVES, "İzin", Icons.Outlined.EventBusy, Icons.Filled.EventBusy),
  R.EMERGENCY to Tab(R.EMERGENCY, "Acil", Icons.Outlined.Warning, Icons.Filled.Warning, danger = true),
  R.INBOX_TAB to Tab(R.INBOX_TAB, "Bildirimler", Icons.Outlined.Notifications, Icons.Filled.Notifications),
  R.MENU to Tab(R.MENU, "Profil", Icons.Outlined.Person, Icons.Filled.Person),
)

/**
 * Alt menü role göre kurulur (en çok 5 sekme; geri kalanı Menü'de):
 * - Platform yöneticisi: Platform · Okullar · Takvim · Bildirimler
 * - Okul sahibi ve yönetici: Merkez · Onaylar · Panolar · Nöbet · Acil
 * - Editör: İçerik + yetkilerinden gelen en çok 3 sekme + Bildirimler
 * - Öğretmen: Bugün · Nöbetim · Duyurular · İzin · Profil
 */
fun tabsFor(state: AuthState): List<Tab> {
  val role = state.role
  val (label, icon, selected) = home.getValue(role)
  val first = Tab(R.HOME, label, icon, selected)
  val rest = when (role) {
    AppRole.Platform -> listOf(R.SCHOOLS, R.MEB, R.INBOX_TAB)
    AppRole.Owner, AppRole.Admin -> listOf(R.APPROVALS, R.BOARDS, R.DUTIES, R.EMERGENCY)
    AppRole.Editor -> buildList {
      if (state.can(Perm.ANNOUNCEMENTS)) add(R.ANNOUNCEMENTS)
      if (state.can(Perm.APPROVE) || state.can(Perm.LEAVES)) add(R.APPROVALS)
      if (state.can(Perm.BOARD) || state.can(Perm.SCREENS)) add(R.BOARDS)
      if (state.can(Perm.DUTIES)) add(R.DUTIES)
      if (state.can(Perm.EMERGENCY)) add(R.EMERGENCY)
    }.take(3) + R.INBOX_TAB
    AppRole.Teacher -> listOf(R.DUTIES, R.ANNOUNCEMENTS, R.LEAVES, R.MENU)
  }
  return listOf(first) + rest.map { r -> all.getValue(r).let { if (r == R.DUTIES && role == AppRole.Teacher) it.copy(label = "Nöbetim") else it } }
}
