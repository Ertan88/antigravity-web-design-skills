package com.okulpano.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Collections
import androidx.compose.material.icons.outlined.Campaign
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.KeyboardArrowUp
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.okulpano.app.data.LocalApp
import com.okulpano.app.data.rememberQuery
import com.okulpano.app.platform.rememberPhotoPicker
import com.okulpano.app.ui.components.AppScaffold
import com.okulpano.app.ui.components.ChipGroup
import com.okulpano.app.ui.components.EmptyCard
import com.okulpano.app.ui.components.ErrorCard
import com.okulpano.app.ui.components.Field
import com.okulpano.app.ui.components.GroupCard
import com.okulpano.app.ui.components.Hint
import com.okulpano.app.ui.components.LoadingBox
import com.okulpano.app.ui.components.SectionHeader
import com.okulpano.app.ui.components.Segmented
import com.okulpano.app.ui.components.StatusBadge
import com.okulpano.app.ui.components.rememberRunner
import com.okulpano.app.ui.components.rememberSnackbar
import com.okulpano.app.ui.nav.LocalNav
import com.okulpano.app.ui.nav.R
import com.okulpano.app.ui.nav.authState
import com.okulpano.app.ui.nav.go
import com.okulpano.app.ui.theme.status
import com.okulpano.core.ANNOUNCEMENT_TEMPLATES
import com.okulpano.core.Announcement
import com.okulpano.core.AnnouncementDesign
import com.okulpano.core.Board
import com.okulpano.core.Perm
import com.okulpano.core.SchoolInfo
import com.okulpano.core.body
import com.okulpano.core.dayMonth
import com.okulpano.core.designTemplate
import com.okulpano.core.designTitle
import com.okulpano.core.fullDate
import com.okulpano.core.timeAgo
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

@Composable
fun rememberAnnouncements() = authState().let { s -> rememberQuery(s.path("announcements"), pollMs = 60_000) { get<List<Announcement>>(s.path("announcements")) } }

/**
 * Duyurular: yetkisi olan kendi gönderdiklerini ve durumlarını görür (onay bekliyor, yayında, düzeltme istendi);
 * yetkisi olmayan öğretmen panolarda yayında olanları okur.
 */
@Composable
fun AnnouncementsScreen() {
  val state = authState()
  val nav = LocalNav.current
  val list = rememberAnnouncements()
  val manage = state.can(Perm.ANNOUNCEMENTS)
  val mine = list.data.orEmpty().filter { it.createdBy == state.me?.user?.id }
  AppScaffold(
    title = if (manage) "Duyurularım" else "Duyurular",
    refreshing = list.refreshing,
    onRefresh = list.refresh,
    floatingActionButton = {
      if (manage) ExtendedFloatingActionButton(onClick = { nav.go(R.ANNOUNCEMENT_NEW) }, icon = { Icon(Icons.Outlined.Add, null) }, text = { Text("Yeni duyuru") })
    },
  ) {
    when {
      list.data == null && list.error != null -> item { ErrorCard(list.error!!, list.refresh) }
      list.data == null -> item { LoadingBox() }
      !manage -> {
        val now = Instant.now()
        val live = list.data.orEmpty().filter { a ->
          a.approvalStatus == "approved" && a.isActive && (a.startsAt == null || Instant.parse(a.startsAt) <= now) && (a.endsAt == null || Instant.parse(a.endsAt) > now)
        }
        if (live.isEmpty()) {
          item { EmptyCard(Icons.Outlined.Campaign, "Şu an panolarda duyuru yok", "Panoya duyuru eklemek isterseniz okul yöneticinizden Duyurular yetkisi isteyin.") }
        } else {
          item { SectionHeader("Panolarda yayında") }
          live.forEach { a -> item(key = a.id) { AnnouncementCard(a, showStatus = false) } }
        }
      }
      mine.isEmpty() -> item { EmptyCard(Icons.Outlined.Campaign, "Henüz duyuru göndermediniz", "Veli toplantısı, gezi, sınav gibi hazır şablonlarla bir dakikada duyuru hazırlayın.") }
      else -> {
        item { SectionHeader("Gönderdiklerim") }
        mine.forEach { a -> item(key = a.id) { AnnouncementCard(a, showStatus = true) } }
        item { Hint("Düzeltme istenen duyuruyu yönetim panelinden düzenleyip yeniden gönderebilirsiniz.") }
      }
    }
  }
}

@Composable
private fun AnnouncementCard(a: Announcement, showStatus: Boolean) {
  Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow), modifier = Modifier.fillMaxWidth()) {
    AnnouncementPreview(a.kind, a.title, a.body, a.imageUrl, a.design, height = 140)
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
      Row(verticalAlignment = Alignment.CenterVertically) {
        Text(a.title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f), maxLines = 2)
        if (showStatus) {
          val (label, t) = announcementStatus(a)
          Spacer(Modifier.width(8.dp))
          StatusBadge(label, t)
        }
      }
      if (a.approvalStatus == "rejected" && a.reviewNote != null) Text("Not: ${a.reviewNote}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error)
      if (!showStatus && !a.body.isNullOrBlank()) Text(a.body!!, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
      Text(
        if (showStatus) "${timeAgo(a.createdAt.ifEmpty { null })} · ${if (a.screenIds.isNullOrEmpty()) "tüm panolar" else "${a.screenIds!!.size} pano"}"
        else a.endsAt?.let { "${fullDate(it)} tarihine kadar" } ?: "Süresiz",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
      )
    }
  }
}

/**
 * Yeni duyuru: hazır şablon, telefonla çekilen fotoğraf ya da yazı; panodaki görünüm canlı önizlenir. Okulda onay
 * açıksa ve kişinin onay yetkisi yoksa "Onaya gönder" olur.
 */
@Composable
fun AnnouncementNewScreen() {
  val state = authState()
  val app = LocalApp.current
  val nav = LocalNav.current
  val snackbar = rememberSnackbar()
  val run = rememberRunner(snackbar)
  val info = rememberQuery(state.path()) { get<SchoolInfo>(state.path()) }
  val boards = rememberQuery(state.path("screens")) { get<List<Board>>(state.path("screens")) }
  var kind by remember { mutableStateOf("design") }
  var templateId by remember { mutableStateOf(ANNOUNCEMENT_TEMPLATES.first().id) }
  val fields = remember { mutableStateMapOf<String, String>() }
  var title by remember { mutableStateOf("") }
  var text by remember { mutableStateOf("") }
  var imageUrl by remember { mutableStateOf<String?>(null) }
  var uploading by remember { mutableStateOf(false) }
  var screenIds by remember { mutableStateOf(listOf<String>()) }
  var phase by remember { mutableStateOf("any") }
  var until by remember { mutableStateOf("7") }
  val t = designTemplate(templateId)
  val design = AnnouncementDesign(t.id, t.palette, fields.toMap())
  val needsApproval = info.data?.settings?.requireApproval == true && !state.can(Perm.APPROVE)
  val picker = rememberPhotoPicker(
    onPicked = { photo ->
      run.run("upload") {
        uploading = true
        try {
          imageUrl = app.api.upload(state.schoolId!!, photo.name, photo.mime, photo.bytes).url
          kind = "image"
        } finally {
          uploading = false
        }
      }
    },
    onError = { run.toast(it) },
  )
  val ready = when (kind) {
    "design" -> !fields[t.headline.key].isNullOrBlank()
    "image" -> imageUrl != null && title.isNotBlank()
    else -> title.isNotBlank()
  }

  fun submit() = run.run("save") {
    // Seçilen gün sayısı sonunda gece yarısı (telefonun saatiyle) yayından kalkar
    val endsAt = if (until == "none") null else LocalDate.now().plusDays(until.toLong()).atStartOfDay(ZoneId.systemDefault()).toInstant().toString()
    val payload = when (kind) {
      "design" -> mapOf("kind" to kind, "title" to designTitle(design), "design" to mapOf("template" to design.template, "palette" to design.palette, "fields" to design.fields))
      "image" -> mapOf("kind" to kind, "title" to title.trim(), "body" to text.trim().ifEmpty { null }, "imageUrl" to imageUrl)
      else -> mapOf("kind" to kind, "title" to title.trim(), "body" to text.trim().ifEmpty { null })
    }
    app.api.send(
      state.path("announcements"),
      "POST",
      body(
        *payload.toList().toTypedArray(),
        "screenIds" to screenIds.ifEmpty { null },
        "schedule" to if (phase == "break") mapOf("days" to emptyList<Int>(), "from" to null, "to" to null, "phase" to "break") else null,
        "endsAt" to endsAt,
      ),
    )
    app.cache.invalidate("announcements", "control-center")
    nav.popBackStack()
  }

  AppScaffold(
    title = "Yeni duyuru",
    onBack = { nav.popBackStack() },
    snackbar = snackbar,
    bottomBar = {
      Surface(tonalElevation = 3.dp) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
          if (needsApproval) Hint("Okulunuzda onay açık: yönetici onaylayınca panoya çıkar")
          Button(onClick = { submit() }, enabled = ready && !uploading && run.busy == null, modifier = Modifier.fillMaxWidth().height(52.dp)) {
            if (run.busy == "save") CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp) else Text(if (needsApproval) "Onaya gönder" else "Yayınla")
          }
        }
      }
    },
  ) {
    if (!state.can(Perm.ANNOUNCEMENTS)) {
      item { EmptyCard(Icons.Outlined.Campaign, "Duyuru ekleme yetkiniz yok", "Okul yöneticinizden Duyurular yetkisi isteyin.") }
      return@AppScaffold
    }
    item { Segmented(listOf("design" to "Hazır şablon", "image" to "Fotoğraf", "text" to "Yazı"), kind, { kind = it }) }
    if (kind == "design") {
      item {
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          items(ANNOUNCEMENT_TEMPLATES) { x -> FilterChip(selected = x.id == templateId, onClick = { templateId = x.id }, label = { Text(x.name) }) }
        }
      }
    }
    item {
      Card(shape = MaterialTheme.shapes.medium) {
        AnnouncementPreview(kind, title.ifBlank { "Duyuru başlığı" }, text.ifBlank { null }, imageUrl, if (kind == "design") design else null, height = 190)
      }
    }
    if (kind == "design") {
      t.fields.filterNot { it.image }.forEach { f ->
        item(key = "${t.id}-${f.key}") { Field(f.label, fields[f.key].orEmpty(), { fields[f.key] = it }, placeholder = f.placeholder, maxLength = f.max, multiline = f.multiline) }
      }
    } else {
      if (kind == "image") {
        item {
          Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = picker.takePhoto, enabled = !uploading, modifier = Modifier.weight(1f)) {
              Icon(Icons.Outlined.PhotoCamera, null)
              Text(" Fotoğraf çek")
            }
            OutlinedButton(onClick = picker.pickFromGallery, enabled = !uploading, modifier = Modifier.weight(1f)) {
              Icon(Icons.Outlined.Image, null)
              Text(" Galeriden")
            }
          }
        }
      }
      item { Field("Başlık", title, { title = it }, placeholder = "ör. Bilim fuarımızdan kareler", maxLength = 120) }
      item { Field("Açıklama (isteğe bağlı)", text, { text = it }, maxLength = 600, multiline = true) }
    }
    item { Hint("Uzun metinleri telefon klavyesindeki mikrofonla sesli yazabilirsiniz.", center = false) }
    item { SectionHeader("Hangi panolarda") }
    item {
      ChipGroup(
        listOf("" to "Tüm panolar") + boards.data.orEmpty().map { it.id to it.name },
        isSelected = { id -> if (id.isEmpty()) screenIds.isEmpty() else id in screenIds },
        onToggle = { id -> screenIds = if (id.isEmpty()) emptyList() else if (id in screenIds) screenIds - id else screenIds + id },
      )
    }
    item { SectionHeader("Yayın zamanı") }
    item { Segmented(listOf("any" to "Her zaman", "break" to "Teneffüslerde"), phase, { phase = it }) }
    item { Segmented(listOf("1" to "Bugün", "3" to "3 gün", "7" to "1 hafta", "none" to "Süresiz"), until, { until = it }) }
  }
}

/** Yayın akışı: panolarda şu an ve planlı olanlar; sıralama ve duraklatma */
@Composable
fun ScheduleFeedScreen() {
  val state = authState()
  val app = LocalApp.current
  val nav = LocalNav.current
  val snackbar = rememberSnackbar()
  val run = rememberRunner(snackbar)
  val list = rememberAnnouncements()
  var tab by remember { mutableStateOf("live") }
  val now = Instant.now()
  fun stateOf(a: Announcement) = when {
    a.approvalStatus != "approved" -> "pending"
    a.endsAt != null && Instant.parse(a.endsAt) <= now -> "ended"
    a.startsAt != null && Instant.parse(a.startsAt) > now -> "planned"
    else -> "live"
  }
  val all = list.data.orEmpty()
  val counts = all.groupingBy { stateOf(it) }.eachCount()
  val rows = all.filter { stateOf(it) == tab }
  val editable = state.can(Perm.ANNOUNCEMENTS)
  val endOfToday = LocalDate.now().plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant()

  fun refresh() = app.cache.invalidate("announcements", "control-center")
  fun move(index: Int, dir: Int) {
    val ids = all.map { it.id }.toMutableList()
    val a = rows[index].id
    val b = rows.getOrNull(index + dir)?.id ?: return
    val i = ids.indexOf(a)
    val j = ids.indexOf(b)
    ids[i] = b
    ids[j] = a
    run.run("move") {
      app.api.send(state.path("announcements/reorder"), "POST", body("ids" to ids))
      refresh()
    }
  }

  AppScaffold(
    title = "Yayın akışı",
    subtitle = "Panolarda şu an ve planlı olanlar",
    onBack = { nav.popBackStack() },
    refreshing = list.refreshing,
    onRefresh = list.refresh,
    snackbar = snackbar,
    floatingActionButton = { if (editable) ExtendedFloatingActionButton(onClick = { nav.go(R.ANNOUNCEMENT_NEW) }, icon = { Icon(Icons.Outlined.Add, null) }, text = { Text("Duyuru ekle") }) },
  ) {
    item { Segmented(listOf("live" to "Yayında ${counts["live"] ?: 0}", "planned" to "Planlı ${counts["planned"] ?: 0}", "ended" to "Bitti"), tab, { tab = it }) }
    when {
      list.data == null && list.error != null -> item { ErrorCard(list.error!!, list.refresh) }
      list.data == null -> item { LoadingBox() }
      rows.isEmpty() -> item { EmptyCard(Icons.Outlined.Collections, if (tab == "live") "Yayında içerik yok" else if (tab == "planned") "Planlı içerik yok" else "Biten içerik yok") }
      else -> item {
        GroupCard {
          rows.forEachIndexed { i, a ->
            if (i > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            val endsToday = tab == "live" && a.endsAt != null && Instant.parse(a.endsAt) <= endOfToday
            Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
              if (editable && tab == "live") {
                Column {
                  IconButton(onClick = { move(i, -1) }, enabled = i > 0) { Icon(Icons.Outlined.KeyboardArrowUp, "Yukarı taşı") }
                  IconButton(onClick = { move(i, 1) }, enabled = i < rows.lastIndex) { Icon(Icons.Outlined.KeyboardArrowDown, "Aşağı taşı") }
                }
              } else {
                Spacer(Modifier.width(8.dp))
              }
              AnnouncementThumb(a.kind, a.imageUrl, a.design)
              Spacer(Modifier.width(12.dp))
              Column(Modifier.weight(1f)) {
                Text(a.title, style = MaterialTheme.typography.titleSmall, maxLines = 2, color = if (a.isActive) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.outline)
                Text(
                  when {
                    !a.isActive -> "Duraklatıldı"
                    endsToday -> "Bugün sona eriyor"
                    tab == "planned" && a.startsAt != null -> "${dayMonth(a.startsAt!!)} başlıyor"
                    a.endsAt != null -> "${dayMonth(a.endsAt!!)} tarihine kadar"
                    else -> "Süresiz"
                  } + if (a.schedule?.phase == "break") " · teneffüslerde" else "",
                  style = MaterialTheme.typography.bodySmall,
                  color = if (endsToday) MaterialTheme.status.warning else MaterialTheme.colorScheme.onSurfaceVariant,
                )
              }
              if (editable && tab != "ended") {
                Switch(checked = a.isActive, onCheckedChange = {
                  run.run("t${a.id}") {
                    app.api.send(state.path("announcements/${a.id}"), "PATCH", body("isActive" to !a.isActive))
                    refresh()
                  }
                })
              }
            }
          }
        }
      }
    }
    item { Hint("Oklarla sırayı değiştirin, anahtarla duraklatın. Kayan yazı ve tasarım ayrıntıları yönetim panelindedir.") }
  }
}
