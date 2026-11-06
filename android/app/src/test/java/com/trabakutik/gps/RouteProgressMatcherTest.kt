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
        val later = RouteProgressMatcher.match(crossing, 43.0, -2.0, 130.0, 1.0, 1.0)
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
}
