package com.okulpano.app.ui.screens

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.okulpano.app.data.LocalApp
import com.okulpano.app.data.rememberQuery
import com.okulpano.app.ui.components.AppScaffold
import com.okulpano.app.ui.components.ChipGroup
import com.okulpano.app.ui.components.EmptyCard
import com.okulpano.app.ui.components.Field
import com.okulpano.app.ui.components.GroupCard
import com.okulpano.app.ui.components.Hint
import com.okulpano.app.ui.components.SwitchRow
import com.okulpano.app.ui.components.rememberRunner
import com.okulpano.app.ui.components.rememberSnackbar
import com.okulpano.app.ui.nav.authState
import com.okulpano.core.ControlCenter
import com.okulpano.core.EMERGENCY_TYPES
import com.okulpano.core.Perm
import com.okulpano.core.body
import com.okulpano.core.clockOf
import com.okulpano.core.emergencyLabel
import kotlinx.coroutines.launch

private const val HOLD_MS = 3000

/**
 * Acil durum: tür seçilir, büyük düğmeye 3 saniye basılı tutulur (yanlışlıkla başlamasın). Bütün panolar kırmızı
 * uyarıya geçer, siren çalar, okuldaki herkesin telefonuna bildirim gider.
 */
@Composable
fun EmergencyScreen() {
  val state = authState()
  val app = LocalApp.current
  val snackbar = rememberSnackbar()
  val run = rememberRunner(snackbar)
  val center = rememberQuery(state.path("control-center"), pollMs = 30_000) { get<ControlCenter>(state.path("control-center")) }
  val active = center.data?.emergency
  var type by remember { mutableStateOf("earthquake") }
  var message by remember { mutableStateOf("") }
  var sound by remember { mutableStateOf(true) }
  val container = if (active != null) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.surface

  AppScaffold(title = "Acil durum", snackbar = snackbar, containerColor = container) {
    if (!state.can(Perm.EMERGENCY)) {
      item { EmptyCard(Icons.Outlined.Lock, "Yetkiniz yok", "Acil durum uyarısını yalnızca yetkili kişiler başlatabilir.") }
      return@AppScaffold
    }
    if (active != null) {
      item {
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.error, contentColor = MaterialTheme.colorScheme.onError), modifier = Modifier.fillMaxWidth()) {
          Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("UYARI SÜRÜYOR", style = MaterialTheme.typography.labelLarge)
            Text(emergencyLabel(active.type), style = MaterialTheme.typography.headlineMedium)
            Text("${clockOf(active.startedAt)} · ${active.startedBy.orEmpty()}", style = MaterialTheme.typography.bodyMedium)
            active.message?.let { Text(it, style = MaterialTheme.typography.bodyLarge) }
          }
        }
      }
      item {
        Box(Modifier.fillMaxWidth().padding(vertical = 12.dp), contentAlignment = Alignment.Center) {
          HoldButton("UYARIYI BİTİR", "3 saniye basılı tutun", dark = true) {
            run.run("stop", "Uyarı bitti") {
              app.api.send(state.path("emergency"), "DELETE")
              app.cache.invalidate("control-center")
            }
          }
        }
      }
      item { Hint("Bitirince panolar normal görünümüne döner.") }
      return@AppScaffold
    }
    item { Text("Tür seçin. Bütün panolar anında kırmızı uyarıya geçer ve siren çalar.", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    item { ChipGroup(EMERGENCY_TYPES.map { it.type to it.label }, { it == type }, { type = it }) }
    item {
      Box(Modifier.fillMaxWidth().padding(vertical = 8.dp), contentAlignment = Alignment.Center) {
        HoldButton("BASILI TUT", "3 saniye") {
          run.run("start", "Uyarı başladı") {
            app.api.send(state.path("emergency"), "POST", body("type" to type, "message" to message.trim().ifEmpty { null }, "sound" to sound))
            app.cache.invalidate("control-center")
          }
        }
      }
    }
    item { Field("Ek mesaj (isteğe bağlı)", message, { message = it }, placeholder = "ör. Bahçedeki toplanma alanına çıkın", maxLength = 200) }
    item { GroupCard { SwitchRow("Sesli uyarı (siren)", sound, { sound = it }) } }
    item {
      Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer, contentColor = MaterialTheme.colorScheme.onErrorContainer), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
          Text("Uyarı başlayınca", style = MaterialTheme.typography.titleSmall)
          Text("Tüm panolar · okuldaki herkesin telefonuna bildirim · bitirmek için yine basılı tutulur", style = MaterialTheme.typography.bodySmall)
        }
      }
    }
  }
}

/** Basılı tutunca dolan halka: süre dolmadan bırakılırsa iptal olur */
@Composable
private fun HoldButton(label: String, sub: String, dark: Boolean = false, onComplete: () -> Unit) {
  val progress = remember { Animatable(0f) }
  val scope = rememberCoroutineScope()
  val haptic = LocalHapticFeedback.current
  var holding by remember { mutableStateOf(false) }
  val bg = if (dark) MaterialTheme.colorScheme.inverseSurface else MaterialTheme.colorScheme.error
  val fg = if (dark) MaterialTheme.colorScheme.inverseOnSurface else MaterialTheme.colorScheme.onError
  Box(
    Modifier
      .size(232.dp)
      .semantics {
        role = Role.Button
        contentDescription = "$label, $sub"
      }
      .pointerInput(Unit) {
        awaitEachGesture {
          awaitFirstDown()
          holding = true
          haptic.performHapticFeedback(HapticFeedbackType.LongPress)
          val job = scope.launch {
            progress.animateTo(1f, tween(HOLD_MS, easing = LinearEasing))
            holding = false
            progress.snapTo(0f)
            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
            onComplete()
          }
          waitForUpOrCancellation()
          if (job.isActive) {
            job.cancel()
            holding = false
            scope.launch { progress.animateTo(0f, tween(200)) }
          }
        }
      },
    contentAlignment = Alignment.Center,
  ) {
    CircularProgressIndicator(
      progress = { progress.value },
      modifier = Modifier.fillMaxSize(),
      strokeWidth = 10.dp,
      color = bg,
      trackColor = bg.copy(alpha = 0.18f),
    )
    Column(
      Modifier.size(188.dp).clip(CircleShape).background(bg),
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.Center,
    ) {
      Icon(Icons.Filled.Warning, null, tint = fg, modifier = Modifier.size(40.dp))
      Text(if (holding) "TUTMAYA DEVAM" else label, color = fg, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.ExtraBold)
      Text(sub, color = fg.copy(alpha = 0.9f), style = MaterialTheme.typography.labelMedium)
    }
  }
}

