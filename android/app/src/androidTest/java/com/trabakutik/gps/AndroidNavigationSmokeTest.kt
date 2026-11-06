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

@RunWith(AndroidJUnit4::class)
class AndroidNavigationSmokeTest {
    @Test
    fun manifestDeclaresRequiredLocationAndForegroundService() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val info = context.packageManager.getPackageInfo(
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
        ActivityScenario.launch<MainActivity>(
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
                assertEquals("com.trabakutik.gps", activity.packageName)
            }
        }
    }

    @Test
    fun gpsTrackingServiceIsNotExternallyExported() {
        val context: Context = InstrumentationRegistry.getInstrumentation().targetContext
        val info = context.packageManager.getServiceInfo(
            android.content.ComponentName(context, TrackingService::class.java),
            0,
        )
        assertFalse(info.exported)
    }
}
