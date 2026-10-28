package com.okulpano.app.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.okulpano.app.R
import com.okulpano.app.data.LocalApp
import com.okulpano.app.ui.components.ErrorCard
import kotlinx.coroutines.launch

/**
 * Giriş: panel hesabıyla, yalnızca e-posta ve şifre. Sunucu adresi derlemede verilir; kendi sunucusunu kuran okullar
 * "Farklı sunucu" ile değiştirebilir.
 */
@Composable
fun LoginScreen() {
  val app = LocalApp.current
  val scope = rememberCoroutineScope()
  var server by remember { mutableStateOf(app.store.server) }
  var editServer by remember { mutableStateOf(app.store.server.isBlank()) }
  var email by remember { mutableStateOf("") }
  var password by remember { mutableStateOf("") }
  var show by remember { mutableStateOf(false) }
  var busy by remember { mutableStateOf(false) }
  var error by remember { mutableStateOf<String?>(null) }

  fun submit() {
    if (busy) return
    error = null
    if (server.isBlank()) {
      editServer = true
      error = "Sunucu adresini yazın (Okulyayın panelini açtığınız adres)."
      return
    }
    busy = true
    scope.launch {
      try {
        app.auth.signIn(server, email, password)
      } catch (e: Exception) {
        error = e.message ?: "Giriş yapılamadı"
      } finally {
        busy = false
      }
    }
  }

  Box(
    Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surfaceContainerLowest).safeDrawingPadding().imePadding(),
    contentAlignment = Alignment.TopCenter,
  ) {
    Column(
      Modifier.widthIn(max = 480.dp).fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp, vertical = 32.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
      Box(Modifier.size(88.dp).clip(RoundedCornerShape(24.dp)).background(MaterialTheme.colorScheme.primary), contentAlignment = Alignment.Center) {
        Image(painterResource(R.drawable.ic_launcher_foreground), contentDescription = null, modifier = Modifier.size(132.dp))
      }
      Text(
        buildAnnotatedString {
          append("okul")
          withStyle(SpanStyle(color = MaterialTheme.colorScheme.tertiary)) { append("yayın") }
        },
        style = MaterialTheme.typography.displaySmall,
        fontWeight = FontWeight.ExtraBold,
      )
      Text(
        "Panel hesabınızla giriş yapın. Hesabınız yoksa okul yöneticinizden isteyin.",
        style = MaterialTheme.typography.bodyLarge,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        textAlign = TextAlign.Center,
      )
      Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
        modifier = Modifier.fillMaxWidth(),
      ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
          if (editServer) {
            OutlinedTextField(
              value = server,
              onValueChange = { server = it.trim() },
              label = { Text("Sunucu adresi") },
              placeholder = { Text("ör. pano.okulunuz.k12.tr") },
              supportingText = { Text("Okulyayın panelini açtığınız adres") },
              singleLine = true,
              keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Next),
              modifier = Modifier.fillMaxWidth(),
            )
          }
          OutlinedTextField(
            value = email,
            onValueChange = { email = it.trim() },
            label = { Text("E-posta") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
            modifier = Modifier.fillMaxWidth(),
          )
          OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Şifre") },
            singleLine = true,
            visualTransformation = if (show) VisualTransformation.None else PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Go),
            keyboardActions = KeyboardActions(onGo = { submit() }),
            trailingIcon = {
              IconButton(onClick = { show = !show }) {
                Icon(if (show) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility, contentDescription = if (show) "Şifreyi gizle" else "Şifreyi göster")
              }
            },
            modifier = Modifier.fillMaxWidth(),
          )
          if (error != null) ErrorCard(error!!)
          Button(onClick = { submit() }, enabled = !busy && email.isNotBlank() && password.isNotBlank(), modifier = Modifier.fillMaxWidth().height(52.dp)) {
            if (busy) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary) else Text("Giriş yap")
          }
        }
      }
      if (!editServer) {
        TextButton(onClick = { editServer = true }) { Text("Farklı sunucu: ${server.removePrefix("https://")}") }
      }
    }
  }
}
