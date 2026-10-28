plugins {
  id("com.android.application") version "9.2.1" apply false
  // AGP 9 Kotlin'i kendisi derler; burada yalnızca Kotlin sürümü (çekirdek modülle aynı) ve Compose derleyicisi seçilir
  id("org.jetbrains.kotlin.android") version "2.4.21" apply false
  id("org.jetbrains.kotlin.plugin.compose") version "2.4.21" apply false
}
