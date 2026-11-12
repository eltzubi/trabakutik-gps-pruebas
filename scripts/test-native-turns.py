"""Ejecuta checkTurns de producción con posiciones simuladas, sin Android."""
from pathlib import Path
import subprocess,tempfile,sys
production=Path('android/app/src/main/java/com/trabakutik/gps')
src=(production/'TrackingService.java').read_text()
metrics=(production/'NavigationMetrics.java').read_text()
def method(signature):
 a=src.index(signature);start=src.index('{',a);depth=1;i=start+1
 while depth:
  depth += (src[i]=='{')-(src[i]=='}');i+=1
 return src[a:i]
code='''package com.trabakutik.gps;
import java.util.*;
public class NativeTurnsTest {
 boolean navigating=true,offRoute=false;ArrayList<double[]> route=new ArrayList<>(),turns=new ArrayList<>();
 HashSet<String> warnedTurns=new HashSet<>();String upcomingTurn="";int sentido=1;
 double ultimoProgresoGiro=Double.NaN;long ultimoProgresoGiroMs=0;double velocidadSuave=10;
 static class SystemClock {static long elapsedRealtime(){return 1000;}}
 ArrayList<Integer> spoken=new ArrayList<>();int beeps=0;
 static class Location {double lat,lon;float acc=4; Location(double m){lat=m/111195.;lon=0;} Location(double m,float a){this(m);acc=a;}double getLatitude(){return lat;}double getLongitude(){return lon;}boolean hasAccuracy(){return true;}float getAccuracy(){return acc;}}
 double avisoLargo(){return 80;}double avisoCorto(){return 20;}double avisoVoz(){return 200;}
 void updateNotice(){}void pitidos(int n,int ms){beeps++;}void habla(String s){spoken.add(Integer.parseInt(s));}
 NavigationMetrics metrics=new NavigationMetrics();
 void checkTurns(Location l){
  if(metrics.distance.length!=route.size())metrics.configure(route,Collections.emptyList());
  checkTurns(l,metrics.project(l.getLatitude(),l.getLongitude(),sentido,l.getAccuracy()<=35&&!offRoute));
 }
 String fraseGiro(int lado,int tipo,String fase,double ahead){return ""+lado;}
'''+method(' static double coste(double ahead)')+method(' void checkTurns(Location l,NavigationMetrics.Projection position)')+'''
 static NativeTurnsTest setup(){NativeTurnsTest c=new NativeTurnsTest();for(int m=0;m<=300;m+=10)c.route.add(new double[]{m/111195.,0});c.turns.add(new double[]{10,-1,1});c.turns.add(new double[]{18,1,1});return c;}
 static NativeTurnsTest setup2(){NativeTurnsTest c=new NativeTurnsTest();for(int m=0;m<=300;m+=10)c.route.add(new double[]{m/111195.,0});c.turns.add(new double[]{7,-1,1});c.turns.add(new double[]{17,1,1});return c;}
 static void require(boolean b,String s){if(!b)throw new AssertionError(s);}
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
  System.out.println("PASS Java: giro proximo, voz unica, inverso, giro pasado, cruce atras, cruce recien pasado y avisos con mala señal");
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
