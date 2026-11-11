package com.trabakutik.gps;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.Collections;
import java.util.List;

/** Route geometry shared by the native turn announcements and navigation metrics. */
final class NavigationMetrics {
    private static final double CLIMB_LENGTH = 200, CLIMB_GRADE = .10, CLIMB_NOTICE = 100;
    private static final double WATER_NOTICE = 150, WATER_OFFSET = 30;
    private static final long MAX_GAP_MS = 10_000;
    record Water(String name, double lat, double lon, boolean approximate) {}
    record Projection(double along, double distance) {}
    record Notice(String text, int beeps) {}
    private record Event(double along, int direction, Notice notice) {}

    private List<double[]> points = Collections.emptyList();
    double[] distance = new double[0];
    private double[] ascent = new double[0], descent = new double[0];
    private int[] missing = new int[0];
    private final List<Event> events = new ArrayList<>();
    private final HashSet<Event> announced = new HashSet<>();
    private double reference = Double.NaN, lastLat, lastLon;
    private double motionAlong, motionLat, motionLon, movingMeters;
    private long motionTime, movingMillis, lastMovement;
    private int direction = 1;

    void configure(List<double[]> route, List<Water> sources) {
        points = route;
        int n = points.size();
        distance = new double[n];
        ascent = new double[n];
        descent = new double[n];
        missing = new int[n + 1];
        reference = Double.NaN;
        resetPace();
        events.clear();
        announced.clear();
        for (int i = 0; i < n; i++) {
            double[] p = points.get(i);
            double h = heightAt(i);
            missing[i + 1] = missing[i] + (Double.isFinite(h) ? 0 : 1);
            if (i == 0) continue;
            double[] a = points.get(i - 1);
            distance[i] = distance[i - 1] + meters(a[0], a[1], p[0], p[1]);
            double delta = h - heightAt(i - 1);
            ascent[i] = ascent[i - 1] + (Double.isFinite(delta) ? Math.max(0, delta) : 0);
            descent[i] = descent[i - 1] + (Double.isFinite(delta) ? Math.max(0, -delta) : 0);
        }
        if (total() <= 0) return;
        for (int dir : new int[]{1, -1}) {
            boolean climbing = false;
            for (int i = dir > 0 ? 0 : n - 1; i >= 0 && i < n; i += dir) {
                double from = distance[i], to = from + dir * CLIMB_LENGTH;
                double grade = to < 0 || to > total() || !hasHeights(from, to)
                        ? Double.NaN : (height(to) - height(from)) / CLIMB_LENGTH;
                boolean qualifies = grade + 1e-9 >= CLIMB_GRADE;
                if (qualifies && !climbing) {
                    events.add(new Event(from, dir, new Notice(
                            "Subida dura próxima, " + Math.round(grade * 100) + " por ciento durante 200 metros", 1)));
                }
                climbing = qualifies;
            }
        }
        for (Water source : sources) addWater(source);
    }

    double total() { return distance.length == 0 ? 0 : distance[distance.length - 1]; }

    private static double meters(double lat, double lon, double otherLat, double otherLon) {
        return 111195 * Math.hypot(otherLat - lat,
                (otherLon - lon) * Math.cos(Math.toRadians((lat + otherLat) / 2)));
    }

    private void projectSegment(int i, double lat, double lon, double scale, double[] result) {
        double[] a = points.get(i - 1), b = points.get(i);
        double x = (a[1] - lon) * scale, y = (a[0] - lat) * 111195;
        double dx = (b[1] - a[1]) * scale, dy = (b[0] - a[0]) * 111195;
        double len = dx * dx + dy * dy;
        double t = len == 0 ? 0 : Math.max(0, Math.min(1, -(x * dx + y * dy) / len));
        result[0] = distance[i - 1] + t * (distance[i] - distance[i - 1]);
        result[1] = Math.hypot(x + t * dx, y + t * dy);
    }

    Projection project(double lat, double lon, int dir, boolean reliable) {
        double nearest = Double.POSITIVE_INFINITY, nearestAlong = 0;
        double nearby = Double.POSITIVE_INFINITY, nearbyAlong = 0, bestScore = Double.POSITIVE_INFINITY;
        double[] segment = new double[2];
        double scale = 111195 * Math.cos(Math.toRadians(lat));
        boolean hasReference = Double.isFinite(reference);
        double step = hasReference ? meters(lastLat, lastLon, lat, lon) : 0;
        double window = Math.max(25, Math.min(200, step * 2 + 15));
        double predicted = reference + Math.min(step, window) * dir;
        for (int i = 1; i < distance.length; i++) {
            projectSegment(i, lat, lon, scale, segment);
            double along = segment[0], error = segment[1];
            if (error < nearest - 1e-6
                    || (Math.abs(error - nearest) <= 1e-6 && !hasReference && dir < 0)) {
                nearest = error;
                nearestAlong = along;
            }
            if (!hasReference || Math.abs(along - reference) > window) continue;
            double score = error + .20 * Math.abs(along - predicted);
            if (score < bestScore) {
                bestScore = score;
                nearby = error;
                nearbyAlong = along;
            }
        }
        Projection result = Double.isFinite(nearby) && nearby <= nearest + 12
                ? new Projection(nearbyAlong, nearby) : new Projection(nearestAlong, nearest);
        if (reliable && result.distance <= 30) {
            reference = result.along;
            lastLat = lat;
            lastLon = lon;
        }
        return result;
    }

    private void addWater(Water source) {
        double scale = 111195 * Math.cos(Math.toRadians(source.lat));
        double closest = Double.POSITIVE_INFINITY;
        List<Projection> candidates = new ArrayList<>();
        double[] segment = new double[2];
        for (int i = 1; i < distance.length; i++) {
            projectSegment(i, source.lat, source.lon, scale, segment);
            if (segment[1] <= WATER_OFFSET) {
                candidates.add(new Projection(segment[0], segment[1]));
                closest = Math.min(closest, segment[1]);
            }
        }
        double lastAlong = Double.NEGATIVE_INFINITY;
        for (Projection p : candidates) {
            // Keep equivalent passes, such as the outbound and return legs of the same path.
            if (p.distance > closest + .25 || p.along - lastAlong < 5) continue;
            events.add(new Event(p.along, 0, new Notice(
                    source.name + (source.approximate ? ", posición aproximada" : "") + " cerca de la ruta", 2)));
            lastAlong = p.along;
        }
    }

    Notice nextNotice(double along, int dir) {
        Event best = null;
        double nearest = Double.POSITIVE_INFINITY;
        for (Event event : events) {
            boolean water = event.direction == 0;
            if (!water && event.direction != dir) continue;
            Event key = new Event(water ? -1 : event.along, dir, event.notice);
            if (announced.contains(key)) continue;
            double ahead = (event.along - along) * dir;
            if (ahead < -.01 || ahead > (water ? WATER_NOTICE : CLIMB_NOTICE)) continue;
            if (!water) {
                announced.add(key);
                return event.notice;
            }
            if (ahead < nearest) { best = key; nearest = ahead; }
        }
        if (best == null) return null;
        announced.add(best);
        return new Notice(best.notice.text + ", a " + Math.round(nearest) + " metros por la ruta. Comprueba el acceso y el agua", best.notice.beeps);
    }

    private int segment(double along) {
        int lo = 1, hi = distance.length - 1;
        while (lo < hi) {
            int mid = (lo + hi) >>> 1;
            if (distance[mid] < along) lo = mid + 1;
            else hi = mid;
        }
        return lo;
    }

    private double heightAt(int i) {
        double[] p = points.get(i);
        return p.length > 2 ? p[2] : Double.NaN;
    }

    private double height(double along) {
        int i = segment(along);
        if (along == distance[i]) return heightAt(i);
        if (along == distance[i - 1]) return heightAt(i - 1);
        double a = heightAt(i - 1), b = heightAt(i);
        return a + (b - a) * (along - distance[i - 1]) / (distance[i] - distance[i - 1]);
    }

    private boolean hasHeights(double from, double to) {
        double low = Math.min(from, to), high = Math.max(from, to);
        int a = segment(low), b = segment(high);
        int first = low == distance[a] ? a : a - 1;
        return missing[b + 1] == missing[first];
    }

    double gain(double along, int dir) {
        if (total() <= 0 || !hasHeights(along, dir > 0 ? total() : 0)) return Double.NaN;
        if (dir > 0 && along >= total() || dir < 0 && along <= 0) return 0;
        int i = segment(along);
        double h = height(along);
        return dir > 0 ? Math.max(0, heightAt(i) - h) + ascent[ascent.length - 1] - ascent[i]
                : along == distance[i] ? descent[i] : Math.max(0, heightAt(i - 1) - h) + descent[i - 1];
    }

    void pausePace() { motionTime = 0; }

    private void resetPace() {
        motionTime = movingMillis = lastMovement = 0;
        movingMeters = 0;
    }

    long eta(double along, int dir, double lat, double lon, long time, boolean moving) {
        if (dir != direction) {
            direction = dir;
            resetPace();
        }
        if (!moving) { motionTime = 0; return -1; }
        long delta = time - motionTime;
        double advance = (along - motionAlong) * dir;
        double step = meters(motionLat, motionLon, lat, lon);
        if (motionTime != 0 && delta > 0 && delta <= MAX_GAP_MS) {
            if (advance >= 3 && step >= 3 && advance <= 20 * delta / 1000. && step <= 20 * delta / 1000.) {
                movingMeters += advance;
                movingMillis += delta;
                lastMovement = time;
            } else if (advance >= 0 && advance < 3 && step < 3) {
                return estimatedTime(along, dir, time);
            }
        }
        motionTime = time;
        motionAlong = along;
        motionLat = lat;
        motionLon = lon;
        return estimatedTime(along, dir, time);
    }

    private long estimatedTime(double along, int dir, long time) {
        if (movingMillis < 60_000 || movingMeters < 100 || time - lastMovement > MAX_GAP_MS) return -1;
        return Math.round((dir > 0 ? total() - along : along) * movingMillis / movingMeters);
    }
}
