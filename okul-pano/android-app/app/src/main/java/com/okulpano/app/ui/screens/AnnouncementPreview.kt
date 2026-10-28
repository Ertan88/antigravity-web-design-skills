package com.okulpano.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Campaign
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.okulpano.app.data.LocalApp
import com.okulpano.core.AnnouncementDesign
import com.okulpano.core.DESIGN_PALETTES
import com.okulpano.core.TR
import com.okulpano.core.designTemplate

/*
 * Panodaki slaytın küçük önizlemesi. Pano kendi renkleriyle (koyu zemin) çizildiği için burada tema renkleri değil
 * şablonun palet renkleri kullanılır: telefon açık ya da koyu temada olsun, önizleme panodaki gibi görünür.
 */
@Composable
fun AnnouncementPreview(kind: String, title: String, body: String?, imageUrl: String?, design: AnnouncementDesign?, height: Int = 170, modifier: Modifier = Modifier) {
  val app = LocalApp.current
  Box(modifier.fillMaxWidth().height(height.dp)) {
    when {
      kind == "image" && imageUrl != null -> Box(Modifier.fillMaxSize().background(Color(0xFF0B1220))) {
        AsyncImage(model = app.api.absoluteUrl(imageUrl), contentDescription = title, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize())
      }
      kind == "design" && design != null -> {
        val t = designTemplate(design.template)
        val p = DESIGN_PALETTES[design.palette] ?: DESIGN_PALETTES.getValue("petrol")
        val head = design.fields[t.headline.key]?.trim().orEmpty().ifEmpty { t.headline.placeholder }
        val sub = t.subline?.let { design.fields[it.key]?.trim() }.orEmpty()
        val info = t.info.mapNotNull { design.fields[it.key]?.trim()?.takeIf { v -> v.isNotEmpty() } }
        Column(
          Modifier.fillMaxSize().background(Brush.linearGradient(listOf(Color(p.from), Color(p.to)))).padding(14.dp),
          verticalArrangement = Arrangement.SpaceBetween,
        ) {
          Surface(color = Color(p.accent), contentColor = Color(p.from), shape = RoundedCornerShape(6.dp)) {
            Text(t.kicker.uppercase(TR), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.ExtraBold, modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp))
          }
          Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(head, color = Color.White, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.ExtraBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (sub.isNotEmpty()) Text(sub, color = Color(p.accent), style = MaterialTheme.typography.titleSmall)
            if (info.isNotEmpty()) Text(info.joinToString(" · "), color = Color.White.copy(alpha = 0.85f), style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
          }
          Text("Panodaki görünüm", color = Color.White.copy(alpha = 0.7f), style = MaterialTheme.typography.labelSmall)
        }
      }
      else -> Column(
        Modifier.fillMaxSize().background(Brush.linearGradient(listOf(Color(0xFF0D4F66), Color(0xFF1F8BAD)))).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterVertically),
      ) {
        Icon(if (kind == "video") Icons.Outlined.PlayArrow else Icons.Outlined.Campaign, null, tint = Color.White, modifier = Modifier.size(28.dp))
        Text(title, color = Color.White, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.ExtraBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
        if (!body.isNullOrBlank()) Text(body, color = Color.White.copy(alpha = 0.85f), style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
      }
    }
  }
}

/** Yayın akışındaki küçük görsel */
@Composable
fun AnnouncementThumb(kind: String, imageUrl: String?, design: AnnouncementDesign?) {
  val app = LocalApp.current
  val bg = design?.let { DESIGN_PALETTES[it.palette]?.from }?.let { Color(it) } ?: Color(0xFF0D4F66)
  Box(Modifier.size(width = 64.dp, height = 40.dp).clip(RoundedCornerShape(8.dp)).background(bg), contentAlignment = Alignment.Center) {
    if (kind == "image" && imageUrl != null) {
      AsyncImage(model = app.api.absoluteUrl(imageUrl), contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
    } else {
      Icon(if (kind == "video") Icons.Outlined.PlayArrow else Icons.Outlined.Campaign, null, tint = Color.White, modifier = Modifier.size(18.dp))
    }
  }
}
