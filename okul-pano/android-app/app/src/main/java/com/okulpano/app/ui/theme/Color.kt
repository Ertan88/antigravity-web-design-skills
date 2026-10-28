package com.okulpano.app.ui.theme

import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color

/*
 * Okul Yayın renk şeması (Material Design 3). Kaynak renkler: marka petrolü #0E5E66 (birincil), logo altını #F5B83D
 * (üçüncül). Tonlar M3 ton paletinden elle seçildi; açık ve koyu temada metin / zemin karşıtlığı WCAG AA'yı geçer.
 */

val LightColors = lightColorScheme(
  primary = Color(0xFF0E5E66),
  onPrimary = Color(0xFFFFFFFF),
  primaryContainer = Color(0xFFB2ECF2),
  onPrimaryContainer = Color(0xFF002023),
  inversePrimary = Color(0xFF82D3DD),
  secondary = Color(0xFF4A6366),
  onSecondary = Color(0xFFFFFFFF),
  secondaryContainer = Color(0xFFCDE8EB),
  onSecondaryContainer = Color(0xFF051F22),
  tertiary = Color(0xFF7A5900),
  onTertiary = Color(0xFFFFFFFF),
  tertiaryContainer = Color(0xFFFFDEA6),
  onTertiaryContainer = Color(0xFF261900),
  error = Color(0xFFBA1A1A),
  onError = Color(0xFFFFFFFF),
  errorContainer = Color(0xFFFFDAD6),
  onErrorContainer = Color(0xFF410002),
  background = Color(0xFFF5FAFB),
  onBackground = Color(0xFF171D1E),
  surface = Color(0xFFF5FAFB),
  onSurface = Color(0xFF171D1E),
  surfaceVariant = Color(0xFFDAE4E5),
  onSurfaceVariant = Color(0xFF3F484A),
  surfaceTint = Color(0xFF0E5E66),
  inverseSurface = Color(0xFF2B3132),
  inverseOnSurface = Color(0xFFECF2F3),
  outline = Color(0xFF6F797A),
  outlineVariant = Color(0xFFBEC8C9),
  scrim = Color(0xFF000000),
  surfaceBright = Color(0xFFF5FAFB),
  surfaceDim = Color(0xFFD5DBDC),
  surfaceContainerLowest = Color(0xFFFFFFFF),
  surfaceContainerLow = Color(0xFFEFF5F6),
  surfaceContainer = Color(0xFFE9EFF0),
  surfaceContainerHigh = Color(0xFFE3E9EA),
  surfaceContainerHighest = Color(0xFFDEE3E4),
)

val DarkColors = darkColorScheme(
  primary = Color(0xFF82D3DD),
  onPrimary = Color(0xFF00363B),
  primaryContainer = Color(0xFF004F56),
  onPrimaryContainer = Color(0xFFB2ECF2),
  inversePrimary = Color(0xFF0E5E66),
  secondary = Color(0xFFB1CBCE),
  onSecondary = Color(0xFF1C3437),
  secondaryContainer = Color(0xFF334B4E),
  onSecondaryContainer = Color(0xFFCDE8EB),
  tertiary = Color(0xFFF5BE48),
  onTertiary = Color(0xFF402D00),
  tertiaryContainer = Color(0xFF5C4300),
  onTertiaryContainer = Color(0xFFFFDEA6),
  error = Color(0xFFFFB4AB),
  onError = Color(0xFF690005),
  errorContainer = Color(0xFF93000A),
  onErrorContainer = Color(0xFFFFDAD6),
  background = Color(0xFF0E1415),
  onBackground = Color(0xFFDEE3E4),
  surface = Color(0xFF0E1415),
  onSurface = Color(0xFFDEE3E4),
  surfaceVariant = Color(0xFF3F484A),
  onSurfaceVariant = Color(0xFFBEC8C9),
  surfaceTint = Color(0xFF82D3DD),
  inverseSurface = Color(0xFFDEE3E4),
  inverseOnSurface = Color(0xFF2B3132),
  outline = Color(0xFF899294),
  outlineVariant = Color(0xFF3F484A),
  scrim = Color(0xFF000000),
  surfaceBright = Color(0xFF343A3B),
  surfaceDim = Color(0xFF0E1415),
  surfaceContainerLowest = Color(0xFF090F10),
  surfaceContainerLow = Color(0xFF171D1E),
  surfaceContainer = Color(0xFF1B2122),
  surfaceContainerHigh = Color(0xFF252B2C),
  surfaceContainerHighest = Color(0xFF303637),
)

/** M3'te karşılığı olmayan anlam renkleri (başarı, uyarı): açık / koyu tema için ayrı tonlar */
data class StatusColors(
  val success: Color,
  val onSuccess: Color,
  val successContainer: Color,
  val onSuccessContainer: Color,
  val warning: Color,
  val onWarning: Color,
  val warningContainer: Color,
  val onWarningContainer: Color,
)

val LightStatus = StatusColors(
  success = Color(0xFF1B6C3A),
  onSuccess = Color(0xFFFFFFFF),
  successContainer = Color(0xFFA6F4B5),
  onSuccessContainer = Color(0xFF00210C),
  warning = Color(0xFF8B5000),
  onWarning = Color(0xFFFFFFFF),
  warningContainer = Color(0xFFFFDCBE),
  onWarningContainer = Color(0xFF2C1600),
)

val DarkStatus = StatusColors(
  success = Color(0xFF8BD89B),
  onSuccess = Color(0xFF00391A),
  successContainer = Color(0xFF005228),
  onSuccessContainer = Color(0xFFA6F4B5),
  warning = Color(0xFFFFB870),
  onWarning = Color(0xFF4A2800),
  warningContainer = Color(0xFF693C00),
  onWarningContainer = Color(0xFFFFDCBE),
)
