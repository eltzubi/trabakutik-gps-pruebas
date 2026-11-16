#!/usr/bin/env python3
"""El tiempo en movimiento (TiempoEnMarcha): andar suma, parado con el GPS
bailando no, lo pausado no, y las posiciones malas o los saltos tampoco."""
import subprocess, tempfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
PKG = ROOT / 'android/app/src/main/java/com/trabakutik/gps'
prueba = r"""
package com.trabakutik.gps;
import java.util.*;
public class TiempoTest{
 static void require(boolean ok,String m){if(!ok)throw new AssertionError(m);}
 static double lat(double m){return 43.2+m/111195.0;}
 static double lon(double m){return -2.5+m/(111195.0*Math.cos(Math.toRadians(43.2)));}
 public static void main(String[] a){
  Random r=new Random(3);
  // 1. Andar 10 min a 1,2 m/s (velocidad del GPS con ruido): unos 10 min.
  TiempoEnMarcha t=new TiempoEnMarcha();long ms=0;double m=0;
  for(int s=0;s<600;s++){t.posicion(lat(m),-2.5,5,ms,1.2+r.nextGaussian()*0.2);ms+=1000;m+=1.2;}
  require(Math.abs(t.totalMs()-600000)<=10000,"andando 10 min cuenta 10 min: "+t.totalMs());
  // 2. (GPT) Parado 20 min bajo arbolado: la posicion salta ±6 m cada 10 s
  //    (12 m entre una y otra), precision 15 m; la velocidad Doppler, cerca de 0.
  long antes=t.totalMs();
  for(int s=0;s<120;s++){t.posicion(lat(m+(s%2==0?-6:6)),-2.5,15,ms,Math.abs(r.nextGaussian()*0.12));ms+=10000;}
  require(t.totalMs()-antes<=6000,"parado 20 min con saltos de 12 m no suma: "+(t.totalMs()-antes));
  // 3. Y parado con una posicion por segundo y baile de 4 m.
  antes=t.totalMs();
  for(int s=0;s<1200;s++){t.posicion(lat(m+r.nextDouble()*4-2),lon(r.nextDouble()*4-2),6,ms,Math.abs(r.nextGaussian()*0.12));ms+=1000;}
  require(t.totalMs()-antes<=6000,"parado 20 min con baile de 4 m no suma: "+(t.totalMs()-antes));
  // 4. (GPT) Subiendo despacio, 0,5 m/s, una hora: casi una hora.
  TiempoEnMarcha s=new TiempoEnMarcha();ms=0;m=0;
  for(int k=0;k<3600;k++){s.posicion(lat(m),-2.5,8,ms,0.5+r.nextGaussian()*0.08);ms+=1000;m+=0.5;}
  require(s.totalMs()>=3400000,"subiendo despacio cuenta: "+s.totalMs());
  // 5. (GPT) Entregadas en grupo (5 posiciones de golpe, con su hora): igual.
  TiempoEnMarcha g=new TiempoEnMarcha(),u=new TiempoEnMarcha();m=0;
  ArrayList<double[]> lote=new ArrayList<>();
  for(int k=0;k<300;k++){double[] p={lat(m),k*1000L};m+=1.2;u.posicion(p[0],-2.5,5,(long)p[1],1.2);lote.add(p);
   if(lote.size()==5){for(double[] q:lote)g.posicion(q[0],-2.5,5,(long)q[1],1.2);lote.clear();}}
  require(g.totalMs()==u.totalMs(),"en grupo o una a una, lo mismo: "+g.totalMs()+" / "+u.totalMs());
  // 6. Una posicion vieja (fuera de orden) no cuenta.
  long t0=g.totalMs();g.posicion(lat(0),-2.5,5,1000,1.2);require(g.totalMs()==t0,"la vieja no cuenta");
  // 7. (GPT) Parado 29 s y un salto de 100 m en 1 s: no suma ni se queda.
  TiempoEnMarcha j=new TiempoEnMarcha();ms=0;
  for(int k=0;k<30;k++){j.posicion(lat(0),-2.5,5,ms,0.05);ms+=1000;}
  j.posicion(lat(100),-2.5,5,ms,0.05);ms+=1000;
  for(int k=0;k<10;k++){j.posicion(lat(0),-2.5,5,ms,0.05);ms+=1000;}
  require(j.totalMs()==0,"el salto no suma: "+j.totalMs());
  // 8. Pausado 10 min: lo pausado no suma.
  TiempoEnMarcha p=new TiempoEnMarcha();ms=0;m=0;
  for(int k=0;k<60;k++){p.posicion(lat(m),-2.5,5,ms,1.2);ms+=1000;m+=1.2;}
  p.pausa();ms+=600000;m+=50;antes=p.totalMs();
  for(int k=0;k<60;k++){p.posicion(lat(m),-2.5,5,ms,1.2);ms+=1000;m+=1.2;}
  require(p.totalMs()-antes<=61000,"lo pausado no suma: "+(p.totalMs()-antes));
  // 9. Posiciones malas no cuentan.
  TiempoEnMarcha q=new TiempoEnMarcha();for(int k=0;k<60;k++)q.posicion(lat(k*1.2),-2.5,80,k*1000L,1.2);
  require(q.totalMs()==0,"las malas no cuentan");
  // 10. Sin velocidad del GPS: por distancia; andar cuenta, parado (4 m) no.
  TiempoEnMarcha n=new TiempoEnMarcha();ms=0;m=0;
  for(int k=0;k<300;k++){n.posicion(lat(m),-2.5,5,ms,Double.NaN);ms+=1000;m+=1.2;}
  require(Math.abs(n.totalMs()-300000)<=20000,"sin velocidad, andando: "+n.totalMs());
  antes=n.totalMs();
  for(int k=0;k<600;k++){n.posicion(lat(m+r.nextDouble()*4-2),-2.5,6,ms,Double.NaN);ms+=1000;}
  require(n.totalMs()-antes<=35000,"sin velocidad, parado: "+(n.totalMs()-antes));
  t.reinicia();require(t.totalMs()==0,"reinicia");
  System.out.println("tiempo en marcha OK");
 }
}
"""
with tempfile.TemporaryDirectory() as tmp:
    tmp = Path(tmp)
    (tmp / 'TiempoTest.java').write_text(prueba)
    subprocess.run(['javac', '-d', str(tmp), str(PKG / 'TiempoEnMarcha.java'), str(tmp / 'TiempoTest.java')], check=True)
    out = subprocess.run(['java', '-cp', str(tmp), 'com.trabakutik.gps.TiempoTest'], check=True, capture_output=True, text=True)
    print(out.stdout.strip())
