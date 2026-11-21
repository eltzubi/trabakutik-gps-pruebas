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

    static String mensaje(boolean automatico, boolean hayPosicion, double lat, double lon, double precision,
                          double altitud, long segundos, String ruta, double pkMetros, int bateria, String hora,
                          String usuario, String datoMedico) {
        StringBuilder texto = new StringBuilder("NECESITO AYUDA - SOS TRABAKUTIK GPS");
        texto.append(automatico ? "\nPosible caida: aviso automatico." : "\nSOS activado manualmente.");
        texto.append("\nHora: ").append(hora);
        if (bateria >= 0 && bateria <= 100) texto.append(" | Bateria: ").append(bateria).append('%');
        if (hayPosicion) {
            String latTexto = String.format(Locale.ROOT, "%.6f", lat);
            String lonTexto = String.format(Locale.ROOT, "%.6f", lon);
            String cuando = segundos < 60 ? "hace " + segundos + " s" : "hace " + (segundos / 60) + " min";
            texto.append("\nUbicacion: ").append(latTexto).append(", ").append(lonTexto).append(" (");
            if (Double.isFinite(precision) && precision > 0) texto.append("+/-").append((int) Math.ceil(precision)).append(" m, ");
            if (Double.isFinite(altitud)) texto.append("alt. aprox. ").append(Math.round(altitud)).append(" m, ");
            texto.append(cuando).append(')');
            texto.append("\nMapa: https://maps.google.com/?q=").append(latTexto).append(',').append(lonTexto);
            texto.append("\nOSM: https://www.openstreetmap.org/?mlat=").append(latTexto).append("&mlon=").append(lonTexto)
                    .append("#map=16/").append(latTexto).append('/').append(lonTexto);
        } else {
            texto.append("\nSin posicion GPS reciente.");
        }
        String nombre = compacto(ruta, 100);
        if (!nombre.isEmpty()) texto.append("\nRuta: ").append(nombre);
        if (Double.isFinite(pkMetros) && pkMetros >= 0) {
            texto.append(String.format(Locale.ROOT, "%sPK aprox. %.1f km desde el inicio del GPX",
                    nombre.isEmpty() ? "\n" : " - ", pkMetros / 1000));
        }
        if (!usuario.isEmpty()) texto.append("\nUsuario: ").append(compacto(usuario, 40));
        if (!datoMedico.isEmpty()) texto.append("\nDato medico: ").append(compacto(datoMedico, 90));
        return texto.toString();
    }

    static String compacto(String valor, int limite) {
        if (valor == null) return "";
        String limpio = java.text.Normalizer.normalize(valor, java.text.Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "").replaceAll("[^A-Za-z0-9 .,_+()/-]", " ").replaceAll(" +", " ").trim();
        return limpio.length() <= limite ? limpio : limpio.substring(0, limite).trim();
    }
}
