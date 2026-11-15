package com.trabakutik.gps;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Los contactos a los que va el SOS automatico del aviso de caida, y el texto
 * del mensaje. Los mete cada usuario (de la agenda o a mano): hasta MAX, con
 * nombre y telefono. Se guardan como texto, una linea por contacto
 * («nombre<TAB>telefono»), en las preferencias de la app.
 *
 * Va por SMS y no por correo a proposito: un correo sin que nadie toque nada
 * necesita un servidor de correo con su clave, y en una app instalada esa
 * clave quedaria a la vista. El SMS lo manda el propio telefono.
 *
 * Sin nada de Android, para poder probarlo con javac a secas.
 */
final class ContactosSos {
    private ContactosSos() {}
    static final int MAX = 3;

    record Contacto(String nombre, String telefono) {}

    static List<Contacto> lee(String guardado) {
        List<Contacto> out = new ArrayList<>();
        if (guardado == null) return out;
        for (String linea : guardado.split("\n")) {
            int tab = linea.indexOf('\t');
            if (tab < 0) continue;
            String tel = normaliza(linea.substring(tab + 1));
            if (tel != null && out.size() < MAX) out.add(new Contacto(limpiaNombre(linea.substring(0, tab)), tel));
        }
        return out;
    }

    static String escribe(List<Contacto> lista) {
        StringBuilder sb = new StringBuilder();
        for (Contacto c : lista) sb.append(c.nombre()).append('\t').append(c.telefono()).append('\n');
        return sb.toString();
    }

    /** Un telefono valido (6 a 15 cifras, con + delante si lo trae) o null. */
    static String normaliza(String tel) {
        if (tel == null) return null;
        String t = tel.trim();
        boolean mas = t.startsWith("+") || t.startsWith("00");
        String cifras = t.replaceAll("[\\s.\\-()/]", "");
        if (cifras.startsWith("+")) cifras = cifras.substring(1);
        else if (cifras.startsWith("00")) cifras = cifras.substring(2);
        if (!cifras.matches("\\d{6,15}")) return null;
        return (mas ? "+" : "") + cifras;
    }

    static String limpiaNombre(String n) {
        String s = n == null ? "" : n.replaceAll("[\\t\\n\\r]", " ").trim();
        if (s.length() > 40) s = s.substring(0, 40);
        return s.isEmpty() ? "Contacto" : s;
    }

    /** Añade (o renombra si ya estaba ese telefono). null si no vale o no cabe. */
    static String anade(String guardado, String nombre, String telefono) {
        String tel = normaliza(telefono);
        if (tel == null) return null;
        List<Contacto> l = lee(guardado);
        for (int i = 0; i < l.size(); i++)
            if (l.get(i).telefono().equals(tel)) { l.set(i, new Contacto(limpiaNombre(nombre), tel)); return escribe(l); }
        if (l.size() >= MAX) return null;
        l.add(new Contacto(limpiaNombre(nombre), tel));
        return escribe(l);
    }

    static String quita(String guardado, String telefono) {
        String tel = normaliza(telefono);
        List<Contacto> l = lee(guardado);
        l.removeIf(c -> c.telefono().equals(tel));
        return escribe(l);
    }

    static String json(List<Contacto> lista) {
        StringBuilder sb = new StringBuilder("[");
        for (Contacto c : lista) {
            if (sb.length() > 1) sb.append(',');
            sb.append("{\"nombre\":\"").append(escapa(c.nombre())).append("\",\"telefono\":\"").append(c.telefono()).append("\"}");
        }
        return sb.append(']').toString();
    }

    static String escapa(String s) {
        StringBuilder sb = new StringBuilder();
        for (char ch : s.toCharArray()) {
            if (ch == '"' || ch == '\\') sb.append('\\').append(ch);
            else if (ch < 0x20) sb.append(' ');
            else sb.append(ch);
        }
        return sb.toString();
    }

    /**
     * El SMS. Lo primero, que es una emergencia y que el aviso es automatico
     * (quien lo recibe tiene que saber que puede que no lo hayas escrito tu);
     * luego el enlace al mapa y los numeros con su precision y su edad, como
     * el SOS de siempre. Sin posicion, se dice.
     */
    /** Lo que se dice tras enviar (EnvioSms): enviado, no ha salido, sin confirmar. */
    static String textoEnvio(String si, String no, String duda) { return textoEnvio(si, no, duda, ""); }
    static String textoEnvio(String si, String no, String duda, String medias) {
        StringBuilder t = new StringBuilder(si.isEmpty() ? "No se ha confirmado ningún envío" : "Enviado a " + si);
        if (!medias.isEmpty()) t.append(". Envío incompleto a ").append(medias).append(" (puede que le haya llegado una parte)");
        if (!no.isEmpty()) t.append(". No ha salido a ").append(no);
        if (!duda.isEmpty()) t.append(". Sin confirmar a ").append(duda).append(" (puede salir aún)");
        return t.append('.').toString();
    }

    /** El SMS de prueba: que se vea a la primera que NO es una emergencia. */
    static String mensajePrueba(boolean hayPosicion, double lat, double lon, double precision, long segundos) {
        String cab = "PRUEBA de Trabakutik GPS: no es una emergencia. Asi te llegaria un aviso de caida.";
        if (!hayPosicion) return cab + "\nSin posicion GPS reciente.";
        return cab + "\n" + String.format(Locale.ROOT, "https://maps.google.com/?q=%.6f,%.6f", lat, lon);
    }

    static String mensaje(boolean hayPosicion, double lat, double lon, double precision, long segundos) {
        String cab = "NECESITO AYUDA. Posible caida: aviso automatico de Trabakutik GPS, nadie lo ha cancelado en 30 s.";
        if (!hayPosicion) return cab + "\nSin posicion GPS reciente.";
        String cuando = segundos < 60 ? "hace " + segundos + " s" : "hace " + (segundos / 60) + " min";
        return cab + "\n" + String.format(Locale.ROOT, "https://maps.google.com/?q=%.6f,%.6f", lat, lon)
                + "\n" + String.format(Locale.ROOT, "%.6f, %.6f", lat, lon)
                + " (+/-" + (int) Math.ceil(precision) + " m, " + cuando + ")";
    }
}
