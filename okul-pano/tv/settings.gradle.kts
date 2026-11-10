// Okul Yayın Pano: TV'de panoyu tam ekran açan küçük Android TV uygulaması
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
rootProject.name = "okul-yayin-pano"
include(":app")
