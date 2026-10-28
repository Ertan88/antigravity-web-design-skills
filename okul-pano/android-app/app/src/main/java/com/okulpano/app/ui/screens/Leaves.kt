package com.okulpano.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.Button
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.okulpano.app.data.LocalApp
import com.okulpano.app.data.rememberQuery
import com.okulpano.app.ui.components.AppScaffold
import com.okulpano.app.ui.components.EmptyCard
import com.okulpano.app.ui.components.ErrorCard
import com.okulpano.app.ui.components.Field
import com.okulpano.app.ui.components.GroupCard
import com.okulpano.app.ui.components.Hint
import com.okulpano.app.ui.components.LoadingBox
import com.okulpano.app.ui.components.RowItem
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
import com.okulpano.core.ApprovalResult
import com.okulpano.core.Leave
import com.okulpano.core.Perm
import com.okulpano.core.body
import com.okulpano.core.dateSpan
import com.okulpano.core.fullDate
import com.okulpano.core.parseTrDate
import java.time.LocalDate

private val LEAVE_STATUS = mapOf("approved" to ("Onaylandı" to Tone.Success), "pending" to ("Onay bekliyor" to Tone.Warning), "rejected" to ("Reddedildi" to Tone.Danger))

@Composable
fun rememberMyLeaves() = authState().let { s -> rememberQuery(s.path("me/leaves")) { get<List<Leave>>(s.path("me/leaves")) } }

/** Öğretmenin izinleri: bildirdikleri ve durumları; yeni izin bildirimi */
@Composable
fun LeavesScreen() {
  val nav = LocalNav.current
  val leaves = rememberMyLeaves()
  val list = leaves.data.orEmpty()
  AppScaffold(
    title = "İzinlerim",
    refreshing = leaves.refreshing,
    onRefresh = leaves.refresh,
    floatingActionButton = { ExtendedFloatingActionButton(onClick = { nav.go(R.LEAVE_NEW) }, icon = { Icon(Icons.Outlined.Add, null) }, text = { Text("İzin bildir") }) },
  ) {
    when {
      leaves.data == null && leaves.error != null -> item { ErrorCard(leaves.error!!, leaves.refresh) }
      leaves.data == null -> item { LoadingBox() }
      list.isEmpty() -> item { EmptyCard(Icons.Outlined.EventBusy, "Henüz izin bildirmediniz", "İzniniz onaylanınca panoda izinli görünür; nöbetiniz varsa yöneticiniz yerine birini görevlendirir.") }
      else -> item {
        GroupCard {
          list.forEachIndexed { i, l ->
            val (label, t) = LEAVE_STATUS[l.approvalStatus] ?: ("" to Tone.Neutral)
            RowItem(dateSpan(l.startDate, l.endDate), l.note, Icons.Outlined.EventBusy, t, trailing = { StatusBadge(label, t) }, divider = i < list.lastIndex)
          }
        }
      }
    }
  }
}

/**
 * İzin bildirimi: öğretmen kendi iznini bildirir. İzin yetkisi yoksa yöneticinin onayına düşer; onaylanınca panoda
 * izinli görünür ve nöbeti boş kaldıysa yöneticiye hatırlatılır.
 */
@Composable
fun LeaveNewScreen() {
  val state = authState()
  val app = LocalApp.current
  val nav = LocalNav.current
  val snackbar = rememberSnackbar()
  val run = rememberRunner(snackbar)
  val today = rememberToday(state)
  val mine = rememberMyLeaves()
  val base = today.data?.today?.let { LocalDate.parse(it) } ?: LocalDate.now()
  var preset by remember { mutableStateOf("tomorrow") }
  var start by remember { mutableStateOf("") }
  var end by remember { mutableStateOf("") }
  var note by remember { mutableStateOf("") }

  fun range(): Pair<LocalDate, LocalDate>? = when (preset) {
    "today" -> base to base
    "tomorrow" -> base.plusDays(1) to base.plusDays(1)
    else -> {
      val s = parseTrDate(start)
      val e = parseTrDate(end.ifBlank { start })
      if (s != null && e != null) s to e else null
    }
  }

  fun submit() {
    val r = range()
    if (r == null) {
      run.toast("Tarihi GG.AA.YYYY biçiminde yazın (ör. 29.10.2026).")
      return
    }
    run.run("save") {
      val res: ApprovalResult = app.api.post(state.path("me/leaves"), body("startDate" to r.first.toString(), "endDate" to r.second.toString(), "note" to note.trim().ifEmpty { null }))
      app.cache.invalidate("me/leaves", "me/today")
      note = ""
      snackbar.showSnackbar(if (res.approvalStatus == "approved") "İzniniz kaydedildi, panoda görünüyor." else "İzin bildiriminiz yöneticinin onayına gönderildi.")
    }
  }

  AppScaffold(
    title = "İzin bildir",
    onBack = { nav.popBackStack() },
    snackbar = snackbar,
    bottomBar = {
      if (state.isTeacher) {
        Surface(tonalElevation = 3.dp) {
          Button(onClick = { submit() }, enabled = run.busy == null, modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(16.dp).height(52.dp)) {
            Text(if (state.can(Perm.LEAVES)) "Kaydet" else "Onaya gönder")
          }
        }
      }
    },
  ) {
    if (!state.isTeacher) {
      item { EmptyCard(Icons.Outlined.Person, "Hesabınız öğretmen kaydına bağlı değil", "Okul yöneticiniz panelde Kullanıcılar sayfasından hesabınızı öğretmen kaydınızla eşleştirmeli.") }
      return@AppScaffold
    }
    item { Text("İzin nedeni yalnızca yöneticiler tarafından görülür, panoda gösterilmez.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    item { Segmented(listOf("today" to "Bugün", "tomorrow" to "Yarın", "custom" to "Tarih seç"), preset, { preset = it }) }
    if (preset == "custom") {
      item {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
          Field("Başlangıç", start, { start = it }, Modifier.weight(1f), placeholder = "29.10.2026", maxLength = 10, keyboard = KeyboardType.Number)
          Field("Bitiş (dahil)", end, { end = it }, Modifier.weight(1f), placeholder = "aynı gün", maxLength = 10, keyboard = KeyboardType.Number)
        }
      }
    } else {
      item { Text(fullDate(if (preset == "today") base else base.plusDays(1)), style = MaterialTheme.typography.titleMedium) }
    }
    item { Field("Not (isteğe bağlı)", note, { note = it }, placeholder = "ör. Yıllık izin, görevlendirme", help = "Hastalık, tanı ya da rapor içeriği gibi sağlık bilgisi yazmayın.", maxLength = 120) }
    item { SectionHeader("Bildirdiğim izinler") }
    val list = mine.data.orEmpty().take(10)
    if (list.isEmpty()) {
      item { Hint("Henüz izin bildirmediniz.", center = false) }
    } else {
      item {
        GroupCard {
          Column {
            list.forEachIndexed { i, l ->
              val (label, t) = LEAVE_STATUS[l.approvalStatus] ?: ("" to Tone.Neutral)
              RowItem(dateSpan(l.startDate, l.endDate), trailing = { StatusBadge(label, t) }, divider = i < list.lastIndex)
            }
          }
        }
      }
    }
  }
}
