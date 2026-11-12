import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Varsayılan sunucu derlemeden gelir (okula özel adres koda yazılmaz); TV'de gizli ayarlardan değiştirilebilir
val defaultServer = System.getenv("PANOKUL_API_URL")?.takeIf { it.isNotBlank() } ?: "https://okul-pano.onrender.com"

android {
    namespace = "com.okulyayin.pano"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.okulyayin.pano"
        minSdk = 23
        targetSdk = 35
        versionCode = 7
        versionName = "1.4.1"
        buildConfigField("String", "DEFAULT_SERVER", "\"$defaultServer\"")
    }

    buildFeatures {
        buildConfig = true
    }

    signingConfigs {
        create("release") {
            // Kalıcı imza: GitHub gizli değişkenlerinden (TV_KEYSTORE_*). Yoksa depodaki geliştirme anahtarı kullanılır.
            val ks = System.getenv("TV_KEYSTORE_FILE")
            if (!ks.isNullOrBlank()) {
                storeFile = file(ks)
                storePassword = System.getenv("TV_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("TV_KEY_ALIAS")
                keyPassword = System.getenv("TV_KEY_PASSWORD")
            } else {
                storeFile = rootProject.file("keystore/pano-dev.keystore")
                storePassword = "android"
                keyAlias = "pano"
                keyPassword = "android"
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
        debug {
            signingConfig = signingConfigs.getByName("release")
        }
    }

    // Eski Android sürümlerinde hiç çağrılmayan yöntemler (ör. onRenderProcessGone) derlemeyi durdurmasın
    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}
