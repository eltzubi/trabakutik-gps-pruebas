package com.trabakutik.gps

import android.Manifest
import android.app.Activity
import android.content.*
import android.content.pm.PackageManager
import android.os.Bundle
import android.provider.MediaStore
import android.webkit.*
import android.widget.*
import android.view.*
import android.graphics.Color
import java.io.File
import java.text.SimpleDateFormat
import java.util.*

class MainActivity : Activity() {
    private lateinit var web: WebView
    private lateinit var status: TextView
    private val requestLocationCode = 25

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(Color.rgb(8,23,34)) }
        val controls = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        fun button(text: String, action: () -> Unit): Button = Button(this).apply {
            this.text = text; setOnClickListener { action() }
            controls.addView(this, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        }
        button("● Grabar GPS") { requestStart() }
        button("■ Parar") { startService(Intent(this, TrackingService::class.java).setAction(TrackingService.STOP)); status.text = "Grabación detenida · lista para guardar" }
        button("↓ Guardar GPX") { exportGpx() }
        root.addView(controls)
        status = TextView(this).apply { setTextColor(Color.WHITE); text = "Grabación nativa · independiente de la web"; setPadding(14, 4, 14, 8) }
        root.addView(status)
        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            webViewClient = WebViewClient()
            webChromeClient = WebChromeClient()
        }
        root.addView(web, LinearLayout.LayoutParams(-1, 0, 1f))
        setContentView(root)
        web.loadUrl("https://eltzubi.github.io/trabakutik-gps-pruebas/")
        if (getSharedPreferences("gps", MODE_PRIVATE).getBoolean(TrackingService.STATE, false)) {
            status.text = "Grabación nativa activa · puedes bloquear la pantalla"
        }
    }

    private fun requestStart() {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION), requestLocationCode)
            return
        }
        startGps()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == requestLocationCode && checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) startGps()
        else status.text = "Se necesita ubicación precisa para grabar"
    }

    private fun startGps() {
        try {
            startForegroundService(Intent(this, TrackingService::class.java).setAction(TrackingService.START))
            status.text = "Grabación nativa activa · puedes bloquear la pantalla"
        } catch (e: Exception) {
            status.text = "No se pudo iniciar GPS: ${e.message}"
        }
    }

    private fun exportGpx() {
        if (getSharedPreferences("gps", MODE_PRIVATE).getBoolean(TrackingService.STATE, false)) {
            Toast.makeText(this, "Pulsa Parar antes de guardar", Toast.LENGTH_LONG).show()
            return
        }
        val file = File(filesDir, TrackingService.FILE)
        if (!file.exists()) { status.text = "Todavía no hay grabación"; return }
        val rows = file.readLines().mapNotNull {
            val x = it.split(",")
            if (x.size != 5) null else x
        }
        if (rows.size < 2) { status.text = "Se necesitan al menos dos puntos GPS válidos"; return }
        val date = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
        val gpx = StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?><gpx version=\"1.1\" creator=\"Trabakutik GPS\" xmlns=\"http://www.topografix.com/GPX/1/1\"><trk><name>Trabakutik grabación</name>")
        var current: String? = null
        for (x in rows) {
            if (current != x[4]) {
                if (current != null) gpx.append("</trkseg>")
                gpx.append("<trkseg>"); current = x[4]
            }
            gpx.append("<trkpt lat=\"${x[0]}\" lon=\"${x[1]}\"><time>${date.format(Date(x[2].toLong()))}</time></trkpt>")
        }
        gpx.append("</trkseg></trk></gpx>")
        try {
            val values = android.content.ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, "trabakutik-grabacion-${System.currentTimeMillis()}.gpx")
                put(MediaStore.Downloads.MIME_TYPE, "application/gpx+xml")
                put(MediaStore.Downloads.RELATIVE_PATH, "Download/")
            }
            val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)!!
            contentResolver.openOutputStream(uri)!!.use { it.write(gpx.toString().toByteArray(Charsets.UTF_8)) }
            status.text = "GPX guardado en Descargas · ${rows.size} puntos"
        } catch (e: Exception) {
            status.text = "Error al guardar: ${e.message}"
        }
    }
}
