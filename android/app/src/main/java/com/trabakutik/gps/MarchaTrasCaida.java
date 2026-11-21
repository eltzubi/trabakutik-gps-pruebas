package com.trabakutik.gps;

/** Confirma marcha continua durante la cuenta atrás del SOS. */
final class MarchaTrasCaida {
    private static final long CONTINUA_MS = 5_000;
    private static final long MAX_HUECO_MS = 2_000;
    private static final double MARCHA_MS = 1.0;

    private long inicio;
    private long anterior;
    private long enMarcha;

    void inicia(long ahora) {
        inicio = ahora;
        anterior = enMarcha = -1;
    }

    boolean muestra(long tiempo, double velocidad) {
        if (tiempo < inicio || tiempo <= anterior) return false;
        if (tiempo - anterior > MAX_HUECO_MS) enMarcha = -1;
        anterior = tiempo;
        if (!Double.isFinite(velocidad) || velocidad < MARCHA_MS) {
            enMarcha = -1;
            return false;
        }
        if (enMarcha < 0) enMarcha = tiempo;
        return tiempo - enMarcha >= CONTINUA_MS;
    }
}
