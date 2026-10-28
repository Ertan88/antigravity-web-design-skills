package com.okulpano.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Apartment
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.automirrored.outlined.Login
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.okulpano.app.data.LocalApp
import com.okulpano.app.data.rememberQuery
import com.okulpano.app.ui.components.AppScaffold
import com.okulpano.app.ui.components.EmptyCard
import com.okulpano.app.ui.components.ErrorCard
import com.okulpano.app.ui.components.GroupCard
import com.okulpano.app.ui.components.Hint
import com.okulpano.app.ui.components.LoadingBox
import com.okulpano.app.ui.components.SectionHeader
import com.okulpano.app.ui.components.Segmented
import com.okulpano.app.ui.components.StatusBadge
import com.okulpano.app.ui.components.Tone
import com.okulpano.app.ui.components.rememberConfirm
import com.okulpano.app.ui.components.rememberRunner
import com.okulpano.app.ui.components.rememberSnackbar
import com.okulpano.app.ui.theme.status
import com.okulpano.core.AcademicCalendarData
import com.okulpano.core.CalendarRow
import com.okulpano.core.PlatformSchool
import com.okulpano.core.ScanResult
import com.okulpano.core.TR
import com.okulpano.core.academicYearLabel
import com.okulpano.core.academicYearOf
import com.okulpano.core.body
import com.okulpano.core.calendarSummary
import com.okulpano.core.fullDate
import com.okulpano.core.timeAgo
import java.time.Instant
import java.time.LocalDate

private val PLAN = mapOf("trial" to "Deneme", "basic" to "Temel", "pro" to "Profesyonel")

/** Okullar ve abonelikler: paket, pano sayısı, deneme süresi; destek erişimi süren okula geçiş */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SchoolsScreen() {
  val app = LocalApp.current
  val schools = rememberPlatformSchools()
  val openSchool = rememberOpenSchool()
  val snackbar = rememberSnackbar()
  val run = rememberRunner(snackbar)
  val confirm = rememberConfirm("Kapat")
  var q by remember { mutableStateOf("") }
  var filter by remember { mutableStateOf("all") }
  val needle = q.trim().lowercase(TR)
  val list = schools.data.orEmpty().filter { s ->
    (needle.isEmpty() || "${s.name} ${s.city.orEmpty()}".lowercase(TR).contains(needle)) &&
      when (filter) {
        "trial" -> s.plan == "trial" && s.isActive
        "paid" -> s.plan != "trial" && s.isActive
        "passive" -> !s.isActive
        else -> true
      }
  }
  fun patch(s: PlatformSchool, vararg pairs: Pair<String, Any?>, done: String) = run.run(s.id, done) {
    app.api.send("/api/platform/schools/${s.id}", "PATCH", body(*pairs))
    app.cache.invalidate("/api/platform/schools")
  }

  AppScaffold(title = "Okullar", subtitle = "Paketler, pano sayısı ve deneme süreleri", refreshing = schools.refreshing, onRefresh = schools.refresh, snackbar = snackbar) {
    item {
      OutlinedTextField(
        value = q,
        onValueChange = { q = it },
        leadingIcon = { Icon(Icons.Outlined.Search, null) },
        placeholder = { Text("Okul adı ya da il") },
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
      )
    }
    item { Segmented(listOf("all" to "Tümü", "trial" to "Deneme", "paid" to "Ücretli", "passive" to "Kapalı"), filter, { filter = it }) }
    when {
      schools.data == null && schools.error != null -> item { ErrorCard(schools.error!!, schools.refresh) }
      schools.data == null -> item { LoadingBox() }
      list.isEmpty() -> item { EmptyCard(Icons.Outlined.Apartment, "Okul bulunamadı") }
      else -> list.forEach { s ->
        item(key = s.id) {
          val trialLeft = s.trialEndsAt?.let { ((Instant.parse(it).toEpochMilli() - System.currentTimeMillis()) / 86_400_000.0).let(Math::ceil).toInt() }
          GroupCard {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
              Row(verticalAlignment = Alignment.CenterVertically) {
                Text(s.name, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                StatusBadge(if (!s.isActive) "Kapalı" else PLAN[s.plan] ?: s.plan, if (!s.isActive) Tone.Danger else if (s.plan == "trial") Tone.Warning else Tone.Success)
              }
              Text(listOfNotNull(s.city, "${s.screenCount}/${s.maxScreens} pano", if (s.member) "üyesiniz" else null).joinToString(" · "), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
              if (s.plan == "trial" && s.trialEndsAt != null) {
                Text(
                  if ((trialLeft ?: 0) < 0) "Deneme ${fullDate(s.trialEndsAt!!)} tarihinde bitti" else "Deneme ${fullDate(s.trialEndsAt!!)} tarihinde bitiyor",
                  style = MaterialTheme.typography.labelLarge,
                  color = if ((trialLeft ?: 99) < 7) MaterialTheme.status.warning else MaterialTheme.colorScheme.onSurfaceVariant,
                )
              }
              if (!s.member && s.supportAccessUntil != null && Instant.parse(s.supportAccessUntil) > Instant.now()) {
                Text("Destek erişimi ${fullDate(s.supportAccessUntil!!)} tarihine kadar açık", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.status.success)
              }
              FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (s.plan == "trial") {
                  OutlinedButton(onClick = { patch(s, "extendTrialDays" to 30, done = "Deneme 30 gün uzatıldı") }, enabled = run.busy == null) {
                    Icon(Icons.Outlined.Add, null)
                    Text(" 30 gün uzat")
                  }
                }
                if (s.canOpen) {
                  OutlinedButton(onClick = { openSchool(s.id) }) {
                    Icon(Icons.AutoMirrored.Outlined.Login, null)
                    Text(" Okulu aç")
                  }
                }
                TextButton(onClick = {
                  if (s.isActive) confirm.ask("Okul kapatılsın mı?", "${s.name} panoları ve panel girişi durur. Daha sonra yeniden açabilirsiniz.") { patch(s, "isActive" to false, done = "Okul kapatıldı") }
                  else patch(s, "isActive" to true, done = "Okul yeniden açıldı")
                }) { Text(if (s.isActive) "Kapat" else "Yeniden aç") }
              }
            }
          }
        }
      }
    }
  }
}

/**
 * MEB çalışma takvimi (platform yöneticisi): her yıl haziran ortasından itibaren MEB'in sitesi taranır, bulunan takvim
 * onaya düşer. Onaylanınca bütün okulların tatil takvimine işlenir.
 */
@Composable
fun MebCalendarScreen() {
  val app = LocalApp.current
  val snackbar = rememberSnackbar()
  val run = rememberRunner(snackbar)
  val calendars = rememberQuery("/api/platform/academic-calendars") { get<List<CalendarRow>>("/api/platform/academic-calendars") }
  var note by remember { mutableStateOf<String?>(null) }
  val current = academicYearOf(LocalDate.now())
  val rows = calendars.data.orEmpty().filter { it.startYear >= current }.sortedBy { it.startYear }
  val missingNext = calendars.data != null && rows.none { it.startYear == current + 1 }

  fun scan(year: Int) = run.run("scan$year") {
    val r: ScanResult = app.api.post("/api/platform/academic-calendars/$year/scan", body())
    note = r.message
    app.cache.invalidate("academic-calendars")
  }
  fun decide(year: Int, action: String) = run.run("$action$year", if (action == "accept") "Takvim onaylandı" else "Mevcut takvim korundu") {
    app.api.send("/api/platform/academic-calendars/$year/$action", "POST")
    app.cache.invalidate("academic-calendars")
  }

  AppScaffold(title = "MEB takvimi", subtitle = "Bütün okullar için ortak", refreshing = calendars.refreshing, onRefresh = calendars.refresh, snackbar = snackbar) {
    if (note != null) {
      item {
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
          Text(note!!, Modifier.padding(16.dp), style = MaterialTheme.typography.bodyMedium)
        }
      }
    }
    if (missingNext) {
      item {
        GroupCard {
          Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("${academicYearLabel(current + 1)} takvimi henüz yok", style = MaterialTheme.typography.titleMedium)
            Text("MEB takvimi genellikle haziran ortasından itibaren duyurur; sistem her gün kendiliğinden tarar. İsterseniz şimdi tarayın.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedButton(onClick = { scan(current + 1) }, enabled = run.busy == null) {
              Icon(Icons.Outlined.Refresh, null)
              Text(" Şimdi tara")
            }
          }
        }
      }
    }
    when {
      calendars.data == null && calendars.error != null -> item { ErrorCard(calendars.error!!, calendars.refresh) }
      calendars.data == null -> item { LoadingBox() }
      rows.isEmpty() -> item { EmptyCard(Icons.Outlined.CalendarMonth, "Takvim yok") }
      else -> rows.forEach { c ->
        val waiting = c.pending != null || c.status == "review"
        item(key = "h${c.startYear}") {
          SectionHeader("${c.label} eğitim yılı") { StatusBadge(if (waiting) "Onay bekliyor" else "Onaylandı", if (waiting) Tone.Warning else Tone.Success) }
        }
        item(key = c.startYear) {
          GroupCard {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
              val source = mapOf("meb" to "MEB duyurusundan", "manual" to "Elle girildi", "builtin" to "Kurulum verisi")[c.source] ?: c.source
              Text(source + (c.checkedAt?.let { " · son tarama ${timeAgo(it)}" } ?: ""), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
              Summary(c.data, c.startYear)
              c.pending?.let { p ->
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                Text("MEB duyurusunda farklı tarihler bulundu", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.status.warning)
                Summary(p.data, c.startYear)
              }
              Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (waiting) {
                  Button(onClick = { decide(c.startYear, "accept") }, enabled = run.busy == null) {
                    Icon(Icons.Outlined.Check, null)
                    Text(if (c.pending != null) " Yeni tarihleri uygula" else " Onayla")
                  }
                }
                if (c.pending != null) OutlinedButton(onClick = { decide(c.startYear, "reject") }, enabled = run.busy == null) { Text("Mevcut kalsın") }
                TextButton(onClick = { scan(c.startYear) }, enabled = run.busy == null) { Text("Şimdi tara") }
              }
            }
          }
        }
      }
    }
    item { Hint("Takvimi elle düzeltmek için yönetim panelinde Tatil Takvimi sayfasını kullanın.") }
  }
}

/** Takvimin satır satır özeti: tarihler kısaltmasız, yıl ve gün adıyla */
@Composable
private fun Summary(data: AcademicCalendarData, startYear: Int) {
  Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
    calendarSummary(data, startYear).forEach { (k, v) ->
      Column {
        Text(k, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(v, style = MaterialTheme.typography.bodyLarge)
      }
    }
  }
}
