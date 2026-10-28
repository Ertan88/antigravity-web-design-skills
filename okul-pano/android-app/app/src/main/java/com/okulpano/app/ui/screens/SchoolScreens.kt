package com.okulpano.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Cake
import androidx.compose.material.icons.outlined.Event
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.School
import androidx.compose.material.icons.outlined.WbSunny
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.okulpano.app.data.LocalApp
import com.okulpano.app.data.rememberQuery
import com.okulpano.app.ui.components.AppScaffold
import com.okulpano.app.ui.components.EmptyCard
import com.okulpano.app.ui.components.EmptyState
import com.okulpano.app.ui.components.ErrorCard
import com.okulpano.app.ui.components.GroupCard
import com.okulpano.app.ui.components.Hint
import com.okulpano.app.ui.components.LoadingBox
import com.okulpano.app.ui.components.RowItem
import com.okulpano.app.ui.components.SectionHeader
import com.okulpano.app.ui.components.StatusBadge
import com.okulpano.app.ui.components.Tone
import com.okulpano.app.ui.components.rememberRunner
import com.okulpano.app.ui.components.rememberSnackbar
import com.okulpano.app.ui.nav.LocalNav
import com.okulpano.app.ui.nav.authState
import com.okulpano.core.AppRole
import com.okulpano.core.AuditRow
import com.okulpano.core.ClassGroup
import com.okulpano.core.Exam
import com.okulpano.core.HolidayList
import com.okulpano.core.SchoolEvent
import com.okulpano.core.SchoolInfo
import com.okulpano.core.Student
import com.okulpano.core.academicYearOf
import com.okulpano.core.body
import com.okulpano.core.clockOf
import com.okulpano.core.dateSpan
import com.okulpano.core.fullDate
import com.okulpano.core.localDateOf
import java.time.Instant
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/**
 * Destek erişimi (KVKK): platform desteği okulun verilerini varsayılan olarak göremez. Yardım gerektiğinde okul sahibi
 * (müdür) 24 saat ya da 7 gün erişim verir; süre dolunca kendiliğinden kapanır, işlemler etkinlik geçmişine düşer.
 */
@Composable
fun SupportScreen() {
  val state = authState()
  val app = LocalApp.current
  val nav = LocalNav.current
  val snackbar = rememberSnackbar()
  val run = rememberRunner(snackbar)
  val info = rememberQuery(state.path()) { get<SchoolInfo>(state.path()) }
  val allowed = state.role == AppRole.Owner && state.school?.support != true && state.me?.user?.isSuperAdmin != true
  fun grant(hours: Int, done: String) = run.run("h$hours", done) {
    app.api.send(state.path("support-access"), "POST", body("hours" to hours))
    info.refresh()
  }
  AppScaffold(title = "Destek erişimi", onBack = { nav.popBackStack() }, refreshing = info.refreshing, onRefresh = info.refresh, snackbar = snackbar) {
    if (!allowed) {
      item { EmptyCard(Icons.Outlined.Lock, "Destek erişimini yalnızca okul sahibi (müdür) verir") }
      return@AppScaffold
    }
    val data = info.data
    if (data == null) {
      item { if (info.error != null) ErrorCard(info.error!!, info.refresh) else LoadingBox() }
      return@AppScaffold
    }
    val until = data.supportAccessUntil
    val open = until != null && Instant.parse(until) > Instant.now()
    item {
      GroupCard {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
          StatusBadge(if (open) "Açık" else "Kapalı", if (open) Tone.Success else Tone.Neutral)
          if (open) Text("${fullDate(until!!)} saat ${clockOf(until)} tarihine kadar açık", style = MaterialTheme.typography.titleMedium)
          Text(
            "Okulunuzun verilerini (öğretmenler, öğrenciler, nöbetler) platform desteği göremez. Yardım istediğinizde süreli erişim verin; süre dolunca kendiliğinden kapanır. Destek sırasında yapılan işlemler Etkinlik geçmişinde görünür.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
          )
        }
      }
    }
    if (open) {
      item {
        Button(
          onClick = { grant(0, "Destek erişimi kapatıldı") },
          enabled = run.busy == null,
          colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error, contentColor = MaterialTheme.colorScheme.onError),
          modifier = Modifier.fillMaxWidth().height(52.dp),
        ) {
          Icon(Icons.Outlined.Lock, null)
          Text("  Erişimi şimdi kapat")
        }
      }
    } else {
      item {
        Button(onClick = { grant(24, "Platform desteğine 24 saat erişim verildi") }, enabled = run.busy == null, modifier = Modifier.fillMaxWidth().height(52.dp)) {
          Icon(Icons.Outlined.Key, null)
          Text("  24 saat erişim ver")
        }
      }
      item { OutlinedButton(onClick = { grant(168, "Platform desteğine 7 gün erişim verildi") }, enabled = run.busy == null, modifier = Modifier.fillMaxWidth().height(52.dp)) { Text("7 gün erişim ver") } }
    }
  }
}

private val HOLIDAY_SOURCE = mapOf("official" to ("Resmî tatil" to Tone.Danger), "meb" to ("MEB takvimi" to Tone.Success), "school" to ("Okulun tatili" to Tone.Primary))

/** Tatil takvimi: eğitim yılının sonuna kadar tatiller, arifeler (yarım gün) ve olası köprü günleri */
@Composable
fun HolidaysScreen() {
  val state = authState()
  val nav = LocalNav.current
  val today = LocalDate.now()
  val days = maxOf(30, ChronoUnit.DAYS.between(today, LocalDate.of(academicYearOf(today) + 1, 6, 30)).toInt())
  val path = state.path("holidays/upcoming?days=$days")
  val q = rememberQuery(path) { get<HolidayList>(path) }
  data class Group(val name: String, val start: String, var end: String, val source: String)
  val groups = mutableListOf<Group>()
  q.data?.holidays?.forEach { h ->
    val last = groups.lastOrNull()
    val base = h.name.replace(Regex(" \\d+\\. Gün$"), "")
    if (last != null && last.source == h.source && last.name.replace(Regex(" \\d+\\. Gün$"), "") == base && LocalDate.parse(last.end).plusDays(1).toString() == h.date) {
      last.end = h.date
      groups[groups.lastIndex] = last.copy(name = base)
    } else groups += Group(h.name, h.date, h.date, h.source)
  }
  AppScaffold(title = "Tatil takvimi", subtitle = "MEB takvimi, bayramlar ve okulun tatilleri", onBack = { nav.popBackStack() }, refreshing = q.refreshing, onRefresh = q.refresh) {
    val data = q.data
    when {
      data == null && q.error != null -> item { ErrorCard(q.error!!, q.refresh) }
      data == null -> item { LoadingBox() }
      else -> {
        item { SectionHeader("Tatiller") }
        item {
          GroupCard {
            if (groups.isEmpty()) EmptyState(Icons.Outlined.WbSunny, "Yaklaşan tatil yok")
            groups.forEachIndexed { i, g ->
              if (i > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
              val n = ChronoUnit.DAYS.between(LocalDate.parse(g.start), LocalDate.parse(g.end)).toInt() + 1
              val (label, t) = HOLIDAY_SOURCE[g.source] ?: ("" to Tone.Neutral)
              Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                  Text(g.name, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                  Spacer(Modifier.width(8.dp))
                  StatusBadge(label, t)
                }
                Text(dateSpan(g.start, g.end) + if (n > 1) " · $n gün" else "", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
              }
            }
          }
        }
        if (data.halfDays.isNotEmpty()) {
          item { SectionHeader("Yarım günler (arife)") }
          item {
            GroupCard {
              data.halfDays.forEachIndexed { i, h -> RowItem(h.name, "${fullDate(h.date)} · öğleden sonra tatil", divider = i < data.halfDays.lastIndex) }
            }
          }
        }
        if (data.bridges.isNotEmpty()) {
          item { SectionHeader("Olası köprü günleri") }
          item {
            GroupCard {
              data.bridges.forEachIndexed { i, b -> RowItem(fullDate(b.date), "${b.near} ile tatil arasında kalıyor · idari izin ilan edilirse tatil olur", divider = i < data.bridges.lastIndex) }
            }
          }
        }
      }
    }
  }
}

private val ACTION = mapOf("create" to "ekledi", "update" to "değiştirdi", "delete" to "sildi", "approve" to "onayladı", "reject" to "düzeltmeye gönderdi")

/** Etkinlik geçmişi: kim, ne zaman, neyi değiştirdi (son 100 işlem, günlere göre) */
@Composable
fun AuditScreen() {
  val state = authState()
  val nav = LocalNav.current
  val q = rememberQuery(state.path("audit")) { get<List<AuditRow>>(state.path("audit")) }
  AppScaffold(title = "Etkinlik geçmişi", onBack = { nav.popBackStack() }, refreshing = q.refreshing, onRefresh = q.refresh) {
    val rows = q.data
    when {
      rows == null && q.error != null -> item { ErrorCard(q.error!!, q.refresh) }
      rows == null -> item { LoadingBox() }
      rows.isEmpty() -> item { EmptyCard(Icons.Outlined.History, "Henüz kayıt yok") }
      else -> rows.groupBy { localDateOf(it.createdAt) }.forEach { (day, list) ->
        item(key = "h$day") { SectionHeader(fullDate(day)) }
        item(key = "c$day") {
          GroupCard {
            list.forEachIndexed { i, r ->
              if (i > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
              Row(Modifier.fillMaxWidth().padding(16.dp)) {
                Text(clockOf(r.createdAt), style = MaterialTheme.typography.labelLarge.copy(fontFeatureSettings = "tnum"), color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.width(52.dp))
                Column(Modifier.weight(1f)) {
                  Text("${r.userName ?: "Sistem"} · ${r.entity} ${ACTION[r.action] ?: r.action}", style = MaterialTheme.typography.titleSmall)
                  r.summary?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2) }
                }
              }
            }
          }
        }
      }
    }
  }
}

/** Doğum günleri: bugün ve önümüzdeki 7 gün (panodaki kutlama kartıyla aynı liste; doğum yılı gösterilmez) */
@Composable
fun BirthdaysScreen() {
  val state = authState()
  val nav = LocalNav.current
  val students = rememberQuery(state.path("students")) { get<List<Student>>(state.path("students")) }
  val classes = rememberQuery(state.path("classes")) { get<List<ClassGroup>>(state.path("classes")) }
  val className = classes.data.orEmpty().associate { it.id to it.name }
  val today = LocalDate.now()
  val byDay = (0..7).map { today.plusDays(it.toLong()) }.map { d -> d to students.data.orEmpty().filter { it.birthDate.length >= 10 && it.birthDate.substring(5, 10) == d.toString().substring(5) } }
  AppScaffold(title = "Doğum günleri", onBack = { nav.popBackStack() }, refreshing = students.refreshing, onRefresh = students.refresh) {
    when {
      students.data == null && students.error != null -> item { ErrorCard(students.error!!, students.refresh) }
      students.data == null -> item { LoadingBox() }
      byDay.all { it.second.isEmpty() } -> item { EmptyCard(Icons.Outlined.Cake, "Bu hafta doğum günü yok", "Öğrenci listesi yönetim panelinden Excel ile yüklenir.") }
      else -> byDay.filter { it.second.isNotEmpty() }.forEach { (d, list) ->
        item(key = "h$d") { SectionHeader(if (d == today) "Bugün · ${fullDate(d)}" else fullDate(d)) }
        item(key = "c$d") {
          GroupCard {
            list.forEachIndexed { i, s -> RowItem(s.fullName, s.classGroupId?.let { className[it] }, Icons.Outlined.Cake, if (d == today) Tone.Gold else Tone.Neutral, divider = i < list.lastIndex) }
          }
        }
      }
    }
    item { Hint("Öğrencilerin doğum tarihi ve yaşı gösterilmez.") }
  }
}

/** Sınavlar ve etkinlikler: panodaki sınav sayacı ve etkinlik takviminin yaklaşan kayıtları */
@Composable
fun UpcomingScreen() {
  val state = authState()
  val nav = LocalNav.current
  val exams = rememberQuery(state.path("exams")) { get<List<Exam>>(state.path("exams")) }
  val events = rememberQuery(state.path("events")) { get<List<SchoolEvent>>(state.path("events")) }
  val now = Instant.now()
  val today = LocalDate.now().toString()
  val upcomingExams = exams.data.orEmpty().filter { it.isActive && Instant.parse(it.examAt) >= now }.sortedBy { it.examAt }
  val upcomingEvents = events.data.orEmpty().filter { it.isActive && it.date >= today }.sortedBy { it.date }
  AppScaffold(
    title = "Sınavlar ve etkinlikler",
    onBack = { nav.popBackStack() },
    refreshing = exams.refreshing || events.refreshing,
    onRefresh = {
      exams.refresh()
      events.refresh()
    },
  ) {
    if (exams.data == null || events.data == null) {
      item { (exams.error ?: events.error)?.let { ErrorCard(it) { exams.refresh(); events.refresh() } } ?: LoadingBox() }
      return@AppScaffold
    }
    item { SectionHeader("Sınavlar") }
    item {
      GroupCard {
        if (upcomingExams.isEmpty()) EmptyState(Icons.Outlined.School, "Yaklaşan sınav yok")
        upcomingExams.forEachIndexed { i, e ->
          val days = ChronoUnit.DAYS.between(LocalDate.now(), localDateOf(e.examAt))
          RowItem(e.title, "${fullDate(e.examAt)} · ${clockOf(e.examAt)}", Icons.Outlined.School, trailing = { StatusBadge(if (days > 0) "$days gün" else "Bugün", Tone.Primary) }, divider = i < upcomingExams.lastIndex)
        }
      }
    }
    item { SectionHeader("Etkinlikler") }
    item {
      GroupCard {
        if (upcomingEvents.isEmpty()) EmptyState(Icons.Outlined.Event, "Yaklaşan etkinlik yok")
        upcomingEvents.forEachIndexed { i, e ->
          RowItem(e.title, listOfNotNull(fullDate(e.date), e.time, e.place, e.organizer).joinToString(" · "), Icons.Outlined.Event, Tone.Gold, divider = i < upcomingEvents.lastIndex)
        }
      }
    }
  }
}
