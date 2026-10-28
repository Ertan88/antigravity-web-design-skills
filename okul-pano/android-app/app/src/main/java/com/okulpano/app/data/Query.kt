package com.okulpano.app.data

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.okulpano.core.OkulApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.util.concurrent.ConcurrentHashMap

/**
 * Basit sorgu önbelleği: ekrana dönülünce son veri hemen görünür, arkada tazelenir. Bir işlemden sonra
 * `invalidate("announcements")` ile anahtarında bu parça geçen sorgular yeniden çekilir.
 */
class QueryCache {
  data class Signal(val n: Int, val parts: List<String>?)

  private val data = ConcurrentHashMap<String, Any>()
  private val _signal = MutableStateFlow(Signal(0, null))
  val signal: StateFlow<Signal> = _signal

  @Suppress("UNCHECKED_CAST")
  fun <T> get(key: String): T? = data[key] as T?

  fun put(key: String, value: Any) {
    data[key] = value
  }

  fun invalidate(vararg parts: String) {
    _signal.value = Signal(_signal.value.n + 1, parts.toList())
  }

  /** Okul değişince ya da çıkışta: bütün veriler unutulur */
  fun clear() {
    data.clear()
    _signal.value = Signal(_signal.value.n + 1, null)
  }
}

class QueryState<T>(
  val data: T?,
  val error: String?,
  val loading: Boolean,
  val refreshing: Boolean,
  val refresh: () -> Unit,
)

/**
 * Ekranın verisi: ilk açılışta yüklenir, `pollMs` verilirse düzenli tazelenir, önbellek geçersiz kılınınca yeniden
 * çekilir. Hata mesajı sunucunun Türkçe mesajıdır.
 */
@Composable
fun <T : Any> rememberQuery(key: String, enabled: Boolean = true, pollMs: Long? = null, fetch: suspend OkulApi.() -> T): QueryState<T> {
  val app = LocalApp.current
  val signal by app.cache.signal.collectAsState()
  var data by remember(key) { mutableStateOf(app.cache.get<T>(key)) }
  var error by remember(key) { mutableStateOf<String?>(null) }
  var loading by remember(key) { mutableStateOf(false) }
  var refreshing by remember(key) { mutableStateOf(false) }
  var trigger by remember(key) { mutableIntStateOf(0) }

  LaunchedEffect(signal) {
    if (signal.n > 0 && (signal.parts == null || signal.parts!!.any { key.contains(it) })) trigger++
  }

  LaunchedEffect(key, enabled, trigger) {
    if (!enabled) return@LaunchedEffect
    loading = data == null
    while (true) {
      runCatching { app.api.fetch() }
        .onSuccess {
          data = it
          error = null
          app.cache.put(key, it)
        }
        .onFailure { error = it.message ?: "Yüklenemedi" }
      loading = false
      refreshing = false
      if (pollMs == null) break
      delay(pollMs)
    }
  }
  return QueryState(data, error, loading, refreshing) {
    refreshing = true
    trigger++
  }
}
