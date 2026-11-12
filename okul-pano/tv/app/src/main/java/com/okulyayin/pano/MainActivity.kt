package com.okulyayin.pano

import android.annotation.SuppressLint
import android.app.Activity
import android.app.ActivityManager
import android.app.ActivityOptions
import android.app.AlarmManager
import android.app.AlertDialog
import android.app.PendingIntent
import android.app.admin.DevicePolicyManager
import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Color
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.net.http.SslError
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
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.TextView
import android.widget.Toast
import org.json.JSONObject
import java.net.ConnectException
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.SocketTimeoutException
import java.net.URL
import java.net.UnknownHostException
import java.text.SimpleDateFormat
import java.util.Locale
import javax.net.ssl.SSLException

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
    /** Pano ön plandan çıkınca birkaç dakika sonra geri getirilir (gizli ayarlardan çıkılmadıysa) */
    private val bringBack = Runnable { bringToFront() }
    /** Gizli ayarlardan "Uygulamadan çık" seçildi: geri dönüş kurulmaz */
    private var leaving = false
    private var dialogOpen = false
    private var longPressHandled = false
    /** Ağ hatasında önce son kaydedilen pano açılır; bu açılışta da hata olursa hata ekranı gösterilir */
    private var triedCache = false
    private var pageFailed = false
    private var failReason: String? = null
    /** Sayfa açıldı demek pano çizildi demek değil: panonun ekrana geldiği sayfanın içinden doğrulanır */
    private val renderCheck = Runnable { checkRendered() }
    private var renderChecks = 0
    private var cacheCleared = false
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

    override fun onStart() {
        super.onStart()
        cancelReturn()
    }

    override fun onResume() {
        super.onResume()
        hideSystemUi()
        applyKiosk()
    }

    // Ana ekran ya da kaynak tuşuyla panodan çıkıldı: pano birkaç dakika sonra kendiliğinden geri gelir
    override fun onStop() {
        super.onStop()
        if (!leaving && !isChangingConfigurations && Prefs.returnToBoard(this)) scheduleReturn()
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
        w.webChromeClient = object : WebChromeClient() {
            // WebView, video ilk karesini çizene kadar kendi gri "oynat" simgesini gösterir (YouTube duyurusunun
            // başında). Bu simge sayfanın üstünde çizildiği için panodaki kapak görseli onu örtemez: saydam
            // 1x1 görselle hiç gösterilmez.
            override fun getDefaultVideoPoster(): Bitmap = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)
        }
        w.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                // Yalnızca pano sunucusu içinde gezilir; başka sitelere açılan bağlantılar engellenir
                val host = Uri.parse(Prefs.server(this@MainActivity)).host
                return request.url.host != host
            }

            override fun onPageFinished(view: WebView, url: String) {
                if (pageFailed) return
                // Yazı ve önbellek ayarı ancak pano gerçekten çizilince değişir (bkz. checkRendered)
                renderChecks = 0
                handler.removeCallbacks(renderCheck)
                handler.postDelayed(renderCheck, 1_500)
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) mainFrameFailed(webErrorText(error.errorCode, error.description))
            }

            // Sunucu yeniden başlarken ya da uyanırken 502/503 döner: hata sayfası panonun yerine geçmesin
            override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) {
                if (request.isForMainFrame && response.statusCode >= 500) {
                    mainFrameFailed("Sunucu şu an yanıt vermiyor (HTTP ${response.statusCode}). Sunucu yeniden başlıyor ya da uykudan uyanıyor olabilir.")
                }
            }

            // Güvenli bağlantı kurulamazsa bağlantıya asla izin verilmez; nedeni ekranda yazar
            override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
                handler.cancel()
                if (Uri.parse(error.url).host == Uri.parse(Prefs.server(this@MainActivity)).host) mainFrameFailed(SSL_TEXT)
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
        triedCache = false
        failReason = null
        // İnternet yoksa önceden kaydedilen sayfa açılır; pano son kaydettiği bilgiyle çalışmaya devam eder
        open(if (online()) WebSettings.LOAD_DEFAULT else WebSettings.LOAD_CACHE_ELSE_NETWORK)
    }

    private fun open(cacheMode: Int) {
        handler.removeCallbacks(retry)
        handler.removeCallbacks(renderCheck)
        val w = web ?: return
        pageFailed = false
        w.settings.cacheMode = cacheMode
        status.text = LOADING
        status.visibility = View.VISIBLE
        w.loadUrl(displayUrl())
    }

    /**
     * Pano sayfası açılamadı: önce son kaydedilen pano önbellekten açılır (pano son verisiyle çalışır, ağ gelince
     * kendisi toparlanır). Önbellek de yoksa nedeniyle birlikte hata ekranı gösterilir ve 15 saniyede bir denenir.
     */
    private fun mainFrameFailed(reason: String) {
        if (pageFailed) return
        pageFailed = true
        if (failReason == null) failReason = reason
        // Kısa gecikme: başarısız açılışın "sayfa bitti" bildirimi önce gelsin, önbellekten açılışı karıştırmasın
        handler.postDelayed({
            if (!triedCache) {
                triedCache = true
                open(WebSettings.LOAD_CACHE_ONLY)
            } else {
                showOffline(failReason ?: reason)
            }
        }, 300)
    }

    /** Panonun kök öğesi doldu mu? Dolduysa yazı kalkar ve panonun istekleri yeniden ağa gider. */
    private fun checkRendered() {
        val w = web ?: return
        w.evaluateJavascript(RENDER_JS) { result ->
            if (result == "true") {
                w.settings.cacheMode = WebSettings.LOAD_DEFAULT
                status.visibility = View.GONE
                handler.removeCallbacks(retry)
                cacheCleared = false
            } else if (++renderChecks < 12) {
                handler.postDelayed(renderCheck, 2_500)
            } else {
                pageBroken()
            }
        }
    }

    /**
     * Sayfa açıldı ama pano 30 saniyede çizilmedi (dosyaları eksik ya da bozuk inmiş olabilir): önce tarayıcı
     * önbelleği temizlenip yeniden açılır; yine olmazsa nedeniyle hata ekranı gösterilir ve yeniden denenir.
     */
    private fun pageBroken() {
        web?.settings?.cacheMode = WebSettings.LOAD_DEFAULT
        if (!cacheCleared) {
            cacheCleared = true
            web?.clearCache(true)
            load()
            return
        }
        showOffline("Pano sayfası açıldı ama görüntülenemedi. Sayfa dosyaları eksik ya da bozuk inmiş olabilir.")
    }

    private fun showOffline(reason: String) {
        web?.settings?.cacheMode = WebSettings.LOAD_DEFAULT
        // TV ağa hiç bağlı değilse asıl neden budur (ör. Wi-Fi koptu); güvenli bağlantı hatası gibi yan hatalar yanıltmasın
        val shown = if (online()) reason else "TV'nin ağ bağlantısı yok (kablo ya da Wi-Fi). Bağlantı gelince pano kendiliğinden açılır."
        status.text = "Sunucuya bağlanılamıyor\n\n$shown\n\n15 saniye sonra yeniden denenecek. Nedenini görmek için gizli ayarlardaki “Bağlantı testi”ni açın.\n\n${displayUrl()}"
        status.visibility = View.VISIBLE
        handler.removeCallbacks(retry)
        handler.postDelayed(retry, 15_000)
    }

    private fun webErrorText(code: Int, description: CharSequence?): String = when (code) {
        WebViewClient.ERROR_HOST_LOOKUP -> "Sunucu adı çözülemedi (DNS). İnternet yok ya da okul ağı bu adresi engelliyor olabilir."
        WebViewClient.ERROR_CONNECT -> "Sunucuyla bağlantı kurulamadı."
        WebViewClient.ERROR_TIMEOUT -> "Sunucu zamanında yanıt vermedi."
        WebViewClient.ERROR_FAILED_SSL_HANDSHAKE -> SSL_TEXT
        WebViewClient.ERROR_PROXY_AUTHENTICATION -> "Ağdaki vekil sunucu (proxy) giriş istiyor."
        WebViewClient.ERROR_IO -> "Bağlantı yarıda kesildi."
        else -> "Bağlantı hatası (${description ?: "kod $code"})."
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
        val kiosk = isKiosk()
        val needsPermission = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && !Settings.canDrawOverlays(this) && !kiosk
        val back = Prefs.returnToBoard(this)
        val entries = mutableListOf<Pair<String, () -> Unit>>(
            "Panoyu yenile" to { load() },
            "Bağlantı testi" to { connectionTest() },
            "Sunucu adresi: ${Prefs.server(this)}" to { editServer() },
            "Eşleştirmeyi sıfırla" to { confirmReset() },
            "Açılışta başlat: ${if (auto) "Açık" else "Kapalı"}${if (auto && needsOverlay()) " (izin gerekli)" else ""}" to { toggleAutostart() },
        )
        if (!kiosk) entries += "Ana ekran uygulaması: ${if (isHomeEnabled()) "Açık" else "Kapalı"}" to { toggleHome() }
        entries += "Panoya geri dönüş (2 dk): ${if (back) "Açık" else "Kapalı"}${if (back && needsPermission) " (izin gerekli)" else ""}" to { toggleReturn() }
        entries += "Kiosk modu: ${if (kiosk) "Açık" else "Kapalı"}" to { if (kiosk) confirmKioskOff() else showKioskHelp() }
        entries += "TV ayarlarını aç (bakım, 15 dk)" to { openTvSettings() }
        entries += "Uygulama bilgisi" to { showInfo() }
        entries += "Uygulamadan çık" to { exitApp() }
        dialog()
            .setTitle("Pano ayarları")
            .setItems(entries.map { it.first }.toTypedArray()) { _, which -> entries[which].second() }
            .setNegativeButton("Kapat", null)
            .showTracked()
    }

    /** Gizli ayarlardan çıkış: geri dönüş kurulmaz; kiosk modunda pano Ana ekran tuşuyla yeniden açılır */
    private fun exitApp() {
        leaving = true
        cancelReturn()
        if (isKiosk()) {
            try {
                stopLockTask()
            } catch (_: Exception) {
            }
        }
        finishAndRemoveTask()
    }

    /* ---------------- Panoya geri dönüş ---------------- */

    private fun toggleReturn() {
        val next = !Prefs.returnToBoard(this)
        Prefs.setReturnToBoard(this, next)
        if (next && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && !Settings.canDrawOverlays(this) && !isKiosk()) {
            // Android 10 ve sonrası arka plandan uygulama açmaya yalnızca bu izinle izin verir
            requestOverlay()
        } else {
            toast(if (next) "Pano, çıkıldıktan 2 dakika sonra kendiliğinden geri gelir" else "Panoya geri dönüş kapatıldı")
        }
    }

    private fun returnIntent() =
        Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)

    private fun returnPending(): PendingIntent {
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        // Android 14 ve sonrası: zamanlayıcının açtığı ekranın arka plandan öne gelmesine açıkça izin verilir
        return if (Build.VERSION.SDK_INT >= 34) {
            val options = ActivityOptions.makeBasic().setPendingIntentCreatorBackgroundActivityStartMode(ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED)
            PendingIntent.getActivity(this, RETURN_REQUEST, returnIntent(), flags, options.toBundle())
        } else {
            PendingIntent.getActivity(this, RETURN_REQUEST, returnIntent(), flags)
        }
    }

    /**
     * İki yoldan kurulur: uygulama çalışıyorsa zamanlayıcı (Handler), Android uygulamayı kapatırsa sistem alarmı.
     * Gizli ayarlardan TV ayarları açıldıysa bakım süresi bitene kadar beklenir.
     */
    private fun scheduleReturn() {
        val delay = maxOf(RETURN_MS, Prefs.returnPausedUntil(this) - System.currentTimeMillis())
        handler.removeCallbacks(bringBack)
        handler.postDelayed(bringBack, delay)
        try {
            val alarms = getSystemService(Context.ALARM_SERVICE) as AlarmManager
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + delay + 5_000, returnPending())
        } catch (_: Exception) {
        }
    }

    private fun cancelReturn() {
        handler.removeCallbacks(bringBack)
        try {
            (getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(returnPending())
        } catch (_: Exception) {
        }
    }

    private fun bringToFront() {
        try {
            startActivity(returnIntent())
        } catch (_: Exception) {
            // İzin yoksa Android engeller; sistem alarmı yine dener
        }
    }

    private fun openTvSettings() {
        Prefs.setReturnPausedUntil(this, System.currentTimeMillis() + MAINTENANCE_MS)
        if (isKiosk()) {
            try {
                stopLockTask()
            } catch (_: Exception) {
            }
        }
        try {
            startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            toast("Pano 15 dakika sonra kendiliğinden geri gelir")
        } catch (_: Exception) {
            toast("Bu TV'de ayarlar buradan açılamıyor")
        }
    }

    /* ---------------- Kiosk modu ---------------- */

    private fun dpm() = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

    private fun adminComponent() = ComponentName(this, AdminReceiver::class.java)

    /** TV bilgisayardan bu uygulamanın "cihaz sahibi" yapıldıysa kiosk modu açıktır */
    private fun isKiosk(): Boolean = try {
        dpm().isDeviceOwnerApp(packageName)
    } catch (_: Exception) {
        false
    }

    /**
     * Kiosk modunda pano kilitli görev modunda açılır: Ana ekran ve son uygulamalar tuşları panodan çıkaramaz.
     * Ana ekran tuşu da kalıcı olarak panoyu açar (TV'nin sorusu ya da seçimi ne olursa olsun).
     */
    private fun applyKiosk() {
        if (leaving || !isKiosk()) return
        try {
            val dpm = dpm()
            dpm.setLockTaskPackages(adminComponent(), arrayOf(packageName))
            packageManager.setComponentEnabledSetting(homeAlias(), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP)
            val home = IntentFilter(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_HOME)
                addCategory(Intent.CATEGORY_DEFAULT)
            }
            dpm.addPersistentPreferredActivity(adminComponent(), home, homeAlias())
            val am = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            if (am.lockTaskModeState == ActivityManager.LOCK_TASK_MODE_NONE) startLockTask()
        } catch (_: Exception) {
            // Kilitli görev modu açılamazsa pano yine çalışır; geri dönüş önlemi devrededir
        }
    }

    private fun showKioskHelp() {
        dialog()
            .setTitle("Kiosk modu")
            .setMessage(
                "Kiosk modunda Ana ekran ve son uygulamalar tuşları panodan çıkaramaz. Bir bilgisayardan bir kez açılır:\n\n" +
                    "1) TV'de Geliştirici seçenekleri › USB (ya da ağ) hata ayıklamayı açın.\n" +
                    "2) TV'de Google hesabı varsa kaldırın (hesap varken Android izin vermez).\n" +
                    "3) Bilgisayarda:\nadb connect TV_IP_ADRESI\nadb shell dpm set-device-owner $packageName/.AdminReceiver\n\n" +
                    "Ayrıntılı anlatım kurulum belgesindedir (TV uygulaması › Kiosk modu).",
            )
            .setPositiveButton("Tamam", null)
            .showTracked()
    }

    private fun confirmKioskOff() {
        dialog()
            .setTitle("Kiosk modu kapatılsın mı?")
            .setMessage("Ana ekran tuşu yeniden TV'nin ana ekranına götürür ve uygulama kaldırılabilir olur. Kiosk modunu yeniden açmak için TV'yi bilgisayardan bir kez daha kiosk moduna almak gerekir.")
            .setPositiveButton("Kapat") { _, _ -> kioskOff() }
            .setNegativeButton("Vazgeç", null)
            .showTracked()
    }

    @Suppress("DEPRECATION")
    private fun kioskOff() {
        try {
            stopLockTask()
        } catch (_: Exception) {
        }
        try {
            val dpm = dpm()
            dpm.clearPackagePersistentPreferredActivities(adminComponent(), packageName)
            dpm.setLockTaskPackages(adminComponent(), arrayOf())
            dpm.clearDeviceOwnerApp(packageName)
            toast("Kiosk modu kapatıldı")
        } catch (e: Exception) {
            toast("Kiosk modu kapatılamadı: ${e.message ?: e.javaClass.simpleName}")
        }
    }

    /* ---------------- Bağlantı testi ---------------- */

    /** Ağ, sunucu adı (DNS), sunucu, TV saati ve genel internet tek ekranda: okul ağı engeli hemen anlaşılır */
    private fun connectionTest() {
        val server = Prefs.server(this).trimEnd('/')
        val host = Uri.parse(server).host ?: server
        val box = dialog()
            .setTitle("Bağlantı testi")
            .setMessage("Sınanıyor…")
            .setPositiveButton("Kapat", null)
            .showTracked()
        Thread {
            val lines = mutableListOf<String>()
            lines += if (online()) "Ağ bağlantısı: Tamam" else "Ağ bağlantısı: SORUN. TV bir ağa bağlı görünmüyor."
            lines += step("Sunucu adı ($host)") { "Tamam (${InetAddress.getByName(host).hostAddress})" }
            lines += step("Sunucu") {
                val (code, date) = httpGet("$server/api/health")
                val clock = date?.let { clockNote(it) } ?: ""
                (if (code in 200..299) "Tamam" else "SORUN. Yanıt kodu $code") + clock
            }
            lines += step("Genel internet") {
                val (code, _) = httpGet("https://www.google.com/generate_204")
                if (code in 200..399) "Tamam" else "SORUN. Yanıt kodu $code"
            }
            runOnUiThread { if (!isFinishing) box.setMessage(lines.joinToString("\n\n")) }
        }.start()
    }

    private fun step(label: String, run: () -> String): String =
        try {
            "$label: ${run()}"
        } catch (e: Exception) {
            "$label: SORUN. ${networkErrorText(e)}"
        }

    private fun httpGet(url: String): Pair<Int, String?> {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 8_000
        c.readTimeout = 8_000
        c.instanceFollowRedirects = false
        try {
            return c.responseCode to c.getHeaderField("Date")
        } finally {
            c.disconnect()
        }
    }

    /** TV saati sunucudan 5 dakikadan çok farklıysa güvenli bağlantı kurulamayabilir */
    private fun clockNote(httpDate: String): String =
        try {
            val server = SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss zzz", Locale.US).parse(httpDate)?.time ?: return ""
            val diffMin = Math.abs(System.currentTimeMillis() - server) / 60_000
            if (diffMin >= 5) "\nTV saati sunucudan $diffMin dakika farklı. TV ayarlarında tarih ve saati “Otomatik” yapın." else ""
        } catch (_: Exception) {
            ""
        }

    private fun networkErrorText(e: Exception): String = when (e) {
        is UnknownHostException -> "Ad çözülemedi (DNS). İnternet yok ya da okul ağı bu adresi engelliyor olabilir."
        is SSLException -> "Güvenli bağlantı kurulamadı. Okul ağı (MEB) bağlantıyı kendi sertifikasıyla açıyor olabilir; o sertifika TV'ye yüklü olmalı. TV'nin tarih ve saati yanlışsa da bu hata görülür."
        is SocketTimeoutException -> "Zaman aşımı. Ağ çok yavaş ya da bağlantı engelleniyor."
        is ConnectException -> "Bağlantı reddedildi."
        else -> e.message ?: e.javaClass.simpleName
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
        // İzin ekranında geçen süre panoya geri dönüşü tetiklemesin
        Prefs.setReturnPausedUntil(this, System.currentTimeMillis() + 10 * 60_000L)
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
        /** Panodan çıkıldıktan sonra geri gelme süresi */
        private const val RETURN_MS = 2 * 60_000L
        /** Gizli ayarlardan TV ayarları açılınca geri dönüş bu kadar bekler */
        private const val MAINTENANCE_MS = 15 * 60_000L
        private const val RETURN_REQUEST = 41
        private const val RENDER_JS = "(function(){var r=document.getElementById('root');return !!(r&&r.childElementCount>0)})()"
        private const val SSL_TEXT = "Güvenli bağlantı kurulamadı. Okul ağı (MEB) bağlantıyı kendi sertifikasıyla açıyor olabilir; o sertifika TV'ye yüklü olmalı. TV'nin tarih ve saati yanlışsa da bu hata görülür (Ayarlar › Tarih ve saat › Otomatik)."
    }
}
