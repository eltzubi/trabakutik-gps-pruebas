package com.trabakutik.gps;

/**
 * EL AVISO DE CAIDA: decide, con el acelerometro y la velocidad, si parece
 * que te has caido. Lo pidio el autor el 15 de noviembre de 2026, con la
 * idea de Garmin delante: un golpe fuerte, una cuenta atras de 30 s y, si
 * nadie la para, un SOS al contacto que haya metido cada usuario.
 *
 * Busca un impacto brusco en marcha, seguido de ocho segundos continuos
 * de quietud que empiecen en los INICIO_QUIETUD_MS siguientes, y un cambio
 * de orientacion. Los umbrales son provisionales hasta contar con trazas de
 * campo.
 *
 * 15 S PARA QUEDARSE QUIETO, NO 2 (21 nov 2026). Con 2 s, una caida rapida
 * en carretera -rodar o deslizarse por el suelo mas de 2 s, o moverse un
 * momento antes de quedarse quieto- no saltaba nunca, y son las mas graves.
 * Antes de los 15 s, moverse no descarta: la cuenta de quietud vuelve a
 * empezar. Pasados los 15 s, si no estas quieto, o te mueves, se descarta.
 * Y el GPS en marcha solo descarta a partir de SIGUE_MARCHA_TRAS_MS: un
 * deslizamiento de unos segundos tambien da velocidad. Lo aprobo el autor.
 *
 * SIN VELOCIDAD DE GPS, LA MARCHA LA DICE EL ACELEROMETRO (22 nov 2026).
 * El servicio solo pasa la velocidad cuando la posicion tiene 30 m de
 * precision o mejor, asi que bajo arbolado -donde esta medido que son 25-35 m-
 * dejan de llegar velocidades. Y sin velocidad, ultimoMovimiento envejece y
 * el golpe NO SE ARMA: medido, basta con que la ultima posicion buena tenga
 * mas de 1,9 s para que no se registre ni el golpe. Es decir, el aviso de
 * caida se apagaba solo justo donde peor es la señal y mas falta hace.
 *
 * El arreglo NO es acreditar la marcha con el acelerometro siempre: eso
 * devolveria la falsa alarma que conto el autor -«cada vez que paraba para
 * mirar el movil, saltaba la alarma»-, porque sacar el movil del bolsillo es
 * un golpe, mirarlo son ocho segundos quieto y el bolsillo a la mano es un
 * cambio de orientacion. Con el GPS diciendo que te has parado, eso no se
 * arma, y asi tiene que seguir.
 *
 * Por eso el acelerometro solo vale de SUPLENTE: entra unicamente cuando
 * hace mas de SIN_VELOCIDAD_MS que no llega ninguna velocidad utilizable, y
 * aun asi pide dos segundos seguidos de agitacion por encima de MARCHA_DESV,
 * que una sacudida suelta no da. Si el GPS habla, manda el GPS.
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
    static final long INICIO_QUIETUD_MS = 15_000;       // tiempo para empezar a estar quieto tras el golpe
    static final long SIGUE_MARCHA_TRAS_MS = 8_000;     // GPS en marcha pasado esto: sigues, no te has caido
    static final double COS_GIRO = Math.sqrt(0.5);
    static final int QUIETO_S = 8;                // segundos seguidos quieto
    static final double QUIETO_DESV = 0.6;        // m/s2: dispersion del vector en un segundo
    static final double SIGUE_MARCHA_MS = 1.0;    // m/s tras el golpe: sigues, no te has caido
    static final long SIN_VELOCIDAD_MS = 4_000;   // sin velocidad utilizable desde hace esto: entra el suplente
    static final double MARCHA_DESV = 1.0;        // m/s2: dispersion del modulo en un segundo que ya es andar
    static final int MARCHA_SEGUNDOS = 2;         // segundos seguidos asi: vas en marcha
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
    private long ultimaVelocidad = Long.MIN_VALUE / 2;
    private long movimientoAcc = Long.MIN_VALUE / 2;
    private long marchaSegundoEn = -1;
    private double marchaSuma, marchaSuma2;
    private int marchaN = 0, marchaSeguidos = 0;
    int golpes = 0;           // golpes fuertes estando en marcha (el registro)
    int caidas = 0;           // de ellos, los que acabaron en aviso

    /** Velocidad del GPS (m/s) en el instante t (ms). NaN si no la trae. */
    void velocidad(double v, long t) {
        if (!Double.isFinite(v)) return;
        ultimaVelocidad = t;
        if (v >= MARCHA_MS) ultimoMovimiento = t;
        if (golpeEn >= 0 && t - golpeEn > SIGUE_MARCHA_TRAS_MS && v >= SIGUE_MARCHA_MS) descarta();
    }

    /** Una muestra del acelerometro (m/s2, con la gravedad) en t (ms). true = aviso. */
    boolean muestra(double x, double y, double z, long t) {
        double m = Math.sqrt(x * x + y * y + z * z);
        long antes = ultimaMuestra;
        double anterior = moduloAnterior;
        ultimaMuestra = t;
        moduloAnterior = m;
        if (golpeEn < 0) {
            miraMarchaAcc(m, t);
            // El GPS manda; el acelerometro solo habla si el GPS lleva callado.
            boolean sinGps = t - ultimaVelocidad > SIN_VELOCIDAD_MS;
            boolean enMarcha = t - ultimoMovimiento <= MOVIENDO_MS
                    || (sinGps && t - movimientoAcc <= MOVIENDO_MS);
            boolean pico = t >= antes && t - antes <= PICO_MS && m - anterior >= AUMENTO_G * G;
            if (pico && m >= GOLPE_G * G && enMarcha && t - ultimoAviso >= ESPERA_MS) {
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
            if (!estable) {
                // Pasado el plazo, moverse descarta; dentro, se vuelve a empezar.
                if (t - golpeEn > INICIO_QUIETUD_MS) {
                    descarta();
                    return false;
                }
                quietos = 0;
            } else quietos++;
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

    /**
     * Agitacion del acelerometro, segundo a segundo, mientras no hay golpe en
     * curso. Dos segundos seguidos por encima de MARCHA_DESV valen por una
     * velocidad de GPS; uno solo no, para que una sacudida al sacar el movil
     * del bolsillo no cuente como ir andando.
     */
    private void miraMarchaAcc(double m, long t) {
        if (marchaSegundoEn < 0 || t < marchaSegundoEn || t - ultimaMuestra > HUECO_MS) {
            marchaSegundoEn = t;
            marchaSuma = marchaSuma2 = 0;
            marchaN = 0;
            marchaSeguidos = 0;
            return;
        }
        marchaSuma += m;
        marchaSuma2 += m * m;
        marchaN++;
        if (t - marchaSegundoEn < 1000) return;
        double media = marchaSuma / marchaN;
        double desv = Math.sqrt(Math.max(0, marchaSuma2 / marchaN - media * media));
        if (marchaN >= MUESTRAS_MIN && desv >= MARCHA_DESV) {
            if (++marchaSeguidos >= MARCHA_SEGUNDOS) movimientoAcc = t;
        } else marchaSeguidos = 0;
        marchaSegundoEn = t;
        marchaSuma = marchaSuma2 = 0;
        marchaN = 0;
    }

    private void reiniciaSegundo() {
        sumaX = sumaY = sumaZ = suma2 = 0;
        n = 0;
    }

    private void descarta() { golpeEn = -1; quietos = 0; }
}
