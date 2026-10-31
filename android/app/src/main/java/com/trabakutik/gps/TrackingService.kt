package com.trabakutik.gps

import android.Manifest
import android.app.*
import android.content.*
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.*
import java.io.File
import java.util.Locale

/**
 * Graba coordenadas en almacenamiento interno desde un servicio Android activo.
 * Cada línea: lat,lon,epochMillis,accuracy,segment. No se interpola ningún punto.
 */
class TrackingService : Service(), LocationListener {
    companion object {
        const val START = "com.trabakutik.gps.START"
        const val STOP = "com.trabakutik.gps.STOP"
        const val CHANNEL = "gps_grabacion"
        const val FILE = "recorrido-pendiente.csv"
        const val STATE = "grabando"
    }
    private lateinit var manager: LocationManager
    private var last: Location? = null
    private var segment = 0
    private var count = 0

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        manager = getSystemService(LOCATION_SERVICE) as LocationManager
        val channel = NotificationChannel(CHANNEL, "Grabación GPS", NotificationManager.IMPORTANCE_LOW)
        (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(channel)
    }

    private fun notification(): Notification {
        val launch = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        return Notification.Builder(this, CHANNEL)
            .setContentTitle("Trabakutik GPS · grabando")
            .setContentText("Grabación activa incluso con la pantalla apagada")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .setContentIntent(launch)
            .build()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == STOP) {
            stopTracking()
            return START_NOT_STICKY
        }
        if (intent?.action != START && intent?.action != null) return START_NOT_STICKY
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            stopSelf()
            return START_NOT_STICKY
        }
        startForeground(49, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        if (!getSharedPreferences("gps", MODE_PRIVATE).getBoolean(STATE, false)) {
            File(filesDir, FILE).writeText("")
            last = null
            segment = 0
            count = 0
        }
        getSharedPreferences("gps", MODE_PRIVATE).edit().putBoolean(STATE, true).apply()
        try {
            manager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1500L, 0f, this, Looper.getMainLooper())
            manager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 2500L, 0f, this, Looper.getMainLooper())
        } catch (_: Exception) {
            stopTracking()
        }
        return START_STICKY
    }

    override fun onLocationChanged(location: Location) {
        if (!location.hasAccuracy() || location.accuracy > 45f) return
        if (System.currentTimeMillis() - location.time > 12000L) return
        val prev = last
        if (prev != null) {
            val elapsed = location.time - prev.time
            if (elapsed <= 0) return
            val distance = prev.distanceTo(location)
            // Un hueco grande se guarda en otro segmento: no unirlo con una recta.
            if (elapsed > 15000L || distance > 60f && elapsed < 10000L) {
                segment++
            } else if (distance > 8f && distance / (elapsed / 1000f) > 14f) {
                // Salto sospechoso: no aceptarlo ni inventar trayectoria.
                return
            }
            if (distance < 2f && elapsed < 5000L) return
        }
        val line = String.format(Locale.US, "%.7f,%.7f,%d,%.1f,%d\n",
            location.latitude, location.longitude, location.time, location.accuracy, segment)
        File(filesDir, FILE).appendText(line)
        last = location
        count++
    }

    private fun stopTracking() {
        try { manager.removeUpdates(this) } catch (_: Exception) {}
        getSharedPreferences("gps", MODE_PRIVATE).edit().putBoolean(STATE, false).apply()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        try { manager.removeUpdates(this) } catch (_: Exception) {}
        super.onDestroy()
    }
}
