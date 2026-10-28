// Okul Yayın çekirdeği: Android'den bağımsız modeller, zil / okul günü hesabı ve API istemcisi.
// Kendi başına derlenip test edilir (`gradle -p core test`); Android uygulaması bunu composite build olarak kullanır.
pluginManagement {
  repositories {
    gradlePluginPortal()
    mavenCentral()
  }
}
dependencyResolutionManagement {
  repositories {
    mavenCentral()
  }
}
rootProject.name = "core"
