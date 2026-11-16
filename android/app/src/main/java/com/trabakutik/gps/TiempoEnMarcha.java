package com.trabakutik.gps;

/**
 * EL TIEMPO EN MOVIMIENTO de la salida, sin las paradas. Lo pidio el autor el
 * 16 de noviembre de 2026 para la tercera casilla del panel de abajo, que
 * repetia la precision del GPS que ya sale arriba. Lo cuenta el servicio y
 * no la pagina porque con la pantalla apagada la pagina se duerme.
 *
 * CON LA VELOCIDAD DEL GPS, NO CON LA POSICION. La primera version contaba
 * por distancia (10 m desde un punto de ancla) y una revision con GPT le saco
 * dos fallos de verdad: bajo arbolado la posicion baila mas de 10 m estando
 * parado, y una parada entera podia contarse como marcha; y subiendo muy
 * despacio podia dar cero. La velocidad que da el receptor sale del efecto
 * Doppler y no depende de que la posicion salte: parado se queda cerca de 0.
 * Se suaviza (media movil) y tiene histeresis: empieza a contar al pasar de
 * ARRANCA_MS y deja de contar al bajar de PARA_MS. Entre dos posiciones
 * seguidas se suma su intervalo si se esta en marcha, con un tope de HUECO_MS
 * (un corte de señal no cuenta entero).
 *
 * Sin velocidad (algun receptor no la da) se usa el metodo de distancia, con
 * ancla y como mucho lo que se tarda en esos metros yendo muy despacio.
 *
 * El tiempo es el de cada POSICION (elapsedRealtime de la medida), no el de
 * llegada: si Android las entrega con retraso o en grupo, cuenta igual. Las
 * posiciones malas (mas de PRECISION_M), las viejas o repetidas y los saltos
 * de mas de SALTO_MS entre posiciones SEGUIDAS no cuentan. Pausar rompe la
 * cuenta: lo pausado no suma.
 *
 * Sin nada de Android, para poder probarlo con javac a secas.
 */
final class TiempoEnMarcha {
    static final double PRECISION_M = 35;
    static final double SALTO_MS = 30;        // m/s entre posiciones seguidas
    static final double ARRANCA_MS = 0.45;    // m/s suavizados: en marcha
    static final double PARA_MS = 0.25;       // m/s suavizados: parado
    static final long HUECO_MS = 5_000;       // tope de un intervalo que cuenta
    // Sin velocidad del GPS:
    static final double AVANCE_M = 10;
    static final long PARADA_MS = 30_000;
    static final double LENTO_MS = 0.35;

    private long total = 0, ultimoT = -1, anclaT = -1;
    private double ultLat, ultLon, anclaLat, anclaLon, vSuave = 0;
    private boolean enMarcha = false;

    void reinicia() { total = 0; pausa(); }
    void pausa() { ultimoT = -1; anclaT = -1; vSuave = 0; enMarcha = false; }
    long totalMs() { return total; }

    /** Una posicion: precision en m, t en ms (de la medida), velocidad en m/s o NaN. */
    void posicion(double la, double lo, double precision, long t, double velocidad) {
        if (!(precision <= PRECISION_M)) return;
        if (ultimoT >= 0) {
            if (t <= ultimoT) return;                         // vieja o repetida
            double d = metros(ultLat, ultLon, la, lo);
            if (d / ((t - ultimoT) / 1000.0) > SALTO_MS) return;  // salto: se ignora
        }
        long dt = ultimoT < 0 ? 0 : t - ultimoT;
        ultimoT = t; ultLat = la; ultLon = lo;
        if (Double.isFinite(velocidad) && velocidad >= 0) {
            vSuave = vSuave * 0.5 + velocidad * 0.5;
            if (enMarcha ? vSuave < PARA_MS : vSuave >= ARRANCA_MS) enMarcha = !enMarcha;
            if (enMarcha && dt > 0) total += Math.min(dt, HUECO_MS);
            anclaT = -1;
            return;
        }
        // Sin velocidad: por distancia desde el ancla.
        if (anclaT < 0) { anclaT = t; anclaLat = la; anclaLon = lo; return; }
        long da = t - anclaT;
        double dd = metros(anclaLat, anclaLon, la, lo);
        if (dd < AVANCE_M) {
            if (da > PARADA_MS) { anclaT = t; anclaLat = la; anclaLon = lo; }
            return;
        }
        if (da <= PARADA_MS) total += Math.min(da, (long) (dd / LENTO_MS * 1000));
        anclaT = t; anclaLat = la; anclaLon = lo;
    }

    static double metros(double la1, double lo1, double la2, double lo2) {
        double k = 111195, x = (lo2 - lo1) * k * Math.cos(Math.toRadians((la1 + la2) / 2)), y = (la2 - la1) * k;
        return Math.hypot(x, y);
    }
}
