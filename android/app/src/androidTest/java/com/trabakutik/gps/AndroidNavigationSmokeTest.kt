package com.trabakutik.gps

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

@RunWith(AndroidJUnit4::class)
class AndroidNavigationSmokeTest {
    @Test
    fun manifestDeclaresRequiredLocationAndForegroundService() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val info =
            context.packageManager.getPackageInfo(
                context.packageName,
                PackageManager.GET_PERMISSIONS,
            )
        val permissions = info.requestedPermissions?.toSet().orEmpty()
        assertTrue(permissions.contains(Manifest.permission.ACCESS_FINE_LOCATION))
        assertTrue(permissions.contains(Manifest.permission.FOREGROUND_SERVICE))
        assertTrue(permissions.contains(Manifest.permission.FOREGROUND_SERVICE_LOCATION))
    }

    @Test
    fun launchAndRecreationDoNotFinishActivity() {
        ActivityScenario
            .launch<MainActivity>(
                Intent(
                    InstrumentationRegistry.getInstrumentation().targetContext,
                    MainActivity::class.java,
                ),
            ).use { scenario ->
                scenario.onActivity { activity ->
                    assertFalse(activity.isFinishing)
                    assertNotNull(activity.window.decorView)
                }
                scenario.recreate()
                scenario.onActivity { activity ->
                    assertFalse(activity.isFinishing)
                    assertEquals(InstrumentationRegistry.getInstrumentation().targetContext.packageName, activity.packageName)
                }
            }
    }

    @Test
    fun gpsTrackingServiceIsNotExternallyExported() {
        val context: Context = InstrumentationRegistry.getInstrumentation().targetContext
        val info =
            context.packageManager.getServiceInfo(
                android.content.ComponentName(context, TrackingService::class.java),
                0,
            )
        assertFalse(info.exported)
    }

    @Test
    fun damagedGpxIsClosedWithoutKeepingPartialPoint() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val file = File(context.cacheDir, "gpx-recovery-smoke.gpx")
        try {
            val lines =
                listOf(
                    "<?xml version=\"1.0\"?><gpx><trk><trkseg>",
                    "<trkpt lat=\"43.0\" lon=\"-2.0\"/>",
                    "<trkpt lat=\"43.00",
                )
            file.writeText(lines.joinToString("\n"))
            assertTrue(TrackingService.cierraGpxSiQuedoAbierto(file))
            val repaired = file.readText()
            assertTrue(repaired.contains("<trkpt lat=\"43.0\" lon=\"-2.0\"/>"))
            assertFalse(repaired.contains("<trkpt lat=\"43.00"))
            assertTrue(repaired.endsWith("</trkseg></trk></gpx>\n"))
            assertFalse(TrackingService.cierraGpxSiQuedoAbierto(file))
        } finally {
            file.delete()
        }
    }

    @Test
    fun routeAndTurnJsonUseAtomicWrites() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val file = File(context.cacheDir, "route-atomic-test.json")
        try {
            AtomicNavigationStore.write(file, "[[43.0,-2.0],[43.1,-2.1]]")
            assertEquals("[[43.0,-2.0],[43.1,-2.1]]", file.readText())
            AtomicNavigationStore.write(file, "[[43.0,-2.0],[43.2,-2.2]]")
            assertEquals("[[43.0,-2.0],[43.2,-2.2]]", file.readText())
        } finally {
            file.delete()
            File(file.path + ".new").delete()
            File(file.path + ".bak").delete()
        }
    }

    @Test
    fun crashReporterDoesNotStackHandlersAfterMultipleInstalls() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        CrashReport.install(context)
        val first = Thread.getDefaultUncaughtExceptionHandler()
        CrashReport.install(context)
        val second = Thread.getDefaultUncaughtExceptionHandler()
        assertTrue(first === second)
    }

    @Test
    fun openingApplicationDoesNotStartGpsTrackingWithoutUserAction() {
        assertFalse(TrackingService.ACTIVO)
        ActivityScenario.launch<MainActivity>(
            Intent(InstrumentationRegistry.getInstrumentation().targetContext, MainActivity::class.java),
        ).use { scenario ->
            scenario.onActivity {
                assertFalse(TrackingService.ACTIVO)
            }
        }
        assertFalse(TrackingService.ACTIVO)
    }

    @Test
    fun atomicRouteStoreKeepsCompleteFileAfterManyUpdates() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val file = File(context.cacheDir, "atomic-updates-stress.json")
        try {
            repeat(200) { i ->
                val value = "[[43.0,-2.0],[43.1,-2.1],[$i,$i]]"
                AtomicNavigationStore.write(file, value)
                assertEquals(value, file.readText())
            }
            assertFalse(File(file.path + ".new").exists())
        } finally {
            file.delete()
            File(file.path + ".new").delete()
            File(file.path + ".bak").delete()
        }
    }

    @Test
    fun atomicStoreRejectsNullAndPreservesPreviousRoute() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val file = File(context.cacheDir, "atomic-preserve.json")
        try {
            AtomicNavigationStore.write(file, "[[43.0,-2.0]]")
            var rejected = false
            try {
                AtomicNavigationStore.write(file, null)
            } catch (expected: IllegalArgumentException) {
                rejected = true
            }
            assertTrue(rejected)
            assertEquals("[[43.0,-2.0]]", file.readText())
        } finally {
            file.delete()
            File(file.path + ".new").delete()
            File(file.path + ".bak").delete()
        }
    }

    @Test
    fun closedRecordingIsNotAlteredByRecovery() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val file = File(context.cacheDir, "closed-recording.gpx")
        try {
            val complete = "<gpx><trk><trkseg>\n<trkpt lat=\\"43\\" lon=\\"-2\\"/>\n</trkseg></trk></gpx>\n"
            file.writeText(complete)
            assertFalse(TrackingService.cierraGpxSiQuedoAbierto(file))
            assertEquals(complete, file.readText())
        } finally {
            file.delete()
        }
    }

    @Test
    fun emptyRecordingIsNotModifiedByRecovery() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val file = File(context.cacheDir, "empty-recording.gpx")
        try {
            file.writeText("")
            assertFalse(TrackingService.cierraGpxSiQuedoAbierto(file))
            assertEquals(0L, file.length())
        } finally {
            file.delete()
        }
    }

    @Test
    fun repairedRecordingDoesNotGrowOnRepeatedChecks() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val file = File(context.cacheDir, "recovery-repeat.gpx")
        try {
            file.writeText("<gpx><trk><trkseg>\n<trkpt lat=\\"43\\" lon=\\"-2\\"/>\n")
            assertTrue(TrackingService.cierraGpxSiQuedoAbierto(file))
            val sizeAfterRepair = file.length()
            repeat(25) {
                assertFalse(TrackingService.cierraGpxSiQuedoAbierto(file))
                assertEquals(sizeAfterRepair, file.length())
            }
        } finally {
            file.delete()
        }
    }
}
