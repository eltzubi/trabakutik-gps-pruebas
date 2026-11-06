package com.trabakutik.gps

import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max

/**
 * Busca el tramo del GPX coherente con la posición actual y el progreso previo.
 * Todas las distancias se expresan en metros; no depende de APIs de Android.
 */
object RouteProgressMatcher {
    private const val METERS_PER_DEGREE = 111_195.0
    private const val MIN_LATITUDE = -90.0
    private const val MAX_LATITUDE = 90.0
    private const val MIN_LONGITUDE = -180.0
    private const val MAX_LONGITUDE = 180.0
    private const val HISTORY_TIMEOUT_SECONDS = 15.0
    private const val MIN_TRAVEL_WINDOW_METERS = 35.0
    private const val BASE_TRAVEL_WINDOW_METERS = 20.0
    private const val MAX_SPEED_METERS_PER_SECOND = 30.0
    private const val MAX_CONTINUITY_ERROR_METERS = 8.0
    private const val MIN_SEGMENT_METERS = 0.001

    data class Position(
        val latitude: Double,
        val longitude: Double,
    )

    data class History(
        val progressMeters: Double,
        val secondsAgo: Double,
        val speedMetersPerSecond: Double,
    )

    data class Match(
        val progressMeters: Double,
        val distanceMeters: Double,
    )

    private data class SegmentProjection(
        val progress: Double,
        val error: Double,
        val length: Double,
    )

    @JvmStatic
    fun match(
        route: List<DoubleArray>,
        position: Position,
        history: History,
    ): Match? {
        if (!isValid(route, position)) return null

        val longitudeScale = METERS_PER_DEGREE * cos(Math.toRadians(position.latitude))
        val continuity = history.progressMeters.isFinite() &&
            history.secondsAgo.isFinite() &&
            history.secondsAgo in 0.0..<HISTORY_TIMEOUT_SECONDS
        val speed = history.speedMetersPerSecond.takeIf(Double::isFinite)?.coerceIn(
            0.0,
            MAX_SPEED_METERS_PER_SECOND,
        ) ?: 0.0
        val distanceWindow = if (continuity) {
            max(
                MIN_TRAVEL_WINDOW_METERS,
                speed * history.secondsAgo + BASE_TRAVEL_WINDOW_METERS,
            )
        } else {
            MIN_TRAVEL_WINDOW_METERS
        }

        var best = Match(0.0, Double.POSITIVE_INFINITY)
        var near = Match(Double.NaN, Double.POSITIVE_INFINITY)
        var progress = 0.0

        for (index in 1 until route.size) {
            val point = project(
                route[index - 1],
                route[index],
                position,
                longitudeScale,
                progress,
            )
            if (point.error < best.distanceMeters) {
                best = Match(point.progress, point.error)
            }
            if (continuity &&
                abs(point.progress - history.progressMeters) <= distanceWindow &&
                point.error < near.distanceMeters
            ) {
                near = Match(point.progress, point.error)
            }
            progress += point.length
        }

        return if (near.progressMeters.isFinite() &&
            near.distanceMeters <= best.distanceMeters + MAX_CONTINUITY_ERROR_METERS
        ) {
            near
        } else {
            best
        }
    }

    private fun isValid(
        route: List<DoubleArray>,
        position: Position,
    ): Boolean {
        val validPosition = position.latitude.isFinite() &&
            position.longitude.isFinite() &&
            position.latitude in MIN_LATITUDE..MAX_LATITUDE &&
            position.longitude in MIN_LONGITUDE..MAX_LONGITUDE
        return route.size >= 2 && validPosition && route.all { point ->
            point.size >= 2 && point[0].isFinite() && point[1].isFinite() &&
                point[0] in MIN_LATITUDE..MAX_LATITUDE &&
                point[1] in MIN_LONGITUDE..MAX_LONGITUDE
        }
    }

    private fun project(
        start: DoubleArray,
        end: DoubleArray,
        position: Position,
        longitudeScale: Double,
        cumulative: Double,
    ): SegmentProjection {
        val dx = (end[1] - start[1]) * longitudeScale
        val dy = (end[0] - start[0]) * METERS_PER_DEGREE
        val ax = (start[1] - position.longitude) * longitudeScale
        val ay = (start[0] - position.latitude) * METERS_PER_DEGREE
        val length = hypot(dx, dy)
        val projection = if (length < MIN_SEGMENT_METERS) {
            0.0
        } else {
            -(ax * dx + ay * dy) / (length * length)
        }
        val fraction = projection.coerceIn(0.0, 1.0)
        return SegmentProjection(
            cumulative + fraction * length,
            hypot(ax + fraction * dx, ay + fraction * dy),
            length,
        )
    }
}
