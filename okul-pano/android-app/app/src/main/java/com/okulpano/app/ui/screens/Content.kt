package com.okulpano.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.MenuBook
import androidx.compose.material.icons.automirrored.outlined.ShortText
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.EmojiEvents
import androidx.compose.material.icons.outlined.Event
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material.icons.outlined.School
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.okulpano.app.data.LocalApp
import com.okulpano.app.data.rememberQuery
import com.okulpano.app.platform.rememberPhotoPicker
import com.okulpano.app.ui.components.AppScaffold
import com.okulpano.app.ui.components.EmptyCard
import com.okulpano.app.ui.components.ErrorCard
import com.okulpano.app.ui.components.Field
import com.okulpano.app.ui.components.GroupCard
import com.okulpano.app.ui.components.IconTile
import com.okulpano.app.ui.components.LoadingBox
import com.okulpano.app.ui.components.Segmented
import com.okulpano.app.ui.components.StatusBadge
import com.okulpano.app.ui.components.SwitchRow
import com.okulpano.app.ui.components.Tone
import com.okulpano.app.ui.components.rememberConfirm
import com.okulpano.app.ui.components.rememberRunner
import com.okulpano.app.ui.components.rememberSnackbar
import com.okulpano.app.ui.nav.LocalNav
import com.okulpano.app.ui.nav.authState
import com.okulpano.core.ContentRow
import com.okulpano.core.Perm
import com.okulpano.core.clockOf
import com.okulpano.core.fullDate
import com.okulpano.core.localDateOf
import com.okulpano.core.parseTrDate
import com.okulpano.core.toJson
import com.okulpano.core.trDateInput
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import java.time.LocalTime
import java.time.ZoneId

private sealed interface ContentField {
  val key: String
  val label: String
  data class Text(override val key: String, override val label: String, val max: Int, val required: Boolean = false, val multiline: Boolean = false, val placeholder: String? = null) : ContentField
  data class Date(override val key: String, override val label: String) : ContentField
  data class DateTime(override val key: String, override val label: String) : ContentField
  data class Choice(override val key: String, override val label: String, val options: List<Pair<String, String>>) : ContentField
  data class Photo(override val key: String, override val label: String, val ratio: Float) : ContentField
}

private class ContentKind(
  val title: String,
  val newLabel: String,
  val icon: ImageVector,
  val permission: String,
  val fields: List<ContentField>,
  val defaults: Map<String, Any?> = emptyMap(),
  val photoKey: String? = null,
  val rowTitle: (ContentRow) -> String,
  val rowSubtitle: (ContentRow) -> String,
)

private fun ContentRow.s(key: String): String = (this[key] as? JsonPrimitive)?.contentOrNull.orEmpty()

/** İçerik türleri: panodaki kartların kaynakları (yönetim panelindeki sayfaların cepteki hali) */
private val KINDS = mapOf(
  "ticker" to ContentKind(
    "Kayan yazı", "Yeni satır", Icons.AutoMirrored.Outlined.ShortText, Perm.TICKER,
    listOf(ContentField.Text("text", "Metin", 200, required = true, multiline = true, placeholder = "ör. Kermesimiz cuma günü okul bahçesinde")),
    rowTitle = { it.s("text") }, rowSubtitle = { "Panonun altında kayar" },
  ),
  "achievements" to ContentKind(
    "Başarılar ve ayın öğrencisi", "Yeni başarı", Icons.Outlined.EmojiEvents, Perm.HIGHLIGHTS,
    listOf(
      ContentField.Choice("kind", "Tür", listOf("achievement" to "Başarı / derece", "month" to "Ayın öğrencisi")),
      ContentField.Photo("photoUrl", "Fotoğraf", 1f),
      ContentField.Text("name", "Öğrenci ya da takım", 80, required = true),
      ContentField.Text("className", "Sınıf", 30, placeholder = "ör. 10-B"),
      ContentField.Text("title", "Başlık", 100, required = true, placeholder = "ör. İl birinciliği · Satranç"),
      ContentField.Text("description", "Açıklama", 200, multiline = true),
    ),
    defaults = mapOf("kind" to "achievement", "showCard" to true, "showSlide" to true),
    photoKey = "photoUrl",
    rowTitle = { "${it.s("name")} · ${it.s("title")}" },
    rowSubtitle = { listOf(if (it.s("kind") == "month") "Ayın öğrencisi" else "Başarı", it.s("className")).filter { x -> x.isNotEmpty() }.joinToString(" · ") },
  ),
  "events" to ContentKind(
    "Etkinlik takvimi", "Yeni etkinlik", Icons.Outlined.Event, Perm.HIGHLIGHTS,
    listOf(
      ContentField.Text("title", "Etkinlik", 100, required = true),
      ContentField.Date("date", "Tarih"),
      ContentField.Text("time", "Saat", 20, placeholder = "ör. 14:00"),
      ContentField.Text("place", "Yer", 60, placeholder = "ör. Konferans salonu"),
      ContentField.Text("organizer", "Düzenleyen", 60, placeholder = "ör. Satranç kulübü"),
    ),
    rowTitle = { it.s("title") },
    rowSubtitle = { listOf(it.s("date").takeIf { d -> d.isNotEmpty() }?.let(::fullDate).orEmpty(), it.s("time"), it.s("place")).filter { x -> x.isNotEmpty() }.joinToString(" · ") },
  ),
  "exams" to ContentKind(
    "Sınav sayacı", "Yeni sınav", Icons.Outlined.School, Perm.EXAMS,
    listOf(ContentField.Text("title", "Sınav adı", 80, required = true, placeholder = "ör. 1. Dönem 1. Yazılı"), ContentField.DateTime("examAt", "Sınav tarihi")),
    rowTitle = { it.s("title") },
    rowSubtitle = { r -> r.s("examAt").takeIf { it.isNotEmpty() }?.let { "${fullDate(it)} · ${clockOf(it)}" }.orEmpty() },
  ),
  "books" to ContentKind(
    "Haftanın kitabı", "Yeni kitap", Icons.AutoMirrored.Outlined.MenuBook, Perm.HIGHLIGHTS,
    listOf(
      ContentField.Photo("coverUrl", "Kapak", 2f / 3f),
      ContentField.Text("title", "Kitap adı", 100, required = true),
      ContentField.Text("author", "Yazar", 80, required = true),
      ContentField.Text("note", "Kısa not", 200, multiline = true),
    ),
    photoKey = "coverUrl",
    rowTitle = { it.s("title") },
    rowSubtitle = { it.s("author") },
  ),
)

/**
 * İçerik: kayan yazı, başarılar, etkinlikler, sınavlar, haftanın kitabı. Listeden aç / kapat, düzenle, sil; yeni kayıt
 * ekle. Fotoğraf ve kitap kapağı doğrudan kameradan çekilip panoya gönderilir.
 */
@Composable
fun ContentScreen(tur: String, startNew: Boolean) {
  val state = authState()
  val app = LocalApp.current
  val nav = LocalNav.current
  val snackbar = rememberSnackbar()
  val run = rememberRunner(snackbar)
  val confirm = rememberConfirm("Sil")
  val kind = KINDS[tur]
  val list = rememberQuery(state.path(tur), enabled = kind != null) { get<List<ContentRow>>(state.path(tur)) }
  var editing by remember { mutableStateOf<ContentRow?>(null) }
  var creating by remember { mutableStateOf(startNew) }

  if (kind == null) {
    AppScaffold(title = "İçerik", onBack = { nav.popBackStack() }) { item { EmptyCard(Icons.Outlined.Event, "Bilinmeyen içerik türü") } }
    return
  }
  val writable = state.can(kind.permission)
  if (writable && (creating || editing != null)) {
    ContentEditor(kind, tur, editing) {
      creating = false
      editing = null
    }
    return
  }
  AppScaffold(
    title = kind.title,
    onBack = { nav.popBackStack() },
    refreshing = list.refreshing,
    onRefresh = list.refresh,
    snackbar = snackbar,
    floatingActionButton = { if (writable) ExtendedFloatingActionButton(onClick = { creating = true }, icon = { Icon(Icons.Outlined.Add, null) }, text = { Text(kind.newLabel) }) },
  ) {
    val rows = list.data
    when {
      rows == null && list.error != null -> item { ErrorCard(list.error!!, list.refresh) }
      rows == null -> item { LoadingBox() }
      rows.isEmpty() -> item { EmptyCard(kind.icon, "Henüz kayıt yok", if (writable) "Eklediğiniz kayıtlar panoda hemen görünür." else null) }
      else -> rows.forEach { r ->
        val id = r.s("id")
        val active = (r["isActive"] as? JsonPrimitive)?.booleanOrNull != false
        item(key = id) {
          Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow), modifier = Modifier.fillMaxWidth()) {
            Row(Modifier.padding(start = 16.dp, top = 12.dp, end = 8.dp, bottom = 12.dp), verticalAlignment = Alignment.CenterVertically) {
              val photo = kind.photoKey?.let { r.s(it) }?.takeIf { it.isNotEmpty() }
              if (photo != null) {
                AsyncImage(model = app.api.absoluteUrl(photo), contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.size(52.dp).clip(RoundedCornerShape(12.dp)))
              } else {
                IconTile(kind.icon, if (active) Tone.Primary else Tone.Neutral)
              }
              Spacer(Modifier.width(12.dp))
              Column(Modifier.weight(1f)) {
                Text(kind.rowTitle(r), style = MaterialTheme.typography.titleSmall, maxLines = 2, color = if (active) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.outline)
                Text(kind.rowSubtitle(r), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
                if (!active) StatusBadge("Panoda kapalı")
              }
              if (writable) {
                Switch(checked = active, onCheckedChange = {
                  run.run("t$id") {
                    app.api.send(state.path("$tur/$id"), "PATCH", com.okulpano.core.body("isActive" to !active))
                    app.cache.invalidate(state.path(tur))
                  }
                })
                IconButton(onClick = { editing = r }) { Icon(Icons.Outlined.Edit, "Düzenle") }
                IconButton(onClick = {
                  confirm.ask("Silinsin mi?", "“${kind.rowTitle(r)}” panodan ve listeden kaldırılır.") {
                    run.run("d$id", "Silindi") {
                      app.api.send(state.path("$tur/$id"), "DELETE")
                      app.cache.invalidate(state.path(tur))
                    }
                  }
                }) { Icon(Icons.Outlined.Delete, "Sil") }
              }
            }
          }
        }
      }
    }
  }
}

@Composable
private fun ContentEditor(kind: ContentKind, tur: String, row: ContentRow?, onDone: () -> Unit) {
  val state = authState()
  val app = LocalApp.current
  val snackbar = rememberSnackbar()
  val run = rememberRunner(snackbar)
  val values = remember {
    mutableStateMapOf<String, String>().apply {
      kind.fields.forEach { f ->
        val raw = row?.s(f.key)?.takeIf { it.isNotEmpty() } ?: (kind.defaults[f.key] as? String).orEmpty()
        when (f) {
          is ContentField.DateTime -> if (raw.isNotEmpty()) {
            put(f.key, trDateInput(localDateOf(raw)))
            put("${f.key}__time", clockOf(raw))
          }
          is ContentField.Date -> if (raw.isNotEmpty()) put(f.key, trDateInput(java.time.LocalDate.parse(raw)))
          else -> put(f.key, raw)
        }
      }
    }
  }
  var active by remember { mutableStateOf((row?.get("isActive") as? JsonPrimitive)?.booleanOrNull != false) }
  var uploadingKey by remember { mutableStateOf<String?>(null) }
  var photoTarget by remember { mutableStateOf<String?>(null) }
  val picker = rememberPhotoPicker(
    onPicked = { photo ->
      val key = photoTarget ?: return@rememberPhotoPicker
      run.run("upload") {
        uploadingKey = key
        try {
          values[key] = app.api.upload(state.schoolId!!, photo.name, photo.mime, photo.bytes).url
        } finally {
          uploadingKey = null
        }
      }
    },
    onError = { run.toast(it) },
  )

  fun save() {
    val out = mutableMapOf<String, Any?>()
    out.putAll(kind.defaults)
    out["isActive"] = active
    for (f in kind.fields) {
      val v = values[f.key].orEmpty().trim()
      if (f is ContentField.Text && f.required && v.isEmpty()) { run.toast("${f.label} boş olamaz."); return }
      when (f) {
        is ContentField.Date -> {
          val d = if (v.isEmpty()) null else parseTrDate(v)
          if (v.isNotEmpty() && d == null) { run.toast("${f.label} GG.AA.YYYY biçiminde olmalı (ör. 29.10.2026)."); return }
          if (d == null) { run.toast("${f.label} boş olamaz."); return }
          out[f.key] = d.toString()
        }
        is ContentField.DateTime -> {
          val d = parseTrDate(v)
          val t = runCatching { LocalTime.parse(values["${f.key}__time"].orEmpty().trim().ifEmpty { "09:00" }.replace('.', ':').padStart(5, '0')) }.getOrNull()
          if (d == null || t == null) { run.toast("${f.label}: tarihi GG.AA.YYYY, saati SS:DD biçiminde yazın."); return }
          out[f.key] = d.atTime(t).atZone(ZoneId.systemDefault()).toInstant().toString()
        }
        else -> out[f.key] = v.ifEmpty { null }
      }
    }
    run.run("save", if (row == null) "Panoya eklendi" else "Kaydedildi") {
      val payload = if (row != null) JsonObject(row.filterKeys { it != "id" } + out.mapValues { toJson(it.value) }) else toJson(out) as JsonObject
      if (row == null) app.api.send(state.path(tur), "POST", payload) else app.api.send(state.path("$tur/${row.s("id")}"), "PUT", payload)
      app.cache.invalidate(state.path(tur))
      onDone()
    }
  }

  AppScaffold(
    title = if (row == null) kind.newLabel else "Düzenle",
    onBack = onDone,
    snackbar = snackbar,
    bottomBar = { BottomAction(if (row == null) "Panoya ekle" else "Kaydet", run.busy == null) { save() } },
  ) {
    kind.fields.forEach { f ->
      item(key = f.key) {
        when (f) {
          is ContentField.Choice -> Segmented(f.options, values[f.key].orEmpty(), { values[f.key] = it })
          is ContentField.Photo -> GroupCard {
            Column(Modifier.fillMaxWidth().padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
              val url = values[f.key]?.takeIf { it.isNotEmpty() }?.let { app.api.absoluteUrl(it) }
              if (url != null) {
                AsyncImage(model = url, contentDescription = f.label, contentScale = ContentScale.Crop, modifier = Modifier.width(160.dp).aspectRatio(f.ratio).clip(RoundedCornerShape(16.dp)))
              } else {
                Box(Modifier.padding(8.dp)) { Text("${f.label} (isteğe bağlı)", color = MaterialTheme.colorScheme.onSurfaceVariant) }
              }
              Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilledTonalButton(onClick = { photoTarget = f.key; picker.takePhoto() }, enabled = uploadingKey == null) {
                  Icon(Icons.Outlined.PhotoCamera, null)
                  Text("  Kamerayla çek")
                }
                OutlinedButton(onClick = { photoTarget = f.key; picker.pickFromGallery() }, enabled = uploadingKey == null) {
                  Icon(Icons.Outlined.Image, null)
                  Text("  Galeriden")
                }
              }
              if (url != null) TextButton(onClick = { values[f.key] = "" }) { Text("Fotoğrafı kaldır") }
            }
          }
          is ContentField.Date -> Field(f.label, values[f.key].orEmpty(), { values[f.key] = it }, placeholder = "29.10.2026", maxLength = 10, keyboard = KeyboardType.Number)
          is ContentField.DateTime -> Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Field(f.label, values[f.key].orEmpty(), { values[f.key] = it }, Modifier.weight(3f), placeholder = "29.10.2026", maxLength = 10, keyboard = KeyboardType.Number)
            Field("Saat", values["${f.key}__time"].orEmpty(), { values["${f.key}__time"] = it }, Modifier.weight(2f), placeholder = "09:00", maxLength = 5, keyboard = KeyboardType.Number)
          }
          is ContentField.Text -> Field(f.label, values[f.key].orEmpty(), { values[f.key] = it }, placeholder = f.placeholder, maxLength = f.max, multiline = f.multiline)
        }
      }
    }
    item { GroupCard { SwitchRow("Panoda göster", active, { active = it }) } }
  }
}
