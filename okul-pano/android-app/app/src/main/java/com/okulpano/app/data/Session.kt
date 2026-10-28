package com.okulpano.app.data

import android.content.Context
import androidx.core.content.edit
import com.okulpano.core.SessionStore

/** Oturum bilgileri uygulamanın kendi depolamasında (başka uygulamalar okuyamaz); yedeklemeye girmez. */
class PrefsSessionStore(context: Context, defaultServer: String) : SessionStore {
  private val prefs = context.getSharedPreferences("okulpano.session", Context.MODE_PRIVATE)

  override var server: String = prefs.getString("server", null) ?: defaultServer
    set(value) {
      field = value
      prefs.edit { putString("server", value) }
    }

  override var refreshToken: String?
    get() = prefs.getString("refresh", null)
    set(value) = prefs.edit { if (value == null) remove("refresh") else putString("refresh", value) }

  override var schoolId: String?
    get() = prefs.getString("school", null)
    set(value) = prefs.edit { if (value == null) remove("school") else putString("school", value) }

  /** Platform yöneticisi açılışta platform görünümündedir; okuluna geçince hatırlanır */
  var platformMode: Boolean
    get() = prefs.getBoolean("platformMode", true)
    set(value) = prefs.edit { putBoolean("platformMode", value) }
}
