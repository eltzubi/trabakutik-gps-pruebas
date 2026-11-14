#!/usr/bin/env python3
"""Grabaciones.java: que se lista y que se deja borrar desde «Mis rutas».

Solo una grabacion nuestra (nombre exacto que pone el servicio), dentro de
la carpeta, y nunca la que se esta grabando. Lo pidio el autor el 14 de
noviembre de 2026: «que no se borre sin querer».
"""
import subprocess, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'android/app/src/main/java/com/trabakutik/gps/Grabaciones.java'

prueba = r'''
package com.trabakutik.gps;
import java.io.File;import java.nio.file.Files;
public class GrabacionesTest{
 static void require(boolean ok,String m){if(!ok)throw new AssertionError(m);}
 static void escribe(File f,String s)throws Exception{Files.write(f.toPath(),s.getBytes("UTF-8"));}
 public static void main(String[] a)throws Exception{
  File base=Files.createTempDirectory("grab").toFile(),dir=new File(base,"grabaciones");dir.mkdirs();
  String gpx="<?xml version=\"1.0\"?><gpx><trk><trkseg>\n"
   +"<trkpt lat=\"43.0\" lon=\"-2.5\"><time>2026-11-14T07:04:46Z</time></trkpt>\n"
   +"<trkpt lat=\"43.009\" lon=\"-2.5\"><time>2026-11-14T07:30:00Z</time></trkpt>\n"
   +"</trkseg><trkseg>\n"
   +"<trkpt lat=\"43.5\" lon=\"-2.5\"><time>2026-11-14T08:00:00Z</time></trkpt>\n"
   +"<trkpt lat=\"43.509\" lon=\"-2.5\"><time>2026-11-14T09:36:05Z</time></trkpt>\n"
   +"</trkseg></trk></gpx>\n";
  escribe(new File(dir,"trabakutik-20261114-080446.gpx"),gpx);
  escribe(new File(dir,"trabakutik-20261113-100000.gpx"),gpx);
  escribe(new File(dir,"trabakutik-20261114-120000_2.gpx"),gpx);
  escribe(new File(dir,"otra-cosa.gpx"),gpx);
  escribe(new File(base,"trabakutik-20261101-090000.gpx"),gpx);   // fuera de la carpeta
  String l=Grabaciones.lista(dir,"trabakutik-20261114-120000_2.gpx");
  require(!l.contains("otra-cosa"),"lo que no es nuestro no se lista: "+l);
  require(l.indexOf("20261114-120000_2")<l.indexOf("20261114-080446")&&l.indexOf("20261114-080446")<l.indexOf("20261113"),"la mas nueva primero: "+l);
  require(l.contains("\"inicio\":\"2026-11-14T07:04:46Z\"")&&l.contains("\"fin\":\"2026-11-14T09:36:05Z\""),"primera y ultima hora: "+l);
  require(l.contains("\"km\":2.0,"),"km sin unir el corte con una recta (1 + 1, no 57): "+l);
  require(l.contains("\"puntos\":4"),"puntos: "+l);
  require(l.contains("120000_2.gpx\",\"bytes\"")&&l.split("\"grabando\":true").length==2,"solo la activa sale como grabando: "+l);
  // Borrar
  require(!Grabaciones.borra(dir,"trabakutik-20261114-120000_2.gpx","trabakutik-20261114-120000_2.gpx"),"la que se graba no se borra");
  require(!Grabaciones.borra(dir,"otra-cosa.gpx",null),"un fichero que no es nuestro no se borra");
  require(!Grabaciones.borra(dir,"../trabakutik-20261101-090000.gpx",null),"nada fuera de la carpeta");
  require(new File(base,"trabakutik-20261101-090000.gpx").exists(),"y sigue ahi");
  require(!Grabaciones.borra(dir,null,null)&&!Grabaciones.borra(dir,"",null),"sin nombre, nada");
  require(!Grabaciones.borra(dir,"trabakutik-20261231-000000.gpx",null),"una que no existe: false");
  require(Grabaciones.borra(dir,"trabakutik-20261114-080446.gpx","trabakutik-20261114-120000_2.gpx"),"una de verdad, si");
  require(!new File(dir,"trabakutik-20261114-080446.gpx").exists()&&new File(dir,"trabakutik-20261113-100000.gpx").exists(),"se borra esa y solo esa");
  require(Grabaciones.lista(new File(base,"no-existe"),null).equals("[]"),"sin carpeta, lista vacia");
  System.out.println("OK: se listan solo las nuestras, la mas nueva primero, con horas y km sin unir cortes; no se borra la activa, ni nada ajeno ni fuera de la carpeta");
 }
}'''

with tempfile.TemporaryDirectory() as d:
    pkg = Path(d, 'com/trabakutik/gps'); pkg.mkdir(parents=True)
    (pkg / 'Grabaciones.java').write_text(SRC.read_text())
    (pkg / 'GrabacionesTest.java').write_text(prueba)
    out = Path(d, 'out')
    subprocess.run(['javac', '-d', str(out), str(pkg / 'Grabaciones.java'), str(pkg / 'GrabacionesTest.java')], check=True)
    subprocess.run(['java', '-cp', str(out), 'com.trabakutik.gps.GrabacionesTest'], check=True)
