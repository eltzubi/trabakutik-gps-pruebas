#!/usr/bin/env python3
"""La pagina y el servicio deciden IGUAL el fuera de ruta.

Son dos programas: la voz con la pantalla apagada la decide el servicio
(TrackingService.checkDeviation, Java) y lo que se ve en pantalla la pagina
(updateOffRoute, 07-servicio.js). Aqui se les da el MISMO recorrido inventado
-te alejas, vuelves a la franja, rebotas, vuelves, te alejas otra vez- y tienen
que pasar a «fuera» y volver a «en ruta» en el mismo instante. Lo pidio el
autor el 16 de noviembre de 2026, despues de que una revision con GPT viera
que la prueba anterior solo comparaba numeros escritos.
"""
import json, subprocess, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
src = (ROOT / 'android/app/src/main/java/com/trabakutik/gps/TrackingService.java').read_text()

def metodo(firma):
    a = src.index(firma); i = src.index('{', a) + 1; n = 1
    while n:
        n += (src[i] == '{') - (src[i] == '}'); i += 1
    return src[a:i]

# (milisegundos, distancia al track en m, precision en m). Una lectura por segundo.
sec = []
t = 0
def tramo(segundos, d, acc=5):
    global t
    for _ in range(segundos):
        t += 1000; sec.append((t, d, acc))
tramo(5, 5)       # en la ruta
tramo(7, 40)      # te alejas: a los 4 s, fuera
tramo(8, 15)      # vuelves a la franja (ni cerca ni lejos): a los 4 s, en ruta
tramo(7, 40)      # otra vez fuera
tramo(1, 15)      # un rebote suelto a la franja...
tramo(1, 40)      # ...y otra vez lejos: no cuenta
tramo(7, 15)      # en la franja de nuevo: a los 4 s, en ruta
tramo(3, 5)       # cerca del todo
tramo(6, 30, 20)  # mala señal: 30 m con 20 de precision no es «lejos» (acc+7=27 -> si lo es)
tramo(6, 5)

java = '''package com.trabakutik.gps;
import java.util.*;
public class FueraTest {
 static class SystemClock{static long reloj=0;static long elapsedRealtime(){return reloj;}}
 static class ToneGenerator{static final int TONE_PROP_ACK=2;}
 static class Location{double lat,lon;float acc;Location(double la,double lo,float a){lat=la;lon=lo;acc=a;}
  double getLatitude(){return lat;}double getLongitude(){return lon;}boolean hasAccuracy(){return true;}float getAccuracy(){return acc;}}
 boolean navigating=true,offRoute=false,routeReached=false;long farSince=0,cercaDesde=0;
 ArrayList<double[]> route=new ArrayList<>();
 void updateNotice(){}void pitidos(int n,int s){}void pitidos(int n,int s,int t){}void habla(String s){}void tonoBien(){}
''' + metodo(' void vuelveALaRuta()') + metodo(' void checkDeviation(Location l)') + metodo(' double closest(double lat,double lon)') + '''
 static final double FUERA_M=25,RECUERDA_M=50;static final long RECUERDA_MS=60_000;long fueraDesde=0;boolean recordado=false;
 public static void main(String[] a){
  FueraTest c=new FueraTest();for(int m=0;m<=300;m+=10)c.route.add(new double[]{43.2+m/111195.0,-2.5});
  Scanner in=new Scanner(System.in);StringBuilder out=new StringBuilder();
  while(in.hasNextLong()){long t=in.nextLong();double d=in.nextDouble();float acc=(float)in.nextDouble();
   SystemClock.reloj=t;double lat=43.2+100/111195.0,lon=-2.5+d/(111195.0*Math.cos(Math.toRadians(lat)));
   c.checkDeviation(new Location(lat,lon,acc));out.append(t).append(' ').append(c.offRoute?1:0).append('\\n');}
  System.out.print(out);
 }
}
'''
js = r'''
const {pieza}=require(process.argv[2]+'/tests/pieza.cjs');
let ahora=0;const sec=JSON.parse(process.argv[3]);
const c=pieza('07-servicio.js',{mode:'nav',routePoints:[[0,0],[0,1]],recording:true,navegaNativo:true,gpsApagadoPorTi:false,
 alerted:false,onRouteSeen:false,farSince:0,notice(){},Date:{now:()=>ahora}});
const out=[];for(const [t,d,acc] of sec){ahora=t;c.updateOffRoute(d,acc);out.push(t+' '+(c.alerted?1:0))}
process.stdout.write(out.join('\n')+'\n');
'''
with tempfile.TemporaryDirectory() as tmp:
    tmp = Path(tmp)
    (tmp / 'FueraTest.java').write_text(java)
    subprocess.run(['javac', '-d', str(tmp), str(tmp / 'FueraTest.java')], check=True, capture_output=True)
    entrada = ''.join(f'{t} {d} {a}\n' for t, d, a in sec)
    sj = subprocess.run(['java', '-cp', str(tmp), 'com.trabakutik.gps.FueraTest'], input=entrada, check=True, capture_output=True, text=True).stdout.split('\n')
    (tmp / 'p.cjs').write_text(js)
    sp = subprocess.run(['node', str(tmp / 'p.cjs'), str(ROOT), json.dumps(sec)], check=True, capture_output=True, text=True, cwd=str(ROOT)).stdout.split('\n')
    sj = [x for x in sj if x]; sp = [x for x in sp if x]
    assert len(sj) == len(sp) == len(sec), (len(sj), len(sp), len(sec))
    distintos = [(a, b) for a, b in zip(sj, sp) if a != b]
    assert not distintos, 'la pagina y el servicio no coinciden (t servicio / t pagina): %s' % distintos[:5]
    cambios = [x for i, x in enumerate(sj) if i == 0 or x.split()[1] != sj[i - 1].split()[1]]
    # fuera a los 4 s, vuelta a los 4 s en la franja, fuera otra vez, el rebote no cuenta, vuelta, mala señal fuera y vuelta
    assert len(cambios) >= 7, cambios
    print('OK: pagina y servicio pasan a fuera y vuelven en el mismo segundo (%d lecturas, %d cambios)' % (len(sec), len(cambios) - 1))
