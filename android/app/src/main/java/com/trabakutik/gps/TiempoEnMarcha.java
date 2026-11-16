package com.trabakutik.gps;

/**
 * EL TIEMPO EN MOVIMIENTO de la salida, sin las paradas. Lo pidio el autor el
 * 16 de noviembre de 2026 para la tercera casilla del panel de abajo, que
 * repetia la precision del GPS que ya sale arriba.
 *
 * Lo cuenta el servicio y no la pagina porque con la pantalla apagada la
 * pagina se duerme. La regla, a prueba del baile del GPS: se guarda un punto
 * de ANCLA y, cuando te alejas de el AVANCE_M o mas, el tiempo desde el ancla
 * cuenta como en marcha si ha pasado menos de PARADA_MS (y como mucho lo que
 * se tarda en esos metros yendo muy despacio); si ha pasado mas, es que
 * estabas parado y no suma. Error: unos 30 s por parada, como mucho. Parado, el GPS baila 2-5 m y no llega a
 * AVANCE_M; andando a 4 km/h se llega en 9 s, y subiendo despacio en 20-30.
 * Las posiciones malas (mas de PRECISION_M) no cuentan y un salto de mas de
 * SALTO_MS de golpe tampoco. Pausar rompe la cuenta: lo pausado no suma.
 *
 * Sin nada de Android, para poder probarlo con javac a secas.
 */
final class TiempoEnMarcha {
    static final double AVANCE_M = 10;
    static final long PARADA_MS = 30_000;
    static final double LENTO_MS = 0.35; // m/s: lo mas despacio que se avanza andando
    static final double PRECISION_M = 35;
    static final double SALTO_MS = 30;   // m/s: mas rapido que esto no se va

    private long total = 0, anclaT = -1;
    private double anclaLat = Double.NaN, anclaLon = Double.NaN;

    void reinicia() { total = 0; anclaT = -1; }
    void pausa() { anclaT = -1; }
    long totalMs() { return total; }

    void posicion(double la, double lo, double precision, long t) {
        if (!(precision <= PRECISION_M)) return;
        if (anclaT < 0) { anclaT = t; anclaLat = la; anclaLon = lo; return; }
        long dt = t - anclaT;
        if (dt <= 0) return;
        double d = metros(anclaLat, anclaLon, la, lo);
        if (d < AVANCE_M) {
            // Parado mas de PARADA_MS: el ancla se mueve aqui y no suma.
            if (dt > PARADA_MS) { anclaT = t; anclaLat = la; anclaLon = lo; }
            return;
        }
        // Al arrancar tras una parada, el ancla puede tener hasta PARADA_MS de
        // estar quieto: se suma como mucho lo que se tarda en esos metros
        // yendo muy despacio (LENTO_MS), no todo el rato desde el ancla.
        if (dt <= PARADA_MS && d / (dt / 1000.0) <= SALTO_MS) total += Math.min(dt, (long) (d / LENTO_MS * 1000));
        anclaT = t; anclaLat = la; anclaLon = lo;
    }

    static double metros(double la1, double lo1, double la2, double lo2) {
        double k = 111195, x = (lo2 - lo1) * k * Math.cos(Math.toRadians((la1 + la2) / 2)), y = (la2 - la1) * k;
        return Math.hypot(x, y);
    }
}
