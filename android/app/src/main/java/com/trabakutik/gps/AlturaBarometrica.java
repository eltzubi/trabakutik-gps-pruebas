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
 * LA PAUSA VA POR LA HORA DE CADA LECTURA, no por cuando llega. Las lecturas
 * llegan en lotes de hasta 10 s, asi que una medida durante la pausa podia
 * llegar ya reanudado y contarse; y al seguir, el filtro arrastraba la altura
 * de antes de la pausa y sumaba esa diferencia. Ahora: lo medido entre pausa
 * y reanudacion no entra, y la primera lectura de despues reinicia el filtro
 * entero, no solo la referencia. Una lectura repetida o desordenada se tira:
 * antes ponia el filtro de golpe en ella y podia contar un salto. Revisado
 * con GPT el 15 de noviembre de 2026.
 *
 * Lo que sigue sin hacer, a sabiendas: subidas y bajadas repetidas de menos
 * de UMBRAL_M no suman (en un terreno muy ondulado se cuenta de menos), y al
 * parar pueden quedar sin contar las lecturas del ultimo lote y el retraso
 * del filtro (unos metros si se para subiendo).
 *
 * Sin nada de Android, para poder probarlo con javac a secas.
 */
final class AlturaBarometrica {
    static final double UMBRAL_M = 3;
    static final double TAU_MS = 10_000;

    private double suave = Double.NaN, ref = Double.NaN;
    private long ultima = -1;
    private boolean enPausa = false, reiniciar = false;
    private long pausaDesde = -1, sigueDesde = -1, ultimaUsada = -1;
    double sube = 0, baja = 0;
    int muestras = 0;

    /** La altura de la atmosfera estandar para una presion en hPa. */
    static double altura(double hPa) {
        return 44330.0 * (1 - Math.pow(hPa / 1013.25, 1 / 5.255));
    }

    /** Una lectura del barometro (hPa) en el instante t (ms). */
    void muestra(double hPa, long t) {
        if (!(hPa > 300 && hPa < 1100)) return;     // lectura imposible
        if (ultima >= 0 && t <= ultima) return;      // repetida o desordenada
        double h = altura(hPa);
        ultima = t;
        muestras++;
        // Medida durante una pausa (aunque llegue despues): no entra.
        if (pausaDesde >= 0 && t >= pausaDesde && (enPausa || t < sigueDesde)) return;
        if (Double.isNaN(suave) || (reiniciar && t >= sigueDesde)) {
            suave = h; ref = h; reiniciar = false; ultimaUsada = t;
            return;
        }
        suave += (1 - Math.exp(-(t - ultimaUsada) / TAU_MS)) * (h - suave);
        ultimaUsada = t;
        if (Double.isNaN(ref)) { ref = suave; return; }
        if (suave >= ref + UMBRAL_M) { sube += suave - ref; ref = suave; }
        else if (suave <= ref - UMBRAL_M) { baja += ref - suave; ref = suave; }
    }

    /** Pausa desde el instante t (ms, la misma base que las lecturas). */
    void pausa(long t) { enPausa = true; pausaDesde = t; }

    /** Reanuda en t: lo medido en pausa no cuenta y el filtro empieza de cero. */
    void sigue(long t) { enPausa = false; sigueDesde = t; reiniciar = true; }

    void reinicia() {
        suave = ref = Double.NaN;
        ultima = ultimaUsada = pausaDesde = sigueDesde = -1;
        enPausa = reiniciar = false;
        sube = baja = 0;
        muestras = 0;
    }
}
