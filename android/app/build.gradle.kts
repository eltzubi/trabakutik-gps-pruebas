plugins { id("com.android.application") }
android {
 namespace = "com.trabakutik.gps"
 compileSdk = 35
 defaultConfig { applicationId = "com.trabakutik.gps"; minSdk = 26; targetSdk = 35; versionCode = 71; versionName = "4.9.22" }
 compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
 // SIEMPRE LA MISMA FIRMA. Sin esto cada APK salia con la llave de depuracion
 // que se inventa cada maquina nueva de GitHub, y Android no deja instalar
 // encima una app firmada con otra llave: habia que desinstalar en cada
 // version, y desinstalar borra las grabaciones. La llave la crea el flujo la
 // primera vez con el secreto FIRMA_CLAVE y la deja en android/firma/; sin la
 // contraseña no sirve de nada. Sin secreto (una PR, o compilando en casa) se
 // firma como antes, y ese APK no se publica: el flujo lo comprueba.
 val llaveFija = rootProject.file("firma/trabakutik.p12")
 val claveFirma = System.getenv("FIRMA_CLAVE")
 if (llaveFija.exists() && !claveFirma.isNullOrEmpty()) {
  signingConfigs {
   create("fija") {
    storeFile = llaveFija; storeType = "pkcs12"; storePassword = claveFirma
    keyAlias = "trabakutik"; keyPassword = claveFirma
   }
  }
  buildTypes { getByName("debug") { signingConfig = signingConfigs.getByName("fija") } }
 }
}

// La unica dependencia del proyecto, y entra solo por el FileProvider: es el
// que espera cualquier app que reciba un GPX por la hoja de compartir.
dependencies { implementation("androidx.core:core:1.13.1") }
