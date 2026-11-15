#!/usr/bin/env python3
"""Lo subido y lo bajado con el barometro (AlturaBarometrica).

Lo pidio el autor el 15 de noviembre de 2026: que el recuadro cuente desde
donde empieza el, tambien fuera de la ruta. Se prueba con trazas de presion
sinteticas: una subida y una bajada de verdad, el ruido del sensor estando
quieto, un cambio de tiempo lento, una pausa en la que se sube y lecturas
imposibles.
"""
import subprocess, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PKG = ROOT / 'android/app/src/main/java/com/trabakutik/gps'

prueba = r'''
package com.trabakutik.gps;
import java.util.*;
public class BarometroTest{
 static void require(boolean ok,String m){if(!ok)throw new AssertionError(m);}
 // La presion que corresponde a una altura (inversa de altura()).
 static double hPa(double h){return 1013.25*Math.pow(1-h/44330.0,5.255);}
 static Random rnd=new Random(3);
 static long t=0;
 // «seg» segundos a 1 Hz yendo de h0 a h1, con ruido del sensor de +-ruido m.
 static void tramo(AlturaBarometrica b,double seg,double h0,double h1,double ruido){
  for(int k=0;k<seg;k++){t+=1000;double h=h0+(h1-h0)*k/seg+(rnd.nextDouble()*2-1)*ruido;b.muestra(hPa(h),t);}
 }
 public static void main(String[] a){
  require(Math.abs(AlturaBarometrica.altura(1013.25))<1e-9,"nivel del mar = 0 m");
  require(Math.abs(AlturaBarometrica.altura(hPa(600))-600)<0.01,"la formula y su inversa cuadran");

  // 1. Subir 300 m en 25 min y bajar 200 en 15, con 0,5 m de ruido.
  AlturaBarometrica b=new AlturaBarometrica();t=0;
  tramo(b,60,400,400,0.5);
  require(b.sube<1&&b.baja<1,"quieto con ruido no suma: "+b.sube+"/"+b.baja);
  tramo(b,1500,400,700,0.5);tramo(b,60,700,700,0.5);
  require(Math.abs(b.sube-300)<=6,"sube 300: "+b.sube);
  tramo(b,900,700,500,0.5);tramo(b,60,500,500,0.5);
  require(Math.abs(b.baja-200)<=6,"baja 200: "+b.baja);
  require(Math.abs(b.sube-300)<=6,"y lo subido no cambia al bajar: "+b.sube);

  // 2. Una hora quieto con ruido fuerte (1,5 m): sigue sin sumar casi nada.
  b=new AlturaBarometrica();t=0;
  tramo(b,3600,300,300,1.5);
  require(b.sube<4&&b.baja<4,"una hora quieto: "+b.sube+"/"+b.baja);

  // 3. Un cambio de tiempo de 1 hPa en tres horas (unos 8 m): se cuenta
  //    como mucho eso, no se multiplica.
  b=new AlturaBarometrica();t=0;
  for(int k=0;k<3*3600;k++){t+=1000;b.muestra(1000-1.0*k/(3*3600)+(rnd.nextDouble()*2-1)*0.03,t);}
  require(b.sube<=9.5,"el tiempo cuenta como mucho lo que mueve: "+b.sube);

  // 4. En pausa no cuenta: se sube 100 m parado (un teleferico) y al seguir
  //    se empieza desde ahi.
  b=new AlturaBarometrica();t=0;
  tramo(b,600,200,300,0.3);double antes=b.sube;
  b.pausa();tramo(b,600,300,400,0.3);
  require(Math.abs(b.sube-antes)<0.01,"en pausa no suma: "+b.sube+" vs "+antes);
  b.sigue();tramo(b,60,400,400,0.3);tramo(b,600,400,500,0.3);tramo(b,60,500,500,0.3);
  require(Math.abs(b.sube-antes-100)<=6,"al seguir cuenta desde la altura de entonces: "+(b.sube-antes));

  // 5. Lecturas imposibles (0, 2000 hPa) se ignoran.
  b=new AlturaBarometrica();t=0;
  tramo(b,60,100,100,0.2);b.muestra(0,t+=1000);b.muestra(2000,t+=1000);b.muestra(Double.NaN,t+=1000);
  tramo(b,60,100,100,0.2);
  require(b.sube<1&&b.baja<1,"las imposibles no cuentan: "+b.sube+"/"+b.baja);

  // 6. Reiniciar deja todo a cero.
  b.reinicia();require(b.sube==0&&b.baja==0&&b.muestras==0,"reinicia");
  System.out.println("barometro OK");
 }
}
'''

with tempfile.TemporaryDirectory() as tmp:
    tmp = Path(tmp)
    (tmp / 'BarometroTest.java').write_text(prueba)
    subprocess.run(['javac', '-d', str(tmp), str(PKG / 'AlturaBarometrica.java'), str(tmp / 'BarometroTest.java')], check=True)
    out = subprocess.run(['java', '-cp', str(tmp), 'com.trabakutik.gps.BarometroTest'], check=True, capture_output=True, text=True)
    print(out.stdout.strip())
