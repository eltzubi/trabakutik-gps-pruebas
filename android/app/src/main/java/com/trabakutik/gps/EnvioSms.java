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

    static void envia(Context ctx, List<ContactosSos.Contacto> contactos, String mensaje, Consumer<String> fin) {
        final Context app = ctx.getApplicationContext();
        final String accion = app.getPackageName() + ".SMS_ENVIADO." + (serie++);
        final int n = contactos.size();
        final int[] partesDe = new int[n], bien = new int[n], mal = new int[n];
        final boolean[] cerrado = {false};
        final Handler h = new Handler(Looper.getMainLooper());
        final BroadcastReceiver[] oyente = new BroadcastReceiver[1];
        final Runnable cierra = () -> {
            if (cerrado[0]) return;
            cerrado[0] = true;
            try { app.unregisterReceiver(oyente[0]); } catch (Exception ignored) {}
            StringBuilder si = new StringBuilder(), no = new StringBuilder();
            for (int c = 0; c < n; c++) {
                StringBuilder sb = partesDe[c] > 0 && bien[c] == partesDe[c] ? si : no;
                if (sb.length() > 0) sb.append(", ");
                sb.append(contactos.get(c).nombre());
            }
            String texto = si.length() > 0 ? "Enviado a " + si : "No ha salido ningún SMS";
            if (si.length() > 0 && no.length() > 0) texto += ". No ha salido a " + no;
            fin.accept(texto + ".");
        };
        oyente[0] = new BroadcastReceiver() {
            @Override public void onReceive(Context c, Intent i) {
                int k = i.getIntExtra("c", -1);
                if (k < 0 || k >= n) return;
                if (getResultCode() == Activity.RESULT_OK) bien[k]++; else mal[k]++;
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
                    Intent i = new Intent(accion).setPackage(app.getPackageName()).putExtra("c", c);
                    avisos.add(PendingIntent.getBroadcast(app, (serie % 1000) * 1000 + c * 50 + p, i,
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
