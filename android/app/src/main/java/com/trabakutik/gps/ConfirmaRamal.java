package com.trabakutik.gps;

/** Comprueba la salida del cruce con geometría local y rumbo de movimiento. */
final class ConfirmaRamal {
    record Cruce(double km, double[][] ramas) {}
    private Cruce cruce;
    private int sentido;
    private long tiempo, inicio;
    private double[] ancla;
    private int anterior, lecturas, confirmado;

    void reinicia() {
        cruce = null;
        ancla = null;
        anterior = lecturas = confirmado = 0;
    }

    int muestra(Cruce cerca, int dir, double lat, double lon, double precision, long ahora) {
        if (dir != sentido || ahora <= tiempo || ahora - tiempo > 5_000 || ahora - inicio > 45_000) reinicia();
        sentido = dir;
        tiempo = ahora;
        if (!Double.isFinite(precision) || precision <= 0 || precision > 20) {
            ancla = null;
            anterior = lecturas = confirmado = 0;
            return 0;
        }
        if (cruce == null) {
            cruce = cerca;
            inicio = ahora;
        }
        if (cruce == null) return 0;
        double[][] datos = cruce.ramas();
        double[] origen = datos[0];
        double escala = 111195 * Math.cos(Math.toRadians(origen[0]));
        double x = (lon - origen[1]) * escala;
        double y = (lat - origen[0]) * 111195;
        double radio = Math.hypot(x, y);
        if (radio > 38) { reinicia(); return 0; }
        if (radio < 9 || ancla == null) {
            ancla = new double[]{x, y};
            anterior = lecturas = confirmado = 0;
            return 0;
        }
        double dx = x - ancla[0], dy = y - ancla[1];
        double avance = Math.hypot(dx, dy);
        if (avance < Math.max(5, precision)) return confirmado;
        ancla = new double[]{x, y};
        double mejor = Double.POSITIVE_INFINITY, segundo = mejor, producto = 0;
        int rama = -1;
        for (int i = 1; i < datos.length; i++) {
            double rx = (datos[i][1] - origen[1]) * escala, ry = (datos[i][0] - origen[0]) * 111195;
            double largo = Math.hypot(rx, ry);
            if (largo < 8) continue;
            double u = Math.max(0, Math.min(1, (x * rx + y * ry) / (largo * largo)));
            double error = Math.hypot(x - u * rx, y - u * ry);
            if (error < mejor) {
                segundo = mejor;
                mejor = error;
                rama = i;
                producto = (dx * rx + dy * ry) / (avance * largo);
            } else if (error < segundo) segundo = error;
        }
        int evidencia = segundo - mejor > precision + 3 && mejor <= precision
                && producto >= 0.82 && x * dx + y * dy > 0 ? (rama == 1 ? 1 : -rama) : 0;
        lecturas = evidencia == anterior ? lecturas + 1 : 1;
        anterior = evidencia;
        if (lecturas >= 2) confirmado = evidencia;
        return confirmado;
    }
}
