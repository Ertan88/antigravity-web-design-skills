package com.okulpano.app.ui.nav

import androidx.compose.runtime.staticCompositionLocalOf
import androidx.navigation.NavHostController
import java.time.Instant

val LocalNav = staticCompositionLocalOf<NavHostController> { error("NavController eksik") }

/** Şimdiki an: ekran görüntüsü testlerinde sabit bir ana ayarlanır */
val LocalNow = staticCompositionLocalOf<() -> Instant> { { Instant.now() } }
