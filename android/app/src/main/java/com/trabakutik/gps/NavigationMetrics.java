package com.trabakutik.gps;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.Collections;
import java.util.List;

/** Route geometry shared by the native turn announcements and navigation metrics. */
final class NavigationMetrics {
    private static final double CLIMB_LENGTH = 200, CLIMB_GRADE = .10, CLIMB_NOTICE = 100;
    // UNA SUBIDA ES UNA SUBIDA ENTERA, NO CADA VENTANA DE 200 METROS. La
    // deteccion mira si en los proximos 200 m se sube el 10%, y antes soltaba
    // un aviso cada vez que esa ventana VOLVIA a cumplirlo. En una subida
    // larga y desigual -un replano, una curva mas tendida- eso son muchos
    // avisos seguidos: en egoarbitza, 41 en 33 km, y amontonados justo en las
    // cuestas. El autor: «no me gusta que cada 200 m esté indicándome el
    // desnivel y metros, es cansino y gastaremos la batería; con marcar toda
    // una subida, como de Trabakua a Zengotitagane, sería suficiente».
    // Ahora, cuando la ventana cumple, la subida se sigue hasta la CIMA -se
    // da por acabada al perder CLIMB_DROP metros desde el punto mas alto, que
    // un bajadita de 20 m en medio de un puerto no lo parte- y se suelta UN
    // aviso con lo que mide y lo que sube. Medido sobre las 72 rutas y 1.600
    // km: de 794 avisos a 238, y egoarbitza de 41 a 8.
    // Y no se cuenta cualquier repecho: hace falta subir CLIMB_MIN_GAIN
    // metros o medir CLIMB_MIN_LENGTH. Si algun dia sobran o faltan avisos,
    // esos dos numeros son el dial.
    private static final double CLIMB_DROP = 25, CLIMB_MIN_GAIN = 60, CLIMB_MIN_LENGTH = 600;
    private static final double WATER_NOTICE = 150, WATER_OFFSET = 30;
    private static final double CLIMB_LATE = 60;
    private static final double UMBRAL_DESNIVEL = 5, CIERRE_M = 300;
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
        // EL DESNIVEL SE CUENTA CON UN UMBRAL DE 5 M, como la pantalla. Sumar
        // cada metro de un punto al siguiente mete el ruido de las alturas: en
        // la ruta del autor del 14 de noviembre de 2026 daba 1732 m de subida
        // donde su Garmin midio 1182 y la ficha dice 1311; con el umbral, 1325.
        // Y el «quedan X m» iba inflado de principio a fin.
        double ref = Double.NaN;
        for (int i = 0; i < n; i++) {
            double[] p = points.get(i);
            double h = heightAt(i);
            missing[i + 1] = missing[i] + (Double.isFinite(h) ? 0 : 1);
            if (i > 0) {
                double[] a = points.get(i - 1);
                distance[i] = distance[i - 1] + meters(a[0], a[1], p[0], p[1]);
                ascent[i] = ascent[i - 1];
                descent[i] = descent[i - 1];
            }
            if (!Double.isFinite(h)) { ref = Double.NaN; continue; }
            if (!Double.isFinite(ref)) { ref = h; continue; }
            if (h >= ref + UMBRAL_DESNIVEL) { ascent[i] += h - ref; ref = h; }
            else if (h <= ref - UMBRAL_DESNIVEL) { descent[i] += ref - h; ref = h; }
        }
        if (total() <= 0) return;
        for (int dir : new int[]{1, -1}) {
            int i = dir > 0 ? 0 : n - 1;
            while (i >= 0 && i < n) {
                double from = distance[i], to = from + dir * CLIMB_LENGTH;
                double grade = to < 0 || to > total() || !hasHeights(from, to)
                        ? Double.NaN : (height(to) - height(from)) / CLIMB_LENGTH;
                if (!(grade + 1e-9 >= CLIMB_GRADE)) { i += dir; continue; }
                // Hasta la cima: se acaba al perder CLIMB_DROP desde lo mas alto.
                int top = i;
                double highest = heightAt(i);
                for (int j = i; j >= 0 && j < n; j += dir) {
                    double h = heightAt(j);
                    if (!Double.isFinite(h)) continue;
                    if (!Double.isFinite(highest) || h > highest) { highest = h; top = j; }
                    else if (highest - h > CLIMB_DROP) break;
                }
                double length = Math.abs(distance[top] - distance[i]);
                // Yendo al reves, lo que aqui se sube es lo que de ida se baja.
                double gain = dir > 0 ? ascent[top] - ascent[i] : descent[i] - descent[top];
                if (gain >= CLIMB_MIN_GAIN || length >= CLIMB_MIN_LENGTH) {
                    events.add(new Event(from, dir, new Notice(textoSubida(length, gain), 1)));
                }
                i = top == i ? i + dir : top;
            }
        }
        for (Water source : sources) addWater(source);
    }

    // «Empieza una subida de 5,5 kilometros y 344 metros». Lo que hace falta
    // saber antes de meterse: cuanto dura y cuanto sube. Ni el porcentaje ni
    // los 200 metros de la ventana, que no son la subida.
    private static String textoSubida(double length, double gain) {
        String largo = length >= 1000
                ? String.format(java.util.Locale.ROOT, "%.1f", length / 1000).replace('.', ',') + " kilómetros"
                : Math.round(length / 10) * 10 + " metros";
        return "Empieza una subida de " + largo + " y " + Math.round(gain) + " metros de desnivel";
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
        // EL FINAL DE UN CIRCUITO NO ES SU PRINCIPIO. Si la ruta acaba a menos
        // de 150 m de donde empieza y ya ibas por los ultimos CIERRE_M, volver
        // a la salida es terminar: sin esto, el tramo mas cercano era el del
        // km 0 y «quedan» volvia a ser la subida entera. Lo vio el autor al
        // llegar al coche: su ruta acababa 89 m antes de la salida.
        double total = total();
        if (hasReference && total > 2 * CIERRE_M && points.size() > 2) {
            double[] a = points.get(0), b = points.get(points.size() - 1);
            if (meters(a[0], a[1], b[0], b[1]) < 150) {
                // Solo es llegar si lo que faltaba cabe en lo movido (+60 m);
                // si no, una lectura en el km 0,2 te deja donde ibas.
                if (dir > 0 && reference > total - CIERRE_M && result.along < CIERRE_M)
                    result = new Projection(total - reference <= step + 60 ? total : reference, result.distance);
                else if (dir < 0 && reference < CIERRE_M && result.along > total - CIERRE_M)
                    result = new Projection(reference <= step + 60 ? 0 : reference, result.distance);
            }
        }
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
            // LA FUENTE SE APUNTA POR DONDE PASA, no solo por su nombre. Con
            // -1 todos los avisos de una misma fuente eran la misma entrada,
            // asi que se cantaba una vez y ya: en una ida y vuelta, al volver
            // a pasar por delante no decia nada. Y eso anula lo que hace
            // addWater, que a proposito guarda un aviso por pasada -«keep
            // equivalent passes»- y ya descarta los repetidos de la misma
            // pasada exigiendo 5 m entre uno y otro.
            Event key = new Event(event.along, dir, event.notice);
            if (announced.contains(key)) continue;
            double ahead = (event.along - along) * dir;
            // Una subida tambien vale con el arranque recien pasado, hasta
            // CLIMB_LATE. El servicio no pide avisos mientras canta un giro
            // (upcomingTurn), y si la subida empezaba junto a un cruce sus
            // 100 m de antes caian todos dentro de la ventana del giro: pasado
            // el arranque ya no se volvia a ofrecer y no se decia nunca. Asi
            // se dice en cuanto el giro queda atras. El agua no: decir «a -20
            // metros» no tiene sentido y la fuente se avisa a 150.
            if (ahead < (water ? -.01 : -CLIMB_LATE) || ahead > (water ? WATER_NOTICE : CLIMB_NOTICE)) continue;
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
