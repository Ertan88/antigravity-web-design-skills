package com.okulpano.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val LocalStatusColors = staticCompositionLocalOf { LightStatus }

/** Başarı ve uyarı renkleri: `MaterialTheme.status.success` */
val MaterialTheme.status: StatusColors
  @Composable @ReadOnlyComposable get() = LocalStatusColors.current

private val base = Typography()

/** M3 tip ölçeği; başlıklar biraz daha kalın (okulda uzaktan bakılan bilgiler: saat, geri sayım) */
val AppTypography = Typography(
  displayLarge = base.displayLarge.copy(fontWeight = FontWeight.Bold),
  displayMedium = base.displayMedium.copy(fontWeight = FontWeight.Bold, letterSpacing = (-0.5).sp),
  displaySmall = base.displaySmall.copy(fontWeight = FontWeight.Bold),
  headlineLarge = base.headlineLarge.copy(fontWeight = FontWeight.SemiBold),
  headlineMedium = base.headlineMedium.copy(fontWeight = FontWeight.SemiBold),
  headlineSmall = base.headlineSmall.copy(fontWeight = FontWeight.SemiBold),
  titleLarge = base.titleLarge.copy(fontWeight = FontWeight.SemiBold),
  titleMedium = base.titleMedium.copy(fontWeight = FontWeight.SemiBold),
  titleSmall = base.titleSmall.copy(fontWeight = FontWeight.SemiBold),
  labelLarge = base.labelLarge.copy(fontWeight = FontWeight.SemiBold),
)

val AppShapes = Shapes(
  extraSmall = RoundedCornerShape(6.dp),
  small = RoundedCornerShape(10.dp),
  medium = RoundedCornerShape(16.dp),
  large = RoundedCornerShape(24.dp),
  extraLarge = RoundedCornerShape(32.dp),
)

/** Koyu tema mı (renk şemasından; testlerde tema elle verildiğinde de doğru çalışır) */
val androidx.compose.material3.ColorScheme.isDark: Boolean get() = surface.luminance() < 0.5f

/** Acil durum kırmızısı: iki temada da aynı güçlü kırmızı (uyarı her zaman uyarı gibi görünsün) */
val AlarmRed = androidx.compose.ui.graphics.Color(0xFFC62828)

/** Geri sayım rakamları: sabit genişlikli rakamlar (saniye değişirken metin oynamaz) */
val CountdownStyle = TextStyle(fontSize = 52.sp, fontWeight = FontWeight.Bold, letterSpacing = (-1).sp, fontFeatureSettings = "tnum")

/**
 * Uygulama teması: renkler yalnızca MaterialTheme.colorScheme üzerinden okunur; açık / koyu tema telefonun
 * ayarını izler.
 */
@Composable
fun OkulTheme(darkTheme: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
  CompositionLocalProvider(LocalStatusColors provides if (darkTheme) DarkStatus else LightStatus) {
    MaterialTheme(
      colorScheme = if (darkTheme) DarkColors else LightColors,
      typography = AppTypography,
      shapes = AppShapes,
      content = content,
    )
  }
}
