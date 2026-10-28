package com.okulpano.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Campaign
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.FreeBreakfast
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material.icons.outlined.WbSunny
import androidx.compose.material.icons.outlined.Tv
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.okulpano.app.data.AuthState
import com.okulpano.app.data.rememberQuery
import com.okulpano.app.ui.components.AppScaffold
import com.okulpano.app.ui.components.EmptyState
import com.okulpano.app.ui.components.ErrorCard
import com.okulpano.app.ui.components.GroupCard
import com.okulpano.app.ui.components.IconTile
import com.okulpano.app.ui.components.LoadingBox
import com.okulpano.app.ui.components.SectionHeader
import com.okulpano.app.ui.components.Tone
import com.okulpano.app.ui.components.clickableRow
import com.okulpano.app.ui.nav.LocalNav
import com.okulpano.app.ui.nav.LocalNow
import com.okulpano.app.ui.nav.R
import com.okulpano.app.ui.nav.authState
import com.okulpano.app.ui.nav.go
import com.okulpano.app.ui.theme.CountdownStyle
import com.okulpano.app.ui.theme.status
import com.okulpano.core.InboxPage
import com.okulpano.core.LessonState
import com.okulpano.core.MeToday
import com.okulpano.core.WEEKDAY_LONG
import com.okulpano.core.bellHeadline
import com.okulpano.core.countdownText
import com.okulpano.core.fullDate
import com.okulpano.core.greeting
import com.okulpano.core.teacherDay
import kotlinx.coroutines.delay

/** Bugünün verisi (zil, ders, nöbet): öğretmen ve öğretmen kaydı olan yöneticiler kullanır */
@Composable
fun rememberToday(state: AuthState = authState()) = rememberQuery(state.path("me/today"), pollMs = 5 * 60_000) { get<MeToday>(state.path("me/today")) }

/** Saniyede bir (ya da verilen aralıkla) ilerleyen saat */
@Composable
fun rememberTicker(ms: Long = 1000): java.time.Instant {
  val now = LocalNow.current
  var t by remember { mutableStateOf(now()) }
  LaunchedEffect(ms) {
    while (true) {
      delay(ms)
      t = now()
    }
  }
  return t
}

/** Başlıktaki bildirim zili (okunmamış sayısıyla) */
@Composable
fun NotificationsAction() {
  val state = authState()
  val nav = LocalNav.current
  val path = if (state.school != null) state.path("inbox?filter=unread&limit=50") else "/api/me/inbox?filter=unread&limit=50"
  val inbox = rememberQuery(path, pollMs = 60_000) { get<InboxPage>(path) }
  val n = inbox.data?.unread ?: 0
  IconButton(onClick = { nav.go(R.INBOX) }) {
    BadgedBox(badge = { if (n > 0) Badge { Text(if (n > 9) "9+" else "$n") } }) {
      Icon(Icons.Outlined.Notifications, contentDescription = if (n > 0) "Bildirimler, $n yeni" else "Bildirimler")
    }
  }
}

/** Başlıktaki hesap düğmesi: Menü (profil, şifre, çıkış ve rolün diğer ekranları) */
@Composable
fun MenuAction() {
  val nav = LocalNav.current
  IconButton(onClick = { nav.go(R.MENU) }) { Icon(Icons.Outlined.Person, contentDescription = "Menü") }
}

/** Öğretmenin ana ekranı: şu anki ders, geri sayım, bugünkü nöbet, hızlı işlemler ve ders programı */
@Composable
fun TeacherHome() {
  val state = authState()
  val nav = LocalNav.current
  val today = rememberToday(state)
  val now = rememberTicker(60_000)
  val context = androidx.compose.ui.platform.LocalContext.current
  // Nöbet günlerinde ilk dersten 15 dakika önce telefona yerel hatırlatma
  LaunchedEffect(today.data) { today.data?.let { com.okulpano.app.platform.DutyReminders.schedule(context, it) } }
  val first = state.me?.user?.fullName?.substringBefore(' ').orEmpty()
  val hour = now.atZone(java.time.ZoneId.of(today.data?.timezone ?: "Europe/Istanbul")).hour
  AppScaffold(
    title = "${greeting(hour)}, $first",
    subtitle = today.data?.let { fullDate(it.today) } ?: state.school?.name,
    actions = { NotificationsAction() },
    refreshing = today.refreshing,
    onRefresh = today.refresh,
  ) {
    val data = today.data
    when {
      data == null && today.error != null -> item { ErrorCard(today.error!!, today.refresh) }
      data == null -> item { LoadingBox() }
      else -> {
        item { BellHero(data) }
        if (data.teacher == null) {
          item {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.status.warningContainer, contentColor = MaterialTheme.status.onWarningContainer)) {
              Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Hesabınız bir öğretmen kaydına bağlı değil", style = MaterialTheme.typography.titleSmall)
                Text("Kendi nöbetlerinizi ve ders programınızı görmek için okul yöneticiniz panelde Kullanıcılar sayfasından hesabınızı öğretmen kaydınızla eşleştirsin.", style = MaterialTheme.typography.bodySmall)
              }
            }
          }
        }
        item { TodayDutyCard(data) }
        item {
          Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            QuickAction("Duyuru", Icons.Outlined.Campaign, Modifier.weight(1f)) { nav.go(R.ANNOUNCEMENT_NEW) }
            QuickAction("İzin", Icons.Outlined.EventBusy, Modifier.weight(1f)) { nav.go(R.LEAVE_NEW) }
            QuickAction("Nöbet", Icons.Outlined.Shield, Modifier.weight(1f)) { nav.go(R.DUTIES) }
            QuickAction("Panolar", Icons.Outlined.Tv, Modifier.weight(1f)) { nav.go(R.BOARDS) }
          }
        }
        mySchedule(data, now)
      }
    }
  }
}

@Composable
private fun QuickAction(label: String, icon: ImageVector, modifier: Modifier, onClick: () -> Unit) {
  Card(onClick = onClick, modifier = modifier, colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow)) {
    Column(Modifier.fillMaxWidth().padding(vertical = 14.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
      Icon(icon, null, tint = MaterialTheme.colorScheme.primary)
      Text(label, style = MaterialTheme.typography.labelMedium, maxLines = 1)
    }
  }
}

/** Şu anki ders / teneffüs ve geri sayım (panodaki zil kartının cepteki hali) */
@Composable
fun BellHero(data: MeToday) {
  val now = rememberTicker(1000)
  val day = teacherDay(data, now)
  val h = bellHeadline(day.bell)
  val next = day.lessons.firstOrNull { it.state == LessonState.Next }
  ElevatedCard(
    colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.primary, contentColor = MaterialTheme.colorScheme.onPrimary),
    shape = MaterialTheme.shapes.large,
    modifier = Modifier.fillMaxWidth(),
  ) {
    Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
      Row(verticalAlignment = Alignment.CenterVertically) {
        Text(if (day.holiday != null) "Tatil · ${day.holiday}" else h.title, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
        Surface(color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.16f), contentColor = MaterialTheme.colorScheme.onPrimary, shape = RoundedCornerShape(50)) {
          Text(WEEKDAY_LONG[day.now.weekday], style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp))
        }
      }
      if (h.remaining != null && day.holiday == null) {
        Row(verticalAlignment = Alignment.Bottom) {
          Text(countdownText(h.remaining!!), style = CountdownStyle)
          Spacer(Modifier.width(10.dp))
          Text(h.caption, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(bottom = 10.dp))
        }
      } else {
        Text(if (day.holiday != null) "İyi tatiller" else h.caption, style = MaterialTheme.typography.headlineSmall)
      }
      if (day.halfDay != null) {
        Text("${day.halfDay} · yarım gün, son zil ${day.endsAt}", style = MaterialTheme.typography.labelLarge)
      }
      if (h.progress != null && day.holiday == null) {
        LinearProgressIndicator(
          progress = { h.progress!!.coerceIn(0f, 1f) },
          modifier = Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)),
          color = MaterialTheme.colorScheme.onPrimary,
          trackColor = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.25f),
          drawStopIndicator = {},
        )
      }
      val nextText = if (day.holiday == null) next?.let { "Sıradaki dersiniz: ${it.period.start} · ${it.className} ${it.subject}" } ?: h.next else null
      if (nextText != null) Text(nextText, style = MaterialTheme.typography.bodyMedium)
    }
  }
}

/** Bugünkü nöbet: yer, birlikte nöbet tutanlar; nöbetini başkası tutuyorsa o bilgi */
@Composable
fun TodayDutyCard(data: MeToday) {
  val nav = LocalNav.current
  if (data.teacher == null) return
  val today = data.week.firstOrNull { it.date == data.today }
  if (today?.holiday != null) return
  val duty = today?.duties?.firstOrNull()
  GroupCard {
    if (duty == null) {
      Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
        IconTile(Icons.Outlined.Shield, Tone.Neutral)
        Spacer(Modifier.width(14.dp))
        Text("Bugün nöbetiniz yok", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
      }
    } else {
      Row(Modifier.clickableRow { nav.go(R.DUTIES) }.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
        IconTile(Icons.Outlined.Shield, Tone.Warning, size = 48)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
          Text(
            when {
              duty.coveredBy != null -> "NÖBETİNİZ DEVREDİLDİ"
              duty.substituteFor != null -> "BUGÜN GÖREVLİSİNİZ"
              else -> "BUGÜN NÖBETÇİSİNİZ"
            },
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.status.warning,
          )
          Text(duty.area, style = MaterialTheme.typography.titleMedium)
          Text(
            when {
              duty.coveredBy != null -> "İzniniz nedeniyle ${duty.coveredBy} tutuyor"
              duty.substituteFor != null -> "${duty.substituteFor} yerine · teneffüslerde"
              duty.partners.isNotEmpty() -> "Birlikte: ${duty.partners.joinToString(", ")}"
              else -> "Teneffüslerde"
            },
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
          )
        }
      }
    }
  }
}

/** Bugünkü programım: geçenler soluk, şu anki vurgulu */
fun androidx.compose.foundation.lazy.LazyListScope.mySchedule(data: MeToday, now: java.time.Instant) {
  if (data.teacher == null) return
  val day = teacherDay(data, now)
  item { SectionHeader("Bugünkü programım") }
  item {
    GroupCard {
      when {
        day.holiday != null -> EmptyState(Icons.Outlined.WbSunny, "Bugün tatil", day.holiday)
        day.lessons.isEmpty() -> EmptyState(Icons.Outlined.FreeBreakfast, "Bugün dersiniz yok")
        else -> day.lessons.forEachIndexed { i, l ->
          if (i > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
          val nowRow = l.state == LessonState.Now
          Row(
            Modifier.fillMaxWidth().background(if (nowRow) MaterialTheme.colorScheme.primaryContainer else androidx.compose.ui.graphics.Color.Transparent).padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
          ) {
            val faded = l.state == LessonState.Past
            val color = if (faded) MaterialTheme.colorScheme.outline else if (nowRow) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurface
            Text(l.period.start, style = MaterialTheme.typography.labelLarge.copy(fontFeatureSettings = "tnum"), color = color, modifier = Modifier.width(56.dp))
            Text("${l.className} · ${l.subject}", style = MaterialTheme.typography.bodyLarge, fontWeight = if (nowRow) FontWeight.Bold else FontWeight.Medium, color = color, modifier = Modifier.weight(1f))
            when (l.state) {
              LessonState.Now -> Text("ŞİMDİ", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
              LessonState.Next -> Text("SIRADAKİ", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
              else -> Unit
            }
          }
        }
      }
    }
  }
}
