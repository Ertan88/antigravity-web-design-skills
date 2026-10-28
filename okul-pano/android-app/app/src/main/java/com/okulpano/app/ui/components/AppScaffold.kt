package com.okulpano.app.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

/**
 * Bütün ekranların iskeleti (M3): üstte TopAppBar, içerikte kaydırılabilir kart listesi, aşağı çekince yenileme.
 * Sekme kök ekranlarında büyük ve kaydırınca küçülen başlık (LargeTopAppBar), alt ekranlarda geri düğmeli
 * küçük başlık kullanılır. Alt menü (NavigationBar) dıştaki uygulama iskeletindedir.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppScaffold(
  title: String,
  subtitle: String? = null,
  onBack: (() -> Unit)? = null,
  actions: @Composable RowScope.() -> Unit = {},
  refreshing: Boolean = false,
  onRefresh: (() -> Unit)? = null,
  snackbar: SnackbarHostState? = null,
  floatingActionButton: @Composable () -> Unit = {},
  bottomBar: @Composable () -> Unit = {},
  containerColor: androidx.compose.ui.graphics.Color = MaterialTheme.colorScheme.surface,
  content: LazyListScope.() -> Unit,
) {
  val large = onBack == null
  val scroll = if (large) TopAppBarDefaults.exitUntilCollapsedScrollBehavior() else TopAppBarDefaults.pinnedScrollBehavior()
  val titleContent: @Composable () -> Unit = {
    Column {
      Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis)
      if (subtitle != null) {
        Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
      }
    }
  }
  val navIcon: @Composable () -> Unit = {
    if (onBack != null) {
      IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Geri") }
    }
  }
  Scaffold(
    modifier = Modifier.nestedScroll(scroll.nestedScrollConnection),
    containerColor = containerColor,
    topBar = {
      val colors = TopAppBarDefaults.topAppBarColors(containerColor = containerColor, scrolledContainerColor = MaterialTheme.colorScheme.surfaceContainer)
      if (large) LargeTopAppBar(title = titleContent, actions = actions, scrollBehavior = scroll, colors = TopAppBarDefaults.largeTopAppBarColors(containerColor = containerColor, scrolledContainerColor = MaterialTheme.colorScheme.surfaceContainer))
      else TopAppBar(title = titleContent, navigationIcon = navIcon, actions = actions, scrollBehavior = scroll, colors = colors)
    },
    snackbarHost = { if (snackbar != null) SnackbarHost(snackbar) },
    floatingActionButton = floatingActionButton,
    bottomBar = bottomBar,
  ) { padding ->
    val list: @Composable () -> Unit = {
      LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 32.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        content = content,
      )
    }
    if (onRefresh != null) {
      PullToRefreshBox(isRefreshing = refreshing, onRefresh = onRefresh, modifier = Modifier.padding(padding).fillMaxSize()) { list() }
    } else {
      androidx.compose.foundation.layout.Box(Modifier.padding(padding).fillMaxSize()) { list() }
    }
  }
}

/** Ekranın anlık mesajları için (işlem tamam, hata…) */
@Composable
fun rememberSnackbar() = remember { SnackbarHostState() }
