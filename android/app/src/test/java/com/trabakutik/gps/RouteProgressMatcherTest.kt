package com.trabakutik.gps

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RouteProgressMatcherTest {
    private val crossing =
        listOf(
            doubleArrayOf(43.0, -2.0),
            doubleArrayOf(43.0003, -1.9997),
            doubleArrayOf(43.0, -1.9994),
            doubleArrayOf(42.9997, -1.9997),
            doubleArrayOf(43.0, -2.0),
            doubleArrayOf(43.0003, -2.0003),
        )

    private fun locate(
        route: List<DoubleArray>,
        latitude: Double,
        longitude: Double,
        previous: Double = Double.NaN,
        seconds: Double = Double.POSITIVE_INFINITY,
        speed: Double = 1.0,
    ): RouteProgressMatcher.Match? =
        RouteProgressMatcher.match(
            route,
            latitude,
            longitude,
            previous,
            seconds,
            speed,
        )

    @Test
    fun rejectsRoutesWithoutSegments() {
        assertNull(locate(emptyList(), 43.0, -2.0))
        assertNull(locate(listOf(doubleArrayOf(43.0, -2.0)), 43.0, -2.0))
    }

    @Test
    fun rejectsInvalidCoordinates() {
        assertNull(locate(crossing, Double.NaN, -2.0))
        assertNull(locate(crossing, 91.0, -2.0))
        assertNull(
            locate(
                listOf(doubleArrayOf(43.0), doubleArrayOf(43.1, -2.0)),
                43.0,
                -2.0,
            ),
        )
    }

    @Test
    fun matchesFirstSegmentWithoutPriorProgress() {
        val route = listOf(doubleArrayOf(43.0, -2.0), doubleArrayOf(43.001, -2.0))
        val actual = locate(route, 43.0005, -2.0)
        assertNotNull(actual)
        assertEquals(55.6, actual!!.progressMeters, 1.0)
        assertEquals(0.0, actual.distanceMeters, 0.01)
    }

    @Test
    fun prefersContinuityWhenRouteReturnsToStart() {
        val earlier = locate(crossing, 43.0, -2.0, previous = 0.0, seconds = 1.0)
        val later = locate(crossing, 43.0, -2.0, previous = 160.0, seconds = 1.0)
        assertNotNull(earlier)
        assertNotNull(later)
        assertTrue(later!!.progressMeters > earlier!!.progressMeters + 60.0)
    }

    @Test
    fun expiredHistoryDoesNotForceOldSegment() {
        val result = locate(crossing, 43.0, -2.0, previous = 130.0, seconds = 20.0)
        assertNotNull(result)
        assertEquals(0.0, result!!.progressMeters, 0.1)
    }

    @Test
    fun fallsBackToNearestWhenPriorSegmentIsTooFar() {
        val route =
            listOf(
                doubleArrayOf(43.0, -2.0),
                doubleArrayOf(43.001, -2.0),
                doubleArrayOf(43.002, -2.0),
            )
        val result = locate(route, 43.0019, -2.0, previous = 0.0, seconds = 1.0)
        assertNotNull(result)
        assertTrue(result!!.progressMeters > 190.0)
    }

    @Test
    fun supportsTracksLongerThanTwoHundredKilometresAndThousandPoints() {
        val longRoute =
            (0..2502).map { index ->
                doubleArrayOf(40.0, -3.0 + index * 0.001)
            }
        val position = longRoute[2400]
        val result = locate(longRoute, position[0], position[1], speed = 4.0)
        assertNotNull(result)
        assertTrue(result!!.progressMeters > 200_000)
        assertEquals(0.0, result.distanceMeters, 0.05)
    }

    @Test
    fun recoveryAfterLongGpsSignalLossUsesCurrentLocation() {
        val route =
            listOf(
                doubleArrayOf(43.0, -2.0),
                doubleArrayOf(43.001, -2.0),
                doubleArrayOf(43.002, -2.0),
            )
        val result = locate(route, 43.0018, -2.0, previous = 0.0, seconds = 180.0)
        assertNotNull(result)
        assertTrue(result!!.progressMeters > 180.0)
    }

    @Test
    fun deviationReportsDistanceFromTheTrack() {
        val route = listOf(doubleArrayOf(43.0, -2.0), doubleArrayOf(43.001, -2.0))
        val result = locate(route, 43.0005, -1.999)
        assertNotNull(result)
        assertTrue(result!!.distanceMeters > 70.0)
    }

    @Test
    fun offlineCalculationDoesNotRequireConnectivity() {
        val route = listOf(doubleArrayOf(43.0, -2.0), doubleArrayOf(43.0005, -2.0))
        assertNotNull(locate(route, 43.00025, -2.0))
    }
}
