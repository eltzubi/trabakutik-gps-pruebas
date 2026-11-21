package com.trabakutik.gps;

/** Decide qué posiciones pasan al GPX y al trazado en directo. */
final class FiltroDeriva {
    private long anterior = -1;
    private boolean corte;
    private int avances;

    void reinicia() {
        anterior = -1;
        corte = false;
        avances = 0;
    }

    boolean cortePendiente() { return corte; }

    void guardado() { corte = false; }

    boolean acepta(long tiempo, double precision, double velocidad, double distancia, boolean hayPunto) {
        if (!(precision > 0 && precision <= 35) || (anterior >= 0 && tiempo <= anterior)) return false;
        if (anterior >= 0 && tiempo - anterior > 20_000) {
            corte = true;
            avances = 0;
        }
        anterior = tiempo;
        if (!hayPunto) return true;

        // El Doppler aporta evidencia de movimiento independiente del baile de la posición.
        boolean conVelocidad = Double.isFinite(velocidad) && velocidad >= 0;
        double minimo = conVelocidad ? 1.5 : Math.max(8, 1.5 * precision);
        boolean moviendo = conVelocidad ? velocidad >= 0.30 : distancia >= minimo;
        if (!moviendo) {
            avances = 0;
            return false;
        }
        if (avances < 2) avances++;
        return avances >= 2 && distancia >= minimo;
    }
}
