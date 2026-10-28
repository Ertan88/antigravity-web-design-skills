package com.okulpano.app.ui.screens

import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.PersonAdd
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material3.Button
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.okulpano.app.data.LocalApp
import com.okulpano.app.data.rememberQuery
import com.okulpano.app.ui.components.AppScaffold
import com.okulpano.app.ui.components.EmptyCard
import com.okulpano.app.ui.components.ErrorCard
import com.okulpano.app.ui.components.Field
import com.okulpano.app.ui.components.GroupCard
import com.okulpano.app.ui.components.Hint
import com.okulpano.app.ui.components.LoadingBox
import com.okulpano.app.ui.components.RowItem
import com.okulpano.app.ui.components.Runner
import com.okulpano.app.ui.components.SectionHeader
import com.okulpano.app.ui.components.Segmented
import com.okulpano.app.ui.components.StatusBadge
import com.okulpano.app.ui.components.SwitchRow
import com.okulpano.app.ui.components.Tone
import com.okulpano.app.ui.components.rememberConfirm
import com.okulpano.app.ui.components.rememberRunner
import com.okulpano.app.ui.components.rememberSnackbar
import com.okulpano.app.ui.nav.LocalNav
import com.okulpano.app.ui.nav.authState
import com.okulpano.core.AddMemberResult
import com.okulpano.core.AppRole
import com.okulpano.core.Member
import com.okulpano.core.Perm
import com.okulpano.core.ROLE_NAMES
import com.okulpano.core.body
import com.okulpano.core.timeAgo

/** Rol ve yetki seçimi: yönetici rolünü yalnızca okul sahibi verir */
@Composable
private fun RoleEditor(role: String, permissions: List<String>, onRole: (String) -> Unit, onPermissions: (List<String>) -> Unit, canAssignAdmin: Boolean) {
  Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
    if (canAssignAdmin) Segmented(listOf("editor" to "Editör · verilen yetkiler", "admin" to "Yönetici · her şey"), role, onRole)
    if (role == "editor") {
      Perm.GRANTABLE.forEach { p ->
        SwitchRow(Perm.LABELS_TR[p] ?: p, p in permissions, { on -> onPermissions(if (on) permissions + p else permissions - p) })
      }
    }
  }
}

/**
 * Kullanıcılar ve yetkiler: davet, editör ekleme ve yetki verme. Okul sahibi (müdür) yönetici de atar; yönetici
 * yalnızca editör ekler ve yöneticileri değiştiremez.
 */
@Composable
fun UsersScreen() {
  val state = authState()
  val app = LocalApp.current
  val nav = LocalNav.current
  val snackbar = rememberSnackbar()
  val run = rememberRunner(snackbar)
  val confirm = rememberConfirm("Çıkar")
  val canManage = state.can(Perm.USERS)
  val members = rememberQuery(state.path("members"), enabled = canManage) { get<List<Member>>(state.path("members")) }
  var adding by remember { mutableStateOf(false) }
  var open by remember { mutableStateOf<String?>(null) }
  val isOwner = state.role == AppRole.Owner
  fun editable(m: Member) = m.userId != state.me?.user?.id && m.role != "owner" && (isOwner || m.role != "admin")

  AppScaffold(
    title = "Kullanıcılar ve yetkiler",
    onBack = { nav.popBackStack() },
    refreshing = members.refreshing,
    onRefresh = members.refresh,
    snackbar = snackbar,
    floatingActionButton = {
      if (canManage && !adding) ExtendedFloatingActionButton(onClick = { adding = true }, icon = { Icon(Icons.Outlined.PersonAdd, null) }, text = { Text("Kullanıcı ekle") })
    },
  ) {
    if (!canManage) {
      item { EmptyCard(Icons.Outlined.Lock, "Bu ekran için yetkiniz yok") }
      return@AppScaffold
    }
    if (adding) item { AddMember(isOwner, run) { adding = false } }
    val list = members.data
    when {
      list == null && members.error != null -> item { ErrorCard(members.error!!, members.refresh) }
      list == null -> item { LoadingBox() }
      else -> item {
        GroupCard {
          list.forEachIndexed { i, m ->
            RowItem(
              m.fullName,
              listOfNotNull(m.email, m.teacherName?.let { "öğretmen: $it" }, if (m.invitePending) "davet bekliyor" else m.lastLoginAt?.let { "son giriş ${timeAgo(it)}" } ?: "hiç girmedi").joinToString(" · "),
              when (m.role) {
                "owner" -> Icons.Outlined.Star
                "admin" -> Icons.Outlined.Shield
                else -> Icons.Outlined.Person
              },
              if (m.role == "editor") Tone.Neutral else Tone.Primary,
              trailing = { StatusBadge(ROLE_NAMES[m.role] ?: m.role, if (m.role == "editor") Tone.Neutral else Tone.Primary) },
              onClick = if (editable(m)) ({ open = if (open == m.id) null else m.id }) else null,
              divider = i < list.lastIndex && open != m.id,
            )
            if (open == m.id) {
              EditMember(m, isOwner, run, onRemove = {
                confirm.ask("Kullanıcı okuldan çıkarılsın mı?", "${m.fullName} artık bu okula giriş yapamaz.") {
                  run.run("del", "${m.fullName} çıkarıldı") {
                    app.api.send(state.path("members/${m.id}"), "DELETE")
                    app.cache.invalidate("members")
                    open = null
                  }
                }
              }) { open = null }
              if (i < list.lastIndex) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            }
          }
        }
      }
    }
    item {
      Hint(
        (if (isOwner) "Yönetici atamayı yalnızca okul sahibi yapar." else "Yöneticileri yalnızca okul sahibi (müdür) atar ve değiştirir.") +
          " Öğretmen eşleştirmesi ve şifre sıfırlama yönetim panelindedir.",
      )
    }
  }
}

@Composable
private fun EditMember(m: Member, isOwner: Boolean, run: Runner, onRemove: () -> Unit, onDone: () -> Unit) {
  val state = authState()
  val app = LocalApp.current
  var role by remember { mutableStateOf(if (m.role == "admin") "admin" else "editor") }
  var permissions by remember { mutableStateOf(m.permissions) }
  Column(Modifier.padding(horizontal = 8.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
    RoleEditor(role, permissions, { role = it }, { permissions = it }, isOwner)
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(horizontal = 8.dp)) {
      Button(
        onClick = {
          run.run("save", "Yetkiler kaydedildi") {
            app.api.send(state.path("members/${m.id}"), "PATCH", body("role" to role, "permissions" to if (role == "editor") permissions else emptyList<String>()))
            app.cache.invalidate("members")
            onDone()
          }
        },
        enabled = run.busy == null,
        modifier = Modifier.weight(1f),
      ) { Text("Kaydet") }
      OutlinedButton(onClick = onRemove, enabled = run.busy == null) {
        Icon(Icons.Outlined.Delete, null)
        Text(" Çıkar")
      }
    }
  }
}

@Composable
private fun AddMember(isOwner: Boolean, run: Runner, onClose: () -> Unit) {
  val state = authState()
  val app = LocalApp.current
  val context = LocalContext.current
  var fullName by remember { mutableStateOf("") }
  var email by remember { mutableStateOf("") }
  var role by remember { mutableStateOf("editor") }
  var permissions by remember { mutableStateOf(listOf(Perm.ANNOUNCEMENTS)) }
  var result by remember { mutableStateOf<String?>(null) }
  var inviteUrl by remember { mutableStateOf<String?>(null) }
  GroupCard {
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
      SectionHeader("Yeni kullanıcı")
      if (result != null) {
        Text(result!!, style = MaterialTheme.typography.bodyLarge)
        inviteUrl?.let { url ->
          OutlinedButton(onClick = {
            val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, "${fullName.trim()}, Okulyayın davetiniz: $url")
            context.startActivity(Intent.createChooser(send, "Davet bağlantısını paylaş"))
          }) {
            Icon(Icons.Outlined.Share, null)
            Text("  Davet bağlantısını paylaş")
          }
        }
        Button(onClick = onClose) { Text("Tamam") }
        return@Column
      }
      Field("Ad soyad", fullName, { fullName = it }, maxLength = 80)
      Field("E-posta", email, { email = it }, help = "Kişiye davet gider, şifresini kendisi belirler.", keyboard = KeyboardType.Email)
      RoleEditor(role, permissions, { role = it }, { permissions = it }, isOwner)
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Button(
          onClick = {
            run.run("add") {
              val r: AddMemberResult = app.api.post(
                state.path("members"),
                body("fullName" to fullName.trim(), "email" to email.trim().lowercase(), "role" to role, "permissions" to if (role == "editor") permissions else emptyList<String>(), "invite" to true),
              )
              app.cache.invalidate("members")
              inviteUrl = r.invite?.takeIf { !it.emailed }?.inviteUrl
              result = when {
                r.existingUser -> "Kişinin hesabı zaten vardı: kendi şifresiyle bu okula da girebilir."
                r.invite?.emailed == true -> "Davet e-postası gönderildi."
                else -> "Kullanıcı eklendi. E-posta gönderilemedi; davet bağlantısını paylaşın."
              }
            }
          },
          enabled = run.busy == null && fullName.trim().length >= 2 && "@" in email,
          modifier = Modifier.weight(1f),
        ) {
          Icon(Icons.AutoMirrored.Outlined.Send, null)
          Text("  Davet gönder")
        }
        TextButton(onClick = onClose) { Text("Vazgeç") }
      }
    }
  }
}
