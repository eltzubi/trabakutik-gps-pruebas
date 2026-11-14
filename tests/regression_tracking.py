"""Regression tests executing production Java methods with Android test doubles."""
from pathlib import Path
import subprocess, tempfile, re
production=Path('android/app/src/main/java/com/trabakutik/gps')
src=(production/'TrackingService.java').read_text()
metrics=(production/'NavigationMetrics.java').read_text()
actividad=(production/'MainActivity.java').read_text()

# EL SOS, REVISADO SOBRE EL FUENTE. Son flujos de pantalla y no se pueden
# ejecutar aqui, pero si se puede exigir que no vuelvan los dos fallos que
# dejaban la funcion de emergencia inservible.
_boton=actividad[actividad.index('setPositiveButton("Elegir destinatario"'):]
_boton=_boton[:_boton.index('}).create()')]
assert 'usableSosLocation' not in _boton, (
    'el boton de compartir NO puede volver a exigir que la posicion sea reciente: '
    'la posicion ya no cambia, solo envejece mientras lees el aviso, y te dejaba '
    'sin poder enviar nada')
assert 'tomada ' in _boton, 'lo que se envia tiene que decir de cuando es la posicion'

# EL MENSAJE DEL SOS. Solo con las coordenadas, quien lo recibe no sabe si es
# una emergencia; y con los numeros sueltos tiene que copiarlos a mano, que
# con prisa no lo hace nadie.
_aviso=actividad[actividad.index('private void confirmSosLocation'):]
_aviso=_aviso[:_aviso.index('sosDialog.show();')]
assert 'NECESITO AYUDA' in _aviso, 'el mensaje tiene que decir lo primero que pides ayuda'
assert 'maps.google.com/?q=' in _aviso, (
    'tiene que llevar un enlace que abra las coordenadas en el mapa de un toque')
assert '%.6f,%.6f' in _aviso, 'el enlace necesita las coordenadas sin espacio, o no abre'
assert '±' in _aviso, 'y la precision, por si el enlace falla'
print('OK: el SOS pide ayuda, lleva enlace al mapa y dice la precision')

_permiso=actividad[actividad.index('if(code==SOS_LOCATION_PERMISSION){'):]
_permiso=_permiso[:_permiso.index('return;')]
assert 'appEnSegundoPlano' in _permiso, (
    'al conceder el permiso con la app todavia en segundo plano, el SOS se iba sin '
    'hacer nada y sin decirlo: hay que apuntarlo y retomarlo al volver')
assert 'sosPendienteDesde' in actividad and 'startSosLocation()' in actividad[
    actividad.index('protected void onResume()'):actividad.index('protected void onResume()')+700], (
    'y al volver al frente hay que retomarlo')
print('OK: el SOS comparte sin caducar y sobrevive al permiso en segundo plano')

# EL TERCER TIPO DE AVISO, «sigue por la derecha». Lo manda la pagina con t:2
# desde que los cruces traen los rumbos de sus ramas: ahi el giro son pocos
# grados y «cruce a la derecha» enganaria, porque lo que hay que hacer es no
# seguir la via que se va por el otro lado. Si el servicio pierde el 2, la
# pantalla lo dice bien y la voz no, que es lo que se oye con el movil en el
# bolsillo.
_frase=src[src.index(' String fraseGiro('):]
_frase=_frase[:_frase.index('\n }')]
assert 'tipo==2' in _frase, 'la voz tiene que distinguir el cruce en el que se sigue por un lado'
assert 'sigue por la izquierda' in _frase and 'sigue por la derecha' in _frase, (
    'y decirlo con esas palabras, las que pidio el autor')
_lee=src[src.index('int tipo=p.optInt("t",1);'):]
assert 'if(tipo<0||tipo>2)tipo=1;' in _lee[:200], (
    'un tipo desconocido se trata como cruce; nunca se tira el giro')
print('OK: el servicio entiende el cruce de «sigue por la derecha»')

def method(signature, source=src):
 a=source.index(signature);start=source.index('{',a);depth=1;i=start+1
 while depth:
  depth+=(source[i]=='{')-(source[i]=='}');i+=1
 return source[a:i]
br=method(' void beginRecording()').replace('try(FileOutputStream reset=new FileOutputStream(new File(getFilesDir(),"trazado-vivo.tsv"),false)){}','')
br=re.sub(r'recording=true;getSharedPreferences.*?updateNotice\(\);','recording=true;',br,flags=re.S)
activity=(production/'MainActivity.java').read_text()
sos=method(' private static boolean usableSosLocation(Location location)',activity)
constant=re.search(r' static final long MAX_EDAD_FIX_NS=[^;]+;',src).group(0)
code='''package com.trabakutik.gps;
import java.util.*;import java.io.*;import java.text.SimpleDateFormat;
public class TrackingRegression {
 static long nowNs=100_000_000_000L;
 static class SystemClock{static long elapsedRealtime(){return nowNs/1000000;}static long elapsedRealtimeNanos(){return nowNs;}}
 static class Location{double lat,lon;float acc=5;long ern=nowNs;Location(double m){lat=m/111195.;}
 double getLatitude(){return lat;}double getLongitude(){return lon;}boolean hasAccuracy(){return true;}float getAccuracy(){return acc;}long getElapsedRealtimeNanos(){return ern;}}
 File dirBase;File getFilesDir(){return dirBase;}
 File file;static String GRABANDO;String errorGrabacion="";long lastRecordedTime;double lastRecordedLat,lastRecordedLon;int points;boolean recording;
 boolean navigating=true,offRoute=false;ArrayList<double[]> route=new ArrayList<>(),turns=new ArrayList<>();
 HashSet<String> warnedTurns=new HashSet<>();String upcomingTurn="";int sentido=1;double velocidadSuave=1.2;int beeps=0;
 double avisoLargo(){return 50;}double avisoCorto(){return 10;}double avisoVoz(){return 35;}
 void updateNotice(){}void pitidos(int n,int ms){beeps++;}void habla(String s){}
 NavigationMetrics metrics=new NavigationMetrics();
 void checkTurns(Location l){
  if(metrics.distance.length!=route.size())metrics.configure(route,Collections.emptyList());
  checkTurns(l,metrics.project(l.getLatitude(),l.getLongitude(),sentido,l.getAccuracy()<=35&&!offRoute));
 }
 String fraseGiro(int lado,int tipo,String f,double a){return "";}
 static void require(boolean condition,String message){if(!condition)throw new AssertionError(message);}
'''+br+method(' static double coste(double ahead)')+method(' void checkTurns(Location l,NavigationMetrics.Projection position)')+constant+method(' boolean esAntigua(Location l)')+sos+method(' static boolean cortaTrack(boolean forzar,boolean hayAnterior,long huecoMs,double salto)')+re.search(r' static final double VEL_IMPOSIBLE=[^;]+;',src).group(0)+'''
 public static void main(String[] args)throws Exception{
 TrackingRegression p=new TrackingRegression();p.dirBase=new File(args[0]);
 long bucket=System.currentTimeMillis()/1000;
 while(System.currentTimeMillis()/1000==bucket)Thread.yield();
 p.beginRecording();File first=p.file;try(FileWriter w=new FileWriter(first,true)){w.write("FIRST-POINTS");}
 p.beginRecording();File second=p.file;
 require(!first.equals(second),"Recordings collide");
 require(second.getName().equals(first.getName().replace(".gpx","_2.gpx")),"Second name must use _2");
 require(new String(java.nio.file.Files.readAllBytes(first.toPath())).contains("FIRST-POINTS"),"First recording lost");
 System.out.println("PASS: recordings in same second preserve first and use _2");
 Location current=new Location(0),boundary=new Location(0),old=new Location(0);
 boundary.ern=nowNs-10_000_000_000L;old.ern=nowNs-10_000_000_001L;
 require(!p.esAntigua(current)&&!p.esAntigua(boundary)&&p.esAntigua(old),"10-second GPS boundary incorrect");
 System.out.println("PASS: age exactly 10 s accepted; older rejected");
 require(usableSosLocation(current)&&usableSosLocation(boundary)&&!usableSosLocation(old),"SOS uses the monotonic age of the position");
 current.acc=36;require(!usableSosLocation(current),"SOS rejects poor accuracy");
 current.acc=5;current.lat=91;require(!usableSosLocation(current),"SOS rejects invalid coordinates");
 System.out.println("PASS: SOS validates native fixes without the tracking service");
 TrackingRegression q=new TrackingRegression();for(int m=0;m<=300;m+=10)q.route.add(new double[]{m/111195.,0});q.turns.add(new double[]{10,-1,1});
 q.offRoute=true;q.checkTurns(new Location(60));require(q.beeps==0,"Turn sounded off-route");
 q.offRoute=false;q.checkTurns(new Location(60));require(q.beeps>0,"Turn did not resume on return");
 System.out.println("PASS: turns silent off-route and resume on return");

 // LA FUENTE, EN LAS DOS PASADAS. Una ida y vuelta por el mismo camino pasa
 // dos veces por delante de la misma fuente. addWater guarda un aviso por
 // pasada a proposito; el apunte de «ya dicho» tiraba la posicion y se
 // quedaba solo con el nombre, asi que a la vuelta no decia nada.
 NavigationMetrics agua=new NavigationMetrics();
 java.util.List<double[]> ida=new java.util.ArrayList<>();
 for(int m=0;m<=2000;m+=10)ida.add(new double[]{43.2+m/111195.,-2.5,100});
 for(int m=1990;m>=0;m-=10)ida.add(new double[]{43.2+m/111195.,-2.5,100});
 // La fuente, al lado del camino a mitad de la ida (1.000 m del inicio).
 agua.configure(ida,java.util.List.of(new NavigationMetrics.Water("Iturri",43.2+1000/111195.,-2.49995,false)));
 NavigationMetrics.Notice primera=agua.nextNotice(950,1);
 require(primera!=null,"a la ida tiene que avisar de la fuente");
 require(agua.nextNotice(960,1)==null,"pero una sola vez en esa pasada");
 // La vuelta pasa por el mismo sitio con un «along» mucho mayor.
 double vuelta=agua.total()-1000;
 require(agua.nextNotice(vuelta-50,1)!=null,"y al volver a pasar, otra vez: "+vuelta);
 System.out.println("PASS: la fuente se avisa en la ida y en la vuelta");

 // EL TRACK SE CORTA CUANDO FALTA TROZO, NO CUANDO VAS DEPRISA. Los dos
 // huecos del GPX del autor del 13 de noviembre de 2026, medidos: el tunel
 // -78 s y 1.911 m- tiene que cortar, y los 8 s con 177 m a 80 km/h no,
 // que es el coche yendo normal y con los 100 m fijos salia un corte falso.
 require(cortaTrack(false,true,78000,1911),"el tunel parte el track");
 require(!cortaTrack(false,true,8000,177),"8 s y 177 m a 80 km/h no es un corte");
 require(!cortaTrack(false,true,1000,25),"un segundo a 90 km/h tampoco");
 require(cortaTrack(false,true,1000,150),"150 m en un segundo son 540 km/h: eso es un salto del GPS");
 require(cortaTrack(false,true,25000,3),"parado 25 s sin posicion tambien es un hueco");
 require(cortaTrack(true,true,1000,1),"la pausa siempre corta");
 require(!cortaTrack(false,false,999999,99999),"el primer punto no corta nada");
 System.out.println("PASS: el track se corta por el hueco, no por la velocidad");
 }
}'''
with tempfile.TemporaryDirectory() as d:
 p=Path(d)/'TrackingRegression.java';p.write_text(code)
 metrics_file=Path(p).with_name('NavigationMetrics.java')
 metrics_file.write_text(metrics)
 subprocess.run(['javac','-d',d,str(p),str(metrics_file)],check=True)
 subprocess.run(['java','-cp',d,'com.trabakutik.gps.TrackingRegression',d],check=True)
