package com.okulpano.app.ui.screens

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Undo
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.DoneAll
import androidx.compose.material.icons.outlined.Drafts
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.MarkEmailUnread
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.vector.ImageVector
import com.okulpano.app.data.LocalApp
import com.okulpano.app.data.rememberQuery
import com.okulpano.app.ui.components.AppScaffold
import com.okulpano.app.ui.components.EmptyCard
import com.okulpano.app.ui.components.ErrorCard
import com.okulpano.app.ui.components.GroupCard
import com.okulpano.app.ui.components.LoadingBox
import com.okulpano.app.ui.components.RowItem
import com.okulpano.app.ui.components.Segmented
import com.okulpano.app.ui.components.StatusBadge
import com.okulpano.app.ui.components.Tone
import com.okulpano.app.ui.components.rememberRunner
import com.okulpano.app.ui.components.rememberSnackbar
import com.okulpano.app.ui.nav.LocalNav
import com.okulpano.app.ui.nav.R
import com.okulpano.app.ui.nav.authState
import com.okulpano.app.ui.nav.go
import com.okulpano.core.InboxItem
import com.okulpano.core.InboxPage
import com.okulpano.core.body
import com.okulpano.core.timeAgo

/** Paneldeki adresleri uygulamadaki ekranlara çevirir */
private val ROUTES = mapOf(
  "approval" to R.APPROVALS,
  "leave-request" to R.APPROVALS,
  "returned" to R.ANNOUNCEMENTS,
  "approved" to R.ANNOUNCEMENTS,
  "duty-gap" to R.DUTIES,
  "month-student" to R.ANNOUNCEMENT_NEW,
  "support-access" to R.SCHOOLS,
  "support-revoked" to R.SCHOOLS,
  "support-expired" to R.SCHOOLS,
  "meb-calendar" to R.MEB,
  "bridge-day" to R.HOLIDAYS,
)

private val ICONS: Map<String, Pair<ImageVector, Tone>> = mapOf(
  "approval" to (Icons.Outlined.DoneAll to Tone.Primary),
  "leave-request" to (Icons.Outlined.CalendarMonth to Tone.Primary),
  "returned" to (Icons.AutoMirrored.Outlined.Undo to Tone.Danger),
  "approved" to (Icons.Outlined.CheckCircle to Tone.Success),
  "duty-gap" to (Icons.Outlined.Shield to Tone.Warning),
  "month-student" to (Icons.Outlined.Star to Tone.Gold),
  "bridge-day" to (Icons.Outlined.CalendarMonth to Tone.Warning),
  "support-access" to (Icons.Outlined.Key to Tone.Primary),
  "support-revoked" to (Icons.Outlined.Lock to Tone.Neutral),
  "support-expired" to (Icons.Outlined.Lock to Tone.Neutral),
  "meb-calendar" to (Icons.Outlined.CalendarMonth to Tone.Primary),
)

/**
 * Bildirimler: yeni olanlar ve okunanlar dahil geçmiş (panelle aynı kutu). Dokununca okundu sayılır ve ilgili ekran
 * açılır; zarf simgesi okundu / okunmadı yapar.
 */
@Composable
fun InboxScreen(back: Boolean) {
  val state = authState()
  val app = LocalApp.current
  val nav = LocalNav.current
  val snackbar = rememberSnackbar()
  val run = rememberRunner(snackbar)
  var filter by remember { mutableStateOf("all") }
  val path = if (state.school != null) state.path("inbox?filter=$filter&limit=50") else "/api/me/inbox?filter=$filter&limit=50"
  val inbox = rememberQuery(path, pollMs = 60_000) { get<InboxPage>(path) }
  val list = inbox.data?.items.orEmpty()
  val unread = inbox.data?.unread ?: 0

  fun refresh() = app.cache.invalidate("inbox")
  fun read(n: InboxItem) = run.run("r${n.id}") {
    app.api.send("/api/me/inbox/read", "POST", body("ids" to listOf(n.id)))
    refresh()
  }
  fun markUnread(n: InboxItem) = run.run("u${n.id}") {
    app.api.send("/api/me/inbox/${n.id}/unread", "POST")
    refresh()
  }

  AppScaffold(
    title = "Bildirimler",
    onBack = if (back) ({ nav.popBackStack() }) else null,
    refreshing = inbox.refreshing,
    onRefresh = inbox.refresh,
    snackbar = snackbar,
  ) {
    item { Segmented(listOf("all" to "Tümü", "unread" to if (unread > 0) "Okunmamış ($unread)" else "Okunmamış"), filter, { filter = it }) }
    if (unread > 0) {
      item {
        FilledTonalButton(onClick = {
          run.run("all") {
            app.api.send("/api/me/inbox/read", "POST", if (state.schoolId != null) body("all" to true, "schoolId" to state.schoolId) else body("all" to true))
            refresh()
          }
        }) {
          Icon(Icons.Outlined.DoneAll, null)
          Text("  Tümünü okundu say")
        }
      }
    }
    when {
      inbox.data == null && inbox.error != null -> item { ErrorCard(inbox.error!!, inbox.refresh) }
      inbox.data == null -> item { LoadingBox() }
      list.isEmpty() -> item {
        EmptyCard(Icons.Outlined.Notifications, if (filter == "unread") "Okunmamış bildirim yok" else "Henüz bildirim yok", "Onay bekleyen duyurular, düzeltme istekleri ve boş nöbetler burada birikir; okuduklarınız da saklanır.")
      }
      else -> item {
        GroupCard {
          list.forEachIndexed { i, n ->
            val (icon, t) = ICONS[n.kind] ?: (Icons.Outlined.Notifications to Tone.Neutral)
            val isNew = n.readAt == null
            Box(Modifier.fillMaxWidth().alpha(if (isNew) 1f else 0.72f)) {
              RowItem(
                title = if (isNew) "● ${n.title}" else n.title,
                subtitle = "${n.body} · ${timeAgo(n.at)}",
                icon = icon,
                t = t,
                trailing = {
                  if (n.resolvedAt != null) StatusBadge("Tamam", Tone.Success)
                  IconButton(onClick = { if (isNew) read(n) else markUnread(n) }) {
                    Icon(if (isNew) Icons.Outlined.Drafts else Icons.Outlined.MarkEmailUnread, if (isNew) "Okundu say" else "Okunmadı yap", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                  }
                },
                onClick = {
                  if (isNew) read(n)
                  ROUTES[n.kind]?.let { nav.go(it) }
                },
                divider = i < list.lastIndex,
              )
            }
          }
        }
      }
    }
  }
}
