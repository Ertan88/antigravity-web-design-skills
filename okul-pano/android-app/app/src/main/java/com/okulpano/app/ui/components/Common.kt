package com.okulpano.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.okulpano.app.ui.theme.status

/** Anlamına göre renk tonu (rozet, simge kutusu) */
enum class Tone { Primary, Neutral, Success, Warning, Danger, Gold }

data class TonePair(val container: Color, val content: Color)

@Composable
fun tone(t: Tone): TonePair {
  val c = MaterialTheme.colorScheme
  val s = MaterialTheme.status
  return when (t) {
    Tone.Primary -> TonePair(c.primaryContainer, c.onPrimaryContainer)
    Tone.Neutral -> TonePair(c.surfaceContainerHighest, c.onSurfaceVariant)
    Tone.Success -> TonePair(s.successContainer, s.onSuccessContainer)
    Tone.Warning -> TonePair(s.warningContainer, s.onWarningContainer)
    Tone.Danger -> TonePair(c.errorContainer, c.onErrorContainer)
    Tone.Gold -> TonePair(c.tertiaryContainer, c.onTertiaryContainer)
  }
}

/** Küçük durum rozeti: "Onay bekliyor", "Yayında"… */
@Composable
fun StatusBadge(text: String, t: Tone = Tone.Neutral) {
  val p = tone(t)
  Surface(color = p.container, contentColor = p.content, shape = RoundedCornerShape(50)) {
    Text(text, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp), maxLines = 1)
  }
}

/** Liste satırının başındaki yuvarlatılmış simge kutusu */
@Composable
fun IconTile(icon: ImageVector, t: Tone = Tone.Primary, size: Int = 40) {
  val p = tone(t)
  Box(Modifier.size(size.dp).clip(RoundedCornerShape(12.dp)).background(p.container), contentAlignment = Alignment.Center) {
    Icon(icon, contentDescription = null, tint = p.content, modifier = Modifier.size((size * 0.55).dp))
  }
}

/** Baş harfli yuvarlak avatar */
@Composable
fun Avatar(text: String, size: Int = 40, container: Color = MaterialTheme.colorScheme.primary, content: Color = MaterialTheme.colorScheme.onPrimary) {
  Box(Modifier.size(size.dp).clip(CircleShape).background(container), contentAlignment = Alignment.Center) {
    Text(text, color = content, style = if (size >= 48) MaterialTheme.typography.titleMedium else MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
  }
}

/** Bölüm başlığı (kartların üstünde) */
@Composable
fun SectionHeader(text: String, modifier: Modifier = Modifier, trailing: @Composable (() -> Unit)? = null) {
  Row(modifier.fillMaxWidth().padding(top = 8.dp, start = 4.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
    Text(text, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary, modifier = Modifier.weight(1f))
    trailing?.invoke()
  }
}

/** Satırları gruplayan kart (M3 filled card: surfaceContainerLow) */
@Composable
fun GroupCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
  Card(modifier = modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow), content = content)
}

/** Kart içindeki satır: simge, başlık, açıklama, sağda rozet ya da ok */
@Composable
fun RowItem(
  title: String,
  subtitle: String? = null,
  icon: ImageVector? = null,
  t: Tone = Tone.Primary,
  trailing: @Composable (() -> Unit)? = null,
  onClick: (() -> Unit)? = null,
  divider: Boolean = false,
) {
  Column {
    ListItem(
      modifier = if (onClick != null) Modifier.clickableRow(onClick) else Modifier,
      colors = ListItemDefaults.colors(containerColor = Color.Transparent),
      headlineContent = { Text(title, maxLines = 2, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.SemiBold) },
      supportingContent = subtitle?.let { { Text(it, maxLines = 2, overflow = TextOverflow.Ellipsis) } },
      leadingContent = icon?.let { { IconTile(it, t) } },
      trailingContent = when {
        trailing != null && onClick != null -> { { Row(verticalAlignment = Alignment.CenterVertically) { trailing(); Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null) } } }
        trailing != null -> trailing
        onClick != null -> { { Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant) } }
        else -> null
      },
    )
    if (divider) HorizontalDivider(Modifier.padding(start = if (icon != null) 72.dp else 16.dp), color = MaterialTheme.colorScheme.outlineVariant)
  }
}

/** Boş durum: simge, başlık ve kısa açıklama */
@Composable
fun EmptyState(icon: ImageVector, title: String, text: String? = null, action: @Composable (() -> Unit)? = null) {
  Column(Modifier.fillMaxWidth().padding(vertical = 28.dp, horizontal = 20.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
    IconTile(icon, Tone.Neutral, size = 56)
    Spacer(Modifier.height(4.dp))
    Text(title, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
    if (text != null) Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
    action?.invoke()
  }
}

/** Kart içinde boş durum */
@Composable
fun EmptyCard(icon: ImageVector, title: String, text: String? = null, action: @Composable (() -> Unit)? = null) {
  GroupCard { EmptyState(icon, title, text, action) }
}

@Composable
fun LoadingBox() {
  Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
}

/** Yükleme hatası: mesaj ve yeniden dene */
@Composable
fun ErrorCard(message: String, onRetry: (() -> Unit)? = null) {
  Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer, contentColor = MaterialTheme.colorScheme.onErrorContainer), modifier = Modifier.fillMaxWidth()) {
    Row(Modifier.padding(start = 16.dp, end = 8.dp, top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
      Icon(Icons.Outlined.ErrorOutline, null)
      Spacer(Modifier.width(12.dp))
      Text(message, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
      if (onRetry != null) TextButton(onClick = onRetry) { Text("Yeniden dene") }
    }
  }
}

/** Açıklama notu (kart altındaki küçük gri metin) */
@Composable
fun Hint(text: String, modifier: Modifier = Modifier, center: Boolean = true) {
  Text(
    text,
    style = MaterialTheme.typography.bodySmall,
    color = MaterialTheme.colorScheme.onSurfaceVariant,
    textAlign = if (center) TextAlign.Center else TextAlign.Start,
    modifier = modifier.fillMaxWidth().padding(horizontal = 8.dp),
  )
}
