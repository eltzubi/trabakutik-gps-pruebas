package com.trabakutik.gps;

/**
 * LO SUBIDO Y LO BAJADO, CON EL BAROMETRO. Lo pidio el autor el 15 de
 * noviembre de 2026: que el recuadro cuente desde donde empieza el, tambien lo
 * andado fuera de la ruta (salio 1,5 km antes de Trabakua-Mendibil). Fuera de
 * la ruta no hay perfil, y la altura del GPS no vale para esto: va sobre el
 * elipsoide, se equivoca 10-20 m y su ruido suma subidas que no existen. El
 * barometro mide la diferencia de presion con una precision de decimetros.
 *
 * Lo que NO hace: dar la altitud. La presion cambia con el tiempo que hace
 * (1 hPa son unos 8 m), asi que la altura absoluta del barometro no vale; las
 * diferencias de un rato si. Un cambio de tiempo de 1 hPa en tres horas se
 * contaria como 8 m: frente a los cientos de metros de una ruta, poco.
 *
 * Se suaviza (media exponencial de TAU_MS) y se cuenta con un umbral de
 * UMBRAL_M, como el perfil: lo que no pasa del umbral no suma. En pausa no
 * cuenta nada, y al seguir se empieza desde la altura de ese momento.
 *
 * Sin nada de Android, para poder probarlo con javac a secas.
 */
final class AlturaBarometrica {
    static final double UMBRAL_M = 3;
    static final double TAU_MS = 10_000;

    private double suave = Double.NaN, ref = Double.NaN;
    private long ultima = -1;
    private boolean enPausa = false;
    double sube = 0, baja = 0;
    int muestras = 0;

    /** La altura de la atmosfera estandar para una presion en hPa. */
    static double altura(double hPa) {
        return 44330.0 * (1 - Math.pow(hPa / 1013.25, 1 / 5.255));
    }

    /** Una lectura del barometro (hPa) en el instante t (ms). */
    void muestra(double hPa, long t) {
        if (!(hPa > 300 && hPa < 1100)) return;     // lectura imposible
        double h = altura(hPa);
        if (ultima < 0 || t <= ultima) suave = h;
        else suave += (1 - Math.exp(-(t - ultima) / TAU_MS)) * (h - suave);
        ultima = t;
        muestras++;
        if (enPausa) return;
        if (Double.isNaN(ref)) { ref = suave; return; }
        if (suave >= ref + UMBRAL_M) { sube += suave - ref; ref = suave; }
        else if (suave <= ref - UMBRAL_M) { baja += ref - suave; ref = suave; }
    }

    void pausa() { enPausa = true; }

    /** Al seguir, la referencia es la altura de ahora: la pausa no cuenta. */
    void sigue() { enPausa = false; ref = Double.NaN; }

    void reinicia() {
        suave = ref = Double.NaN;
        ultima = -1;
        enPausa = false;
        sube = baja = 0;
        muestras = 0;
    }
}
