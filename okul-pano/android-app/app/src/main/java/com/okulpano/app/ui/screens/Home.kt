package com.okulpano.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Campaign
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.DoneAll
import androidx.compose.material.icons.outlined.EmojiEvents
import androidx.compose.material.icons.outlined.Event
import androidx.compose.material.icons.automirrored.outlined.MenuBook
import androidx.compose.material.icons.outlined.School
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material.icons.automirrored.outlined.ShortText
import androidx.compose.material.icons.outlined.Tv
import androidx.compose.material.icons.outlined.Warning
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.okulpano.app.ui.components.AppScaffold
import com.okulpano.app.ui.components.EmptyState
import com.okulpano.app.ui.components.ErrorCard
import com.okulpano.app.ui.components.GroupCard
import com.okulpano.app.ui.components.KpiCard
import com.okulpano.app.ui.components.LoadingBox
import com.okulpano.app.ui.components.RowItem
import com.okulpano.app.ui.components.SectionHeader
import com.okulpano.app.ui.components.Tone
import com.okulpano.app.ui.nav.LocalNav
import com.okulpano.app.ui.nav.R
import com.okulpano.app.ui.nav.authState
import com.okulpano.app.ui.nav.go
import com.okulpano.app.data.rememberQuery
import com.okulpano.core.AppRole
import com.okulpano.core.ControlCenter
import com.okulpano.core.Perm
import com.okulpano.core.clockOf
import com.okulpano.core.emergencyLabel
import com.okulpano.core.timeAgo

/** Ana ekran role göre: platform, kontrol merkezi (sahip ve yönetici), içerik (editör), "Bugün" (öğretmen) */
@Composable
fun HomeScreen() {
  when (authState().role) {
    AppRole.Platform -> PlatformHome()
    AppRole.Owner, AppRole.Admin -> ManagerHome()
    AppRole.Editor -> EditorHome()
    AppRole.Teacher -> TeacherHome()
  }
}

private data class Quick(val label: String, val icon: ImageVector, val route: String, val permission: String)

private val QUICK = listOf(
  Quick("Duyuru", Icons.Outlined.Campaign, R.ANNOUNCEMENT_NEW, Perm.ANNOUNCEMENTS),
  Quick("Kayan yazı", Icons.AutoMirrored.Outlined.ShortText, R.content("ticker", true), Perm.TICKER),
  Quick("Başarı", Icons.Outlined.EmojiEvents, R.content("achievements", true), Perm.HIGHLIGHTS),
  Quick("Etkinlik", Icons.Outlined.Event, R.content("events", true), Perm.HIGHLIGHTS),
  Quick("Sınav", Icons.Outlined.School, R.content("exams", true), Perm.EXAMS),
  Quick("Kitap", Icons.AutoMirrored.Outlined.MenuBook, R.content("books", true), Perm.HIGHLIGHTS),
)

/** Hızlı ekle: yetkiye göre içerik türleri; ilki (genelde duyuru) vurgulu. Kalanlar Menü › İçerik'te. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun QuickAdd(max: Int = 6) {
  val state = authState()
  val nav = LocalNav.current
  val items = QUICK.filter { state.can(it.permission) }.take(max)
  if (items.isEmpty()) return
  FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp), maxItemsInEachRow = 3) {
    items.forEachIndexed { i, q ->
      val colors = if (i == 0) {
        CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primary, contentColor = MaterialTheme.colorScheme.onPrimary)
      } else {
        CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow)
      }
      Card(onClick = { nav.go(q.route) }, colors = colors, modifier = Modifier.weight(1f)) {
        Column(Modifier.fillMaxWidth().padding(vertical = 16.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
          Icon(q.icon, null, tint = if (i == 0) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.primary)
          Text(q.label, style = MaterialTheme.typography.labelLarge, maxLines = 1)
        }
      }
    }
  }
}

private data class Attention(val key: String, val icon: ImageVector, val t: Tone, val title: String, val subtitle: String, val route: String)

/** Okul sahibi ve yöneticinin ana ekranı: kontrol merkezi */
@Composable
fun ManagerHome() {
  val state = authState()
  val nav = LocalNav.current
  val center = rememberQuery(state.path("control-center"), pollMs = 30_000) { get<ControlCenter>(state.path("control-center")) }
  val today = rememberToday(state)
  val c = center.data
  AppScaffold(
    title = "Merkez",
    subtitle = listOfNotNull(if (state.school?.support == true) "Destek erişimi" else state.role.label, state.school?.name).joinToString(" · "),
    actions = {
      NotificationsAction()
      MenuAction()
    },
    refreshing = center.refreshing,
    onRefresh = center.refresh,
  ) {
    when {
      c == null && center.error != null -> item { ErrorCard(center.error!!, center.refresh) }
      c == null -> item { LoadingBox() }
      else -> {
        if (c.holiday != null) item { com.okulpano.app.ui.components.StatusBadge("Tatil · ${c.holiday}", Tone.Gold) }
        item {
          Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            KpiCard("${c.screens.online}/${c.screens.total}", "pano çevrimiçi", Modifier.weight(1f)) { nav.go(R.BOARDS) }
            KpiCard("${c.pending.total}", "onay bekliyor", Modifier.weight(1f)) { nav.go(R.APPROVALS) }
            KpiCard("${c.onAir}", "içerik yayında", Modifier.weight(1f)) { nav.go(R.SCHEDULE_FEED) }
          }
        }
        val attention = buildList {
          c.emergency?.let { add(Attention("e", Icons.Outlined.Warning, Tone.Danger, "Acil durum sürüyor: ${emergencyLabel(it.type)}", "${clockOf(it.startedAt)} · ${it.startedBy.orEmpty()}", R.EMERGENCY)) }
          c.dutyGaps.forEach { add(Attention("g${it.dutyId}", Icons.Outlined.Shield, Tone.Warning, "${it.area} nöbeti boş", "${it.teacherName} bugün izinli · yerine atayın", R.DUTIES)) }
          c.screens.offline.forEach {
            add(Attention("s${it.id}", Icons.Outlined.Tv, Tone.Warning, "${it.name} panosu çevrimdışı", if (it.lastSeenAt != null) "Son görülme ${timeAgo(it.lastSeenAt)} · elektrik ya da internet kontrol edilmeli" else "Hiç bağlanmadı", R.board(it.id)))
          }
          if (c.pending.total > 0) {
            add(Attention("p", Icons.Outlined.DoneAll, Tone.Primary, "${c.pending.total} içerik onay bekliyor", listOfNotNull(c.pending.announcements.takeIf { it > 0 }?.let { "$it duyuru" }, c.pending.leaves.takeIf { it > 0 }?.let { "$it izin" }).joinToString(" · "), R.APPROVALS))
          }
          if (c.endingToday.isNotEmpty()) add(Attention("x", Icons.Outlined.CalendarMonth, Tone.Primary, "${c.endingToday.size} duyurunun süresi bugün bitiyor", c.endingToday.take(2).joinToString(" · ") { it.title }, R.SCHEDULE_FEED))
        }
        item { SectionHeader("İlgilenmeniz gerekenler") }
        item {
          GroupCard {
            if (attention.isEmpty()) {
              EmptyState(Icons.Outlined.CheckCircle, "Her şey yolunda", "Boş nöbet, kapalı pano ya da bekleyen onay yok.")
            } else {
              attention.forEachIndexed { i, a -> RowItem(a.title, a.subtitle, a.icon, a.t, onClick = { nav.go(a.route) }, divider = i < attention.lastIndex) }
            }
          }
        }
        item { SectionHeader("Hızlı ekle") }
        // "Benim günüm" kartı yer kapladığı için öğretmen kaydı olan yöneticide üç hızlı ekleme; diğerleri Menü › İçerik'te
        item { QuickAdd(if (state.isTeacher) 3 else 6) }
        val me = today.data
        if (state.isTeacher && me != null) {
          item { SectionHeader("Benim günüm") }
          item { TodayDutyCard(me) }
        }
      }
    }
  }
}
