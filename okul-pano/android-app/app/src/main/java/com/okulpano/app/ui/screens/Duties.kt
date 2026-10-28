package com.okulpano.app.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material.icons.outlined.WbSunny
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.okulpano.app.data.LocalApp
import com.okulpano.app.data.rememberQuery
import com.okulpano.app.ui.components.AppScaffold
import com.okulpano.app.ui.components.Avatar
import com.okulpano.app.ui.components.EmptyCard
import com.okulpano.app.ui.components.EmptyState
import com.okulpano.app.ui.components.ErrorCard
import com.okulpano.app.ui.components.GroupCard
import com.okulpano.app.ui.components.Hint
import com.okulpano.app.ui.components.LoadingBox
import com.okulpano.app.ui.components.Runner
import com.okulpano.app.ui.components.SectionHeader
import com.okulpano.app.ui.components.Segmented
import com.okulpano.app.ui.components.StatusBadge
import com.okulpano.app.ui.components.Tone
import com.okulpano.app.ui.components.rememberRunner
import com.okulpano.app.ui.components.rememberSnackbar
import com.okulpano.app.ui.nav.LocalNav
import com.okulpano.app.ui.nav.R
import com.okulpano.app.ui.nav.authState
import com.okulpano.app.ui.nav.go
import com.okulpano.app.ui.theme.status
import com.okulpano.core.DutyDay
import com.okulpano.core.DutyEntry
import com.okulpano.core.MeToday
import com.okulpano.core.Perm
import com.okulpano.core.TR
import com.okulpano.core.WEEKDAY_SHORT
import com.okulpano.core.body
import com.okulpano.core.dayTitle
import com.okulpano.core.initials
import java.time.LocalDate

/** Nöbet: kendi nöbetlerim ve bugün kim nerede; yetkisi olan boş yere görevlendirir */
@Composable
fun DutiesScreen() {
  val state = authState()
  val snackbar = rememberSnackbar()
  val run = rememberRunner(snackbar)
  var tab by remember { mutableStateOf(if (state.isTeacher) "mine" else "all") }
  var offset by remember { mutableStateOf(0) }
  val today = rememberToday(state)
  val date = today.data?.let { LocalDate.parse(it.today).plusDays(offset.toLong()).toString() }
  val dayPath = state.path("duty-day" + (date?.let { "?date=$it" } ?: ""))
  val duty = rememberQuery(dayPath, enabled = tab == "all" && date != null) { get<DutyDay>(dayPath) }
  AppScaffold(
    title = if (state.isTeacher) "Nöbetlerim" else "Bugünün nöbetleri",
    refreshing = today.refreshing || duty.refreshing,
    onRefresh = {
      today.refresh()
      duty.refresh()
    },
    snackbar = snackbar,
  ) {
    if (state.isTeacher) item { Segmented(listOf("mine" to "Benim nöbetlerim", "all" to "Kim nerede"), tab, { tab = it }) }
    if (tab == "mine" && state.isTeacher) {
      val data = today.data
      when {
        data == null && today.error != null -> item { ErrorCard(today.error!!, today.refresh) }
        data == null -> item { LoadingBox() }
        else -> myDuties(data)
      }
    } else {
      item { Segmented(listOf(0 to "Bugün", 1 to "Yarın"), offset, { offset = it }) }
      val day = duty.data
      when {
        day == null && duty.error != null -> item { ErrorCard(duty.error!!, duty.refresh) }
        day == null -> item { LoadingBox() }
        day.holiday != null -> item { EmptyCard(Icons.Outlined.WbSunny, "Tatil", "${day.holiday}: nöbet yok") }
        day.entries.isEmpty() -> item { EmptyCard(Icons.Outlined.Shield, "Bu gün için nöbet girilmemiş", "Nöbet çizelgesi panelden Excel ile yüklenebilir.") }
        else -> {
          day.entries.filter { it.dutyId in day.gaps }.forEach { gap -> item(key = "gap${gap.dutyId}") { GapCard(day, gap, state.can(Perm.DUTIES), run) } }
          item { SectionHeader(if (offset == 1) "Yarın kim nerede" else "Bugün kim nerede") }
          val areas = day.entries.groupBy { it.area.trim().lowercase(TR) }.values.toList()
          item {
            GroupCard {
              areas.forEachIndexed { i, list ->
                if (i > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                  Text(list.first().area, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                  Text(
                    list.joinToString(", ") { e -> e.substitute?.let { "${it.teacherName} (yerine)" } ?: if (e.onLeave) "${e.teacherName} (izinli)" else e.teacherName },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.End,
                    modifier = Modifier.weight(1.2f),
                  )
                }
              }
            }
          }
          day.supervisor?.let { item { Hint("Nöbetçi müdür yardımcısı: $it", center = false) } }
        }
      }
    }
  }
}

@OptIn(ExperimentalLayoutApi::class)
private fun androidx.compose.foundation.lazy.LazyListScope.myDuties(data: MeToday) {
  val days = data.week.filter { it.weekday <= 5 }.take(5)
  item {
    var selected by remember { mutableStateOf(data.today) }
    val nav = LocalNav.current
    val day = days.firstOrNull { it.date == selected } ?: days.firstOrNull()
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
      Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        days.forEach { d ->
          val on = d.date == day?.date
          val has = d.duties.any { it.coveredBy == null }
          val colors = when {
            on -> CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primary, contentColor = MaterialTheme.colorScheme.onPrimary)
            d.holiday != null -> CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHighest, contentColor = MaterialTheme.colorScheme.onSurfaceVariant)
            else -> CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow)
          }
          Card(onClick = { selected = d.date }, colors = colors, modifier = Modifier.weight(1f)) {
            Column(Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
              Text(WEEKDAY_SHORT[d.weekday], style = MaterialTheme.typography.labelSmall)
              Text("${LocalDate.parse(d.date).dayOfMonth}", style = MaterialTheme.typography.titleLarge)
              if (d.holiday != null) {
                Text("TATİL", style = MaterialTheme.typography.labelSmall)
              } else {
                Box(Modifier.padding(top = 3.dp).size(6.dp).clip(CircleShape).background(if (has) (if (on) MaterialTheme.colorScheme.onPrimary else MaterialTheme.status.warning) else androidx.compose.ui.graphics.Color.Transparent))
              }
            }
          }
        }
      }
      if (day != null) {
        GroupCard {
          Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
              Text(if (day.date == data.today) "Bugün · ${dayTitle(day.date)}" else dayTitle(day.date), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary, modifier = Modifier.weight(1f))
              if (day.duties.isNotEmpty() && day.holiday == null) StatusBadge("Panoda görünüyor", Tone.Success)
            }
            when {
              day.holiday != null -> EmptyState(Icons.Outlined.WbSunny, "Tatil", day.holiday)
              day.duties.isEmpty() -> Text("Bu gün nöbetiniz yok.", color = MaterialTheme.colorScheme.onSurfaceVariant)
              else -> day.duties.forEach { d ->
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                  Text(d.area, style = MaterialTheme.typography.headlineSmall)
                  FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (d.partners.isNotEmpty()) StatusBadge("Birlikte: ${d.partners.joinToString(", ")}")
                    StatusBadge("Teneffüslerde")
                    d.substituteFor?.let { StatusBadge("$it yerine", Tone.Warning) }
                  }
                  d.coveredBy?.let { Text("İzniniz nedeniyle bu nöbeti $it tutuyor.", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.status.warning) }
                }
              }
            }
            day.supervisor?.let { Text("Nöbetçi müdür yardımcısı: $it", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
          }
        }
      }
      data.week.filter { it.date > (day?.date ?: "") && it.duties.isNotEmpty() && it.holiday == null }.take(3).forEach { d ->
        OutlinedCard(border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), modifier = Modifier.fillMaxWidth()) {
          Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
              Text(dayTitle(d.date), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
              Text(d.duties.joinToString(", ") { it.area }, style = MaterialTheme.typography.titleMedium)
            }
            Text("Teneffüslerde", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
          }
        }
      }
      OutlinedButton(onClick = { nav.go(R.LEAVE_NEW) }, modifier = Modifier.fillMaxWidth()) {
        Icon(Icons.Outlined.EventBusy, null)
        Text("  İzin bildir")
      }
      Hint("Nöbet günlerinizde ilk dersten 15 dakika önce telefonunuza hatırlatma gelir.")
    }
  }
}

/** Boş nöbet yeri ve öneriler: "Ata" ile öğretmene bildirim gider, pano hemen güncellenir */
@Composable
private fun GapCard(day: DutyDay, gap: DutyEntry, canAssign: Boolean, run: Runner) {
  val state = authState()
  val app = LocalApp.current
  Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.status.warningContainer, contentColor = MaterialTheme.status.onWarningContainer), modifier = Modifier.fillMaxWidth()) {
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
      Row(verticalAlignment = Alignment.CenterVertically) {
        Text(gap.area, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
        StatusBadge("BOŞ", Tone.Danger)
      }
      Text("${gap.teacherName} bu gün izinli.", style = MaterialTheme.typography.bodyMedium)
      if (!canAssign) {
        Text("Görevlendirmeyi nöbet yetkisi olan yönetici yapar.", style = MaterialTheme.typography.bodySmall)
        return@Column
      }
      Text("Önerilenler · o gün nöbeti olmayan, bu ay en az nöbet tutanlar", style = MaterialTheme.typography.labelLarge)
      day.candidates.take(4).forEach { c ->
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLowest), modifier = Modifier.fillMaxWidth()) {
          Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
            Avatar(initials(c.fullName), 36, MaterialTheme.colorScheme.primaryContainer, MaterialTheme.colorScheme.onPrimaryContainer)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
              Text(c.fullName, style = MaterialTheme.typography.titleSmall)
              Text("Bu ay ~${c.monthCount} nöbet", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            FilledTonalButton(
              onClick = {
                run.run(c.teacherId, "${c.fullName} görevlendirildi") {
                  app.api.send(state.path("duty-substitutions"), "POST", body("date" to day.date, "dutyId" to gap.dutyId, "teacherId" to c.teacherId))
                  app.cache.invalidate("duty-day", "control-center")
                }
              },
              enabled = run.busy == null,
            ) { Text("Ata") }
          }
        }
      }
      if (day.candidates.isEmpty()) Text("Uygun öğretmen bulunamadı.")
      Text("Atanan öğretmene bildirim gider, pano hemen güncellenir.", style = MaterialTheme.typography.bodySmall)
    }
  }
}
