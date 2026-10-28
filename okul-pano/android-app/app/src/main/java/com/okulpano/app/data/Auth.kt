package com.okulpano.app.data

import com.okulpano.core.AppRole
import com.okulpano.core.Me
import com.okulpano.core.OkulApi
import com.okulpano.core.Perm
import com.okulpano.core.SchoolAccess
import com.okulpano.core.appRole
import com.okulpano.core.body
import com.okulpano.core.can
import com.okulpano.core.normalizeServer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class AuthStatus { Loading, SignedOut, SignedIn }

/** Oturum durumu: kim, hangi okul, hangi rol. Menüler ve ekranlar buna göre kurulur. */
data class AuthState(
  val status: AuthStatus = AuthStatus.Loading,
  val me: Me? = null,
  val schoolId: String? = null,
  val platformMode: Boolean = true,
  val server: String = "",
) {
  val school: SchoolAccess? get() = me?.schools?.firstOrNull { it.id == schoolId }
  val role: AppRole get() = appRole(me, school, platformMode)
  fun can(permission: String) = school?.can(permission) == true
  /** Yönetici ekranları (kontrol merkezi, onaylar, pano kumandası) */
  val isManager: Boolean get() = Perm.MANAGER.any { can(it) }
  /** Öğretmen kaydına bağlı (Bugün, Nöbetlerim) */
  val isTeacher: Boolean get() = school?.teacherId != null
  /** Seçili okulun API yolu: /api/schools/:id/<resource> */
  fun path(resource: String = ""): String = "/api/schools/${schoolId ?: "_"}${if (resource.isEmpty()) "" else "/$resource"}"
}

class Auth(private val api: OkulApi, private val store: PrefsSessionStore, private val cache: QueryCache, private val scope: CoroutineScope) {
  private val _state = MutableStateFlow(AuthState(platformMode = store.platformMode, server = store.server))
  val state: StateFlow<AuthState> = _state.asStateFlow()

  init {
    api.onSignedOut = { _state.update { it.copy(status = AuthStatus.SignedOut, me = null) } }
    scope.launch {
      if (store.refreshToken == null || store.server.isBlank()) {
        _state.update { it.copy(status = AuthStatus.SignedOut) }
        return@launch
      }
      runCatching { loadMe(store.schoolId) }.onFailure { _state.update { it.copy(status = AuthStatus.SignedOut) } }
    }
  }

  private suspend fun loadMe(preferred: String?) {
    val me: Me = api.get("/api/me")
    val pick = me.schools.firstOrNull { it.id == preferred } ?: me.schools.firstOrNull { it.id == me.lastSchoolId } ?: me.schools.firstOrNull()
    store.schoolId = pick?.id
    _state.update { it.copy(status = AuthStatus.SignedIn, me = me, schoolId = pick?.id) }
  }

  suspend fun reloadMe() = loadMe(_state.value.schoolId)

  suspend fun signIn(server: String, email: String, password: String) {
    store.server = normalizeServer(server)
    _state.update { it.copy(server = store.server) }
    api.login(email, password)
    loadMe(null)
  }

  suspend fun signOut() {
    api.logout()
    cache.clear()
    _state.update { it.copy(status = AuthStatus.SignedOut, me = null) }
  }

  fun selectSchool(id: String) {
    store.schoolId = id
    cache.clear()
    _state.update { it.copy(schoolId = id) }
    scope.launch { runCatching { api.send("/api/me/school", "PUT", body("schoolId" to id)) } }
  }

  /** Ekran görüntüsü testleri için: oturumu örnek verilerle doldurur */
  fun setForPreview(s: AuthState) {
    _state.value = s
  }

  /** Platform yöneticisi: platform görünümü ile okul görünümü arasında geçiş */
  fun setPlatformMode(on: Boolean) {
    store.platformMode = on
    cache.clear()
    _state.update { it.copy(platformMode = on) }
  }
}
