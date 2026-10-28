package com.okulpano.app.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Campaign
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.okulpano.app.data.rememberQuery
import com.okulpano.app.ui.components.AppScaffold
import com.okulpano.app.ui.components.EmptyState
import com.okulpano.app.ui.components.GroupCard
import com.okulpano.app.ui.components.LoadingBox
import com.okulpano.app.ui.components.RowItem
import com.okulpano.app.ui.components.SectionHeader
import com.okulpano.app.ui.components.StatusBadge
import com.okulpano.app.ui.components.Tone
import com.okulpano.app.ui.nav.LocalNav
import com.okulpano.app.ui.nav.R
import com.okulpano.app.ui.nav.authState
import com.okulpano.app.ui.nav.go
import com.okulpano.core.Announcement
import com.okulpano.core.Perm
import java.time.Instant

/** Duyurunun durumu: onay bekliyor, düzeltme istendi, yayında… */
fun announcementStatus(a: Announcement, now: Instant = Instant.now()): Pair<String, Tone> = when {
  a.approvalStatus == "pending" -> "Onay bekliyor" to Tone.Warning
  a.approvalStatus == "rejected" -> "Düzeltme istendi" to Tone.Danger
  !a.isActive -> "Yayında değil" to Tone.Neutral
  a.endsAt != null && Instant.parse(a.endsAt) <= now -> "Süresi bitti" to Tone.Neutral
  else -> "Yayında" to Tone.Success
}

/** Editörün ana ekranı: hızlı ekle, duyurularının durumu ve verilen yetkiler */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun EditorHome() {
  val state = authState()
  val nav = LocalNav.current
  val list = rememberQuery(state.path("announcements"), enabled = state.can(Perm.ANNOUNCEMENTS), pollMs = 60_000) { get<List<Announcement>>(state.path("announcements")) }
  val today = rememberToday(state)
  val mine = list.data.orEmpty().filter { it.createdBy == state.me?.user?.id }.take(5)
  AppScaffold(
    title = "İçerik",
    subtitle = listOfNotNull("Editör", state.school?.name).joinToString(" · "),
    actions = {
      NotificationsAction()
      MenuAction()
    },
    refreshing = list.refreshing,
    onRefresh = list.refresh,
  ) {
    item { SectionHeader("Ekle") }
    item { QuickAdd() }
    if (state.can(Perm.ANNOUNCEMENTS)) {
      item { SectionHeader("Duyurularım") }
      item {
        GroupCard {
          when {
            list.data == null -> LoadingBox()
            mine.isEmpty() -> EmptyState(Icons.Outlined.Campaign, "Henüz duyuru göndermediniz")
            else -> mine.forEachIndexed { i, a ->
              val (label, t) = announcementStatus(a)
              RowItem(a.title, a.reviewNote.takeIf { a.approvalStatus == "rejected" }, trailing = { StatusBadge(label, t) }, onClick = { nav.go(R.ANNOUNCEMENTS) }, divider = i < mine.lastIndex)
            }
          }
        }
      }
    }
    val me = today.data
    if (state.isTeacher && me != null) item { TodayDutyCard(me) }
    item {
      OutlinedCard(border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
          Text("Yetkileriniz (okul yöneticisi verdi)", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
          FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            state.school?.permissions.orEmpty().forEach { StatusBadge(Perm.LABELS_TR[it] ?: it, Tone.Primary) }
          }
          Text(
            "Alt menü bu yetkilere göre oluşur." + if (state.can(Perm.ANNOUNCEMENTS) && !state.can(Perm.APPROVE)) " Duyurularınız yayına girmeden önce onaya gidebilir." else "",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
          )
        }
      }
    }
  }
}
