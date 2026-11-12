package com.okulyayin.pano

import android.content.Context
import android.content.SharedPreferences

/** Uygulamanın kalıcı ayarları (TV kapanıp açılınca da kalır) */
object Prefs {
    private fun sp(c: Context): SharedPreferences = c.getSharedPreferences("pano", Context.MODE_PRIVATE)

    /** Sunucu adresi; varsayılanı derlemeden gelir */
    fun server(c: Context): String = sp(c).getString("server", null)?.takeIf { it.isNotBlank() } ?: BuildConfig.DEFAULT_SERVER

    fun setServer(c: Context, v: String?) = sp(c).edit().putString("server", v?.trim()?.trimEnd('/')?.takeIf { it.isNotBlank() }).apply()

    /** Panelden gelen gizli ayarlar şifresi; boşsa ayarlar şifresiz açılır */
    fun pin(c: Context): String? = sp(c).getString("pin", null)

    fun setPin(c: Context, v: String?) = sp(c).edit().putString("pin", v).apply()

    /** TV açılınca panoyu kendiliğinden başlat */
    fun autostart(c: Context): Boolean = sp(c).getBoolean("autostart", true)

    fun setAutostart(c: Context, v: Boolean) = sp(c).edit().putBoolean("autostart", v).apply()

    /** "Açılışta başlasın mı?" sorusu bir kez sorulur */
    fun askedOverlay(c: Context): Boolean = sp(c).getBoolean("askedOverlay", false)

    fun setAskedOverlay(c: Context) = sp(c).edit().putBoolean("askedOverlay", true).apply()

    /** Pano ön plandan çıkarsa (Ana ekran ya da kaynak tuşu) birkaç dakika sonra kendiliğinden geri gelir */
    fun returnToBoard(c: Context): Boolean = sp(c).getBoolean("returnToBoard", true)

    fun setReturnToBoard(c: Context, v: Boolean) = sp(c).edit().putBoolean("returnToBoard", v).apply()

    /** Gizli ayarlardan TV ayarları açılınca geri dönüş bu zamana kadar bekler (bakım için) */
    fun returnPausedUntil(c: Context): Long = sp(c).getLong("returnPausedUntil", 0L)

    fun setReturnPausedUntil(c: Context, v: Long) = sp(c).edit().putLong("returnPausedUntil", v).apply()

    /** Eski tarayıcı motoru uyarısı her motor sürümü için bir kez gösterilir */
    fun warnedWebView(c: Context): String? = sp(c).getString("warnedWebView", null)

    fun setWarnedWebView(c: Context, v: String) = sp(c).edit().putString("warnedWebView", v).apply()
}
