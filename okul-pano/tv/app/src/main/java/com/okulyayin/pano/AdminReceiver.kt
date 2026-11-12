package com.okulyayin.pano

import android.app.admin.DeviceAdminReceiver

/**
 * Kiosk modu: TV bir bilgisayardan bir kez bu uygulamanın "cihaz sahibi" yapılınca
 * (adb shell dpm set-device-owner com.okulyayin.pano/.AdminReceiver) pano kilitli görev modunda açılır;
 * Ana ekran ve son uygulamalar tuşları panodan çıkaramaz. Kapatmak gizli ayarlardan (şifreyle) yapılır.
 */
class AdminReceiver : DeviceAdminReceiver()
