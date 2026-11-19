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
import json, re, subprocess, tempfile
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
tramo(5, 19, 4)  # caso de la captura: empieza ya fuera, sin entrada previa
tramo(5, 13, 4)  # primer regreso estable, sin acercarse a menos de 11 m
tramo(5, 5)       # en la ruta
tramo(7, 40)      # te alejas: a los 4 s, fuera
tramo(8, 30, 30)  # incertidumbre no anuncia un regreso a 30 m
tramo(12, 55)     # repeticion a 50 m, sin esperar un minuto
tramo(8, 15)      # vuelves a la franja (ni cerca ni lejos): a los 4 s, en ruta
tramo(7, 40)      # otra vez fuera
tramo(12, 55)     # la segunda salida tambien repite
tramo(1, 15)      # un rebote suelto a la franja...
tramo(1, 40)      # ...y otra vez lejos: no cuenta
tramo(7, 15)      # en la franja de nuevo: a los 4 s, en ruta
tramo(3, 5)       # cerca del todo
tramo(6, 30, 20)  # 30 m con 20 de precisión supera el margen de 27 m: confirma otra salida
tramo(6, 5)

java = '''package com.trabakutik.gps;
import java.util.*;
public class FueraTest {
 static class SystemClock{static long reloj=0;static long elapsedRealtime(){return reloj;}}
 static class ToneGenerator{static final int TONE_PROP_ACK=2;}
 static class Location{double lat,lon;float acc;Location(double la,double lo,float a){lat=la;lon=lo;acc=a;}
  double getLatitude(){return lat;}double getLongitude(){return lon;}boolean hasAccuracy(){return true;}float getAccuracy(){return acc;}}
 boolean entradaAvisada=false;boolean navigating=true,offRoute=false,routeReached=false;long farSince=0,cercaDesde=0;
 ArrayList<double[]> route=new ArrayList<>();
 void updateNotice(){}void pitidos(int n,int s){}void pitidos(int n,int s,int t){}ArrayList<String> dicho=new ArrayList<>();void habla(String s){dicho.add(s);}void tonoBien(){}
''' + metodo(' void protegeAvisoRuta()') + metodo(' void vuelveALaRuta()') + metodo(' void checkDeviation(Location l)') + metodo(' double closest(double lat,double lon)') + '''
 ''' + re.search(r' static final double FUERA_M=[^;]+;',src).group(0) + re.search(r' static final long RECUERDA_MS=[^;]+;',src).group(0) + '''
 long fueraDesde=0;boolean recordado=false;long ultimoDesvio=0;long avisoRutaHasta=0,lastImportantAudio=0;
 public static void main(String[] a){
  FueraTest c=new FueraTest();for(int m=0;m<=300;m+=10)c.route.add(new double[]{43.2+m/111195.0,-2.5});
  Scanner in=new Scanner(System.in);StringBuilder out=new StringBuilder();
  while(in.hasNextLong()){long t=in.nextLong();double d=in.nextDouble();float acc=(float)in.nextDouble();
   SystemClock.reloj=t;double lat=43.2+100/111195.0,lon=-2.5+d/(111195.0*Math.cos(Math.toRadians(lat)));
   c.checkDeviation(new Location(lat,lon,acc));out.append(t).append(' ').append(c.offRoute?1:0).append('\\n');}
  if(Collections.frequency(c.dicho,"Sigues fuera del recorrido")!=2)throw new AssertionError("dos salidas, dos recordatorios: "+c.dicho);
  if(Collections.frequency(c.dicho,"De nuevo en la ruta")!=4)throw new AssertionError("cada regreso avisa: "+c.dicho);
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
    assert len(cambios) == 9, cambios
    assert sj[3].endswith(' 0') and sj[4].endswith(' 1'), '19 m: avisa a los cuatro segundos, no antes'
    assert sj[8].endswith(' 1') and sj[9].endswith(' 0'), '13 m: regreso confirmado a los cuatro segundos'
    print('OK: pagina y servicio pasan a fuera y vuelven en el mismo segundo (%d lecturas, %d cambios)' % (len(sec), len(cambios) - 1))

# Ejecuta la funcion de voz real: el giro no corta el regreso, pero una
# nueva salida si tiene prioridad. Sin motor Android, con cola observable.
voz_java = '''package com.trabakutik.gps;
import java.util.*;
public class VozRutaTest {
 static class SystemClock{static long reloj=1000;static long elapsedRealtime(){return reloj;}}
 static class TextToSpeech{static final int QUEUE_ADD=1,QUEUE_FLUSH=0;ArrayList<Integer> colas=new ArrayList<>();void speak(String t,int q,Object b,String id){colas.add(q);}}
 String avisoRutaPendiente=null;boolean navigating=true;boolean vozLista=true;TextToSpeech voz=new TextToSpeech();long avisoRutaHasta=5000;
 String modo="voz";String modoAudio(){return modo;}
 void protegeAvisoRuta(){avisoRutaHasta=SystemClock.reloj+4000;}
''' + metodo(' void habla(String texto)') + metodo(' void entregaAvisoRutaPendiente()') + '''
 public static void main(String[] args){
  VozRutaTest v=new VozRutaTest();
  v.habla("De nuevo en la ruta");v.habla("Gira a la derecha");
  v.habla("Atención, fuera del recorrido");
  SystemClock.reloj=6000;v.habla("Gira a la izquierda");
  if(!v.voz.colas.equals(Arrays.asList(0,1,0,0)))throw new AssertionError(v.voz.colas);
  v.voz.colas.clear();v.vozLista=false;
  v.habla("Atención, fuera del recorrido");v.habla("De nuevo en la ruta");
  if(!"De nuevo en la ruta".equals(v.avisoRutaPendiente))throw new AssertionError("solo el ultimo estado");
  v.vozLista=true;v.entregaAvisoRutaPendiente();
  if(v.avisoRutaPendiente!=null||!v.voz.colas.equals(Arrays.asList(0)))throw new AssertionError("se entrega una sola vez al preparar la voz");
  v.entregaAvisoRutaPendiente();if(v.voz.colas.size()!=1)throw new AssertionError("no repetir");
  v.avisoRutaPendiente="Atención, fuera del recorrido";v.navigating=false;v.entregaAvisoRutaPendiente();
  if(v.voz.colas.size()!=1||v.avisoRutaPendiente!=null)throw new AssertionError("parar cancela");
  v.navigating=true;v.modo="silencio";v.avisoRutaPendiente="De nuevo en la ruta";v.entregaAvisoRutaPendiente();
  if(v.voz.colas.size()!=1)throw new AssertionError("silencio cancela");
 }
}
'''
with tempfile.TemporaryDirectory() as tmp:
    f=Path(tmp)/'VozRutaTest.java';f.write_text(voz_java)
    subprocess.run(['javac','-d',tmp,str(f)],check=True,capture_output=True)
    subprocess.run(['java','-cp',tmp,'com.trabakutik.gps.VozRutaTest'],check=True,capture_output=True)
print('OK: el giro se encola tras el regreso y una nueva salida tiene prioridad')
