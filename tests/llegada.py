#!/usr/bin/env python3
"""«Has llegado al final de la ruta» (AvisoLlegada).

Se busco el 15 de noviembre de 2026 comparando con otros navegadores: OsmAnd y
Locus lo dicen y este se callaba. La trampa es la ruta circular, que empieza
en el final: ahi no puede avisar al arrancar.
"""
import subprocess, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PKG = ROOT / 'android/app/src/main/java/com/trabakutik/gps'

prueba = r'''
package com.trabakutik.gps;
import java.util.*;
public class LlegadaTest{
 static void require(boolean ok,String m){if(!ok)throw new AssertionError(m);}
 static double lat(double norteM){return 43.2+norteM/111195.0;}
 static Random rnd=new Random(5);
 public static void main(String[] a){
  // 1. Circular de 2 km: al empezar estas en el final y NO se dice.
  AvisoLlegada c=new AvisoLlegada();
  for(int k=0;k<30;k++){c.posicion(lat(rnd.nextDouble()*3),-2.5,5);require(!c.llega(2000,2000),"al empezar una circular no se dice");}
  // Se anda la vuelta entera (2 km hacia el norte y vuelta, cada 10 m).
  int avisos=0;
  for(int m=0;m<=1000;m+=10){c.posicion(lat(m),-2.5,5);if(c.llega(m,2000))avisos++;}
  for(int m=1000;m>=0;m-=10){c.posicion(lat(m),-2.5,5);if(c.llega(2000-m,2000))avisos++;}
  require(avisos==1,"al acabar la circular se dice, y una sola vez: "+avisos);

  // 2. Lineal de 3 km: se dice al llegar, no antes.
  AvisoLlegada l=new AvisoLlegada();boolean antes=false,alFinal=false;
  for(int m=0;m<=3000;m+=10){l.posicion(lat(m),-2.5,5);boolean s=l.llega(m,3000);if(s&&m<2975)antes=true;if(s)alFinal=true;}
  require(!antes&&alFinal,"en una lineal se dice en los ultimos 25 m");

  // 3. Parado con el GPS bailando 3 m, una hora: no cuenta como andado.
  AvisoLlegada p=new AvisoLlegada();
  for(int k=0;k<3600;k++)p.posicion(lat(rnd.nextDouble()*3),-2.5+(rnd.nextDouble()*3)/81000.0,6);
  require(p.andado()<50,"el baile del GPS parado no suma: "+p.andado());

  // 4. Posiciones malas (60 m) y saltos de 500 m no cuentan.
  AvisoLlegada q=new AvisoLlegada();
  q.posicion(lat(0),-2.5,5);q.posicion(lat(500),-2.5,5);q.posicion(lat(1000),-2.5,60);
  require(q.andado()==0,"ni saltos ni posiciones malas: "+q.andado());

  // 5. Ruta de 200 m: demasiado corta para avisar.
  AvisoLlegada r=new AvisoLlegada();boolean dicho=false;
  for(int m=0;m<=200;m+=5){r.posicion(lat(m),-2.5,5);if(r.llega(m,200))dicho=true;}
  require(!dicho,"en una ruta de 200 m no se dice");

  // 6. Reiniciar (ruta nueva) vuelve a dejar avisar.
  l.reinicia();require(l.andado()==0,"reinicia");
  System.out.println("llegada OK");
 }
}
'''

with tempfile.TemporaryDirectory() as tmp:
    tmp = Path(tmp)
    (tmp / 'LlegadaTest.java').write_text(prueba)
    subprocess.run(['javac', '-d', str(tmp), str(PKG / 'AvisoLlegada.java'), str(tmp / 'LlegadaTest.java')], check=True)
    out = subprocess.run(['java', '-cp', str(tmp), 'com.trabakutik.gps.LlegadaTest'], check=True, capture_output=True, text=True)
    print(out.stdout.strip())
