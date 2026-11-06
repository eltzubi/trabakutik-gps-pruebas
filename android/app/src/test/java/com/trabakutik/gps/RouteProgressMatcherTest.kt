package com.trabakutik.gps

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RouteProgressMatcherTest {
    private val crossing = listOf(
        doubleArrayOf(43.0, -2.0),
        doubleArrayOf(43.0003, -1.9997),
        doubleArrayOf(43.0, -1.9994),
        doubleArrayOf(42.9997, -1.9997),
        doubleArrayOf(43.0, -2.0),
        doubleArrayOf(43.0003, -2.0003)
    )

    @Test fun rejectsRoutesWithoutSegments() {
        assertNull(RouteProgressMatcher.match(emptyList(), 43.0, -2.0, Double.NaN, 0.0, 1.0))
        assertNull(RouteProgressMatcher.match(listOf(doubleArrayOf(43.0, -2.0)), 43.0, -2.0, Double.NaN, 0.0, 1.0))
    }

    @Test fun rejectsInvalidCoordinates() {
        assertNull(RouteProgressMatcher.match(crossing, Double.NaN, -2.0, Double.NaN, 0.0, 1.0))
        assertNull(RouteProgressMatcher.match(crossing, 91.0, -2.0, Double.NaN, 0.0, 1.0))
        assertNull(RouteProgressMatcher.match(listOf(doubleArrayOf(43.0), doubleArrayOf(43.1, -2.0)), 43.0, -2.0, Double.NaN, 0.0, 1.0))
    }

    @Test fun matchesFirstSegmentWithoutPriorProgress() {
        val route = listOf(doubleArrayOf(43.0, -2.0), doubleArrayOf(43.001, -2.0))
        val actual = RouteProgressMatcher.match(route, 43.0005, -2.0, Double.NaN, Double.POSITIVE_INFINITY, 1.0)
        assertNotNull(actual)
        assertEquals(55.6, actual!!.progressMeters, 1.0)
        assertEquals(0.0, actual.distanceMeters, 0.01)
    }

    @Test fun prefersContinuityWhenRouteReturnsToStart() {
        val earlier = RouteProgressMatcher.match(crossing, 43.0, -2.0, 0.0, 1.0, 1.0)
        // La vuelta completa mide unos 166 m: la posición anterior debe estar cerca.
        val later = RouteProgressMatcher.match(crossing, 43.0, -2.0, 160.0, 1.0, 1.0)
        assertNotNull(earlier)
        assertNotNull(later)
        assertTrue(later!!.progressMeters > earlier!!.progressMeters + 60.0)
    }

    @Test fun expiredHistoryDoesNotForceOldSegment() {
        val result = RouteProgressMatcher.match(crossing, 43.0, -2.0, 130.0, 20.0, 1.0)
        assertNotNull(result)
        assertEquals(0.0, result!!.progressMeters, 0.1)
    }

    @Test fun fallsBackToNearestWhenPriorSegmentIsTooFar() {
        val route = listOf(
            doubleArrayOf(43.0, -2.0),
            doubleArrayOf(43.001, -2.0),
            doubleArrayOf(43.002, -2.0)
        )
        val result = RouteProgressMatcher.match(route, 43.0019, -2.0, 0.0, 1.0, 1.0)
        assertNotNull(result)
        assertTrue(result!!.progressMeters > 190.0)
    }

    @Test fun supportsTracksLongerThanTwoHundredKilometresAndThousandPoints() {
        // 2 502 segmentos de unos 111 m: recorrido sintetico de ~278 km.
        val longRoute = (0..2502).map { i ->
            doubleArrayOf(40.0, -3.0 + i * 0.001)
        }
        val position = longRoute[2100]
        val result = RouteProgressMatcher.match(
            longRoute, position[0], position[1],
            Double.NaN, Double.POSITIVE_INFINITY, 4.0
        )
        assertNotNull(result)
        assertTrue(result!!.progressMeters > 200_000)
        assertEquals(0.0, result.distanceMeters, 0.05)
    }

    @Test fun recoveryAfterLongGpsSignalLossUsesCurrentLocation() {
        val route = listOf(
            doubleArrayOf(43.0, -2.0),
            doubleArrayOf(43.001, -2.0),
            doubleArrayOf(43.002, -2.0)
        )
        val result = RouteProgressMatcher.match(
            route, 43.0018, -2.0, 0.0, 180.0, 1.5
        )
        assertNotNull(result)
        assertTrue(result!!.progressMeters > 180.0)
    }

    @Test fun deviationReportsDistanceFromTheTrack() {
        val route = listOf(
            doubleArrayOf(43.0, -2.0),
            doubleArrayOf(43.001, -2.0)
        )
        val result = RouteProgressMatcher.match(
            route, 43.0005, -1.999, Double.NaN,
            Double.POSITIVE_INFINITY, 1.5
        )
        assertNotNull(result)
        assertTrue(result!!.distanceMeters > 70.0)
    }

    @Test fun offlineCalculationDoesNotRequireConnectivity() {
        // El algoritmo no recibe Context, red ni proveedor de mapas.
        // Prueba el calculo offline, NO el modo avion de Android.
        val route = listOf(
            doubleArrayOf(43.0, -2.0),
            doubleArrayOf(43.0005, -2.0)
        )
        assertNotNull(RouteProgressMatcher.match(
            route, 43.00025, -2.0, Double.NaN,
            Double.POSITIVE_INFINITY, 0.0
        ))
    }
}
