package com.trabakutik.gps;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.telephony.SmsManager;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

/**
 * Manda un SMS a cada contacto y CUENTA LO QUE DE VERDAD HA SALIDO. Antes se
 * daba por enviado en cuanto el telefono aceptaba el encargo, y un fallo de
 * cobertura o de SIM llega despues: se podia decir «SOS enviado» de uno que
 * no habia salido. Lo vio la revision con GPT el 15 de noviembre de 2026.
 * Ahora cada trozo del mensaje trae su resultado y, al acabar (o a los
 * ESPERA_MS), se dice a quien ha llegado al operador y a quien no.
 */
final class EnvioSms {
    private EnvioSms() {}
    static final long ESPERA_MS = 60_000;
    private static int serie = 0;


    enum Estado { ENVIADO, FALLO, PARCIAL, DUDOSO, SIN_COBERTURA }

    static void envia(Context ctx, List<ContactosSos.Contacto> contactos, String mensaje, Consumer<String> fin) {
        intento(ctx, contactos, mensaje, estados -> fin.accept(resumen(contactos, estados)));
    }

    static void enviaEmergencia(Context ctx, List<ContactosSos.Contacto> contactos, String mensaje,
                               Consumer<String> pendiente, Consumer<String> fin) {
        reintenta(ctx.getApplicationContext(), contactos, mensaje, new Estado[contactos.size()], 0, pendiente, fin);
    }

    private static void reintenta(Context app, List<ContactosSos.Contacto> contactos, String mensaje,
                                  Estado[] estados, int ronda, Consumer<String> pendiente, Consumer<String> fin) {
        List<ContactosSos.Contacto> actuales = new ArrayList<>();
        List<Integer> indices = new ArrayList<>();
        for (int i = 0; i < contactos.size(); i++) {
            if (estados[i] == null || estados[i] == Estado.SIN_COBERTURA) {
                actuales.add(contactos.get(i));
                indices.add(i);
            }
        }
        intento(app, actuales, mensaje, resultado -> {
            boolean hayPendiente = false;
            for (int i = 0; i < resultado.length; i++) {
                estados[indices.get(i)] = resultado[i];
                hayPendiente |= resultado[i] == Estado.SIN_COBERTURA;
            }
            if (!hayPendiente || ronda >= 2) {
                fin.accept(resumen(contactos, estados));
                return;
            }
            pendiente.accept("SOS pendiente por falta de cobertura. Se volverá a intentar. " + resumen(contactos, estados));
            new Handler(Looper.getMainLooper()).postDelayed(
                    () -> reintenta(app, contactos, mensaje, estados, ronda + 1, pendiente, fin), ronda == 0 ? 30_000 : 60_000);
        });
    }

    private static String resumen(List<ContactosSos.Contacto> contactos, Estado[] estados) {
        StringBuilder si = new StringBuilder(), no = new StringBuilder(), duda = new StringBuilder(), medias = new StringBuilder();
        for (int i = 0; i < estados.length; i++) {
            StringBuilder lista = switch (estados[i]) {
                case ENVIADO -> si;
                case PARCIAL -> medias;
                case DUDOSO -> duda;
                default -> no;
            };
            if (lista.length() > 0) lista.append(", ");
            lista.append(contactos.get(i).nombre());
        }
        return ContactosSos.textoEnvio(si.toString(), no.toString(), duda.toString(), medias.toString());
    }

    static Estado estadoEnvio(int partes, int bien, int mal, int sinRed) {
        if (partes == 0) return Estado.FALLO;
        if (bien == partes) return Estado.ENVIADO;
        if (bien + mal < partes) return Estado.DUDOSO;
        if (bien > 0) return Estado.PARCIAL;
        return sinRed == partes ? Estado.SIN_COBERTURA : Estado.FALLO;
    }

    private static void intento(Context ctx, List<ContactosSos.Contacto> contactos, String mensaje, Consumer<Estado[]> fin) {
        final Context app = ctx.getApplicationContext();
        // CLAVE SECRETA POR ENVIO. En Android 8-12 un receptor registrado asi
        // lo puede llamar cualquier app, y con una accion adivinable podria
        // fabricar «enviado» (revision con GPT). La clave va solo dentro de
        // nuestros PendingIntent, que nadie mas puede leer: un resultado sin
        // ella no cuenta. Y cada trozo cuenta una sola vez.
        final long clave = new java.security.SecureRandom().nextLong();
        final String accion = app.getPackageName() + ".SMS_ENVIADO." + Long.toHexString(clave);
        final int n = contactos.size();
        final int[] partesDe = new int[n], bien = new int[n], mal = new int[n], sinRed = new int[n];
        final java.util.HashSet<Integer> vistos = new java.util.HashSet<>();
        final boolean[] cerrado = {false};
        final Handler h = new Handler(Looper.getMainLooper());
        final BroadcastReceiver[] oyente = new BroadcastReceiver[1];
        final Runnable cierra = () -> {
            if (cerrado[0]) return;
            cerrado[0] = true;
            try { app.unregisterReceiver(oyente[0]); } catch (Exception ignored) {}
            Estado[] estados = new Estado[n];
            for (int c = 0; c < n; c++) {
                estados[c] = estadoEnvio(partesDe[c], bien[c], mal[c], sinRed[c]);
            }
            fin.accept(estados);
        };
        oyente[0] = new BroadcastReceiver() {
            @Override public void onReceive(Context c, Intent i) {
                if (i.getLongExtra("k", 0) != clave) return;
                int k = i.getIntExtra("c", -1), parte = i.getIntExtra("p", -1);
                if (k < 0 || k >= n || parte < 0 || !vistos.add(k * 1000 + parte)) return;
                int codigo = getResultCode();
                if (codigo == Activity.RESULT_OK) bien[k]++;
                else {
                    mal[k]++;
                    if (codigo == SmsManager.RESULT_ERROR_NO_SERVICE || codigo == SmsManager.RESULT_ERROR_RADIO_OFF) sinRed[k]++;
                }
                boolean todo = true;
                for (int q = 0; q < n; q++) if (partesDe[q] > 0 && bien[q] + mal[q] < partesDe[q]) todo = false;
                if (todo) h.post(cierra);
            }
        };
        IntentFilter filtro = new IntentFilter(accion);
        if (Build.VERSION.SDK_INT >= 33) app.registerReceiver(oyente[0], filtro, Context.RECEIVER_NOT_EXPORTED);
        else app.registerReceiver(oyente[0], filtro);
        try {
            SmsManager sms = Build.VERSION.SDK_INT >= 31 ? app.getSystemService(SmsManager.class) : SmsManager.getDefault();
            ArrayList<String> partes = sms.divideMessage(mensaje);
            for (int c = 0; c < n; c++) {
                ArrayList<PendingIntent> avisos = new ArrayList<>();
                for (int p = 0; p < partes.size(); p++) {
                    Intent i = new Intent(accion).setPackage(app.getPackageName())
                            .putExtra("c", c).putExtra("p", p).putExtra("k", clave);
                    avisos.add(PendingIntent.getBroadcast(app, ((serie++) % 1000) * 1000 + c * 50 + p, i,
                            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
                }
                try {
                    sms.sendMultipartTextMessage(contactos.get(c).telefono(), null, partes, avisos, null);
                    partesDe[c] = partes.size();
                } catch (Exception e) {
                    android.util.Log.e("TrabakutikGPS", "SMS a " + contactos.get(c).nombre() + " no salió", e);
                }
            }
        } catch (Exception e) {
            android.util.Log.e("TrabakutikGPS", "SMS: sin servicio", e);
        }
        boolean alguno = false;
        for (int c = 0; c < n; c++) if (partesDe[c] > 0) alguno = true;
        if (!alguno) h.post(cierra);
        else h.postDelayed(cierra, ESPERA_MS);
    }
}
