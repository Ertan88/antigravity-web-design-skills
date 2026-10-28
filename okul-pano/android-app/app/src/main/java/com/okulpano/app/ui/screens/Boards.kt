package com.okulpano.app.ui.screens

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Bedtime
import androidx.compose.material.icons.outlined.Dialpad
import androidx.compose.material.icons.outlined.Pause
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.QrCodeScanner
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.SkipNext
import androidx.compose.material.icons.outlined.SkipPrevious
import androidx.compose.material.icons.outlined.Tv
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.WbSunny
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedIconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.okulpano.app.data.LocalApp
import com.okulpano.app.data.rememberQuery
import com.okulpano.app.platform.QrCameraView
import com.okulpano.app.platform.codeFromQr
import com.okulpano.app.ui.components.AppScaffold
import com.okulpano.app.ui.components.EmptyCard
import com.okulpano.app.ui.components.Runner
import com.okulpano.app.ui.components.ErrorCard
import com.okulpano.app.ui.components.Field
import com.okulpano.app.ui.components.GroupCard
import com.okulpano.app.ui.components.Hint
import com.okulpano.app.ui.components.LoadingBox
import com.okulpano.app.ui.components.SectionHeader
import com.okulpano.app.ui.components.Segmented
import com.okulpano.app.ui.components.clickableRow
import com.okulpano.app.ui.components.rememberRunner
import com.okulpano.app.ui.components.rememberSnackbar
import com.okulpano.app.ui.nav.LocalNav
import com.okulpano.app.ui.nav.R
import com.okulpano.app.ui.nav.authState
import com.okulpano.app.ui.nav.go
import com.okulpano.app.ui.theme.status
import com.okulpano.core.Board
import com.okulpano.core.CommandResult
import com.okulpano.core.Perm
import com.okulpano.core.PreviewToken
import com.okulpano.core.TR
import com.okulpano.core.body
import com.okulpano.core.timeAgo
import java.net.URLEncoder

private val MODE_LABEL = mapOf("board" to "Tam pano", "slides" to "Yalnızca duyurular", "clock" to "Tam ekran saat")

@Composable
fun rememberBoards(fast: Boolean = false) = authState().let { s -> rememberQuery(s.path("screens"), pollMs = if (fast) 3000 else 30_000) { get<List<Board>>(s.path("screens")) } }

/** Panolar: canlı durum, bağlantısı kopan pano öne çıkar; dokununca uzaktan kumanda */
@Composable
fun BoardsScreen() {
  val state = authState()
  val snackbar = rememberSnackbar()
  val run = rememberRunner(snackbar)
  val boards = rememberBoards()
  val list = boards.data.orEmpty().sortedWith(compareBy<Board> { it.online }.thenBy { it.name.lowercase(TR) })
  AppScaffold(
    title = "Panolar",
    subtitle = boards.data?.let { "${list.size} pano · ${list.count { it.online }} çevrimiçi" },
    refreshing = boards.refreshing,
    onRefresh = boards.refresh,
    snackbar = snackbar,
  ) {
    when {
      boards.data == null && boards.error != null -> item { ErrorCard(boards.error!!, boards.refresh) }
      boards.data == null -> item { LoadingBox() }
      list.isEmpty() -> item { EmptyCard(Icons.Outlined.Tv, "Henüz pano yok", "Okuldaki televizyonda pano adresini açın; ekrandaki QR kodu okutun ya da 6 haneli kodu yazın.") }
      else -> list.forEach { b -> item(key = b.id) { BoardRow(b) } }
    }
    if (state.can(Perm.SCREENS)) item { PairCard(run) }
  }
}

@Composable
private fun BoardRow(b: Board) {
  val nav = LocalNav.current
  val live = b.live
  val status = when {
    !b.online -> b.lastSeenAt?.let { "${timeAgo(it)} bağlantı koptu" } ?: "Hiç bağlanmadı"
    live == null -> "Canlı"
    live.sleeping -> "Uyku modunda"
    live.mode == "emergency" -> "Acil durum gösteriliyor"
    live.mode == "clock" -> "Tam ekran saat"
    else -> "Şu an: ${live.slideTitle ?: "—"}${if (live.paused) " · duraklatıldı" else ""}"
  }
  val colors = if (b.online) CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow) else CardDefaults.cardColors(containerColor = MaterialTheme.status.warningContainer, contentColor = MaterialTheme.status.onWarningContainer)
  Card(onClick = { nav.go(R.board(b.id)) }, colors = colors, modifier = Modifier.fillMaxWidth()) {
    Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
      Box(Modifier.size(10.dp).clip(CircleShape).background(if (b.online) MaterialTheme.status.success else MaterialTheme.status.warning))
      Spacer(Modifier.width(14.dp))
      Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(b.name, style = MaterialTheme.typography.titleMedium)
        Text(status, style = MaterialTheme.typography.bodyMedium, maxLines = 1)
        Text(
          listOfNotNull(MODE_LABEL[b.display.mode], if (b.display.orientation == "portrait") "dikey" else "yatay", b.location).joinToString(" · "),
          style = MaterialTheme.typography.bodySmall,
          color = if (b.online) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.status.onWarningContainer,
        )
      }
    }
  }
}

/** Yeni pano: televizyondaki QR kod ya da 6 haneli kodla eşleştirme */
@Composable
fun PairCard(run: Runner, initialCode: String? = null, onDone: (() -> Unit)? = null) {
  val state = authState()
  val app = LocalApp.current
  val nav = LocalNav.current
  var open by remember { mutableStateOf(initialCode != null) }
  var code by remember { mutableStateOf(initialCode.orEmpty()) }
  var name by remember { mutableStateOf("") }
  if (!open) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
      Button(onClick = { nav.go(R.QR) }, modifier = Modifier.weight(1f)) {
        Icon(Icons.Outlined.QrCodeScanner, null)
        Text("  QR ile bağla")
      }
      OutlinedButton(onClick = { open = true }, modifier = Modifier.weight(1f)) {
        Icon(Icons.Outlined.Dialpad, null)
        Text("  Kodla bağla")
      }
    }
    return
  }
  GroupCard {
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
      Text("Yeni pano bağla", style = MaterialTheme.typography.titleMedium)
      Text(
        if (initialCode != null) "Kod QR'dan okundu. Panoya bir ad verin." else "Televizyonda pano adresini açın; ekranda görünen 6 haneli kodu yazın.",
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
      )
      Field("Ekrandaki kod", code, { code = it.uppercase(TR) }, placeholder = "ör. K7M2QX", maxLength = 7)
      Field("Pano adı", name, { name = it }, placeholder = "ör. Giriş holü", maxLength = 60)
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedButton(onClick = { if (onDone != null) onDone() else open = false }, modifier = Modifier.weight(1f)) { Text("Vazgeç") }
        Button(
          onClick = {
            run.run("pair", "Pano bağlandı") {
              app.api.send(state.path("screens/pair"), "POST", body("code" to code, "name" to name.trim()))
              app.cache.invalidate("screens", "control-center")
              open = false
              code = ""
              name = ""
              onDone?.invoke()
            }
          },
          enabled = code.length >= 6 && name.isNotBlank() && run.busy == null,
          modifier = Modifier.weight(1f),
        ) { Text("Bağla") }
      }
    }
  }
}

/** Pano uzaktan kumanda: canlı önizleme, sonraki / önceki / duraklat, ekran modu, uyut / uyandır */
@Composable
fun BoardRemoteScreen(id: String) {
  val state = authState()
  val app = LocalApp.current
  val nav = LocalNav.current
  val snackbar = rememberSnackbar()
  val run = rememberRunner(snackbar)
  val boards = rememberBoards(fast = true)
  val b = boards.data?.firstOrNull { it.id == id }
  val preview = rememberQuery(state.path("preview-token"), pollMs = 25 * 60_000) { post<PreviewToken>(state.path("preview-token")) }
  val remote = state.can(Perm.BOARD) || state.can(Perm.SCREENS)

  fun command(c: String, done: String? = null) = run.run(c) {
    val r: CommandResult = app.api.post(state.path("screens/$id/command"), body("command" to c))
    if (!r.delivered) throw Exception("Pano şu an çevrimdışı; komut iletilemedi.")
    if (done != null) snackbar.showSnackbar(done)
    app.cache.invalidate("screens")
  }
  fun setMode(mode: String) = run.run("mode") {
    app.api.send(state.path("screens/$id/mode"), "POST", body("mode" to mode))
    app.cache.invalidate("screens")
  }

  AppScaffold(
    title = b?.name ?: "Pano",
    subtitle = b?.let { if (it.online) "● Canlı" else "● Çevrimdışı · ${it.lastSeenAt?.let { s -> "son görülme ${timeAgo(s)}" } ?: "hiç bağlanmadı"}" },
    onBack = { nav.popBackStack() },
    snackbar = snackbar,
  ) {
    if (b == null) {
      item { if (boards.data == null) LoadingBox() else EmptyCard(Icons.Outlined.Tv, "Pano bulunamadı") }
      return@AppScaffold
    }
    item {
      Card(shape = MaterialTheme.shapes.medium, modifier = Modifier.fillMaxWidth()) {
        val token = preview.data?.token
        val url = token?.let { "${app.api.server}/display/?preview=${URLEncoder.encode(it, "UTF-8")}&screen=${b.id}" }
        Box(Modifier.fillMaxWidth().aspectRatio(if (b.display.orientation == "portrait") 9f / 16f else 16f / 9f).background(Color(0xFF0B1220)), contentAlignment = Alignment.Center) {
          if (url != null) BoardWebPreview(url) else LoadingBox()
        }
      }
    }
    if (remote) {
      item {
        GroupCard {
          Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            val live = b.live
            Column(Modifier.weight(1f)) {
              Text(
                when {
                  live == null -> "Pano durumu bekleniyor"
                  live.sleeping -> "Uyku modunda"
                  else -> "Şu an gösterilen · ${if (live.slideCount > 0) live.slideIndex + 1 else 0} / ${live.slideCount}"
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
              )
              Text(live?.slideTitle ?: "—", style = MaterialTheme.typography.titleSmall, maxLines = 1)
            }
            OutlinedIconButton(onClick = { command("prev") }, enabled = b.online) { Icon(Icons.Outlined.SkipPrevious, "Önceki") }
            FilledIconButton(onClick = { command(if (live?.paused == true) "resume" else "pause") }, enabled = b.online, modifier = Modifier.size(52.dp)) {
              Icon(if (live?.paused == true) Icons.Outlined.PlayArrow else Icons.Outlined.Pause, if (live?.paused == true) "Sürdür" else "Bu içerikte durdur")
            }
            OutlinedIconButton(onClick = { command("next") }, enabled = b.online) { Icon(Icons.Outlined.SkipNext, "Sonraki") }
          }
        }
      }
      item { SectionHeader("Ekran modu") }
      item { Segmented(listOf("board" to "Normal pano", "slides" to "Sadece duyuru", "clock" to "Tam ekran saat"), b.display.mode, { setMode(it) }) }
      item {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          FilledTonalButton(onClick = { command("reload", "Pano yenilendi") }, modifier = Modifier.weight(1f)) {
            Icon(Icons.Outlined.Refresh, null, Modifier.size(18.dp))
            Text(" Yenile")
          }
          if (b.live?.sleeping == true) {
            FilledTonalButton(onClick = { command("wake", "Pano 2 saatliğine uyandırıldı") }, modifier = Modifier.weight(1f)) {
              Icon(Icons.Outlined.WbSunny, null, Modifier.size(18.dp))
              Text(" Uyandır")
            }
          } else {
            FilledTonalButton(onClick = { command("sleep", "Pano uyku moduna alındı") }, modifier = Modifier.weight(1f)) {
              Icon(Icons.Outlined.Bedtime, null, Modifier.size(18.dp))
              Text(" Uyut")
            }
          }
          FilledTonalButton(onClick = { command("identify", "Panoda 15 saniye adı görünüyor") }, modifier = Modifier.weight(1f)) {
            Icon(Icons.Outlined.Visibility, null, Modifier.size(18.dp))
            Text(" Tanımla")
          }
        }
      }
      item { Hint("Uyut: pano ertesi sabaha kadar ekran koruyucuda kalır. Uyandır: uyku saatinde de 2 saat açık tutar.") }
    }
  }
}

/** Panonun canlı önizlemesi: panodaki sayfanın kendisi (30 dakikalık, yalnızca okuyabilen anahtarla) */
@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun BoardWebPreview(url: String) {
  if (LocalInspectionMode.current) return
  AndroidView(
    factory = { ctx ->
      WebView(ctx).apply {
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.loadWithOverviewMode = true
        settings.useWideViewPort = true
        settings.mediaPlaybackRequiresUserGesture = true
        webViewClient = WebViewClient()
        setBackgroundColor(android.graphics.Color.BLACK)
        loadUrl(url)
      }
    },
    update = { if (it.url != url) it.loadUrl(url) },
    modifier = Modifier.fillMaxWidth(),
  )
}

/** QR ile pano bağlama: televizyondaki eşleştirme ekranında görünen QR kod okutulur */
@Composable
fun QrScreen() {
  val nav = LocalNav.current
  val context = LocalContext.current
  var granted by remember { mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) }
  var error by remember { mutableStateOf<String?>(null) }
  var done by remember { mutableStateOf(false) }
  val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted = it }
  AppScaffold(title = "QR ile bağla", onBack = { nav.popBackStack() }) {
    if (!granted) {
      item {
        EmptyCard(Icons.Outlined.PhotoCamera, "Kamera izni gerekli", "Panodaki QR kodu okutmak için kameraya izin verin. İzin vermezseniz 6 haneli kodu elle de yazabilirsiniz.") {
          Button(onClick = { ask.launch(Manifest.permission.CAMERA) }) { Text("Kameraya izin ver") }
        }
      }
      return@AppScaffold
    }
    item { Text("Televizyondaki eşleştirme ekranında görünen QR kodu çerçeveye getirin.", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    item {
      Card(shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
        QrCameraView(
          onCode = { data ->
            if (done) return@QrCameraView
            val code = codeFromQr(data)
            if (code == null) {
              error = "Bu QR bir Okul Yayın pano kodu değil."
            } else {
              done = true
              nav.popBackStack()
              nav.go(R.pair(code))
            }
          },
          modifier = Modifier.fillMaxWidth().height(420.dp),
        )
      }
    }
    if (error != null) item { Text(error!!, color = MaterialTheme.colorScheme.error, fontWeight = FontWeight.SemiBold) }
  }
}

/**
 * Eşleştirme bağlantısı (okulpano://eslestir/KOD): uygulamadaki QR okuyucudan ya da telefonun kendi kamerasından
 * açılır; kod hazır gelir, yalnızca pano adı yazılır.
 */
@Composable
fun PairScreen(kod: String) {
  val state = authState()
  val nav = LocalNav.current
  val snackbar = rememberSnackbar()
  val run = rememberRunner(snackbar)
  val code = codeFromQr(kod)
  AppScaffold(title = "Yeni pano bağla", subtitle = state.school?.name, onBack = { nav.popBackStack() }, snackbar = snackbar) {
    when {
      !state.can(Perm.SCREENS) -> item { EmptyCard(Icons.Outlined.Tv, "Pano bağlama yetkiniz yok", "Okul yöneticinizden Ekranlar yetkisi isteyin.") }
      code == null -> item { EmptyCard(Icons.Outlined.QrCodeScanner, "Kod okunamadı") }
      else -> item { PairCard(run, code) { nav.go(R.BOARDS) } }
    }
  }
}
