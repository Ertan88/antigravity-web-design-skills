package com.okulpano.app.platform

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.okulpano.app.MainActivity
import com.okulpano.app.R
import com.okulpano.core.MeToday
import com.okulpano.core.periodsFor
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

private const val CHANNEL = "nobet"
private const val MAX = 7

/**
 * Nöbet hatırlatmaları telefonda yerel olarak kurulur (sunucu gerekmez): nöbet günü ilk dersten 15 dakika önce
 * "Bugün nöbetçisiniz" bildirimi. Her açılışta bu haftanın nöbetlerine göre yeniden kurulur.
 */
object DutyReminders {
  fun schedule(context: Context, data: MeToday) {
    if (data.teacher == null) return
    val alarms = context.getSystemService(AlarmManager::class.java) ?: return
    // Önceki hatırlatmaları sil
    (0 until MAX).forEach { i -> pending(context, i, null)?.let(alarms::cancel) }
    val zone = ZoneId.of(data.timezone)
    val now = System.currentTimeMillis()
    data.week.filter { d -> d.holiday == null && d.duties.any { it.coveredBy == null } }.take(MAX).forEachIndexed { i, d ->
      val date = LocalDate.parse(d.date)
      val first = periodsFor(data, date).firstOrNull() ?: return@forEachIndexed
      val at = date.atTime(LocalTime.parse(first.start)).minusMinutes(15).atZone(zone).toInstant().toEpochMilli()
      if (at <= now) return@forEachIndexed
      val area = d.duties.first { it.coveredBy == null }.area
      pending(context, i, area)?.let { alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, it) }
    }
  }

  private fun pending(context: Context, slot: Int, area: String?): PendingIntent? {
    val intent = Intent(context, DutyReminderReceiver::class.java).putExtra("area", area)
    val flags = PendingIntent.FLAG_IMMUTABLE or if (area == null) PendingIntent.FLAG_NO_CREATE else PendingIntent.FLAG_UPDATE_CURRENT
    return PendingIntent.getBroadcast(context, 7000 + slot, intent, flags)
  }

  fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < 26) return
    val nm = context.getSystemService(NotificationManager::class.java)
    nm.createNotificationChannel(NotificationChannel(CHANNEL, "Nöbet hatırlatmaları", NotificationManager.IMPORTANCE_HIGH))
  }

  fun canNotify(context: Context) = Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

  fun show(context: Context, area: String) {
    if (!canNotify(context)) return
    ensureChannel(context)
    val open = PendingIntent.getActivity(context, 0, Intent(context, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
    val n = NotificationCompat.Builder(context, CHANNEL)
      .setSmallIcon(R.drawable.ic_notification)
      .setContentTitle("Bugün nöbetçisiniz")
      .setContentText("$area · teneffüslerde")
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setContentIntent(open)
      .setAutoCancel(true)
      .build()
    runCatching { NotificationManagerCompat.from(context).notify(area.hashCode(), n) }
  }
}

class DutyReminderReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    DutyReminders.show(context, intent.getStringExtra("area") ?: return)
  }
}
