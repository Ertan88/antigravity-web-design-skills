package com.okulpano.app.data

import android.content.Context
import androidx.compose.runtime.staticCompositionLocalOf
import com.okulpano.app.BuildConfig
import com.okulpano.core.OkulApi
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

/** Uygulama boyunca tek: API istemcisi, oturum ve önbellek */
class AppContainer(context: Context) {
  val store = PrefsSessionStore(context, BuildConfig.DEFAULT_SERVER)
  val api = OkulApi(store)
  val cache = QueryCache()
  val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  val auth = Auth(api, store, cache, scope)
}

val LocalApp = staticCompositionLocalOf<AppContainer> { error("AppContainer eksik") }
