package com.okulpano.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.SwapHoriz
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.okulpano.app.data.LocalApp
import com.okulpano.app.data.rememberQuery
import com.okulpano.app.ui.components.AppScaffold
import com.okulpano.app.ui.components.EmptyState
import com.okulpano.app.ui.components.ErrorCard
import com.okulpano.app.ui.components.GroupCard
import com.okulpano.app.ui.components.KpiCard
import com.okulpano.app.ui.components.LoadingBox
import com.okulpano.app.ui.components.RowItem
import com.okulpano.app.ui.components.SectionHeader
import com.okulpano.app.ui.components.StatusBadge
import com.okulpano.app.ui.components.Tone
import com.okulpano.app.ui.components.rememberRunner
import com.okulpano.app.ui.components.rememberSnackbar
import com.okulpano.app.ui.nav.LocalNav
import com.okulpano.app.ui.nav.R
import com.okulpano.app.ui.nav.authState
import com.okulpano.app.ui.nav.go
import com.okulpano.core.CalendarRow
import com.okulpano.core.PlatformSchool
import com.okulpano.core.Signup
import com.okulpano.core.academicYearLabel
import com.okulpano.core.academicYearOf
import com.okulpano.core.fullDate
import com.okulpano.core.timeAgo
import java.time.Instant
import java.time.LocalDate

@Composable
fun rememberPlatformSchools() = rememberQuery("/api/platform/schools") { get<List<PlatformSchool>>("/api/platform/schools") }

/** Kendi okuluna (süper kullanıcı) ya da destek erişimi süren okula geçer */
@Composable
fun rememberOpenSchool(): (String) -> Unit {
  val app = LocalApp.current
  val nav = LocalNav.current
  return { id ->
    app.auth.selectSchool(id)
    app.auth.setPlatformMode(false)
    nav.go(R.HOME)
  }
}

/** Platform yöneticisinin ana ekranı: okullar, kayıt onayları, destek erişimleri, MEB takvimi */
@Composable
fun PlatformHome() {
  val state = authState()
  val nav = LocalNav.current
  val snackbar = rememberSnackbar()
  val run = rememberRunner(snackbar)
  val app = LocalApp.current
  val schools = rememberPlatformSchools()
  val signups = rememberQuery("/api/platform/signups") { get<List<Signup>>("/api/platform/signups") }
  val calendars = rememberQuery("/api/platform/academic-calendars") { get<List<CalendarRow>>("/api/platform/academic-calendars") }
  val openSchool = rememberOpenSchool()

  val list = schools.data.orEmpty()
  val now = Instant.now()
  val own = list.filter { it.member }
  val support = list.filter { !it.member && it.canOpen }
  val trials = list.filter { it.plan == "trial" && it.isActive }
  val ending = trials.filter { it.trialEndsAt != null && Instant.parse(it.trialEndsAt).toEpochMilli() - now.toEpochMilli() < 7 * 86_400_000L }
  val waiting = signups.data.orEmpty().filterNot { it.expired }
  val year = academicYearOf(LocalDate.now())
  val nextCal = calendars.data?.firstOrNull { it.startYear == year + 1 }
  val review = calendars.data.orEmpty().filter { it.status == "review" || it.pending != null }

  AppScaffold(
    title = "Platform",
    subtitle = state.me?.user?.fullName,
    actions = { MenuAction() },
    refreshing = schools.refreshing,
    onRefresh = {
      schools.refresh()
      signups.refresh()
      calendars.refresh()
    },
    snackbar = snackbar,
  ) {
    when {
      schools.data == null && schools.error != null -> item { ErrorCard(schools.error!!, schools.refresh) }
      schools.data == null -> item { LoadingBox() }
      else -> {
        item {
          Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            KpiCard("${list.count { it.isActive }}", "etkin okul", Modifier.weight(1f)) { nav.go(R.SCHOOLS) }
            KpiCard("${trials.size}", "denemede", Modifier.weight(1f)) { nav.go(R.SCHOOLS) }
            KpiCard("${waiting.size}", "kayıt bekliyor", Modifier.weight(1f))
          }
        }
        if (own.isNotEmpty()) {
          item { SectionHeader("Okulum · süper kullanıcı") }
          item {
            GroupCard {
              own.forEachIndexed { i, s -> RowItem(s.name, "Okulumu aç · her şey açık", Icons.Outlined.SwapHoriz, onClick = { openSchool(s.id) }, divider = i < own.lastIndex) }
            }
          }
        }
        item { SectionHeader("Destek erişimi olan okullar") }
        item {
          GroupCard {
            if (support.isEmpty()) {
              EmptyState(Icons.Outlined.Lock, "Açık destek erişimi yok", "Bir okulun verilerine yalnızca müdürün verdiği süreli erişimle girebilirsiniz.")
            } else {
              support.forEachIndexed { i, s ->
                RowItem(s.name, "Müdür onayıyla · ${fullDate(s.supportAccessUntil!!)} tarihine kadar", Icons.Outlined.Key, Tone.Success, onClick = { openSchool(s.id) }, divider = i < support.lastIndex)
              }
            }
          }
        }
        if (waiting.isNotEmpty()) {
          item { SectionHeader("Kayıt onayları") }
          waiting.forEach { s ->
            item(key = s.id) {
              GroupCard {
                Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                  Text(s.schoolName, style = MaterialTheme.typography.titleMedium)
                  Text(listOfNotNull(s.ownerName, s.email, s.city, timeAgo(s.createdAt)).joinToString(" · "), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                  Text("E-postasını doğrulamadı. Elle onaylarsanız okul açılır, başvuran kendi şifresiyle girer.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                  FilledTonalButton(
                    onClick = {
                      run.run(s.id, "Okul açıldı") {
                        app.api.send("/api/platform/signups/${s.id}/approve", "POST")
                        app.cache.invalidate("/api/platform")
                      }
                    },
                    enabled = run.busy == null,
                  ) {
                    Icon(Icons.Outlined.Check, null)
                    Text("  Onayla ve okulu aç")
                  }
                }
              }
            }
          }
        }
        if (ending.isNotEmpty()) {
          item { SectionHeader("Denemesi bitmek üzere") }
          item {
            GroupCard {
              ending.forEachIndexed { i, s -> RowItem(s.name, "Deneme ${fullDate(s.trialEndsAt!!)} tarihinde bitiyor", Icons.Outlined.Schedule, Tone.Warning, onClick = { nav.go(R.SCHOOLS) }, divider = i < ending.lastIndex) }
            }
          }
        }
        item { SectionHeader("MEB çalışma takvimi") }
        item {
          GroupCard {
            RowItem(
              when {
                review.isNotEmpty() -> "${review.size} takvim onay bekliyor"
                nextCal != null -> "${nextCal.label} takvimi sistemde"
                else -> "${academicYearLabel(year + 1)} takvimi henüz yok"
              },
              when {
                review.isNotEmpty() -> "Taranan tarihleri kontrol edip onaylayın"
                nextCal != null -> "Tatiller okullara işlendi"
                else -> "Haziran ortasından itibaren her gün taranır"
              },
              Icons.Outlined.CalendarMonth,
              if (review.isNotEmpty()) Tone.Warning else if (nextCal != null) Tone.Primary else Tone.Neutral,
              trailing = if (review.isNotEmpty()) { { StatusBadge("Onay", Tone.Warning) } } else null,
              onClick = { nav.go(R.MEB) },
            )
          }
        }
      }
    }
  }
}
