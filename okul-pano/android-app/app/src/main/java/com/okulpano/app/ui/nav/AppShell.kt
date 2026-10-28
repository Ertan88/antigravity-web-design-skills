package com.okulpano.app.ui.nav

import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.navigation.navDeepLink
import com.okulpano.app.data.AuthState
import com.okulpano.app.data.LocalApp
import com.okulpano.app.data.rememberQuery
import com.okulpano.app.ui.screens.AccountPasswordScreen
import com.okulpano.app.ui.screens.AccountProfileScreen
import com.okulpano.app.ui.screens.AnnouncementNewScreen
import com.okulpano.app.ui.screens.AnnouncementsScreen
import com.okulpano.app.ui.screens.ApprovalsScreen
import com.okulpano.app.ui.screens.AuditScreen
import com.okulpano.app.ui.screens.BirthdaysScreen
import com.okulpano.app.ui.screens.BoardRemoteScreen
import com.okulpano.app.ui.screens.BoardsScreen
import com.okulpano.app.ui.screens.CalendarExportScreen
import com.okulpano.app.ui.screens.ContentScreen
import com.okulpano.app.ui.screens.DutiesScreen
import com.okulpano.app.ui.screens.EmergencyScreen
import com.okulpano.app.ui.screens.HolidaysScreen
import com.okulpano.app.ui.screens.HomeScreen
import com.okulpano.app.ui.screens.InboxScreen
import com.okulpano.app.ui.screens.LeaveNewScreen
import com.okulpano.app.ui.screens.LeavesScreen
import com.okulpano.app.ui.screens.MebCalendarScreen
import com.okulpano.app.ui.screens.MenuScreen
import com.okulpano.app.ui.screens.PairScreen
import com.okulpano.app.ui.screens.QrScreen
import com.okulpano.app.ui.screens.ScheduleFeedScreen
import com.okulpano.app.ui.screens.SchoolsScreen
import com.okulpano.app.ui.screens.SupportScreen
import com.okulpano.app.ui.screens.TimetableScreen
import com.okulpano.app.ui.screens.UpcomingScreen
import com.okulpano.app.ui.screens.UsersScreen
import com.okulpano.core.AppRole
import com.okulpano.core.ControlCenter
import com.okulpano.core.InboxPage

/** Oturum açıkken: role göre alt menü (NavigationBar) ve bütün ekranlar */
@Composable
fun AppShell(state: AuthState, nav: NavHostController = rememberNavController()) {
  val tabs = tabsFor(state)
  val backStack by nav.currentBackStackEntryAsState()
  val current = backStack?.destination?.route
  val showBar = tabs.any { it.route == current }
  val counts = rememberBadgeCounts(state)

  CompositionLocalProvider(LocalNav provides nav) {
    Scaffold(
      bottomBar = {
        if (showBar) {
          NavigationBar {
            tabs.forEach { tab ->
              val selected = current == tab.route
              val badge = when (tab.route) {
                R.APPROVALS -> counts.first
                R.INBOX_TAB -> counts.second
                else -> 0
              }
              NavigationBarItem(
                selected = selected,
                onClick = {
                  nav.navigate(tab.route) {
                    popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                    launchSingleTop = true
                    restoreState = true
                  }
                },
                icon = {
                  BadgedBox(badge = { if (badge > 0) Badge { Text(if (badge > 99) "99+" else "$badge") } }) {
                    Icon(if (selected) tab.selectedIcon else tab.icon, contentDescription = null)
                  }
                },
                label = { Text(tab.label, maxLines = 1) },
                colors = if (tab.danger) {
                  NavigationBarItemDefaults.colors(
                    selectedIconColor = MaterialTheme.colorScheme.onErrorContainer,
                    selectedTextColor = MaterialTheme.colorScheme.error,
                    indicatorColor = MaterialTheme.colorScheme.errorContainer,
                    unselectedIconColor = MaterialTheme.colorScheme.error,
                    unselectedTextColor = MaterialTheme.colorScheme.error,
                  )
                } else {
                  NavigationBarItemDefaults.colors()
                },
              )
            }
          }
        }
      },
    ) { padding ->
      NavHost(nav, startDestination = R.HOME, modifier = Modifier.padding(bottom = padding.calculateBottomPadding()).consumeWindowInsets(padding)) {
        composable(R.HOME) { HomeScreen() }
        composable(R.SCHOOLS) { SchoolsScreen() }
        composable(R.MEB) { MebCalendarScreen() }
        composable(R.APPROVALS) { ApprovalsScreen() }
        composable(R.ANNOUNCEMENTS) { AnnouncementsScreen() }
        composable(R.BOARDS) { BoardsScreen() }
        composable(R.DUTIES) { DutiesScreen() }
        composable(R.LEAVES) { LeavesScreen() }
        composable(R.EMERGENCY) { EmergencyScreen() }
        composable(R.INBOX_TAB) { InboxScreen(back = false) }
        composable(R.MENU) { MenuScreen() }

        composable(R.INBOX) { InboxScreen(back = true) }
        composable(R.LEAVE_NEW) { LeaveNewScreen() }
        composable(R.ANNOUNCEMENT_NEW) { AnnouncementNewScreen() }
        composable(R.SCHEDULE_FEED) { ScheduleFeedScreen() }
        composable(R.BOARD, listOf(navArgument("id") { type = NavType.StringType })) { BoardRemoteScreen(it.arguments?.getString("id").orEmpty()) }
        composable(R.USERS) { UsersScreen() }
        composable(R.SUPPORT) { SupportScreen() }
        composable(R.HOLIDAYS) { HolidaysScreen() }
        composable(R.AUDIT) { AuditScreen() }
        composable(
          R.CONTENT,
          listOf(navArgument("tur") { type = NavType.StringType }, navArgument("yeni") { type = NavType.IntType; defaultValue = 0 }),
        ) { ContentScreen(it.arguments?.getString("tur").orEmpty(), (it.arguments?.getInt("yeni") ?: 0) == 1) }
        composable(R.BIRTHDAYS) { BirthdaysScreen() }
        composable(R.UPCOMING) { UpcomingScreen() }
        composable(R.TIMETABLE) { TimetableScreen() }
        composable(R.CALENDAR_EXPORT) { CalendarExportScreen() }
        composable(R.PROFILE) { AccountProfileScreen() }
        composable(R.PASSWORD) { AccountPasswordScreen() }
        composable(R.QR) { QrScreen() }
        composable(
          R.PAIR,
          listOf(navArgument("kod") { type = NavType.StringType }),
          deepLinks = listOf(navDeepLink { uriPattern = "okulpano://eslestir/{kod}" }),
        ) { PairScreen(it.arguments?.getString("kod").orEmpty()) }
      }
    }
  }
}

/** Alt menü rozetleri: onay bekleyenler (yönetici) ve okunmamış bildirimler */
@Composable
private fun rememberBadgeCounts(state: AuthState): Pair<Int, Int> {
  val manager = state.isManager && state.role != AppRole.Platform
  val center = rememberQuery(state.path("control-center"), enabled = manager, pollMs = 60_000) { get<ControlCenter>(state.path("control-center")) }
  val inboxPath = if (state.school != null) state.path("inbox?filter=unread&limit=50") else "/api/me/inbox?filter=unread&limit=50"
  val inbox = rememberQuery(inboxPath, pollMs = 60_000) { get<InboxPage>(inboxPath) }
  return (center.data?.pending?.total ?: 0) to (inbox.data?.unread ?: 0)
}

/** Ekranlar arası geçiş kısayolu */
fun NavHostController.go(route: String) = navigate(route) { launchSingleTop = true }

@Composable
fun authState(): AuthState {
  val app = LocalApp.current
  val s by app.auth.state.collectAsStateCompat()
  return s
}
