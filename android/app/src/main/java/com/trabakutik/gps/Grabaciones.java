package com.trabakutik.gps;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Las grabaciones que la app guarda dentro (files/grabaciones), para poder
 * verlas y borrarlas desde «Mis rutas». Lo pidio el autor el 14 de noviembre
 * de 2026: «siempre que sea claro, que no se borre sin querer y que sea facil
 * de identificar». Por eso cada una sale con su fecha, su hora, sus km y su
 * duracion, y aqui solo se borra lo que es, sin duda, una grabacion nuestra:
 * un nombre con la forma exacta que pone el servicio, dentro de esa carpeta,
 * y nunca la que se esta grabando.
 *
 * Sin nada de Android, para poder probarlo con javac a secas.
 */
final class Grabaciones {
    private Grabaciones() {}

    /** El nombre que pone TrackingService.beginRecording, y ningun otro. */
    static final Pattern NOMBRE = Pattern.compile("trabakutik-\\d{8}-\\d{6}(_\\d+)?\\.gpx");
    private static final Pattern PUNTO = Pattern.compile(
            "<trkpt lat=\"(-?[0-9.]+)\" lon=\"(-?[0-9.]+)\"|<time>([^<]+)</time>|<trkseg>");
    /** Una grabacion de horas pesa unos pocos MB; mas que esto no es nuestra. */
    private static final long MAX_BYTES = 40_000_000L;

    /** Lista en JSON, la mas nueva primero. «activa» es el nombre que se graba ahora, o null. */
    static String lista(File dir, String activa) {
        File[] all = dir.listFiles((d, n) -> NOMBRE.matcher(n).matches());
        if (all == null || all.length == 0) return "[]";
        // El nombre lleva la fecha y la hora: ordenar por nombre es ordenar por cuando empezo.
        Arrays.sort(all, (a, b) -> b.getName().compareTo(a.getName()));
        StringBuilder sb = new StringBuilder("[");
        for (File f : all) {
            if (sb.length() > 1) sb.append(',');
            sb.append(resumen(f, f.getName().equals(activa)));
        }
        return sb.append(']').toString();
    }

    /** Nombre, bytes, primera y ultima hora, km (sin unir los cortes) y puntos. */
    static String resumen(File f, boolean grabando) {
        String inicio = "", fin = "";
        double metros = 0;
        int puntos = 0;
        if (f.length() <= MAX_BYTES) {
            try {
                String xml = new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8);
                Matcher m = PUNTO.matcher(xml);
                double lat0 = Double.NaN, lon0 = Double.NaN;
                while (m.find()) {
                    if (m.group(1) != null) {
                        double lat = Double.parseDouble(m.group(1)), lon = Double.parseDouble(m.group(2));
                        if (Double.isFinite(lat0)) metros += metros(lat0, lon0, lat, lon);
                        lat0 = lat;
                        lon0 = lon;
                        puntos++;
                    } else if (m.group(3) != null) {
                        if (inicio.isEmpty()) inicio = m.group(3);
                        fin = m.group(3);
                    } else {
                        // Un corte por perdida de senal: no se une con una recta.
                        lat0 = Double.NaN;
                        lon0 = Double.NaN;
                    }
                }
            } catch (Exception ignored) {
                // Ilegible: sale sin datos, pero sale, para que se pueda borrar.
            }
        }
        return "{\"nombre\":\"" + f.getName() + "\",\"bytes\":" + f.length()
                + ",\"inicio\":\"" + limpio(inicio) + "\",\"fin\":\"" + limpio(fin)
                + "\",\"km\":" + Math.round(metros / 10) / 100.0 + ",\"puntos\":" + puntos
                + ",\"grabando\":" + grabando + "}";
    }

    /**
     * Borra una grabacion. Solo si el nombre es exactamente de los nuestros, si
     * el fichero esta en esa carpeta y no es el que se esta grabando.
     */
    static boolean borra(File dir, String nombre, String activa) {
        if (nombre == null || !NOMBRE.matcher(nombre).matches()) return false;
        if (nombre.equals(activa)) return false;
        File f = new File(dir, nombre);
        try {
            if (!f.getCanonicalFile().getParentFile().equals(dir.getCanonicalFile())) return false;
        } catch (Exception e) {
            return false;
        }
        return f.isFile() && f.delete();
    }

    private static String limpio(String s) {
        return s.replaceAll("[^0-9TZ:.+-]", "");
    }

    private static double metros(double lat1, double lon1, double lat2, double lon2) {
        double r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
        double q = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 12742000 * Math.asin(Math.min(1, Math.sqrt(q)));
    }
}
