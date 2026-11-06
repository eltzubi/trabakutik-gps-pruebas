plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}
android {
 namespace = "com.trabakutik.gps"
 compileSdk = 36
 defaultConfig { applicationId = "com.trabakutik.gps"; minSdk = 26; targetSdk = 36; versionCode = 48; versionName = "4.8" }
 compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
 buildTypes {
  getByName("release") {
   // Mantener desactivada la reduccion hasta completar pruebas de WebView y del puente JS.
   isMinifyEnabled = false
   proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
  }
 }
}

// AndroidX Core permite compartir GPX mediante FileProvider.
// JUnit ejecuta pruebas locales sin necesidad de dispositivo conectado.
dependencies {
    implementation("androidx.core:core:1.13.1")
    testImplementation("junit:junit:4.13.2")
}
