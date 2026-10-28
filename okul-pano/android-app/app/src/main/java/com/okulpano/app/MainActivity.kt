package com.okulpano.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.navigation.compose.rememberNavController
import com.okulpano.app.data.AppContainer
import com.okulpano.app.data.AuthStatus
import com.okulpano.app.data.LocalApp
import com.okulpano.app.ui.nav.AppShell
import com.okulpano.app.ui.screens.LoginScreen
import com.okulpano.app.ui.theme.OkulTheme

class MainActivity : ComponentActivity() {
  /** Uygulama açıkken gelen bağlantı (okulpano://eslestir/KOD) */
  private val newIntent = mutableStateOf<Intent?>(null)

  override fun onCreate(savedInstanceState: Bundle?) {
    val container = (application as OkulApp).container
    val splash = installSplashScreen()
    // Oturum bilgisi gelene kadar marka renkli açılış ekranı kalır
    splash.setKeepOnScreenCondition { container.auth.state.value.status == AuthStatus.Loading }
    super.onCreate(savedInstanceState)
    enableEdgeToEdge()
    setContent {
      OkulTheme {
        CompositionLocalProvider(LocalApp provides container) {
          Root(container, newIntent.value)
        }
      }
    }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    newIntent.value = intent
  }
}

@Composable
private fun Root(container: AppContainer, intent: Intent?) {
  val state by container.auth.state.collectAsState()
  when (state.status) {
    AuthStatus.Loading -> Unit
    AuthStatus.SignedOut -> LoginScreen()
    AuthStatus.SignedIn -> {
      val nav = rememberNavController()
      LaunchedEffect(intent) { if (intent != null) nav.handleDeepLink(intent) }
      AppShell(state, nav)
    }
  }
}
