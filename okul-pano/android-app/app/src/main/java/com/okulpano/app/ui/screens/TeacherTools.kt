package com.okulpano.app.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.NotificationsOff
import androidx.compose.material.icons.outlined.WbSunny
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.okulpano.app.data.rememberQuery
import com.okulpano.app.platform.CalendarItem
import com.okulpano.app.platform.CalendarSync
import com.okulpano.app.ui.components.AppScaffold
import com.okulpano.app.ui.components.EmptyCard
import com.okulpano.app.ui.components.ErrorCard
import com.okulpano.app.ui.components.GroupCard
import com.okulpano.app.ui.components.Hint
import com.okulpano.app.ui.components.LoadingBox
import com.okulpano.app.ui.components.RowItem
import com.okulpano.app.ui.components.SectionHeader
import com.okulpano.app.ui.components.SwitchRow
import com.okulpano.app.ui.components.rememberRunner
import com.okulpano.app.ui.components.rememberSnackbar
import com.okulpano.app.ui.nav.LocalNav
import com.okulpano.app.ui.nav.authState
import com.okulpano.app.ui.theme.status
import com.okulpano.core.Exam
import com.okulpano.core.LessonState
import com.okulpano.core.MeToday
import com.okulpano.core.WEEKDAY_LONG
import com.okulpano.core.WEEKDAY_SHORT
import com.okulpano.core.clockOf
import com.okulpano.core.fullDate
import com.okulpano.core.localDateOf
import com.okulpano.core.periodLabel
import com.okulpano.core.periodsFor
import com.okulpano.core.pickSchedule
import com.okulpano.core.sortPeriods
import com.okulpano.core.teacherDay
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

/** Ders programım ve zil saatleri: haftanın her günü için dersler; seçilen günün zil çizelgesi */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TimetableScreen() {
  val nav = LocalNav.current
  val q = rememberToday()
  val now = rememberTicker(30_000)
  val data = q.data
  var selected by remember { mutableStateOf<Int?>(null) }
  AppScaffold(
    title = "Ders programım",
    subtitle = data?.lessons?.size?.takeIf { it > 0 }?.let { "Haftalık $it ders saati" },
    onBack = { nav.popBackStack() },
    refreshing = q.refreshing,
    onRefresh = q.refresh,
  ) {
    if (data == null) {
      item { q.error?.let { ErrorCard(it, q.refresh) } ?: LoadingBox() }
      return@AppScaffold
    }
    val today = teacherDay(data, now)
    val day = selected ?: if (today.now.weekday <= 5) today.now.weekday else 1
    if (data.teacher == null) {
      item {
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.status.warningContainer, contentColor = MaterialTheme.status.onWarningContainer)) {
          Text("Hesabınız bir öğretmen kaydına bağlı değil; yalnızca zil saatleri görünür.", Modifier.padding(16.dp), style = MaterialTheme.typography.bodyMedium)
        }
      }
    }
    item {
      FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        (1..7).filter { it <= 5 || data.bellSchedules.any { s -> it in s.weekdays } }.forEach { d ->
          FilterChip(selected = d == day, onClick = { selected = d }, label = { Text(WEEKDAY_SHORT[d]) })
        }
      }
    }
    val isToday = today.now.weekday == day
    item { SectionHeader(WEEKDAY_LONG[day] + if (isToday) " · bugün" else "") }
    val periods = pickSchedule(data.bellSchedules, day)?.let { sortPeriods(it.periods) }.orEmpty()
    val lessons = data.lessons.filter { it.weekday == day }.associateBy { it.periodNo }
    when {
      isToday && today.holiday != null -> item { EmptyCard(Icons.Outlined.WbSunny, "Bugün tatil", today.holiday) }
      periods.isEmpty() -> item { EmptyCard(Icons.Outlined.NotificationsOff, "Bu gün zil çalmıyor") }
      else -> item {
        GroupCard {
          periods.forEachIndexed { i, p ->
            if (i > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            val l = lessons[p.no]
            val st = if (isToday) today.lessons.firstOrNull { it.period.no == p.no }?.state else null
            val cut = isToday && today.endsAt != null && p.start >= today.endsAt!!
            val nowRow = st == LessonState.Now
            Row(
              Modifier.fillMaxWidth().background(if (nowRow) MaterialTheme.colorScheme.primaryContainer else Color.Transparent).padding(horizontal = 16.dp, vertical = 12.dp),
              verticalAlignment = Alignment.CenterVertically,
            ) {
              val faded = st == LessonState.Past || cut
              Column(Modifier.width(104.dp)) {
                Text("${p.start} – ${p.end}", style = MaterialTheme.typography.labelLarge.copy(fontFeatureSettings = "tnum"), color = if (faded) MaterialTheme.colorScheme.outline else MaterialTheme.colorScheme.onSurface)
                Text(periodLabel(p), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
              }
              Text(
                if (cut) "Yarım gün · ders yok" else l?.let { "${it.className} · ${it.subject}" } ?: "Boş",
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = if (l != null) FontWeight.SemiBold else FontWeight.Normal,
                color = if (faded) MaterialTheme.colorScheme.outline else if (l != null) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f),
              )
              when (st) {
                LessonState.Now -> Text("ŞİMDİ", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                LessonState.Next -> Text("SIRADAKİ", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                else -> Unit
              }
            }
          }
        }
      }
    }
    if (isToday && today.halfDay != null) item { Hint("${today.halfDay} · yarım gün, son zil ${today.endsAt}") }
  }
}

/** Bu haftaki nöbetler: ilk dersin başından son dersin bitişine (arifede yarım gün saatine) */
private fun dutyItems(data: MeToday): List<CalendarItem> = data.week.flatMap { d ->
  if (d.holiday != null) return@flatMap emptyList()
  val own = d.duties.filter { it.coveredBy == null }
  val date = LocalDate.parse(d.date)
  val periods = periodsFor(data, date)
  if (own.isEmpty() || periods.isEmpty()) return@flatMap emptyList()
  val half = data.halfDays.any { it.date == d.date }
  val end = if (half) data.halfDayEnd ?: "13:00" else periods.last().end
  val zone = ZoneId.of(data.timezone)
  own.map { x ->
    CalendarItem(
      "duty:${d.date}:${x.dutyId}",
      "Nöbet · ${x.area}",
      date.atTime(LocalTime.parse(periods.first().start)).atZone(zone).toInstant(),
      date.atTime(LocalTime.parse(end)).atZone(zone).toInstant(),
      x.area,
      15,
    )
  }
}

/** Telefon takvimine ekle: bu haftaki nöbetler ve yaklaşan sınavlar "Okul Yayın" takvimine yazılır */
@Composable
fun CalendarExportScreen() {
  val state = authState()
  val nav = LocalNav.current
  val context = LocalContext.current
  val snackbar = rememberSnackbar()
  val run = rememberRunner(snackbar)
  val me = rememberToday(state)
  val exams = rememberQuery(state.path("exams")) { get<List<Exam>>(state.path("exams")) }
  var duties by remember { mutableStateOf(true) }
  var withExams by remember { mutableStateOf(true) }
  val data = me.data
  val today = LocalDate.now()
  val until = today.plusDays(60)
  val dutyList = data?.let(::dutyItems).orEmpty()
  val examList = exams.data.orEmpty().filter { it.isActive && localDateOf(it.examAt) in today..until }.map {
    val start = Instant.parse(it.examAt)
    CalendarItem("exam:${it.id}", it.title, start, start.plusSeconds(40 * 60), null, 24 * 60)
  }
  val items = (if (duties) dutyList else emptyList()) + (if (withExams) examList else emptyList())

  fun write() = run.run("sync") {
    val n = CalendarSync.sync(context, items, today.minusDays(7).atStartOfDay(ZoneId.systemDefault()).toInstant(), until.plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant())
    snackbar.showSnackbar("$n kayıt telefon takviminizdeki “Okul Yayın” takvimine yazıldı.")
  }
  val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { r ->
    if (r.values.all { it }) write() else run.toast("Takvim izni verilmedi. Telefon ayarlarından Okul Yayın için takvim iznini açın.")
  }
  fun start() {
    val perms = arrayOf(Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR)
    if (perms.all { ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED }) write() else permission.launch(perms)
  }

  AppScaffold(
    title = "Telefon takvimine ekle",
    onBack = { nav.popBackStack() },
    snackbar = snackbar,
    bottomBar = { BottomAction(if (items.isNotEmpty()) "${items.size} kaydı takvime yaz" else "Eklenecek kayıt yok", items.isNotEmpty() && run.busy == null) { start() } },
  ) {
    if (data == null) {
      item { me.error?.let { ErrorCard(it, me.refresh) } ?: LoadingBox() }
      return@AppScaffold
    }
    item {
      Text(
        "Kayıtlar telefonunuzda ayrı bir “Okul Yayın” takvimine yazılır. Yeniden eşitlediğinizde değişen nöbetler ve ertelenen sınavlar güncellenir; kendi kayıtlarınıza dokunulmaz.",
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
      )
    }
    item {
      GroupCard {
        SwitchRow("Bu haftaki nöbetlerim", duties, { duties = it }, "${dutyList.size} nöbet · 15 dakika önce hatırlatma")
        SwitchRow("Yaklaşan sınavlar", withExams, { withExams = it }, "${examList.size} sınav · 60 gün içinde · bir gün önce hatırlatma")
      }
    }
    if (items.isNotEmpty()) {
      item { SectionHeader("Eklenecekler") }
      item {
        GroupCard {
          items.forEachIndexed { i, it -> RowItem(it.title, "${fullDate(it.start.toString())} · ${clockOf(it.start.toString())}", divider = i < items.lastIndex) }
        }
      }
    }
  }
}
