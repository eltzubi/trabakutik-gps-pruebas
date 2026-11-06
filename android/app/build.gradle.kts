import org.gradle.api.tasks.testing.Test
import org.gradle.testing.jacoco.tasks.JacocoReport
import org.gradle.testing.jacoco.tasks.JacocoCoverageVerification

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jlleitschuh.gradle.ktlint")
    id("io.gitlab.arturbosch.detekt")
    jacoco
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

jacoco {
    toolVersion = "0.8.13"
}

tasks.withType<Test>().configureEach {
    finalizedBy("jacocoDebugReport")
}

val jacocoDebugReport by tasks.registering(JacocoReport::class) {
    dependsOn("testDebugUnitTest")
    reports {
        xml.required.set(true)
        html.required.set(true)
    }
    val javaClasses = fileTree(layout.buildDirectory.dir("intermediates/javac/debug/compileDebugJavaWithJavac/classes")) {
        exclude("**/R.class", "**/R$*.class", "**/BuildConfig.*")
    }
    val kotlinClasses = fileTree(layout.buildDirectory.dir("tmp/kotlin-classes/debug")) {
        exclude("**/R.class", "**/R$*.class", "**/BuildConfig.*")
    }
    classDirectories.setFrom(javaClasses, kotlinClasses)
    sourceDirectories.setFrom(files("src/main/java", "src/main/kotlin"))
    executionData.setFrom(fileTree(layout.buildDirectory) {
        include("**/*.exec")
    })
}

val jacocoCoverageVerification by tasks.registering(JacocoCoverageVerification::class) {
    dependsOn(jacocoDebugReport)
    classDirectories.setFrom(jacocoDebugReport.map { it.classDirectories })
    sourceDirectories.setFrom(jacocoDebugReport.map { it.sourceDirectories })
    executionData.setFrom(jacocoDebugReport.map { it.executionData })
    violationRules {
        rule {
            limit {
                counter = "LINE"
                value = "COVEREDRATIO"
                minimum = "0.90".toBigDecimal()
            }
        }
    }
}
