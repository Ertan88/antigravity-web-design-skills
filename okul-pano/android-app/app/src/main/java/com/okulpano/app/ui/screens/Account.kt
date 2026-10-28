package com.okulpano.app.ui.screens

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.okulpano.app.data.LocalApp
import com.okulpano.app.ui.components.AppScaffold
import com.okulpano.app.ui.components.Field
import com.okulpano.app.ui.components.rememberRunner
import com.okulpano.app.ui.components.rememberSnackbar
import com.okulpano.app.ui.nav.LocalNav
import com.okulpano.app.ui.nav.authState
import com.okulpano.core.body

/** Alttaki sabit ana düğme */
@Composable
fun BottomAction(label: String, enabled: Boolean, onClick: () -> Unit) {
  Surface(tonalElevation = 3.dp) {
    Button(onClick = onClick, enabled = enabled, modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(16.dp).height(52.dp)) { Text(label) }
  }
}

/** Profil bilgilerim: ad soyad ve e-posta. E-posta değişikliği mevcut şifreyle onaylanır. */
@Composable
fun AccountProfileScreen() {
  val state = authState()
  val app = LocalApp.current
  val nav = LocalNav.current
  val snackbar = rememberSnackbar()
  val run = rememberRunner(snackbar)
  var fullName by remember { mutableStateOf(state.me?.user?.fullName.orEmpty()) }
  var email by remember { mutableStateOf(state.me?.user?.email.orEmpty()) }
  var password by remember { mutableStateOf("") }
  val emailChanged = email.trim().lowercase() != state.me?.user?.email

  fun save() {
    if (fullName.trim().length < 2) {
      run.toast("Ad soyad en az 2 harf olmalı.")
      return
    }
    if (emailChanged && password.isEmpty()) {
      run.toast("E-postayı değiştirmek için mevcut şifrenizi girin.")
      return
    }
    run.run("save", if (emailChanged) "Kaydedildi. Bundan sonra yeni e-postanızla giriş yapın." else "Kaydedildi.") {
      app.api.send(
        "/api/me",
        "PATCH",
        if (emailChanged) body("fullName" to fullName.trim(), "email" to email.trim().lowercase(), "currentPassword" to password) else body("fullName" to fullName.trim()),
      )
      app.auth.reloadMe()
      password = ""
    }
  }

  AppScaffold(title = "Profil bilgilerim", onBack = { nav.popBackStack() }, snackbar = snackbar, bottomBar = { BottomAction("Kaydet", run.busy == null) { save() } }) {
    item { Field("Ad soyad", fullName, { fullName = it }, maxLength = 80) }
    item { Field("E-posta", email, { email = it }, help = "Girişte kullandığınız adres.", keyboard = KeyboardType.Email) }
    if (emailChanged) item { Field("Mevcut şifreniz", password, { password = it }, password = true, help = "Hesabınızın güvenliği için e-posta değişikliğini şifrenizle onaylayın.") }
  }
}

/** Şifre değiştir: diğer cihazlardaki oturumlar kapanır, bu telefon açık kalır */
@Composable
fun AccountPasswordScreen() {
  val app = LocalApp.current
  val nav = LocalNav.current
  val snackbar = rememberSnackbar()
  val run = rememberRunner(snackbar)
  var current by remember { mutableStateOf("") }
  var next by remember { mutableStateOf("") }
  var again by remember { mutableStateOf("") }

  fun save() {
    if (next.length < 8) {
      run.toast("Yeni şifre en az 8 karakter olmalı.")
      return
    }
    if (next != again) {
      run.toast("Yeni şifreler aynı değil.")
      return
    }
    run.run("save", "Şifreniz değişti. Diğer cihazlarda yeniden giriş yapmanız gerekecek.") {
      app.api.changePassword(current, next)
      current = ""
      next = ""
      again = ""
    }
  }

  AppScaffold(title = "Şifre değiştir", onBack = { nav.popBackStack() }, snackbar = snackbar, bottomBar = { BottomAction("Şifreyi değiştir", run.busy == null && current.isNotEmpty() && next.isNotEmpty()) { save() } }) {
    item { Field("Mevcut şifre", current, { current = it }, password = true) }
    item { Field("Yeni şifre", next, { next = it }, password = true, help = "En az 8 karakter; harf, rakam ve işaret karışık olursa daha güçlü olur.") }
    item { Field("Yeni şifre (tekrar)", again, { again = it }, password = true) }
  }
}
