package com.trabakutik.gps;

/**
 * EL AVISO DE CAIDA: decide, con el acelerometro y la velocidad, si parece
 * que te has caido. Lo pidio el autor el 15 de noviembre de 2026, con la
 * idea de Garmin delante: un golpe fuerte, una cuenta atras de 30 s y, si
 * nadie la para, un SOS al contacto que haya metido cada usuario.
 *
 * Una caida no se detecta nunca al 100 %, y Garmin lo dice en sus manuales.
 * Para que salte hacen falta TRES cosas seguidas, y cada una quita una clase
 * de falsa alarma:
 *  1. que te estuvieras MOVIENDO (al menos MOVIENDO_MS antes del golpe):
 *     si se te cae el movil estando parado, no es una caida tuya;
 *  2. un GOLPE de al menos GOLPE_G veces la gravedad que suba bruscamente;
 *  3. que despues te quedes QUIETO (QUIETO_S segundos seguidos sin apenas
 *     movimiento) dentro de VENTANA_MS: si tras el bache sigues pedaleando,
 *     o te levantas y andas, no salta. Y si el GPS vuelve a dar velocidad de
 *     marcha, se descarta.
 * Los numeros son los de partida, sin ninguna caida real medida: el registro
 * de golpes esta para ajustarlos con salidas de verdad.
 *
 * Sin nada de Android, para poder probarlo con javac a secas.
 */
final class DetectorCaidas {
    static final double G = 9.80665;
    static final double GOLPE_G = 3.0;            // pico de aceleracion que cuenta como golpe
    static final double MARCHA_MS = 1.0;          // m/s: por encima, te estas moviendo
    static final long MOVIENDO_MS = 2_000;        // el movimiento tiene que ser de hace menos de esto
    static final long PICO_MS = 150;
    static final double AUMENTO_G = 1.0;
    static final long VENTANA_MS = 30_000;        // tras el golpe, tiempo para quedarse quieto
    static final int QUIETO_S = 8;                // segundos seguidos quieto
    static final double QUIETO_DESV = 0.6;        // m/s2: desviacion del modulo en un segundo
    static final double SIGUE_MARCHA_MS = 1.5;    // m/s tras el golpe: sigues, no te has caido
    static final long ESPERA_MS = 60_000;         // tras un aviso, no otro en este tiempo
    // QUIETO DE VERDAD: un segundo cuenta si trae al menos MUESTRAS_MIN
    // muestras, y un hueco de mas de HUECO_MS sin muestras vuelve a empezar la
    // cuenta. Con una sola muestra la desviacion sale cero y parecia quieto; y
    // pedir 25 por segundo no garantiza que lleguen (revision con GPT).
    static final int MUESTRAS_MIN = 10;
    static final long HUECO_MS = 1000;

    private double moduloAnterior = Double.NaN;
    private long ultimoMovimiento = Long.MIN_VALUE / 2;
    private long golpeEn = -1;
    private double golpeG = 0;
    private long segundoEn = -1;
    private double suma = 0, suma2 = 0;
    private int n = 0, quietos = 0;
    private long ultimoAviso = Long.MIN_VALUE / 2;
    private long ultimaMuestra = Long.MIN_VALUE / 2;
    int golpes = 0;           // golpes fuertes estando en marcha (el registro)
    int caidas = 0;           // de ellos, los que acabaron en aviso

    /** Velocidad del GPS (m/s) en el instante t (ms). NaN si no la trae. */
    void velocidad(double v, long t) {
        if (!Double.isFinite(v)) return;
        if (v >= MARCHA_MS) ultimoMovimiento = t;
        if (golpeEn >= 0 && t > golpeEn + 2000 && v >= SIGUE_MARCHA_MS) descarta();
    }

    /** Una muestra del acelerometro (m/s2, con la gravedad) en t (ms). true = aviso. */
    boolean muestra(double x, double y, double z, long t) {
        double m = Math.sqrt(x * x + y * y + z * z);
        long antes = ultimaMuestra;
        double anterior = moduloAnterior;
        ultimaMuestra = t;
        moduloAnterior = m;
        if (golpeEn < 0) {
            boolean pico = t >= antes && t - antes <= PICO_MS && m - anterior >= AUMENTO_G * G;
            if (pico && m >= GOLPE_G * G && t - ultimoMovimiento <= MOVIENDO_MS && t - ultimoAviso >= ESPERA_MS) {
                golpeEn = t;
                golpeG = m / G;
                golpes++;
                segundoEn = t + 1000;   // el segundo del propio golpe no cuenta
                suma = suma2 = 0;
                n = 0;
                quietos = 0;
            }
            return false;
        }
        if (m / G > golpeG) golpeG = m / G;
        if (t - golpeEn > VENTANA_MS) { descarta(); return false; }
        if (t - antes > HUECO_MS) { quietos = 0; segundoEn = t; suma = suma2 = 0; n = 0; return false; }
        if (t < segundoEn) return false;
        suma += m;
        suma2 += m * m;
        n++;
        if (t - segundoEn >= 1000) {
            double media = suma / n, desv = Math.sqrt(Math.max(0, suma2 / n - media * media));
            quietos = n >= MUESTRAS_MIN && desv <= QUIETO_DESV ? quietos + 1 : 0;
            segundoEn = t;
            suma = suma2 = 0;
            n = 0;
            if (quietos >= QUIETO_S) {
                caidas++;
                ultimoAviso = t;
                golpeEn = -1;
                return true;
            }
        }
        return false;
    }

    /** El golpe en curso, en g, o 0 si no hay. */
    double golpeEnCurso() { return golpeEn >= 0 ? golpeG : 0; }

    private void descarta() { golpeEn = -1; quietos = 0; }
}
