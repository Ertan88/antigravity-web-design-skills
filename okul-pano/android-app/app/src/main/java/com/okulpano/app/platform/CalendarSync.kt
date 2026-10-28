package com.okulpano.app.platform

import android.content.ContentValues
import android.content.Context
import android.provider.CalendarContract
import android.provider.CalendarContract.Calendars
import android.provider.CalendarContract.Events
import android.provider.CalendarContract.Reminders
import java.time.Instant
import java.util.TimeZone

data class CalendarItem(val key: String, val title: String, val start: Instant, val end: Instant, val location: String? = null, val alarmMinutes: Int? = null)

private const val NAME = "Okul Yayın"
private const val MARK = "okulyayin:"

/**
 * Nöbetleri ve sınavları telefonun takvimine yazar. Kayıtlar ayrı bir "Okul Yayın" takviminde (telefonda yerel
 * hesap) durur; her eşitlemede o aralıktaki eski kayıtlar silinip yenileri yazılır, kişinin kendi kayıtlarına dokunulmaz.
 */
object CalendarSync {
  private fun calendarId(context: Context): Long {
    val cr = context.contentResolver
    cr.query(Calendars.CONTENT_URI, arrayOf(Calendars._ID), "${Calendars.ACCOUNT_NAME} = ? AND ${Calendars.ACCOUNT_TYPE} = ?", arrayOf(NAME, CalendarContract.ACCOUNT_TYPE_LOCAL), null)?.use {
      if (it.moveToFirst()) return it.getLong(0)
    }
    val uri = Calendars.CONTENT_URI.buildUpon()
      .appendQueryParameter(CalendarContract.CALLER_IS_SYNCADAPTER, "true")
      .appendQueryParameter(Calendars.ACCOUNT_NAME, NAME)
      .appendQueryParameter(Calendars.ACCOUNT_TYPE, CalendarContract.ACCOUNT_TYPE_LOCAL)
      .build()
    val values = ContentValues().apply {
      put(Calendars.ACCOUNT_NAME, NAME)
      put(Calendars.ACCOUNT_TYPE, CalendarContract.ACCOUNT_TYPE_LOCAL)
      put(Calendars.NAME, NAME)
      put(Calendars.CALENDAR_DISPLAY_NAME, NAME)
      put(Calendars.CALENDAR_COLOR, 0xFF0E5E66.toInt())
      put(Calendars.CALENDAR_ACCESS_LEVEL, Calendars.CAL_ACCESS_OWNER)
      put(Calendars.OWNER_ACCOUNT, NAME)
      put(Calendars.VISIBLE, 1)
      put(Calendars.SYNC_EVENTS, 1)
      put(Calendars.CALENDAR_TIME_ZONE, TimeZone.getDefault().id)
    }
    return cr.insert(uri, values)?.lastPathSegment?.toLong() ?: error("Takvim oluşturulamadı")
  }

  fun sync(context: Context, items: List<CalendarItem>, from: Instant, to: Instant): Int {
    val cr = context.contentResolver
    val id = calendarId(context)
    cr.delete(
      Events.CONTENT_URI,
      "${Events.CALENDAR_ID} = ? AND ${Events.DTSTART} >= ? AND ${Events.DTSTART} <= ? AND ${Events.DESCRIPTION} LIKE ?",
      arrayOf("$id", "${from.toEpochMilli()}", "${to.toEpochMilli()}", "%$MARK%"),
    )
    for (it in items) {
      val values = ContentValues().apply {
        put(Events.CALENDAR_ID, id)
        put(Events.TITLE, it.title)
        put(Events.DTSTART, it.start.toEpochMilli())
        put(Events.DTEND, it.end.toEpochMilli())
        put(Events.EVENT_TIMEZONE, TimeZone.getDefault().id)
        put(Events.DESCRIPTION, "Okul Yayın uygulamasından eklendi. $MARK${it.key}")
        it.location?.let { l -> put(Events.EVENT_LOCATION, l) }
        put(Events.HAS_ALARM, if (it.alarmMinutes != null) 1 else 0)
      }
      val eventId = cr.insert(Events.CONTENT_URI, values)?.lastPathSegment?.toLong() ?: continue
      it.alarmMinutes?.let { m ->
        cr.insert(Reminders.CONTENT_URI, ContentValues().apply {
          put(Reminders.EVENT_ID, eventId)
          put(Reminders.MINUTES, m)
          put(Reminders.METHOD, Reminders.METHOD_ALERT)
        })
      }
    }
    return items.size
  }
}
