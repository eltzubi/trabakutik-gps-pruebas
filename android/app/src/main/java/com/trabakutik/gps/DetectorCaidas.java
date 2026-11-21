package com.trabakutik.gps;

/**
 * EL AVISO DE CAIDA: decide, con el acelerometro y la velocidad, si parece
 * que te has caido. Lo pidio el autor el 15 de noviembre de 2026, con la
 * idea de Garmin delante: un golpe fuerte, una cuenta atras de 30 s y, si
 * nadie la para, un SOS al contacto que haya metido cada usuario.
 *
 * Busca un impacto brusco en marcha, seguido de ocho segundos continuos
 * de quietud iniciados enseguida y un cambio de orientacion. Los umbrales
 * son provisionales hasta contar con trazas de campo.
 *
 * Sin nada de Android, para poder probarlo con javac a secas.
 */
final class DetectorCaidas {
    static final double G = 9.80665;
    static final double GOLPE_G = 2.5;            // incluye golpes amortiguados
    static final double MARCHA_MS = 1.0;          // m/s: por encima, te estas moviendo
    static final long MOVIENDO_MS = 2_000;        // el movimiento tiene que ser de hace menos de esto
    static final long PICO_MS = 150;
    static final double AUMENTO_G = 1.0;
    static final long INICIO_QUIETUD_MS = 2_150;        // unos 2 s, con margen por la cadencia del sensor
    static final double COS_GIRO = Math.sqrt(0.5);
    static final int QUIETO_S = 8;                // segundos seguidos quieto
    static final double QUIETO_DESV = 0.6;        // m/s2: dispersion del vector en un segundo
    static final double SIGUE_MARCHA_MS = 1.0;    // m/s tras el golpe: sigues, no te has caido
    static final long ESPERA_MS = 60_000;         // tras un aviso, no otro en este tiempo
    // QUIETO DE VERDAD: un segundo cuenta si trae al menos MUESTRAS_MIN
    // muestras. Un hueco de mas de HUECO_MS invalida la quietud. Con una sola muestra la desviacion sale cero y parecia quieto; y
    // pedir 25 por segundo no garantiza que lleguen (revision con GPT).
    static final int MUESTRAS_MIN = 10;
    static final long HUECO_MS = 1000;

    private double moduloAnterior = Double.NaN;
    private long ultimoMovimiento = Long.MIN_VALUE / 2;
    private long golpeEn = -1;
    private double golpeG = 0;
    private long segundoEn = -1;
    private double gx, gy, gz;
    private double sumaX, sumaY, sumaZ, suma2;
    private int n = 0, quietos = 0;
    private long ultimoAviso = Long.MIN_VALUE / 2;
    private long ultimaMuestra = Long.MIN_VALUE / 2;
    int golpes = 0;           // golpes fuertes estando en marcha (el registro)
    int caidas = 0;           // de ellos, los que acabaron en aviso

    /** Velocidad del GPS (m/s) en el instante t (ms). NaN si no la trae. */
    void velocidad(double v, long t) {
        if (!Double.isFinite(v)) return;
        if (v >= MARCHA_MS) ultimoMovimiento = t;
        if (golpeEn >= 0 && t - golpeEn > INICIO_QUIETUD_MS && v >= SIGUE_MARCHA_MS) descarta();
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
                reiniciaSegundo();
                quietos = 0;
            } else if (m >= 0.7 * G && m <= 1.3 * G) {
                // Orientacion previa, estimada con muestras cercanas a 1 g.
                double peso = antes < 0 || t - antes > HUECO_MS ? 1 : 0.10;
                gx += peso * (x - gx);
                gy += peso * (y - gy);
                gz += peso * (z - gz);
            }
            return false;
        }
        if (m / G > golpeG) golpeG = m / G;
        if (t - antes > HUECO_MS || (quietos == 0 && segundoEn - golpeEn > INICIO_QUIETUD_MS)) {
            descarta();
            return false;
        }
        if (t < segundoEn) return false;
        sumaX += x;
        sumaY += y;
        sumaZ += z;
        suma2 += m * m;
        n++;
        if (t - segundoEn >= 1000) {
            double mx = sumaX / n, my = sumaY / n, mz = sumaZ / n;
            double norma = Math.sqrt(mx * mx + my * my + mz * mz);
            double desv = Math.sqrt(Math.max(0, suma2 / n - norma * norma));
            boolean estable = n >= MUESTRAS_MIN && desv <= QUIETO_DESV && norma >= 0.8 * G && norma <= 1.2 * G;
            if (!estable && (quietos > 0 || t - golpeEn > INICIO_QUIETUD_MS)) {
                descarta();
                return false;
            }
            if (estable) quietos++;
            segundoEn = t;
            reiniciaSegundo();
            if (quietos >= QUIETO_S) {
                double referencia = Math.sqrt(gx * gx + gy * gy + gz * gz);
                boolean giro = referencia >= 0.7 * G
                        && gx * mx + gy * my + gz * mz < COS_GIRO * referencia * norma;
                descarta();
                if (!giro) return false;
                caidas++;
                ultimoAviso = t;
                return true;
            }
        }
        return false;
    }

    /** El golpe en curso, en g, o 0 si no hay. */
    double golpeEnCurso() { return golpeEn >= 0 ? golpeG : 0; }

    private void reiniciaSegundo() {
        sumaX = sumaY = sumaZ = suma2 = 0;
        n = 0;
    }

    private void descarta() { golpeEn = -1; quietos = 0; }
}
