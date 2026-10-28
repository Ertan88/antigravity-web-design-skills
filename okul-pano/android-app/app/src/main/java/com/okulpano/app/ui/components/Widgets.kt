package com.okulpano.app.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

/** Kontrol merkezindeki sayı kartı: "3 / 3 pano çevrimiçi" */
@Composable
fun KpiCard(value: String, label: String, modifier: Modifier = Modifier, onClick: (() -> Unit)? = null) {
  val colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow)
  val inner: @Composable () -> Unit = {
    Column(Modifier.padding(horizontal = 14.dp, vertical = 12.dp)) {
      Text(value, style = MaterialTheme.typography.headlineSmall.copy(fontFeatureSettings = "tnum"))
      Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
  }
  if (onClick != null) Card(onClick = onClick, modifier = modifier, colors = colors) { inner() } else Card(modifier = modifier, colors = colors) { inner() }
}

/** M3 parçalı düğme: birden çok seçenekten biri */
@Composable
fun <T> Segmented(options: List<Pair<T, String>>, selected: T, onSelect: (T) -> Unit, modifier: Modifier = Modifier) {
  SingleChoiceSegmentedButtonRow(modifier.fillMaxWidth()) {
    options.forEachIndexed { i, (value, label) ->
      SegmentedButton(
        selected = value == selected,
        onClick = { onSelect(value) },
        shape = SegmentedButtonDefaults.itemShape(index = i, count = options.size),
        label = { Text(label, maxLines = 1, overflow = TextOverflow.Ellipsis) },
      )
    }
  }
}

/** Seçilebilir küçük çipler (pano seçimi, şablon, okul) */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun <T> ChipGroup(options: List<Pair<T, String>>, isSelected: (T) -> Boolean, onToggle: (T) -> Unit, modifier: Modifier = Modifier) {
  FlowRow(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
    options.forEach { (value, label) ->
      val on = isSelected(value)
      FilterChip(
        selected = on,
        onClick = { onToggle(value) },
        label = { Text(label) },
        leadingIcon = if (on) { { Icon(Icons.Filled.Check, null, Modifier.padding(0.dp)) } } else null,
        colors = FilterChipDefaults.filterChipColors(),
      )
    }
  }
}

/** Açıklamalı anahtar satırı */
@Composable
fun SwitchRow(label: String, checked: Boolean, onChange: (Boolean) -> Unit, description: String? = null, modifier: Modifier = Modifier) {
  Row(modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
    Column(Modifier.weight(1f)) {
      Text(label, style = MaterialTheme.typography.bodyLarge)
      if (description != null) Text(description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    Switch(checked = checked, onCheckedChange = onChange)
  }
}

/** M3 çerçeveli metin alanı */
@Composable
fun Field(
  label: String,
  value: String,
  onChange: (String) -> Unit,
  modifier: Modifier = Modifier,
  placeholder: String? = null,
  help: String? = null,
  maxLength: Int = 200,
  multiline: Boolean = false,
  password: Boolean = false,
  keyboard: KeyboardType = KeyboardType.Text,
  error: String? = null,
) {
  OutlinedTextField(
    value = value,
    onValueChange = { onChange(it.take(maxLength)) },
    label = { Text(label) },
    placeholder = placeholder?.let { { Text(it) } },
    supportingText = (error ?: help)?.let { { Text(it) } },
    isError = error != null,
    singleLine = !multiline,
    minLines = if (multiline) 3 else 1,
    visualTransformation = if (password) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
    keyboardOptions = KeyboardOptions(keyboardType = if (password) KeyboardType.Password else keyboard),
    modifier = modifier.fillMaxWidth(),
  )
}

/** Geri alınamayan işlemden önce onay penceresi */
class ConfirmState {
  var request by mutableStateOf<Triple<String, String, () -> Unit>?>(null)
  fun ask(title: String, text: String, onConfirm: () -> Unit) {
    request = Triple(title, text, onConfirm)
  }
}

@Composable
fun rememberConfirm(confirmLabel: String = "Evet"): ConfirmState {
  val state = remember { ConfirmState() }
  state.request?.let { (title, text, ok) ->
    AlertDialog(
      onDismissRequest = { state.request = null },
      title = { Text(title) },
      text = { Text(text) },
      confirmButton = { TextButton(onClick = { state.request = null; ok() }) { Text(confirmLabel) } },
      dismissButton = { TextButton(onClick = { state.request = null }) { Text("Vazgeç") } },
    )
  }
  return state
}

/**
 * Sunucuya giden işlemler için: işlem sürerken [busy] dolu, hata olursa Türkçe mesaj alttaki bildirim çubuğunda
 * görünür; başarılıysa isteğe bağlı mesaj gösterilir.
 */
class Runner(private val snackbar: SnackbarHostState, private val launch: (suspend () -> Unit) -> Unit) {
  var busy by mutableStateOf<String?>(null)

  /** Yalnızca mesaj göster (ör. izin verilmedi) */
  fun toast(text: String) = launch { snackbar.showSnackbar(text) }

  fun run(tag: String = "x", success: String? = null, block: suspend () -> Unit) {
    if (busy != null) return
    busy = tag
    launch {
      try {
        block()
        if (success != null) snackbar.showSnackbar(success)
      } catch (e: Exception) {
        snackbar.showSnackbar(e.message ?: "İşlem yapılamadı")
      } finally {
        busy = null
      }
    }
  }
}

@Composable
fun rememberRunner(snackbar: SnackbarHostState): Runner {
  val scope = rememberCoroutineScope()
  return remember(snackbar) { Runner(snackbar) { block -> scope.launch { block() } } }
}
