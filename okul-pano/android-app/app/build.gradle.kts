plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.plugin.compose")
}

android {
  namespace = "com.okulpano.app"
  compileSdk = 37

  defaultConfig {
    // Expo uygulamasıyla aynı paket ve imza: telefondaki uygulamanın üzerine güncelleme olarak kurulur
    applicationId = "com.okulpano.app"
    minSdk = 26
    targetSdk = 36
    versionCode = (System.getenv("VERSION_CODE") ?: "100").toInt()
    versionName = "2.0"
    // Uygulamanın bağlandığı sunucu (girişte "Farklı sunucu" ile değiştirilebilir)
    buildConfigField("String", "DEFAULT_SERVER", "\"${System.getenv("API_URL") ?: "https://okul-pano.onrender.com"}\"")
  }

  signingConfigs {
    // Deneme dağıtımı için sabit anahtar (Expo şablonunun hata ayıklama anahtarı). Mağaza sürümü için
    // RELEASE_KEYSTORE ortam değişkenleriyle gerçek anahtar verilmelidir.
    getByName("debug") {
      storeFile = file("debug.keystore")
      storePassword = "android"
      keyAlias = "androiddebugkey"
      keyPassword = "android"
    }
    create("release") {
      val ks = System.getenv("RELEASE_KEYSTORE")
      if (ks != null) {
        storeFile = file(ks)
        storePassword = System.getenv("RELEASE_KEYSTORE_PASSWORD")
        keyAlias = System.getenv("RELEASE_KEY_ALIAS")
        keyPassword = System.getenv("RELEASE_KEY_PASSWORD")
      } else {
        storeFile = file("debug.keystore")
        storePassword = "android"
        keyAlias = "androiddebugkey"
        keyPassword = "android"
      }
    }
  }

  buildTypes {
    release {
      isMinifyEnabled = false
      signingConfig = signingConfigs.getByName("release")
    }
  }

  buildFeatures {
    compose = true
    buildConfig = true
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }

  testOptions {
    unitTests {
      isIncludeAndroidResources = true
      all {
        // Ekran görüntüsü testleri (Roborazzi): görüntüler build/outputs/roborazzi altına yazılır
        it.systemProperty("roborazzi.test.record", "true")
        it.systemProperty("robolectric.pixelCopyRenderMode", "hardware")
      }
    }
  }
}

dependencies {
  implementation("com.okulpano:core")

  val composeBom = platform("androidx.compose:compose-bom:2025.06.00")
  implementation(composeBom)
  implementation("androidx.compose.ui:ui")
  implementation("androidx.compose.ui:ui-tooling-preview")
  implementation("androidx.compose.material3:material3")
  implementation("androidx.compose.material:material-icons-extended")
  implementation("androidx.activity:activity-compose:1.10.1")
  implementation("androidx.navigation:navigation-compose:2.9.0")
  implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.1")
  implementation("androidx.core:core-ktx:1.16.0")
  implementation("androidx.core:core-splashscreen:1.0.1")
  implementation("io.coil-kt.coil3:coil-compose:3.2.0")
  implementation("io.coil-kt.coil3:coil-network-okhttp:3.2.0")
  // QR ile pano eşleştirme: kamera önizlemesi ve cihaz üzerinde QR okuma (internet gerekmez)
  implementation("androidx.camera:camera-camera2:1.4.2")
  implementation("androidx.camera:camera-lifecycle:1.4.2")
  implementation("androidx.camera:camera-view:1.4.2")
  implementation("com.google.mlkit:barcode-scanning:17.3.0")
  debugImplementation("androidx.compose.ui:ui-tooling")

  testImplementation(composeBom)
  testImplementation("junit:junit:4.13.2")
  testImplementation("org.robolectric:robolectric:4.16")
  testImplementation("io.github.takahirom.roborazzi:roborazzi:1.46.1")
  testImplementation("io.github.takahirom.roborazzi:roborazzi-compose:1.46.1")
  testImplementation("androidx.compose.ui:ui-test-junit4")
  testImplementation("androidx.test:core-ktx:1.6.1")
  testImplementation("androidx.test.ext:junit:1.2.1")
  debugImplementation("androidx.compose.ui:ui-test-manifest")
}
