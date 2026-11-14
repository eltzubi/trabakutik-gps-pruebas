"""Ejecuta checkTurns de producción con posiciones simuladas, sin Android."""
from pathlib import Path
import subprocess,tempfile,sys,re
production=Path('android/app/src/main/java/com/trabakutik/gps')
src=(production/'TrackingService.java').read_text()
metrics=(production/'NavigationMetrics.java').read_text()
# Las subidas y las fuentes suenan con un tono propio, no con el pitido de
# los giros: con el mismo, en «solo pitidos» una subida sonaba igual que
# «giro a 50 m» y una fuente casi igual que «sin señal GPS».
avisos=src[src.index(' String updateNavigationMetrics('):]
avisos=avisos[:avisos.index('\n }\n')]
assert 'TONE_PROP_PROMPT' in avisos and 'pitidos(notice.beeps(),900)' not in avisos, \
    'los avisos de subida y de agua tienen que sonar con su propio tono'
print('PASS: subidas y fuentes con tono propio, distinto del de los giros')
def method(signature):
 a=src.index(signature);start=src.index('{',a);depth=1;i=start+1
 while depth:
  depth += (src[i]=='{')-(src[i]=='}');i+=1
 return src[a:i]
code='''package com.trabakutik.gps;
import java.util.*;
public class NativeTurnsTest {
 boolean navigating=true,offRoute=false,routeReached=false;long farSince=0,cercaDesde=0;
 double alongPrevio=Double.NaN,alongAcum=0;ArrayList<double[]> route=new ArrayList<>(),turns=new ArrayList<>();
 HashSet<String> warnedTurns=new HashSet<>();String upcomingTurn="";int sentido=1;
 double ultimoProgresoGiro=Double.NaN;long ultimoProgresoGiroMs=0;double velocidadSuave=10;
 double movSentido=Double.NaN,latSentido=Double.NaN,lonSentido=Double.NaN;
'''+re.search(r' static final double AVANCE_DECIDE_M=[^;]+;',src).group(0)+'''
 static class SystemClock {static long reloj=1000;static long elapsedRealtime(){return reloj;}}
 ArrayList<Integer> spoken=new ArrayList<>();int beeps=0;
 static class Location {double lat,lon;float acc=4; Location(double m){lat=m/111195.;lon=0;} Location(double m,float a){this(m);acc=a;} Location(double m,double off,float a){this(m);lon=off/111195.;acc=a;}double getLatitude(){return lat;}double getLongitude(){return lon;}boolean hasAccuracy(){return true;}float getAccuracy(){return acc;}}
 double avisoLargo(){return 80;}double avisoCorto(){return 20;}double avisoVoz(){return 200;}
 static class ToneGenerator{static final int TONE_PROP_ACK=2;}
 void updateNotice(){}void pitidos(int n,int ms){beeps++;}void pitidos(int n,int ms,int t){beeps++;}
 ArrayList<String> dicho=new ArrayList<>();
 void habla(String s){dicho.add(s);try{spoken.add(Integer.parseInt(s));}catch(NumberFormatException e){}}
 // Lo mismo que hace onLocationChanged con cada posicion, en el mismo orden.
 void posicion(Location l){posicion(l,true);}
 void posicion(Location l,boolean decide){
  if(metrics.distance.length!=route.size())metrics.configure(route,Collections.emptyList());
  checkDeviation(l);
  NavigationMetrics.Projection position=metrics.project(l.getLatitude(),l.getLongitude(),sentido,l.getAccuracy()<=35&&!offRoute);
  if(decide&&!offRoute&&l.getAccuracy()<=35&&position.distance()<=30)decideSentido(position.along(),l.getLatitude(),l.getLongitude());
  checkTurns(l,position);
 }
 // Los lados anunciados, sin las repeticiones de las fases de un mismo giro.
 ArrayList<Integer> lados(){
  ArrayList<Integer> r=new ArrayList<>();
  for(int v:spoken)if(r.isEmpty()||r.get(r.size()-1)!=v)r.add(v);
  return r;
 }
 NavigationMetrics metrics=new NavigationMetrics();
 void checkTurns(Location l){
  if(metrics.distance.length!=route.size())metrics.configure(route,Collections.emptyList());
  checkTurns(l,metrics.project(l.getLatitude(),l.getLongitude(),sentido,l.getAccuracy()<=35&&!offRoute));
 }
 String fraseGiro(int lado,int tipo,String fase,double ahead){return ""+lado;}
'''+''.join(method(m) for m in (
 ' static double coste(double ahead)',
 ' void checkTurns(Location l,NavigationMetrics.Projection position)',
 ' void decideSentido(double along,double lat,double lon)',' void decideSentido(double along)',' void ponSentido(int s)',
 ' void olvidaSentido()',' void tonoBien()',' void vuelveALaRuta()',
 ' void checkDeviation(Location l)',' double closest(double lat,double lon)'))+'''
 static NativeTurnsTest setup(){NativeTurnsTest c=new NativeTurnsTest();for(int m=0;m<=300;m+=10)c.route.add(new double[]{m/111195.,0});c.turns.add(new double[]{10,-1,1});c.turns.add(new double[]{18,1,1});return c;}
 static NativeTurnsTest setup2(){NativeTurnsTest c=new NativeTurnsTest();for(int m=0;m<=300;m+=10)c.route.add(new double[]{m/111195.,0});c.turns.add(new double[]{7,-1,1});c.turns.add(new double[]{17,1,1});return c;}
 static void require(boolean b,String s){if(!b)throw new AssertionError(s);}
 // UN SALTO DE LA PROYECCION NO ES DAR LA VUELTA. Avanzas de 5 en 5 m y, en
 // una posicion, la proyeccion salta 50 m hacia atras (a la otra rama de una
 // curva): sin el filtro eso eran 30 m netos de retroceso y «vas en sentido
 // inverso», con los lados cambiados. Visto en la grabacion del autor del 14
 // de noviembre de 2026.
 // EL DESNIVEL CON UMBRAL Y EL FINAL DE UN CIRCUITO, en NavigationMetrics.
 // Con 2 m de baile en cada punto, la suma cruda inflaba el «quedan»; y al
 // volver a la salida de un circuito te daba otra vez la subida entera.
 static void desnivelYCircuito(){
  ArrayList<double[]> r=new ArrayList<>();
  for(int m=0;m<=1000;m+=10)r.add(new double[]{m/111195.,0,100+(m%20==0?2:0)+m*0.05});
  NavigationMetrics a=new NavigationMetrics();a.configure(r,Collections.emptyList());
  double q=a.gain(0,1);
  require(q>45&&q<56,"sube 50 m con 2 m de ruido: quedan unos 50, no "+Math.round(q));
  // Circuito: cuadrado de 250 m que acaba 90 m antes de la salida.
  ArrayList<double[]> c=new ArrayList<>();
  for(int s=0;s<=910;s+=10){int t=s%250,l=s/250;double x=l==0?t:l==1?250:l==2?250-t:0,y=l==0?0:l==1?t:l==2?250:250-t;
   c.add(new double[]{y/111195.,x/(111195*Math.cos(Math.toRadians(0))),100+(l==1?t*0.2:l==2?50:l==3?50-t*0.2:0)});}
  NavigationMetrics b=new NavigationMetrics();b.configure(c,Collections.emptyList());
  for(int k=c.size()-20;k<c.size();k++)b.project(c.get(k)[0],c.get(k)[1],1,true);
  NavigationMetrics.Projection fin=b.project(0,0,1,true);
  require(fin.along()>b.total()-5,"en la salida, al final del circuito, es el final: "+Math.round(fin.along()));
  require(b.gain(fin.along(),1)==0,"y no queda subida");
  NavigationMetrics e=new NavigationMetrics();e.configure(c,Collections.emptyList());
  require(e.project(0,0,1,true).along()<5,"al empezar, la salida es el km 0");
  // Pero si la llegada vuelve paralela a la salida (20 m) y quedan 90 m, una
  // lectura que cae en la salida no te da por llegado: te deja donde ibas.
  ArrayList<double[]> p=new ArrayList<>();
  double[][] esq={{0,0},{400,0},{400,100},{0,100},{0,20},{100,20}};
  for(int k=1;k<esq.length;k++){double[] A=esq[k-1],B=esq[k];int n=(int)Math.round(Math.hypot(B[0]-A[0],B[1]-A[1])/10);
   for(int u=(k==1?0:1);u<=n;u++)p.add(new double[]{(A[1]+(B[1]-A[1])*u/n)/111195.,(A[0]+(B[0]-A[0])*u/n)/111195.,100});}
  NavigationMetrics f=new NavigationMetrics();f.configure(p,Collections.emptyList());
  for(double x=-20;x<=10;x+=10)f.project((x<0?20+x*-1:20)/111195.,(x<0?0:x)/111195.,1,true);
  NavigationMetrics.Projection ref=f.project(20/111195.,10/111195.,1,true);
  NavigationMetrics.Projection salto=f.project(2/111195.,12/111195.,1,true);
  require(salto.along()>f.total()-150,"90 m antes de llegar, una lectura en la salida no es el km 0: "+Math.round(salto.along())+" (iba por "+Math.round(ref.along())+")");
  require(salto.along()<f.total()-30,"ni la llegada: "+Math.round(salto.along())+" de "+Math.round(f.total()));
 }
 static void saltoNoEsVuelta(){
  NativeTurnsTest c=new NativeTurnsTest();
  double[] along={100,105,110,60,65,70,75};
  for(int k=0;k<along.length;k++)c.decideSentido(along[k],k*5/111195.,0);
  require(c.sentido==1,"un salto de 50 m habiendote movido 5 no cambia el sentido");
  // Y retroceder de verdad -moviendote lo mismo que retrocedes- si lo cambia.
  NativeTurnsTest d=new NativeTurnsTest();
  for(int k=0;k<10;k++)d.decideSentido(200-k*5,k*5/111195.,0);
  require(d.sentido==-1,"retroceder 45 m de verdad si es ir al reves");
 }
 static void metricsChecks(){
  ArrayList<double[]> line=new ArrayList<>();
  for(int m=0;m<=500;m+=10)line.add(new double[]{m/111195.,0,100+m*.10});
  NavigationMetrics metrics=new NavigationMetrics();
  metrics.configure(line,Collections.emptyList());
  require(Math.abs(metrics.gain(100,1)-40)<.01,"Remaining gain forwards");
  require(metrics.gain(100,-1)==0,"Reverse gain");
  // UNA SUBIDA ENTERA, UN AVISO. El autor: «no me gusta que cada 200 m esté
  // indicándome el desnivel y metros». La ventana de 200 m vuelve a cumplir
  // el 10% muchas veces en una cuesta larga y desigual, y antes cada vez que
  // volvia a cumplir soltaba un aviso.
  // Esta de prueba sube 2 km al 12% con un replano de 15 m en medio: eso no
  // parte la subida, porque se pierde menos de CLIMB_DROP.
  ArrayList<double[]> puerto=new ArrayList<>();
  for(int m=0;m<=2000;m+=10){
   double h=100+m*.12;
   if(m>900&&m<1100)h=100+900*.12-15;   // el replano
   puerto.add(new double[]{m/111195.,0,h});
  }
  NavigationMetrics mp=new NavigationMetrics();
  mp.configure(puerto,Collections.emptyList());
  ArrayList<String> dichos=new ArrayList<>();
  for(int m=0;m<=2000;m+=50){
   NavigationMetrics.Notice av=mp.nextNotice(m,1);
   if(av!=null)dichos.add(av.text());
  }
  require(dichos.size()==1,"una subida, un aviso (salieron "+dichos.size()+")");
  require(dichos.get(0).startsWith("Empieza una subida de"),dichos.get(0));
  require(dichos.get(0).contains("kil"),"de mas de un km se dice en kilometros: "+dichos.get(0));
  // Y el desnivel que dice es el de la subida entera, no el de 200 m.
  String txt=dichos.get(0);
  String num=txt.substring(txt.lastIndexOf(" y ")+3,txt.indexOf(" metros de desnivel"));
  require(Integer.parseInt(num)>=200,"el desnivel tiene que ser el de la subida entera: "+txt);
  // Un bajon de 40 m SI la parte en dos: ya no es la misma cuesta.
  ArrayList<double[]> dos=new ArrayList<>();
  for(int m=0;m<=2000;m+=10){
   double h=100+m*.12;
   if(m>900&&m<1100)h=100+900*.12-40;
   dos.add(new double[]{m/111195.,0,h});
  }
  NavigationMetrics md=new NavigationMetrics();
  md.configure(dos,Collections.emptyList());
  int cuantos=0;
  for(int m=0;m<=2000;m+=50)if(md.nextNotice(m,1)!=null)cuantos++;
  require(cuantos==2,"un bajon de 40 m parte la subida (salieron "+cuantos+")");
  // Un repecho pequeno no se canta: 300 m y 36 m de desnivel.
  ArrayList<double[]> repecho=new ArrayList<>();
  for(int m=0;m<=300;m+=10)repecho.add(new double[]{m/111195.,0,100+m*.12});
  NavigationMetrics mr=new NavigationMetrics();
  mr.configure(repecho,Collections.emptyList());
  int chicos=0;
  for(int m=0;m<=300;m+=50)if(mr.nextNotice(m,1)!=null)chicos++;
  require(chicos==0,"un repecho de 36 m no es una subida");
  // UNA SUBIDA QUE EMPIEZA JUNTO A UN CRUCE. Mientras se canta un giro no se
  // piden avisos, y si los 100 m de antes de la subida caian todos en la
  // ventana del giro, pasado el arranque ya no se ofrecia y no se decia nunca.
  // Ahora vale hasta 60 m despues del arranque; mas alla, no.
  NavigationMetrics mt=new NavigationMetrics();
  mt.configure(puerto,Collections.emptyList());
  require(mt.nextNotice(40,1)!=null,"recien empezada la subida todavia se avisa");
  NavigationMetrics mt2=new NavigationMetrics();
  mt2.configure(puerto,Collections.emptyList());
  require(mt2.nextNotice(80,1)==null,"pasados 60 m del arranque ya no");
  long eta=-1;
  for(int i=0;i<=60;i++)eta=metrics.eta(i*2,1,i*2/111195.,0,100000+i*1000,true);
  require(Math.abs(eta-190000)<1,"ETA from real movement");
  metrics.pausePace();
  eta=metrics.eta(120,1,120/111195.,0,185000,true);
  require(eta==-1,"Long pause hides ETA");
  metrics.eta(122,1,122/111195.,0,186000,true);
  eta=metrics.eta(124,1,124/111195.,0,187000,true);
  require(Math.abs(eta-188000)<1,"Pause not included in ETA");

  ArrayList<double[]> loop=new ArrayList<>(line);
  for(int m=490;m>=0;m-=10)loop.add(new double[]{m/111195.,0,100});
  metrics.configure(loop,Collections.emptyList());
  metrics.project(440/111195.,0,1,true);
  require(Math.abs(metrics.project(450/111195.,0,1,true).along()-450)<.01,"Keep outbound leg");
  for(int m=460;m<=500;m+=10)metrics.project(m/111195.,0,1,true);
  require(Math.abs(metrics.project(490/111195.,0,1,true).along()-510)<.01,"Take return after turnaround");

  ArrayList<double[]> parallel=new ArrayList<>();
  for(double[] p:new double[][]{{0,0},{500,0},{500,20},{0,20}})parallel.add(new double[]{p[0]/111195.,p[1]/111195.,100});
  NavigationMetrics.Water water=new NavigationMetrics.Water("Fuente",100/111195.,20/111195.,true);
  metrics.configure(parallel,Collections.singletonList(water));
  require(metrics.nextNotice(0,1)==null,"Source on another nearby branch must stay quiet");
  require(metrics.nextNotice(800,1).text().contains("aproximada"),"Source on the return can be announced");

  line.get(20)[2]=Double.NaN;
  metrics.configure(line,Collections.emptyList());
  require(Double.isNaN(metrics.gain(100,1)),"Altitude gap cannot invent gain");
  require(Double.isFinite(metrics.gain(300,1)),"Earlier gap does not hide subsequent gain");
 }
 public static void main(String[] args){
  saltoNoEsVuelta();desnivelYCircuito();
  System.out.println("PASS: el desnivel con umbral de 5 m y el final de un circuito");
  System.out.println("PASS: un salto de la proyeccion no es dar la vuelta");
  metricsChecks();
  NativeTurnsTest late=setup();late.checkTurns(new Location(72));
  require(late.spoken.equals(Arrays.asList(-1)),"First fix in phase 1 still speaks");
  late.checkTurns(new Location(72));require(late.spoken.size()==1,"Late turn voice is deduplicated");
  NativeTurnsTest c=setup();c.checkTurns(new Location(0));require(c.spoken.equals(Arrays.asList(-1)),"Debe anunciar solo la izquierda próxima, no la derecha posterior: "+c.spoken);require(c.upcomingTurn.startsWith("Izquierda"),c.upcomingTurn);
  c.checkTurns(new Location(0));require(c.spoken.size()==1,"No repetir la misma fase");
  c=setup();c.sentido=-1;c.checkTurns(new Location(280));require(c.spoken.equals(Arrays.asList(-1)),"En inverso, la derecha próxima se convierte en izquierda: "+c.spoken);
  c=setup();c.checkTurns(new Location(145));require(c.upcomingTurn.startsWith("Derecha"),"Un giro ya pasado no debe tapar el siguiente");
  // Dos cruces dentro de la misma ventana, uno detras y otro delante: manda
  // el que viene. Con el criterio de «el mas cercano a 15 m» ganaba el de
  // atras y el de delante no se avisaba.
  c=setup2();c.checkTurns(new Location(95));require(c.upcomingTurn.startsWith("Derecha"),"Un cruce 25 m atras no debe tapar al que viene a 75 m: "+c.upcomingTurn);
  // Pero el que acabas de cruzar si manda: para eso esta el suelo negativo
  // de la ventana, para no perder el pitido del propio cruce.
  c=setup2();c.checkTurns(new Location(75));require(c.spoken.equals(Arrays.asList(-1)),"El cruce recien pasado debe seguir sonando: "+c.spoken);
  // CON MALA SEÑAL TAMBIEN SE AVISA. El corte estaba en 22 m y bajo arbolado
  // la precision normal es de 25 a 45: el autor se quedaba sin avisos justo
  // con el movil en el bolsillo y el cielo tapado, que es cuando los necesita.
  for(float acc:new float[]{4,25,40,59}){
   c=setup();c.checkTurns(new Location(0,acc));
   require(c.spoken.equals(Arrays.asList(-1)),"con "+acc+" m de precision tiene que avisar: "+c.spoken);
  }
  // Pero una posicion de 70 m de error es basura y no vale para decidir.
  c=setup();c.checkTurns(new Location(0,70));
  require(c.spoken.isEmpty(),"con 70 m no se avisa: "+c.spoken);

  // LA RUTA AL REVES, CON LA PAGINA DORMIDA. Lo que le paso al autor el 13 de
  // noviembre de 2026: hizo al reves una ruta de ayer y le canto todos los
  // giros al lado contrario. La pagina, dormida con la pantalla apagada, no
  // mandaba el sentido; aqui NO se manda ninguno a proposito: el servicio
  // tiene que darse cuenta solo. La ruta sube 300 m al norte con una
  // izquierda grabada en el metro 100 y una derecha en el 180, asi que
  // volviendo hay que oir primero izquierda (la derecha del 180) y luego
  // derecha (la izquierda del 100).
  c=setup();
  for(int m=300;m>=0;m-=10)c.posicion(new Location(m,6));
  require(c.sentido==-1,"el servicio tiene que ver que vas al reves sin que se lo diga la pagina");
  require(c.lados().equals(Arrays.asList(-1,1)),"al reves, los lados van cambiados: "+c.lados()+" "+c.dicho);
  require(c.dicho.contains("Vas en sentido inverso, los giros van corregidos"),"y hay que decirlo: "+c.dicho);
  // Y ESTO ES EL FALLO QUE TENIA, para que la prueba de arriba tenga dientes:
  // sin decidir el sentido, los dos giros salen al lado de enfrente.
  NativeTurnsTest viejo=setup();
  for(int m=300;m>=0;m-=10)viejo.posicion(new Location(m,6),false);
  require(viejo.lados().equals(Arrays.asList(1,-1)),"el fallo de la 4.9.17 era este: "+viejo.lados());

  // VOLVER A LA RUTA. El autor: «al volver no me ha indicado que entra en
  // ruta, solo al salir». Sale a 40 m, vuelve a 13 y se queda ahi.
  // Lejos de los dos giros (100 y 180 m), para que lo que suene sea la
  // vuelta y no un cruce.
  c=setup();SystemClock.reloj=1000;
  c.posicion(new Location(250,0,5));
  require(c.routeReached,"llegar a la ruta");
  for(int k=0;k<5;k++){SystemClock.reloj+=1500;c.posicion(new Location(250,40,5));}
  require(c.offRoute&&c.dicho.contains("Atención, fuera del recorrido"),"tiene que avisar al salir: "+c.dicho);
  int antesBeeps=c.beeps;
  for(int k=0;k<5;k++){SystemClock.reloj+=1500;c.posicion(new Location(250,13,5));}
  require(!c.offRoute&&c.dicho.contains("De nuevo en la ruta"),"y al volver, aunque te quedes a 13 m: "+c.dicho);
  // Y SUENA. Iba muda mientras que salirse lleva cuatro pitidos; en el coche
  // una frase sola se pierde, y el autor no la oyo.
  require(c.beeps>antesBeeps,"la vuelta a la ruta tambien tiene que sonar");
  // Pegado a la ruta, sin esperar los cuatro segundos.
  c=setup();SystemClock.reloj=1000;c.posicion(new Location(250,0,5));
  for(int k=0;k<5;k++){SystemClock.reloj+=1500;c.posicion(new Location(250,40,5));}
  require(c.offRoute,"fuera");
  SystemClock.reloj+=1500;c.posicion(new Location(250,4,5));
  require(!c.offRoute&&c.dicho.contains("De nuevo en la ruta"),"a 4 m se dice ya: "+c.dicho);
  SystemClock.reloj=1000;

  System.out.println("PASS Java: giro proximo, voz unica, inverso, giro pasado, cruce atras, cruce recien pasado, avisos con mala señal, ruta al reves sin la pagina y vuelta a la ruta");
 }
}'''
if '--generate-junit' in sys.argv:
 dest=Path('android/app/src/test/java/com/trabakutik/gps/NativeTurnsTest.java')
 dest.parent.mkdir(parents=True,exist_ok=True)
 code=code.replace(' public static void main(String[] args){',' @org.junit.Test public void checks(){main(new String[0]);}\n public static void main(String[] args){')
 dest.write_text(code)
 print('Generado test JUnit con checkTurns de producción')
 sys.exit(0)
with tempfile.TemporaryDirectory() as d:
 p=Path(d)/'NativeTurnsTest.java';p.write_text(code)
 metrics_file=Path(d)/'NavigationMetrics.java'
 metrics_file.write_text(metrics)
 subprocess.run(['javac','-d',d,str(p),str(metrics_file)],check=True)
 subprocess.run(['java','-cp',d,'com.trabakutik.gps.NativeTurnsTest'],check=True)
# Run regression cases in the existing APK validation step.
import runpy
runpy.run_path('tests/regression_tracking.py',run_name='__main__')
