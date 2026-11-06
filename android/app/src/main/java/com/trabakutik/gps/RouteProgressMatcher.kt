package com.trabakutik.gps

import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max

/**
 * Proyecta posiciones GPS sobre el trazado, conservando la continuidad
 * al pasar por cruces, bucles o segmentos cercanos entre sí.
 *
 * No accede a Android, almacenamiento ni a la red.
 */
object RouteProgressMatcher {
    data class Match(
        val progressMeters: Double,
        val distanceMeters: Double,
    )

    @JvmStatic
    fun match(
        route: List<DoubleArray>,
        latitude: Double,
        longitude: Double,
        previousProgressMeters: Double,
        secondsSincePrevious: Double,
        speedMetersPerSecond: Double,
    ): Match? {
        if (route.size < 2) return null
        if (!latitude.isFinite() || !longitude.isFinite()) return null
        if (latitude !in -90.0..90.0) return null
        if (longitude !in -180.0..180.0) return null

        val scale = 111_195.0
        val lonScale = scale * cos(Math.toRadians(latitude))
        val usePrevious =
            previousProgressMeters.isFinite() &&
                secondsSincePrevious.isFinite() &&
                secondsSincePrevious >= 0.0 &&
                secondsSincePrevious < 15.0
        val speed = if (speedMetersPerSecond.isFinite()) speedMetersPerSecond.coerceIn(0.0, 30.0) else 0.0
        val travelWindow = max(35.0, speed * secondsSincePrevious.coerceAtLeast(0.0) + 20.0)

        var bestDistance = Double.POSITIVE_INFINITY
        var bestProgress = 0.0
        var nearDistance = Double.POSITIVE_INFINITY
        var nearProgress = Double.NaN
        var cumulative = 0.0

        for (index in 1 until route.size) {
            val a = route[index - 1]
            val b = route[index]
            if (a.size < 2 || b.size < 2) return null
            if (!a[0].isFinite() || !a[1].isFinite()) return null
            if (!b[0].isFinite() || !b[1].isFinite()) return null

            val dx = (b[1] - a[1]) * lonScale
            val dy = (b[0] - a[0]) * scale
            val ax = (a[1] - longitude) * lonScale
            val ay = (a[0] - latitude) * scale
            val length = hypot(dx, dy)
            val projection = if (length < 0.001) 0.0 else -(ax * dx + ay * dy) / (length * length)
            val t = projection.coerceIn(0.0, 1.0)
            val distance = hypot(ax + t * dx, ay + t * dy)
            val progress = cumulative + t * length

            if (distance < bestDistance) {
                bestDistance = distance
                bestProgress = progress
            }
            if (usePrevious && abs(progress - previousProgressMeters) <= travelWindow) {
                if (distance < nearDistance) {
                    nearDistance = distance
                    nearProgress = progress
                }
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
