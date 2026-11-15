package com.trabakutik.gps;

/**
 * «HAS LLEGADO AL FINAL DE LA RUTA». OsmAnd y Locus lo dicen al llegar; este
 * navegador se callaba, y al final de una salida larga no sabias si habias
 * terminado o te quedaba un tramo. Se busco el 15 de noviembre de 2026,
 * comparando con otros navegadores.
 *
 * La trampa es la ruta circular: la salida y la llegada son el mismo sitio, y
 * al empezar estas a 0 m del final. Por eso no basta con estar cerca del
 * final: hay que haber andado de verdad al menos la mitad de la ruta. Lo
 * andado se cuenta con posiciones buenas (35 m o mejor) y solo cuando te
 * mueves 5 m o mas desde el ultimo punto apuntado: el baile del GPS parado no
 * suma. Se avisa una sola vez por ruta.
 *
 * Sin nada de Android, para poder probarlo con javac a secas.
 */
final class AvisoLlegada {
    static final double FALTA_M = 25;          // a esto del final, has llegado
    static final double RUTA_MINIMA_M = 300;   // en rutas mas cortas no se dice
    static final double ANDADO_MINIMO = 0.5;   // fraccion de la ruta andada de verdad
    static final double PASO_M = 5;            // menos que esto es el GPS bailando
    static final double SALTO_M = 100;         // mas que esto de golpe no se anda

    private boolean avisado = false;
    private double andado = 0, lat = Double.NaN, lon = Double.NaN;

    void reinicia() { avisado = false; andado = 0; lat = lon = Double.NaN; }

    double andado() { return andado; }

    /** Una posicion; precision en metros. */
    void posicion(double la, double lo, double precision) {
        if (!(precision <= 35)) return;
        if (Double.isNaN(lat)) { lat = la; lon = lo; return; }
        double d = metros(lat, lon, la, lo);
        if (d < PASO_M) return;
        if (d <= SALTO_M) andado += d;
        lat = la; lon = lo;
    }

    /** true UNA vez, al llegar: «hecho» y «total» por la ruta, en tu sentido. */
    boolean llega(double hecho, double total) {
        if (avisado || !(total >= RUTA_MINIMA_M)) return false;
        if (total - hecho <= FALTA_M && andado >= total * ANDADO_MINIMO) {
            avisado = true;
            return true;
        }
        return false;
    }

    static double metros(double la1, double lo1, double la2, double lo2) {
        double k = 111195, x = (lo2 - lo1) * k * Math.cos(Math.toRadians((la1 + la2) / 2)), y = (la2 - la1) * k;
        return Math.hypot(x, y);
    }
}
