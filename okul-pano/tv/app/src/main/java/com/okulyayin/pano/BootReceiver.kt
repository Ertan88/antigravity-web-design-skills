package com.okulyayin.pano

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * TV açılınca (ve uygulama güncellenince) panoyu başlatır. Android 10 ve sonrasında bunun için
 * "diğer uygulamaların üzerinde göster" izni ya da uygulamanın ana ekran yapılması gerekir; izin yoksa
 * Android başlatmayı sessizce engeller (kullanıcı TV'nin uygulama listesinden açar).
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (!Prefs.autostart(context)) return
        val start = Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
        try {
            context.startActivity(start)
        } catch (_: Exception) {
            // İzin yoksa Android engeller: yapılacak bir şey yok
        }
    }
}
