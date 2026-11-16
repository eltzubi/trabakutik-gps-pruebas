#!/usr/bin/env python3
"""El tiempo en movimiento (TiempoEnMarcha): andar suma, parado con el GPS
bailando no, lo pausado no, y las posiciones malas o los saltos tampoco."""
import subprocess, tempfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
PKG = ROOT / 'android/app/src/main/java/com/trabakutik/gps'
prueba = r'''
package com.trabakutik.gps;
import java.util.*;
public class TiempoTest{
 static void require(boolean ok,String m){if(!ok)throw new AssertionError(m);}
 static double lat(double m){return 43.2+m/111195.0;}
 public static void main(String[] a){
  Random r=new Random(3);
  // 1. Andar 10 minutos a 1,2 m/s, una posicion por segundo: unos 10 min.
  TiempoEnMarcha t=new TiempoEnMarcha();long ms=0;double m=0;
  for(int s=0;s<600;s++){t.posicion(lat(m),-2.5,5,ms);ms+=1000;m+=1.2;}
  require(Math.abs(t.totalMs()-600000)<=20000,"andando 10 min cuenta 10 min: "+t.totalMs());
  // 2. Parado 20 minutos con el GPS bailando 4 m: no suma.
  long antes=t.totalMs();
  for(int s=0;s<1200;s++){t.posicion(lat(m+r.nextDouble()*4-2),-2.5+(r.nextDouble()*4-2)/81000.0,6,ms);ms+=1000;}
  require(t.totalMs()-antes<=15000,"parado 20 min no suma (como mucho el arranque): "+(t.totalMs()-antes));
  // 3. Vuelve a andar 5 min: suma otros 5.
  antes=t.totalMs();
  for(int s=0;s<300;s++){t.posicion(lat(m),-2.5,5,ms);ms+=1000;m+=1.2;}
  require(Math.abs(t.totalMs()-antes-300000)<=35000,"otros 5 min (mas como mucho ~30 s de la parada): "+(t.totalMs()-antes));
  // 4. Pausado 10 min (el servicio no le pasa posiciones) y sigue: lo pausado no suma.
  t.pausa();antes=t.totalMs();ms+=600000;m+=50;
  for(int s=0;s<60;s++){t.posicion(lat(m),-2.5,5,ms);ms+=1000;m+=1.2;}
  require(t.totalMs()-antes<=62000,"lo pausado no suma: "+(t.totalMs()-antes));
  // 5. Posiciones malas y un salto de 2 km no suman.
  TiempoEnMarcha q=new TiempoEnMarcha();q.posicion(lat(0),-2.5,80,0);q.posicion(lat(500),-2.5,80,5000);
  q.posicion(lat(0),-2.5,5,10000);q.posicion(lat(2000),-2.5,5,12000);
  require(q.totalMs()==0,"ni malas ni saltos: "+q.totalMs());
  // 6. Subiendo muy despacio (0,4 m/s) tambien es estar en marcha.
  TiempoEnMarcha s=new TiempoEnMarcha();ms=0;m=0;
  for(int k=0;k<300;k++){s.posicion(lat(m),-2.5,8,ms);ms+=1000;m+=0.4;}
  require(s.totalMs()>=270000,"despacio tambien cuenta: "+s.totalMs());
  t.reinicia();require(t.totalMs()==0,"reinicia");
  System.out.println("tiempo en marcha OK");
 }
}
'''
with tempfile.TemporaryDirectory() as tmp:
    tmp = Path(tmp)
    (tmp / 'TiempoTest.java').write_text(prueba)
    subprocess.run(['javac', '-d', str(tmp), str(PKG / 'TiempoEnMarcha.java'), str(tmp / 'TiempoTest.java')], check=True)
    out = subprocess.run(['java', '-cp', str(tmp), 'com.trabakutik.gps.TiempoTest'], check=True, capture_output=True, text=True)
    print(out.stdout.strip())
