package com.okulpano.app

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.navigation.NavHostController
import androidx.navigation.compose.rememberNavController
import androidx.test.core.app.ApplicationProvider
import com.github.takahirom.roborazzi.captureRoboImage
import com.okulpano.app.data.AppContainer
import com.okulpano.app.data.AuthState
import com.okulpano.app.data.AuthStatus
import com.okulpano.app.data.LocalApp
import com.okulpano.app.ui.nav.AppShell
import com.okulpano.app.ui.nav.LocalNow
import com.okulpano.app.ui.nav.R
import com.okulpano.app.ui.screens.LoginScreen
import com.okulpano.app.ui.theme.OkulTheme
import com.okulpano.core.Me
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.GraphicsMode

/**
 * Ekran görüntüleri (Roborazzi): her rolün ana ekranları açık ve koyu temada, örnek verilerle çizilir.
 * Sunucuya bağlanılmaz; veriler önbelleğe önceden konur. Görüntüler build/outputs/roborazzi altına yazılır.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ScreenshotTest {
  @get:Rule val compose = createComposeRule()

  private val app get() = ApplicationProvider.getApplicationContext<OkulApp>().container

  private fun prime(c: AppContainer) {
    val p = "/api/schools/${Fixtures.SCHOOL}"
    c.store.server = "http://127.0.0.1:9"
    c.cache.put("$p/me/today", Fixtures.today)
    c.cache.put("$p/control-center", Fixtures.center)
    c.cache.put("$p/inbox?filter=unread&limit=50", Fixtures.inbox)
    c.cache.put("$p/inbox?filter=all&limit=50", Fixtures.inbox)
    c.cache.put("/api/me/inbox?filter=unread&limit=50", Fixtures.inbox.copy(unread = 1))
    c.cache.put("$p/screens", Fixtures.boards)
    c.cache.put("$p/announcements", Fixtures.announcements)
    c.cache.put("$p/leaves", Fixtures.leaves)
    c.cache.put("$p/teachers", Fixtures.teachers)
    c.cache.put("$p/me/leaves", Fixtures.myLeaves)
    c.cache.put("$p/duty-day?date=${Fixtures.TODAY}", Fixtures.dutyDay)
    c.cache.put("$p/members", Fixtures.members)
    c.cache.put("/api/platform/schools", Fixtures.schools)
    c.cache.put("/api/platform/signups", Fixtures.signups)
    c.cache.put("/api/platform/academic-calendars", emptyList<com.okulpano.core.CalendarRow>())
  }

  private fun shoot(name: String, me: Me, route: String? = null, platformMode: Boolean = false, emergency: Boolean = false) {
    val c = app
    prime(c)
    if (emergency) c.cache.put("/api/schools/${Fixtures.SCHOOL}/control-center", Fixtures.emergency)
    val state = AuthState(AuthStatus.SignedIn, me, me.schools.firstOrNull()?.id, platformMode, c.store.server)
    c.auth.setForPreview(state)
    val dark = mutableStateOf(false)
    lateinit var nav: NavHostController
    compose.setContent {
      OkulTheme(darkTheme = dark.value) {
        CompositionLocalProvider(LocalApp provides c, LocalNow provides { Fixtures.NOW }) {
          nav = rememberNavController()
          AppShell(state, nav)
        }
      }
    }
    if (route != null) compose.runOnIdle { nav.navigate(route) }
    compose.waitForIdle()
    compose.onRoot().captureRoboImage("build/outputs/roborazzi/$name-acik.png")
    dark.value = true
    compose.waitForIdle()
    compose.onRoot().captureRoboImage("build/outputs/roborazzi/$name-koyu.png")
  }

  private val teacher = Fixtures.me("teacher", teacher = true, permissions = listOf("announcements.manage"))
  private val owner = Fixtures.me("owner")
  private val editor = Fixtures.me("editor", permissions = listOf("announcements.manage", "highlights.manage", "ticker.manage", "board.control"))

  @Test fun login() {
    compose.setContent {
      OkulTheme { CompositionLocalProvider(LocalApp provides app) { LoginScreen() } }
    }
    compose.onRoot().captureRoboImage("build/outputs/roborazzi/00-giris.png")
  }

  @Test fun teacherHome() = shoot("01-ogretmen-bugun", teacher)
  @Test fun teacherDuties() = shoot("02-ogretmen-nobetim", teacher, R.DUTIES)
  @Test fun teacherLeaves() = shoot("03-ogretmen-izinlerim", teacher, R.LEAVES)
  @Test fun teacherMenu() = shoot("04-ogretmen-menu", teacher, R.MENU)
  @Test fun teacherAnnouncements() = shoot("05-ogretmen-duyurularim", teacher, R.ANNOUNCEMENTS)
  @Test fun timetable() = shoot("06-ders-programim", teacher, R.TIMETABLE)
  @Test fun ownerHome() = shoot("10-mudur-merkez", owner)
  @Test fun ownerApprovals() = shoot("11-mudur-onaylar", owner, R.APPROVALS)
  @Test fun ownerBoards() = shoot("12-mudur-panolar", owner, R.BOARDS)
  @Test fun ownerDuties() = shoot("13-mudur-nobet", owner, R.DUTIES)
  @Test fun ownerEmergency() = shoot("14-mudur-acil", owner, R.EMERGENCY)
  @Test fun ownerEmergencyActive() = shoot("15-mudur-acil-suruyor", owner, R.EMERGENCY, emergency = true)
  @Test fun ownerMenu() = shoot("16-mudur-menu", owner, R.MENU)
  @Test fun ownerUsers() = shoot("17-mudur-kullanicilar", owner, R.USERS)
  @Test fun newAnnouncement() = shoot("18-yeni-duyuru", owner, R.ANNOUNCEMENT_NEW)
  @Test fun scheduleFeed() = shoot("19-yayin-akisi", owner, R.SCHEDULE_FEED)
  @Test fun inbox() = shoot("20-bildirimler", owner, R.INBOX)
  @Test fun editorHome() = shoot("30-editor-icerik", editor)
  @Test fun platformHome() = shoot("40-platform", Fixtures.me("owner", superAdmin = true), platformMode = true)
  @Test fun platformSchools() = shoot("41-platform-okullar", Fixtures.me("owner", superAdmin = true), R.SCHOOLS, platformMode = true)
}
