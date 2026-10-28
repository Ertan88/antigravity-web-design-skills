package com.okulpano.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DoneAll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.okulpano.app.data.LocalApp
import com.okulpano.app.data.rememberQuery
import com.okulpano.app.ui.components.AppScaffold
import com.okulpano.app.ui.components.EmptyCard
import com.okulpano.app.ui.components.ErrorCard
import com.okulpano.app.ui.components.Field
import com.okulpano.app.ui.components.LoadingBox
import com.okulpano.app.ui.components.Runner
import com.okulpano.app.ui.components.SectionHeader
import com.okulpano.app.ui.components.rememberRunner
import com.okulpano.app.ui.components.rememberSnackbar
import com.okulpano.app.ui.nav.authState
import com.okulpano.app.ui.theme.status
import com.okulpano.core.Announcement
import com.okulpano.core.Leave
import com.okulpano.core.Perm
import com.okulpano.core.Teacher
import com.okulpano.core.body
import com.okulpano.core.dateSpan
import com.okulpano.core.timeAgo

/** Onay kutusu: onaya düşen duyurular ve öğretmenlerin bildirdiği izinler */
@Composable
fun ApprovalsScreen() {
  val state = authState()
  val app = LocalApp.current
  val snackbar = rememberSnackbar()
  val run = rememberRunner(snackbar)
  val canAnn = state.can(Perm.APPROVE)
  val canLeave = state.can(Perm.LEAVES)
  val ann = rememberQuery(state.path("announcements"), enabled = canAnn) { get<List<Announcement>>(state.path("announcements")) }
  val leaves = rememberQuery(state.path("leaves"), enabled = canLeave) { get<List<Leave>>(state.path("leaves")) }
  val teachers = rememberQuery(state.path("teachers"), enabled = canLeave) { get<List<Teacher>>(state.path("teachers")) }
  val pendingAnn = if (canAnn) ann.data.orEmpty().filter { it.approvalStatus == "pending" } else emptyList()
  val pendingLeaves = if (canLeave) leaves.data.orEmpty().filter { it.approvalStatus == "pending" } else emptyList()
  val names = teachers.data.orEmpty().associate { it.id to it.fullName }
  val total = pendingAnn.size + pendingLeaves.size
  val loading = (canAnn && ann.data == null) || (canLeave && leaves.data == null)

  fun review(resource: String, id: String, action: String, note: String? = null) = run.run("$action$id", if (action == "approve") "Onaylandı" else "Gönderildi") {
    app.api.send(state.path("$resource/$id/$action"), "POST", if (note != null) body("note" to note) else body())
    app.cache.invalidate("announcements", "leaves", "control-center", "inbox")
  }

  AppScaffold(
    title = "Onaylar",
    subtitle = if (loading) null else if (total > 0) "$total içerik onayınızı bekliyor" else "Bekleyen içerik yok",
    refreshing = ann.refreshing || leaves.refreshing,
    onRefresh = {
      ann.refresh()
      leaves.refresh()
    },
    snackbar = snackbar,
  ) {
    val error = ann.error ?: leaves.error
    when {
      loading && error != null -> item { ErrorCard(error) { ann.refresh(); leaves.refresh() } }
      loading -> item { LoadingBox() }
      total == 0 -> item { EmptyCard(Icons.Outlined.DoneAll, "Hepsi tamam", "Öğretmenlerin gönderdiği duyurular ve izin bildirimleri burada görünür.") }
      else -> {
        pendingAnn.forEach { a -> item(key = a.id) { AnnouncementReview(a, run, { review("announcements", a.id, "approve") }) { note -> review("announcements", a.id, "reject", note) } } }
        if (pendingLeaves.isNotEmpty()) item { SectionHeader("İzin bildirimleri") }
        pendingLeaves.forEach { l ->
          item(key = l.id) {
            LeaveReview(l, names[l.teacherId] ?: "Öğretmen", run, { review("leaves", l.id, "approve") }) { review("leaves", l.id, "reject") }
          }
        }
      }
    }
  }
}

@Composable
private fun AnnouncementReview(a: Announcement, run: Runner, onApprove: () -> Unit, onReject: (String) -> Unit) {
  var rejecting by remember { mutableStateOf(false) }
  var note by remember { mutableStateOf("") }
  Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow), modifier = Modifier.fillMaxWidth()) {
    AnnouncementPreview(a.kind, a.title, a.body, a.imageUrl, a.design)
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
      Text(a.title, style = MaterialTheme.typography.titleMedium)
      Text(
        "${a.createdByName ?: "Bir kullanıcı"} gönderdi · ${timeAgo(a.updatedAt.ifEmpty { null })}" +
          (if (a.screenIds.isNullOrEmpty()) " · tüm panolar" else " · ${a.screenIds!!.size} pano") +
          (if (a.schedule?.phase == "break") " · teneffüslerde" else ""),
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
      )
      if (rejecting) Field("Düzeltme nedeni (öğretmen görür)", note, { note = it }, placeholder = "ör. Tarih yanlış yazılmış", multiline = true)
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        if (rejecting) {
          OutlinedButton(onClick = { rejecting = false }, modifier = Modifier.weight(1f)) { Text("Vazgeç") }
          Button(
            onClick = { onReject(note.trim()) },
            enabled = note.trim().length >= 3 && run.busy == null,
            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error, contentColor = MaterialTheme.colorScheme.onError),
            modifier = Modifier.weight(1f),
          ) { Text("Geri gönder") }
        } else {
          OutlinedButton(onClick = { rejecting = true }, modifier = Modifier.weight(1f)) { Text("Geri gönder") }
          Button(
            onClick = onApprove,
            enabled = run.busy == null,
            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.status.success, contentColor = MaterialTheme.status.onSuccess),
            modifier = Modifier.weight(1f),
          ) { Text("Onayla") }
        }
      }
    }
  }
}

@Composable
private fun LeaveReview(l: Leave, name: String, run: Runner, onApprove: () -> Unit, onReject: () -> Unit) {
  Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow), modifier = Modifier.fillMaxWidth()) {
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
      Text(name, style = MaterialTheme.typography.titleMedium)
      Text(dateSpan(l.startDate, l.endDate) + (l.note?.let { " · $it" } ?: ""), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
      Text("Onaylanınca panoda izinli görünür; nöbeti varsa boş nöbet olarak size hatırlatılır.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedButton(onClick = onReject, enabled = run.busy == null, modifier = Modifier.weight(1f)) { Text("Reddet") }
        Button(
          onClick = onApprove,
          enabled = run.busy == null,
          colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.status.success, contentColor = MaterialTheme.status.onSuccess),
          modifier = Modifier.weight(1f),
        ) { Text("Onayla") }
      }
    }
  }
}
