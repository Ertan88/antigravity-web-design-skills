// Okul Yayın · yerel Android uygulaması (Kotlin + Jetpack Compose, Material Design 3)
pluginManagement {
  repositories {
    google()
    mavenCentral()
    gradlePluginPortal()
  }
}
dependencyResolutionManagement {
  repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
  repositories {
    google()
    mavenCentral()
  }
}
rootProject.name = "okul-yayin"
// Android'den bağımsız çekirdek (modeller, zil hesabı, API istemcisi): kendi başına da derlenip test edilir
includeBuild("core")
include(":app")
