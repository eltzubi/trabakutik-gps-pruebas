plugins { id("com.android.application") }
android {
 namespace = "com.trabakutik.gps"
 compileSdk = 35
 defaultConfig { applicationId = "com.trabakutik.gps"; minSdk = 26; targetSdk = 35; versionCode = 68; versionName = "4.9.19" }
 compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
}

// La unica dependencia del proyecto, y entra solo por el FileProvider: es el
// que espera cualquier app que reciba un GPX por la hoja de compartir.
dependencies { implementation("androidx.core:core:1.13.1") }
