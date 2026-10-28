package com.okulpano.core

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.serializer
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import java.util.concurrent.TimeUnit

/** Sunucunun anlaşılır Türkçe hata mesajı ve HTTP durum kodu */
class ApiException(message: String, val status: Int) : Exception(message)

/** Oturum anahtarlarını saklayan yer (Android'de uygulamaya özel depolama) */
interface SessionStore {
  var server: String
  var refreshToken: String?
  var schoolId: String?
}

class MemorySessionStore(override var server: String = "", override var refreshToken: String? = null, override var schoolId: String? = null) : SessionStore

val json = Json {
  ignoreUnknownKeys = true
  explicitNulls = false
  encodeDefaults = true
  coerceInputValues = true
}

/** "okul.example.com" → "https://okul.example.com"; sondaki eğik çizgi atılır */
fun normalizeServer(url: String): String {
  val t = url.trim().trimEnd('/')
  if (t.isEmpty()) return t
  return if (Regex("^https?://", RegexOption.IGNORE_CASE).containsMatchIn(t)) t else "https://$t"
}

/**
 * Okul Yayın API istemcisi. Erişim anahtarı bellekte, yenileme anahtarı [SessionStore]'da durur; 401 alınca bir kez
 * yenilenip istek tekrarlanır. Yenileme de başarısızsa oturum kapanır ve [onSignedOut] çağrılır.
 */
class OkulApi(
  val store: SessionStore,
  private val client: OkHttpClient = OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS).readTimeout(30, TimeUnit.SECONDS).build(),
) {
  @Volatile var accessToken: String? = null
  var onSignedOut: (() -> Unit)? = null
  private val refreshLock = Mutex()

  val server: String get() = store.server

  /** Göreli resim adresi ("/uploads/…") → tam adres */
  fun absoluteUrl(u: String?): String? = when {
    u.isNullOrBlank() -> null
    Regex("^https?:", RegexOption.IGNORE_CASE).containsMatchIn(u) -> u
    else -> "${store.server}$u"
  }

  suspend inline fun <reified T> get(path: String): T = request(path, "GET", null, serializer())

  suspend inline fun <reified T> post(path: String, body: JsonElement? = null): T = request(path, "POST", body, serializer())

  suspend inline fun <reified T> patch(path: String, body: JsonElement): T = request(path, "PATCH", body, serializer())

  suspend inline fun <reified T> put(path: String, body: JsonElement): T = request(path, "PUT", body, serializer())

  suspend fun send(path: String, method: String, body: JsonElement? = null) {
    request(path, method, body, JsonElement.serializer())
  }

  suspend fun <T> request(path: String, method: String, body: JsonElement?, ser: KSerializer<T>): T {
    val requestBody = body?.toString()?.toRequestBody(JSON) ?: if (method == "GET") null else "{}".toRequestBody(JSON)
    return execute(path, method, requestBody, ser)
  }

  suspend fun upload(schoolId: String, fileName: String, mimeType: String, bytes: ByteArray): UploadResult {
    val form = MultipartBody.Builder().setType(MultipartBody.FORM)
      .addFormDataPart("file", fileName, bytes.toRequestBody(mimeType.toMediaType()))
      .build()
    return execute("/api/schools/$schoolId/uploads", "POST", form, UploadResult.serializer())
  }

  private suspend fun <T> execute(path: String, method: String, body: RequestBody?, ser: KSerializer<T>): T = withContext(Dispatchers.IO) {
    fun build() = Request.Builder().url("${store.server}$path").method(method, body).apply {
      accessToken?.let { header("Authorization", "Bearer $it") }
      header("Accept", "application/json")
    }.build()

    var res: Response
    try {
      if (accessToken == null && store.refreshToken != null && !path.startsWith("/api/auth/")) refresh()
      res = client.newCall(build()).execute()
      if (res.code == 401 && store.refreshToken != null && !path.startsWith("/api/auth/")) {
        res.close()
        refresh()
        res = client.newCall(build()).execute()
      }
    } catch (e: IOException) {
      throw ApiException("Sunucuya ulaşılamadı. İnternet bağlantınızı ve sunucu adresini kontrol edin.", 0)
    }
    res.use { r ->
      if (r.code == 401 && path != "/api/auth/login") {
        accessToken = null
        store.refreshToken = null
        onSignedOut?.invoke()
      }
      val text = r.body?.string().orEmpty()
      if (!r.isSuccessful) {
        val msg = runCatching { json.decodeFromString(ApiErrorBody.serializer(), text).message }.getOrNull()
        throw ApiException(msg ?: "İşlem yapılamadı (${r.code})", r.code)
      }
      @Suppress("UNCHECKED_CAST")
      if (r.code == 204 || text.isBlank()) return@withContext (null as T)
      json.decodeFromString(ser, text)
    }
  }

  /** Yenileme anahtarıyla yeni erişim anahtarı; aynı anda gelen istekler tek yenileme bekler */
  private suspend fun refresh(): Boolean = refreshLock.withLock {
    val token = store.refreshToken ?: return@withLock false
    val req = Request.Builder().url("${store.server}/api/auth/refresh")
      .post(buildJsonObject { put("refreshToken", token) }.toString().toRequestBody(JSON)).build()
    runCatching {
      client.newCall(req).execute().use { r ->
        if (!r.isSuccessful) return@use false
        val t = json.decodeFromString(Tokens.serializer(), r.body!!.string())
        accessToken = t.accessToken
        store.refreshToken = t.refreshToken
        true
      }
    }.getOrDefault(false)
  }

  /* ---------- Oturum ---------- */

  suspend fun login(email: String, password: String) {
    val t: Tokens = post("/api/auth/login", buildJsonObject {
      put("email", email.trim().lowercase())
      put("password", password)
      put("client", "mobile")
    })
    accessToken = t.accessToken
    store.refreshToken = t.refreshToken
  }

  suspend fun logout() {
    val token = store.refreshToken
    accessToken = null
    store.refreshToken = null
    if (token != null) runCatching { send("/api/auth/logout", "POST", buildJsonObject { put("refreshToken", token) }) }
  }

  /** Şifre değişince sunucu diğer oturumları kapatır; bu cihazın oturumu yeni anahtarla sürer */
  suspend fun changePassword(current: String, next: String) {
    val r: PasswordResult = post("/api/me/password", buildJsonObject {
      put("currentPassword", current)
      put("newPassword", next)
      put("client", "mobile")
    })
    r.refreshToken?.let {
      store.refreshToken = it
      accessToken = null
    }
  }

  fun school(schoolId: String, resource: String = "") = "/api/schools/$schoolId${if (resource.isEmpty()) "" else "/$resource"}"

  companion object {
    val JSON = "application/json; charset=utf-8".toMediaType()
  }
}

/** JSON gövdesi kısaltması: `body("hours" to 24)` */
fun body(vararg pairs: Pair<String, Any?>): JsonObject = buildJsonObject {
  for ((k, v) in pairs) put(k, toJson(v))
}

fun toJson(v: Any?): JsonElement = when (v) {
  null -> kotlinx.serialization.json.JsonNull
  is JsonElement -> v
  is String -> kotlinx.serialization.json.JsonPrimitive(v)
  is Number -> kotlinx.serialization.json.JsonPrimitive(v)
  is Boolean -> kotlinx.serialization.json.JsonPrimitive(v)
  is List<*> -> kotlinx.serialization.json.JsonArray(v.map { toJson(it) })
  is Map<*, *> -> JsonObject(v.entries.associate { (k, x) -> k.toString() to toJson(x) })
  else -> error("JSON'a çevrilemiyor: ${v::class}")
}
