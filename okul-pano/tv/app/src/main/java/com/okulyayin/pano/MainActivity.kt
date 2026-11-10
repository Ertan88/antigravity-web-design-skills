package com.okulyayin.pano

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.text.InputType
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.TextView
import android.widget.Toast
import org.json.JSONObject

/**
 * Okul Yayın Pano: sunucudaki panoyu (/display/) tam ekran açar. Ekran hep açık kalır, Geri tuşu panodan
 * çıkarmaz. Gizli ayarlar: OK tuşuna 5 saniye basılı tutmak ya da Geri'ye art arda 5 kez basmak (panelden
 * belirlenen şifre sorulur).
 *
 * Pano eşleştirmesi ve verisi panonun kendi sayfasındadır (cihaz anahtarı WebView'in yerel deposunda saklanır);
 * bu uygulama yalnızca onu güvenli ve kesintisiz açık tutar.
 */
class MainActivity : Activity() {
    private lateinit var root: FrameLayout
    private lateinit var status: TextView
    private var web: WebView? = null
    private val handler = Handler(Looper.getMainLooper())
    private val retry = Runnable { load() }
    private var dialogOpen = false
    private var longPressHandled = false
    private val backPresses = ArrayDeque<Long>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        root = FrameLayout(this).apply { setBackgroundColor(BG) }
        status = TextView(this).apply {
            setTextColor(Color.parseColor("#F1F5F9"))
            textSize = 24f
            gravity = Gravity.CENTER
            setPadding(80, 80, 80, 80)
            setBackgroundColor(BG)
            visibility = View.GONE
        }
        setContentView(root)
        createWebView()
        root.addView(status, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        load()
        // İlk açılış soruları pano yüklendikten biraz sonra (sırayla, tek pencere)
        handler.postDelayed({ firstRunChecks() }, 2500)
    }

    override fun onResume() {
        super.onResume()
        hideSystemUi()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemUi()
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        web?.destroy()
        web = null
        super.onDestroy()
    }

    /* ---------------- Pano (WebView) ---------------- */

    @SuppressLint("SetJavaScriptEnabled")
    private fun createWebView() {
        web?.let {
            root.removeView(it)
            it.destroy()
        }
        val w = WebView(this)
        w.setBackgroundColor(BG)
        w.settings.apply {
            javaScriptEnabled = true
            // Cihaz anahtarı ve son pano verisi burada saklanır: TV kapanıp açılınca eşleştirme sorulmaz
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            loadWithOverviewMode = true
            useWideViewPort = true
            userAgentString = "$userAgentString OkulYayinPano/${BuildConfig.VERSION_NAME}"
        }
        w.isFocusable = true
        w.isFocusableInTouchMode = true
        w.addJavascriptInterface(Bridge(), "OkulYayinTV")
        w.webChromeClient = WebChromeClient()
        w.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                // Yalnızca pano sunucusu içinde gezilir; başka sitelere açılan bağlantılar engellenir
                val host = Uri.parse(Prefs.server(this@MainActivity)).host
                return request.url.host != host
            }

            override fun onPageFinished(view: WebView, url: String) {
                if (status.text.toString() == LOADING) status.visibility = View.GONE
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) showOffline()
            }

            // TV'de bellek azalınca WebView'in çizim süreci kapanabilir: uygulama çökmez, pano yeniden açılır
            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                handler.post {
                    createWebView()
                    root.bringChildToFront(status)
                    load()
                }
                return true
            }
        }
        root.addView(w, 0, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        web = w
    }

    private fun displayUrl(): String = Prefs.server(this).trimEnd('/') + "/display/"

    private fun load() {
        handler.removeCallbacks(retry)
        val w = web ?: return
        // İnternet yoksa önceden kaydedilen sayfa açılır; pano son kaydettiği bilgiyle çalışmaya devam eder
        w.settings.cacheMode = if (online()) WebSettings.LOAD_DEFAULT else WebSettings.LOAD_CACHE_ELSE_NETWORK
        status.text = LOADING
        status.visibility = View.VISIBLE
        w.loadUrl(displayUrl())
    }

    private fun showOffline() {
        status.text = "Sunucuya bağlanılamıyor\n\nİnternet bağlantısını kontrol edin. 15 saniye sonra yeniden denenecek.\n\n${displayUrl()}"
        status.visibility = View.VISIBLE
        handler.removeCallbacks(retry)
        handler.postDelayed(retry, 15_000)
    }

    private fun online(): Boolean {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    /** Pano sayfası bu nesneyle uygulamaya ayar iletir (ör. gizli ayarlar şifresi) */
    inner class Bridge {
        @JavascriptInterface
        fun setConfig(json: String) {
            try {
                val o = JSONObject(json)
                if (o.has("pin")) Prefs.setPin(this@MainActivity, if (o.isNull("pin")) null else o.getString("pin").takeIf { it.isNotBlank() })
            } catch (_: Exception) {
                // bozuk veri: yok sayılır
            }
        }

        @JavascriptInterface
        fun version(): String = BuildConfig.VERSION_NAME
    }

    /* ---------------- Kumanda ---------------- */

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val code = event.keyCode
        val ok = code == KeyEvent.KEYCODE_DPAD_CENTER || code == KeyEvent.KEYCODE_ENTER || code == KeyEvent.KEYCODE_NUMPAD_ENTER
        if (ok && event.action == KeyEvent.ACTION_DOWN) {
            if (event.repeatCount == 0) longPressHandled = false
            // OK tuşu 5 saniye basılı: gizli ayarlar
            if (!longPressHandled && event.repeatCount > 0 && event.eventTime - event.downTime >= 5_000) {
                longPressHandled = true
                openSettings()
                return true
            }
        }
        if (code == KeyEvent.KEYCODE_BACK) {
            // Geri tuşu panodan çıkarmaz; 3 saniye içinde 5 kez basmak gizli ayarları açar
            if (event.action == KeyEvent.ACTION_UP) {
                val now = event.eventTime
                backPresses.addLast(now)
                while (backPresses.isNotEmpty() && now - backPresses.first() > 3_000) backPresses.removeFirst()
                if (backPresses.size >= 5) {
                    backPresses.clear()
                    openSettings()
                }
            }
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    /* ---------------- Gizli ayarlar ---------------- */

    private fun openSettings() {
        if (dialogOpen) return
        val pin = Prefs.pin(this)
        if (pin.isNullOrBlank()) {
            showMenu()
            return
        }
        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
            hint = "Şifre"
            textSize = 22f
            gravity = Gravity.CENTER
        }
        dialog()
            .setTitle("Pano ayarları")
            .setMessage("Okul yönetiminin panelde belirlediği şifreyi girin.")
            .setView(padded(input))
            .setPositiveButton("Aç") { _, _ ->
                if (input.text.toString() == pin) showMenu() else toast("Şifre yanlış")
            }
            .setNegativeButton("Vazgeç", null)
            .showTracked()
        input.requestFocus()
    }

    private fun showMenu() {
        val auto = Prefs.autostart(this)
        val home = isHomeEnabled()
        val items = arrayOf(
            "Panoyu yenile",
            "Sunucu adresi: ${Prefs.server(this)}",
            "Eşleştirmeyi sıfırla",
            "Açılışta başlat: ${if (auto) "Açık" else "Kapalı"}${if (auto && needsOverlay()) " (izin gerekli)" else ""}",
            "Ana ekran uygulaması: ${if (home) "Açık" else "Kapalı"}",
            "Uygulama bilgisi",
            "Uygulamadan çık",
        )
        dialog()
            .setTitle("Pano ayarları")
            .setItems(items) { _, which ->
                when (which) {
                    0 -> load()
                    1 -> editServer()
                    2 -> confirmReset()
                    3 -> toggleAutostart()
                    4 -> toggleHome()
                    5 -> showInfo()
                    6 -> finishAndRemoveTask()
                }
            }
            .setNegativeButton("Kapat", null)
            .showTracked()
    }

    private fun editServer() {
        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            setText(Prefs.server(this@MainActivity))
            setSelection(text.length)
        }
        dialog()
            .setTitle("Sunucu adresi")
            .setMessage("Panonun açıldığı adres (sonuna /display/ eklenir). Varsayılan: ${BuildConfig.DEFAULT_SERVER}")
            .setView(padded(input))
            .setPositiveButton("Kaydet") { _, _ ->
                val v = input.text.toString().trim()
                Prefs.setServer(this, if (v.isEmpty() || v == BuildConfig.DEFAULT_SERVER) null else if (v.startsWith("http")) v else "https://$v")
                load()
            }
            .setNeutralButton("Varsayılan") { _, _ ->
                Prefs.setServer(this, null)
                load()
            }
            .setNegativeButton("Vazgeç", null)
            .showTracked()
    }

    private fun confirmReset() {
        dialog()
            .setTitle("Eşleştirme sıfırlansın mı?")
            .setMessage("Bu TV panodan çıkarılır ve yeni bir eşleştirme kodu gösterir. Panoyu panelde yeniden eklemeniz gerekir.")
            .setPositiveButton("Sıfırla") { _, _ ->
                web?.evaluateJavascript("try{localStorage.removeItem('okulpano.deviceToken');localStorage.removeItem('okulpano.lastState')}catch(e){}") { load() }
            }
            .setNegativeButton("Vazgeç", null)
            .showTracked()
    }

    private fun toggleAutostart() {
        val next = !Prefs.autostart(this)
        Prefs.setAutostart(this, next)
        if (next && needsOverlay()) requestOverlay() else toast(if (next) "Açılışta başlat açık" else "Açılışta başlat kapalı")
    }

    /* "Ana ekran uygulaması": TV'nin Ana ekran tuşu panoya döner; açılışta başlatmanın en sağlam yolu */
    private fun homeAlias() = ComponentName(this, "$packageName.HomeAlias")

    private fun isHomeEnabled() = packageManager.getComponentEnabledSetting(homeAlias()) == PackageManager.COMPONENT_ENABLED_STATE_ENABLED

    private fun toggleHome() {
        val enable = !isHomeEnabled()
        packageManager.setComponentEnabledSetting(
            homeAlias(),
            if (enable) PackageManager.COMPONENT_ENABLED_STATE_ENABLED else PackageManager.COMPONENT_ENABLED_STATE_DEFAULT,
            PackageManager.DONT_KILL_APP,
        )
        if (enable) {
            dialog()
                .setTitle("Ana ekran uygulaması")
                .setMessage("Kumandanın Ana ekran tuşuna basın. TV hangi uygulamanın açılacağını sorarsa “Okul Yayın Pano” ve “Her zaman”ı seçin. Bazı TV’ler bu seçimi sormaz; o TV’lerde “Açılışta başlat” kullanılır.")
                .setPositiveButton("Tamam", null)
                .showTracked()
        } else {
            toast("Ana ekran uygulaması kapatıldı")
        }
    }

    private fun showInfo() {
        val wv = webViewVersion() ?: "bilinmiyor"
        val overlay = if (needsOverlay()) "verilmedi" else "var"
        dialog()
            .setTitle("Okul Yayın Pano ${BuildConfig.VERSION_NAME}")
            .setMessage(
                "Pano adresi: ${displayUrl()}\n" +
                    "Tarayıcı motoru (WebView): $wv\n" +
                    "Açılışta başlatma izni: $overlay\n" +
                    "Gizli ayarlar şifresi: ${if (Prefs.pin(this).isNullOrBlank()) "yok (panelden belirleyin)" else "var"}\n\n" +
                    "İzin TV menüsünde yoksa bir bilgisayardan bir kez:\nadb shell appops set $packageName SYSTEM_ALERT_WINDOW allow",
            )
            .setPositiveButton("Tamam", null)
            .showTracked()
    }

    /* ---------------- İlk açılış ---------------- */

    private fun firstRunChecks() {
        if (isFinishing) return
        val wv = webViewVersion()
        val major = wv?.substringBefore('.')?.toIntOrNull()
        if (major != null && major < MIN_WEBVIEW && Prefs.warnedWebView(this) != wv) {
            Prefs.setWarnedWebView(this, wv)
            dialog()
                .setTitle("Tarayıcı motoru eski")
                .setMessage("Bu TV’nin tarayıcı motoru (Android System WebView $wv) eski; pano renkleri ve yerleşimi bozuk görünebilir. TV’nin uygulama mağazasından “Android System WebView” güncellemesini yükleyin. Güncellenemiyorsa bir Android TV çubuğu kullanın.")
                .setPositiveButton("Tamam") { _, _ -> askOverlayOnce() }
                .setOnCancelListener { askOverlayOnce() }
                .showTracked()
            return
        }
        askOverlayOnce()
    }

    private fun askOverlayOnce() {
        if (!Prefs.autostart(this) || !needsOverlay() || Prefs.askedOverlay(this)) return
        Prefs.setAskedOverlay(this)
        dialog()
            .setTitle("Açılışta kendiliğinden başlasın mı?")
            .setMessage("TV açılınca pano kimse dokunmadan gelsin. Açılan ekranda “Okul Yayın Pano”yu bulup izni açın, sonra Geri tuşuyla dönün.")
            .setPositiveButton("İzin ver") { _, _ -> requestOverlay() }
            .setNegativeButton("Sonra", null)
            .showTracked()
    }

    /** Android 10 ve sonrası: açılışta öne gelebilmek için "diğer uygulamaların üzerinde göster" izni */
    private fun needsOverlay(): Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && !Settings.canDrawOverlays(this) && !isHomeEnabled()

    private fun requestOverlay() {
        val withPackage = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName"))
        try {
            startActivity(withPackage)
            return
        } catch (_: ActivityNotFoundException) {
        } catch (_: SecurityException) {
        }
        try {
            startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION))
            return
        } catch (_: Exception) {
        }
        // Bazı Google TV'lerde bu ayar ekranı yoktur
        dialog()
            .setTitle("Bu TV izni menüde göstermiyor")
            .setMessage("İki yol var:\n\n1) Gizli ayarlarda “Ana ekran uygulaması”nı açın.\n\n2) Aynı ağdaki bir bilgisayardan bir kez şu komutu çalıştırın:\nadb shell appops set $packageName SYSTEM_ALERT_WINDOW allow")
            .setPositiveButton("Tamam", null)
            .showTracked()
    }

    private fun webViewVersion(): String? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WebView.getCurrentWebViewPackage()?.versionName else null

    /* ---------------- Yardımcılar ---------------- */

    @Suppress("DEPRECATION")
    private fun hideSystemUi() {
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            )
    }

    private fun dialog() = AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)

    private fun AlertDialog.Builder.showTracked(): AlertDialog {
        val d = create()
        d.setOnDismissListener {
            dialogOpen = false
            hideSystemUi()
            web?.requestFocus()
        }
        dialogOpen = true
        d.show()
        return d
    }

    private fun padded(v: View): View = FrameLayout(this).apply {
        setPadding(56, 16, 56, 0)
        addView(v)
    }

    private fun toast(text: String) = Toast.makeText(this, text, Toast.LENGTH_LONG).show()

    companion object {
        private val BG = Color.parseColor("#080E1C")
        private const val LOADING = "Okul Yayın Pano açılıyor…"
        /** Panonun kullandığı tarayıcı özellikleri (color-mix vb.) için en düşük motor sürümü */
        private const val MIN_WEBVIEW = 111
    }
}
