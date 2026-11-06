plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}
android {
 namespace = "com.trabakutik.gps"
 compileSdk = 36
 defaultConfig { applicationId = "com.trabakutik.gps"; minSdk = 26; targetSdk = 36; versionCode = 48; versionName = "4.8" }
 compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
}

// La unica dependencia del proyecto, y entra solo por el FileProvider: es el
// que espera cualquier app que reciba un GPX por la hoja de compartir.
dependencies {
    implementation("androidx.core:core:1.13.1")
    testImplementation("junit:junit:4.13.2")
}
