package com.trabakutik.gps

import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

/**
 * Proyecta una posición sobre un GPX y da preferencia a la continuidad en
 * cruces y recorridos que pasan varias veces por el mismo lugar.
 *
 * Los elementos de [route] son [latitud, longitud] en grados. No almacena
 * posiciones ni utiliza APIs Android: se puede probar en una JVM.
 */
object RouteProgressMatcher {
    data class Match(val progressMeters: Double, val distanceMeters: Double)

    /**
     * [previousProgressMeters] debe ser NaN si no existe una posición anterior.
     * [secondsSincePrevious] debe ser infinito si ha caducado la anterior.
     * Devuelve null si la ruta o las coordenadas son inválidas.
     */
    @JvmStatic
    fun match(
        route: List<DoubleArray>,
        latitude: Double,
        longitude: Double,
        previousProgressMeters: Double,
        secondsSincePrevious: Double,
        speedMetersPerSecond: Double
    ): Match? {
        if (route.size < 2 || !latitude.isFinite() || !longitude.isFinite() ||
            latitude !in -90.0..90.0 || longitude !in -180.0..180.0
        ) return null

        val scale = 111_195.0
        val lonScale = scale * cos(Math.toRadians(latitude))
        val usePrevious = previousProgressMeters.isFinite() &&
            secondsSincePrevious.isFinite() && secondsSincePrevious >= 0.0 &&
            secondsSincePrevious < 15.0
        val travelWindow = max(
            35.0,
            max(0.0, speedMetersPerSecond.coerceAtMost(30.0)) *
                secondsSincePrevious.coerceAtLeast(0.0) + 20.0
        )

        var bestDistance = Double.POSITIVE_INFINITY
        var bestProgress = 0.0
        var nearDistance = Double.POSITIVE_INFINITY
        var nearProgress = Double.NaN
        var cumulative = 0.0

        for (index in 1 until route.size) {
            val a = route[index - 1]
            val b = route[index]
            if (a.size < 2 || b.size < 2 ||
                !a[0].isFinite() || !a[1].isFinite() ||
                !b[0].isFinite() || !b[1].isFinite()
            ) return null

            val dx = (b[1] - a[1]) * lonScale
            val dy = (b[0] - a[0]) * scale
            val ax = (a[1] - longitude) * lonScale
            val ay = (a[0] - latitude) * scale
            val length = hypot(dx, dy)
            val t = if (length < 0.001) 0.0 else
                (-(ax * dx + ay * dy) / (length * length)).coerceIn(0.0, 1.0)
            val distance = hypot(ax + t * dx, ay + t * dy)
            val progress = cumulative + t * length

            if (distance < bestDistance) {
                bestDistance = distance
                bestProgress = progress
            }
            if (usePrevious &&
                abs(progress - previousProgressMeters) <= travelWindow &&
                distance < nearDistance
            ) {
                nearDistance = distance
                nearProgress = progress
            }
            cumulative += length
        }

        return if (nearProgress.isFinite() && nearDistance <= bestDistance + 8.0) {
            Match(nearProgress, nearDistance)
        } else {
            Match(bestProgress, bestDistance)
        }
    }
}
