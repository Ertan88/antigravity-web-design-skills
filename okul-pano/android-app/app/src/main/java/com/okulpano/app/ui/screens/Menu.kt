package com.okulpano.app.ui.screens

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.automirrored.outlined.MenuBook
import androidx.compose.material.icons.automirrored.outlined.ShortText
import androidx.compose.material.icons.outlined.Apartment
import androidx.compose.material.icons.outlined.Cake
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Campaign
import androidx.compose.material.icons.outlined.Dashboard
import androidx.compose.material.icons.outlined.DoneAll
import androidx.compose.material.icons.outlined.EmojiEvents
import androidx.compose.material.icons.outlined.Event
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.School
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material.icons.outlined.SwapHoriz
import androidx.compose.material.icons.outlined.WbSunny
import androidx.compose.material3.Badge
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.okulpano.app.data.LocalApp
import com.okulpano.app.data.rememberQuery
import com.okulpano.app.ui.components.AppScaffold
import com.okulpano.app.ui.components.Avatar
import com.okulpano.app.ui.components.GroupCard
import com.okulpano.app.ui.components.Hint
import com.okulpano.app.ui.components.RowItem
import com.okulpano.app.ui.components.SectionHeader
import com.okulpano.app.ui.components.StatusBadge
import com.okulpano.app.ui.components.Tone
import com.okulpano.app.ui.nav.LocalNav
import com.okulpano.app.ui.nav.R
import com.okulpano.app.ui.nav.authState
import com.okulpano.app.ui.nav.go
import com.okulpano.core.AppRole
import com.okulpano.core.InboxPage
import com.okulpano.core.Perm
import com.okulpano.core.initials
import kotlinx.coroutines.launch

private data class MenuItem(val title: String, val subtitle: String?, val icon: ImageVector, val t: Tone = Tone.Primary, val route: String? = null, val badge: Int = 0, val onClick: (() -> Unit)? = null)

private data class MenuContent(val tur: String, val title: String, val subtitle: String, val icon: ImageVector, val permission: String)

private val CONTENT = listOf(
  MenuContent("ticker", "Kayan yazı", "Tek satır ekle, kapat", Icons.AutoMirrored.Outlined.ShortText, Perm.TICKER),
  MenuContent("achievements", "Başarılar ve ayın öğrencisi", "Kamerayla fotoğraf çek, panoya gönder", Icons.Outlined.EmojiEvents, Perm.HIGHLIGHTS),
  MenuContent("events", "Etkinlik takvimi", "Kulüp ve okul etkinlikleri", Icons.Outlined.Event, Perm.HIGHLIGHTS),
  MenuContent("exams", "Sınav sayacı", "Sınav ekle ve düzenle", Icons.Outlined.School, Perm.EXAMS),
  MenuContent("books", "Haftanın kitabı", "Kapağı kamerayla çek", Icons.AutoMirrored.Outlined.MenuBook, Perm.HIGHLIGHTS),
)

/**
 * Menü: role göre bölümler (okul yönetimi, içerik, öğretmen araçları, okul) ve herkes için Hesabım (profil, şifre,
 * bildirimler, çıkış). Alt menüye sığmayan her şey buradadır.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun MenuScreen() {
  val state = authState()
  val app = LocalApp.current
  val nav = LocalNav.current
  val scope = rememberCoroutineScope()
  val role = state.role
  val managerial = role == AppRole.Owner || role == AppRole.Admin
  val inboxPath = if (state.school != null) state.path("inbox?filter=unread&limit=50") else "/api/me/inbox?filter=unread&limit=50"
  val inbox = rememberQuery(inboxPath) { get<InboxPage>(inboxPath) }
  val leaves = if (state.isTeacher) rememberMyLeaves() else null
  val pendingLeaves = leaves?.data.orEmpty().count { it.approvalStatus == "pending" }
  var pushNote by remember { mutableStateOf<String?>(null) }
  val notifPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
    pushNote = if (granted) "İzin verildi: nöbet hatırlatmaları bu telefonda çalışır." else "İzin verilmedi: telefon ayarlarından Okul Yayın için bildirimleri açın."
  }
  fun openSchool(id: String) {
    app.auth.selectSchool(id)
    app.auth.setPlatformMode(false)
    nav.go(R.HOME)
  }

  val sections = buildList<Pair<String, List<MenuItem>>> {
    if (role == AppRole.Platform) {
      val own = state.me?.schools.orEmpty().filter { it.support != true }
      val support = state.me?.schools.orEmpty().filter { it.support == true }
      add(
        "Okulum · süper kullanıcı" to own.map { MenuItem(it.name, "Okulumu aç · her şey açık", Icons.Outlined.SwapHoriz, onClick = { openSchool(it.id) }) } +
          MenuItem("Destek erişimi olan okullar", if (support.isNotEmpty()) "${support.size} okul · müdür onayıyla, süreli" else "Şu an yok", Icons.Outlined.Key, Tone.Success, R.SCHOOLS),
      )
      add(
        "Platform" to listOf(
          MenuItem("Okullar ve abonelikler", "Paketler, pano sayısı, deneme süreleri", Icons.Outlined.Apartment, route = R.SCHOOLS),
          MenuItem("Kayıt onayları", "E-postası doğrulanmamış başvurular", Icons.Outlined.DoneAll, route = R.HOME),
          MenuItem("MEB çalışma takvimi", "Tara · onayla", Icons.Outlined.CalendarMonth, route = R.MEB),
        ),
      )
    }
    if (state.me?.user?.isSuperAdmin == true && role != AppRole.Platform) {
      add("Platform" to listOf(MenuItem("Platform görünümüne dön", "Okullar, kayıtlar, MEB takvimi", Icons.Outlined.Dashboard, onClick = { app.auth.setPlatformMode(true); nav.go(R.HOME) })))
    }
    if (managerial) {
      add(
        "Okul yönetimi" to listOfNotNull(
          MenuItem("Kullanıcılar ve yetkiler", if (role == AppRole.Owner) "Davet · yönetici ve editör ata · yetki ver" else "Davet · editör ekle ve yetki ver", Icons.Outlined.Groups, route = R.USERS),
          if (role == AppRole.Owner && state.school?.support != true && state.me?.user?.isSuperAdmin != true) {
            MenuItem("Destek erişimi", "Platform desteğine 24 saat ya da 7 gün onay ver, kapat", Icons.Outlined.Key, Tone.Gold, R.SUPPORT)
          } else null,
          MenuItem("Tatil takvimi", "MEB takvimi, bayramlar, köprü günleri", Icons.Outlined.WbSunny, route = R.HOLIDAYS),
          MenuItem("Etkinlik geçmişi", "Kim ne zaman neyi değiştirdi", Icons.Outlined.History, Tone.Neutral, R.AUDIT),
        ),
      )
    }
    if (role != AppRole.Platform && role != AppRole.Teacher) {
      val content = buildList {
        if (state.can(Perm.ANNOUNCEMENTS)) add(MenuItem("Duyurular ve yayın akışı", "Yeni duyuru, yayındakiler", Icons.Outlined.Campaign, route = R.SCHEDULE_FEED))
        CONTENT.filter { state.can(it.permission) }.forEach { add(MenuItem(it.title, it.subtitle, it.icon, route = R.content(it.tur))) }
        if (managerial || state.can(Perm.STUDENTS)) add(MenuItem("Doğum günleri", "Bugün doğum günü olanlar", Icons.Outlined.Cake, route = R.BIRTHDAYS))
      }
      if (content.isNotEmpty()) add((if (role == AppRole.Editor) "İçerik (yetkileriniz)" else "İçerik") to content)
    }
    if (state.isTeacher && role != AppRole.Platform) {
      add(
        "Öğretmen araçlarım" to listOfNotNull(
          MenuItem("Ders programım ve zil saatleri", "Haftalık program, bugünün zilleri", Icons.Outlined.Schedule, route = R.TIMETABLE),
          if (role == AppRole.Editor) MenuItem("Nöbetlerim", "Bu hafta ve yerine görevlendirmeler", Icons.Outlined.Shield, route = R.DUTIES) else null,
          MenuItem(if (role == AppRole.Teacher) "İzinlerim" else "İzin bildir", if (pendingLeaves > 0) "$pendingLeaves bildirim onay bekliyor" else "Onay durumu", Icons.Outlined.EventBusy, route = if (role == AppRole.Teacher) R.LEAVES else R.LEAVE_NEW),
          MenuItem("Telefon takvimine ekle", "Nöbetler ve sınavlar takviminize", Icons.Outlined.EventAvailable, route = R.CALENDAR_EXPORT),
        ),
      )
    }
    if (role == AppRole.Editor || role == AppRole.Teacher) {
      add(
        "Okul" to listOf(
          MenuItem("Tatil takvimi", "Ara tatil, yarıyıl, bayramlar", Icons.Outlined.WbSunny, route = R.HOLIDAYS),
          MenuItem("Sınavlar ve etkinlikler", "Yaklaşan sınav ve etkinlikler", Icons.Outlined.School, route = R.UPCOMING),
          MenuItem("Bugün doğum günü olanlar", "Öğrencilerimiz", Icons.Outlined.Cake, route = R.BIRTHDAYS),
        ),
      )
    }
    add(
      "Hesabım" to listOfNotNull(
        MenuItem("Profil bilgilerim", "Ad soyad, e-posta", Icons.Outlined.Person, Tone.Neutral, R.PROFILE),
        MenuItem("Şifre değiştir", "Diğer cihazlardaki oturumlar kapanır", Icons.Outlined.Lock, Tone.Neutral, R.PASSWORD),
        MenuItem("Bildirimler", "Okunanlar dahil geçmiş", Icons.Outlined.Notifications, Tone.Neutral, R.INBOX, badge = inbox.data?.unread ?: 0),
        if (Build.VERSION.SDK_INT >= 33) {
          MenuItem("Telefon bildirimlerini aç", pushNote ?: "Nöbet hatırlatmaları", Icons.Outlined.NotificationsActive, Tone.Neutral, onClick = { notifPermission.launch(Manifest.permission.POST_NOTIFICATIONS) })
        } else null,
      ),
    )
  }

  AppScaffold(title = "Menü", onBack = if (role == AppRole.Teacher) null else ({ nav.popBackStack() })) {
    item {
      Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer, contentColor = MaterialTheme.colorScheme.onPrimaryContainer), modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
          Avatar(initials(state.me?.user?.fullName.orEmpty()), 56)
          Spacer(Modifier.width(14.dp))
          Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(state.me?.user?.fullName.orEmpty(), style = MaterialTheme.typography.titleLarge)
            Text(state.me?.user?.email.orEmpty(), style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(4.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
              StatusBadge(role.label, Tone.Primary)
              if (state.isTeacher && role != AppRole.Teacher && role != AppRole.Platform) StatusBadge("Öğretmen")
              if (state.school?.support == true && role != AppRole.Platform) StatusBadge("Destek erişimi", Tone.Warning)
            }
            if (role != AppRole.Platform && state.school != null) Text(state.school!!.name, style = MaterialTheme.typography.bodySmall)
          }
        }
      }
    }
    val choices = if (role == AppRole.Platform) emptyList() else state.me?.schools.orEmpty()
    if (choices.size > 1) {
      item { SectionHeader("Okul") }
      item {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          choices.forEach { s -> FilterChip(selected = s.id == state.schoolId, onClick = { app.auth.selectSchool(s.id) }, label = { Text(s.name) }) }
        }
      }
    }
    sections.forEach { (title, items) ->
      item(key = "h$title") { SectionHeader(title) }
      item(key = "c$title") {
        GroupCard {
          items.forEachIndexed { i, it ->
            RowItem(
              it.title,
              it.subtitle,
              it.icon,
              it.t,
              trailing = if (it.badge > 0) { { Badge { Text("${it.badge}") } } } else null,
              onClick = it.onClick ?: it.route?.let { r -> { nav.go(r) } },
              divider = i < items.lastIndex,
            )
          }
        }
      }
    }
    if (role == AppRole.Platform) item { Hint("Kendi okulunuzda her şey açık. Diğer okullara yalnızca müdürün onayladığı süreli destek erişimiyle girersiniz.") }
    item {
      OutlinedButton(
        onClick = { scope.launch { app.auth.signOut() } },
        colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
        modifier = Modifier.fillMaxWidth().height(52.dp),
      ) {
        Icon(Icons.AutoMirrored.Outlined.Logout, null)
        Text("  Çıkış yap")
      }
    }
  }
}
