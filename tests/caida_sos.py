#!/usr/bin/env python3
"""El aviso de caida: DetectorCaidas (cuando salta) y ContactosSos (contactos y SMS).

Lo pidio el autor el 15 de noviembre de 2026: un golpe fuerte, cuenta atras de
30 s y SOS por SMS al contacto que meta cada usuario. Aqui se prueba con
trazas de acelerometro sinteticas: una caida, un bache, el movil que se cae
estando parado, levantarse tras el golpe y dos avisos seguidos.
"""
import subprocess, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PKG = ROOT / 'android/app/src/main/java/com/trabakutik/gps'

prueba = r'''
package com.trabakutik.gps;
import java.util.*;
public class CaidaSosTest{
 static void require(boolean ok,String m){if(!ok)throw new AssertionError(m);}
 static final double G=9.80665;
 static Random rnd=new Random(7);
 // Avanza el detector: «seg» segundos a 25 Hz, con aceleracion de marcha
 // (ruido de +-amp) o quieto, y velocidad GPS cada segundo.
 static long t=0;
 static boolean tramo(DetectorCaidas d,double seg,double amp,double vel){
  boolean salto=false;
  for(int k=0;k<seg*25;k++){
   t+=40;
   if(t%1000==0&&!Double.isNaN(vel))d.velocidad(vel,t);
   double z=G+(rnd.nextDouble()*2-1)*amp,x=(rnd.nextDouble()*2-1)*amp*.5;
   if(d.muestra(x,0,z,t))salto=true;
  }
  return salto;
 }
 static boolean golpe(DetectorCaidas d,double g){t+=40;return d.muestra(0,0,g*G,t);}
 public static void main(String[] a){
  // 1. Caida de verdad: en marcha, golpe de 4 g, y quieto en el suelo.
  DetectorCaidas d=new DetectorCaidas();t=0;
  require(!tramo(d,20,2.5,4.0),"en marcha no salta");
  golpe(d,4.0);
  require(tramo(d,12,0.05,0.0),"golpe en marcha y quieto despues: salta");
  require(d.golpes==1&&d.caidas==1,"registro: 1 golpe, 1 caida");
  // 2. Bache: golpe de 4 g pero sigues pedaleando.
  d=new DetectorCaidas();t=0;
  tramo(d,20,2.5,5.0);golpe(d,4.0);
  require(!tramo(d,35,2.5,5.0),"un bache sin pararse no salta");
  require(d.golpes==1&&d.caidas==0,"el bache queda en el registro como golpe, no como caida");
  // 3. Se te cae el movil estando parado.
  d=new DetectorCaidas();t=0;
  tramo(d,30,0.3,0.0);golpe(d,6.0);
  require(!tramo(d,15,0.05,0.0),"si no ibas en marcha, no salta");
  require(d.golpes==0,"ni cuenta como golpe en marcha");
  // 4. Te caes, te quedas 5 s y te levantas y andas.
  d=new DetectorCaidas();t=0;
  tramo(d,20,2.5,3.0);golpe(d,4.0);
  boolean s=tramo(d,5,0.05,0.0);
  s|=tramo(d,30,2.5,1.2);
  require(!s,"si te levantas antes de 8 s quieto, no salta");
  // 5. Golpe flojo (2 g, un paso fuerte) no cuenta.
  d=new DetectorCaidas();t=0;
  tramo(d,20,2.5,1.3);golpe(d,2.0);
  require(!tramo(d,12,0.05,0.0)&&d.golpes==0,"2 g no es un golpe");
  // 6. Dos caidas seguidas: la segunda dentro de 60 s no repite el aviso.
  d=new DetectorCaidas();t=0;
  tramo(d,20,2.5,4.0);golpe(d,4.0);require(tramo(d,12,0.05,0.0),"primera");
  tramo(d,10,2.5,4.0);golpe(d,4.0);
  require(!tramo(d,12,0.05,0.0),"segunda dentro de 60 s: no");
  // 7. Si el GPS vuelve a dar velocidad de marcha tras el golpe, se descarta.
  d=new DetectorCaidas();t=0;
  tramo(d,20,2.5,4.0);golpe(d,4.0);
  tramo(d,3,0.05,4.0);
  require(!tramo(d,12,0.05,Double.NaN),"si el GPS dice que sigues a 4 m/s, no salta");

  // CONTACTOS
  require("+34600111222".equals(ContactosSos.normaliza("+34 600 11 12 22")),"con prefijo y espacios");
  require("+34600111222".equals(ContactosSos.normaliza("0034-600-111-222")),"00 es +");
  require("600111222".equals(ContactosSos.normaliza("600 111 222")),"sin prefijo");
  require(ContactosSos.normaliza("12345")==null&&ContactosSos.normaliza("hola")==null&&ContactosSos.normaliza(null)==null,"no valen");
  String g=ContactosSos.anade("","Ama","600 111 222");
  g=ContactosSos.anade(g,"Aita","+34 600 333 444");
  g=ContactosSos.anade(g,"Ama bis","600111222");
  require(ContactosSos.lee(g).size()==2&&ContactosSos.lee(g).get(0).nombre().equals("Ama bis"),"el mismo numero se renombra, no se duplica");
  g=ContactosSos.anade(g,"Tercero","611222333");
  require(ContactosSos.anade(g,"Cuarto","622333444")==null,"como mucho 3");
  require(ContactosSos.anade(g,"Malo","123")==null,"numero malo: null");
  g=ContactosSos.quita(g,"+34 600 333 444");
  require(ContactosSos.lee(g).size()==2,"se quita por numero");
  require(ContactosSos.json(ContactosSos.lee(ContactosSos.anade("","Jon \"el\" de\\Garai","600111222"))).equals("[{\"nombre\":\"Jon \\\"el\\\" de\\\\Garai\",\"telefono\":\"600111222\"}]"),"json escapado");
  require(ContactosSos.lee("basura\nsin tab\n\t\n").isEmpty(),"lo guardado roto no rompe");
  // MENSAJE
  String m=ContactosSos.mensaje(true,43.123456,-2.5,8.2,95);
  require(m.startsWith("NECESITO AYUDA")&&m.contains("aviso automatico")&&m.contains("https://maps.google.com/?q=43.123456,-2.500000")&&m.contains("+/-9 m, hace 1 min"),m);
  require(m.chars().allMatch(c->c<128),"solo ASCII: el SMS no se parte en trozos de 70");
  require(ContactosSos.mensaje(false,0,0,0,0).contains("Sin posicion GPS reciente"),"sin posicion se dice");
  String pr=ContactosSos.mensajePrueba(true,43.1,-2.5,5,10);
  require(pr.startsWith("PRUEBA")&&pr.contains("no es una emergencia")&&!pr.contains("NECESITO AYUDA")&&pr.chars().allMatch(ch->ch<128),"la prueba se ve que es prueba: "+pr);
  System.out.println("OK: salta con golpe en marcha y quieto; no con bache, movil caido parado, levantarse, golpe flojo, repeticion ni si el GPS sigue en marcha; contactos y mensaje");
 }
}'''

with tempfile.TemporaryDirectory() as d:
    pkg = Path(d, 'com/trabakutik/gps'); pkg.mkdir(parents=True)
    for n in ('DetectorCaidas.java', 'ContactosSos.java'):
        (pkg / n).write_text((PKG / n).read_text())
    (pkg / 'CaidaSosTest.java').write_text(prueba)
    out = Path(d, 'out')
    subprocess.run(['javac', '-d', str(out)] + [str(pkg / n) for n in ('DetectorCaidas.java', 'ContactosSos.java', 'CaidaSosTest.java')], check=True)
    subprocess.run(['java', '-cp', str(out), 'com.trabakutik.gps.CaidaSosTest'], check=True)
