"""Ejecuta checkTurns de producción con posiciones simuladas, sin Android."""
from pathlib import Path
import subprocess,tempfile,sys,re
production=Path('android/app/src/main/java/com/trabakutik/gps')
src=(production/'TrackingService.java').read_text()
replay="--replay" in sys.argv
metrics=(production/'NavigationMetrics.java').read_text()
# Las subidas y las fuentes suenan con un tono propio, no con el pitido de
# los giros: con el mismo, en «solo pitidos» una subida sonaba igual que
# «giro a 50 m» y una fuente casi igual que «sin señal GPS».
avisos=src[src.index(' String updateNavigationMetrics('):]
avisos=avisos[:avisos.index('\n }\n')]
assert 'TONE_PROP_PROMPT' in avisos and 'pitidos(notice.beeps(),900)' not in avisos, \
    'los avisos de subida y de agua tienen que sonar con su propio tono'
if not replay: print('PASS: subidas y fuentes con tono propio, distinto del de los giros')
def method(signature):
 a=src.index(signature);start=src.index('{',a);depth=1;i=start+1
 while depth:
  depth += (src[i]=='{')-(src[i]=='}');i+=1
 return src[a:i]
code='''package com.trabakutik.gps;
import java.util.*;
public class NativeTurnsTest {
 boolean entradaAvisada=false;boolean navigating=true,offRoute=false,routeReached=false;long farSince=0,cercaDesde=0;
 long avisoRutaHasta=0,lastImportantAudio=0;
 double alongPrevio=Double.NaN,alongAcum=0;ArrayList<double[]> route=new ArrayList<>(),turns=new ArrayList<>(),turnsReves=new ArrayList<>();boolean hayReves=false;
 double inicioCurva=Double.NaN,maximoCurva=Double.NaN;long ultimoFixCurva=0;
 HashSet<String> warnedTurns=new HashSet<>();String upcomingTurn="";int sentido=1;
 double ultimoProgresoGiro=Double.NaN;long ultimoProgresoGiroMs=0;double velocidadSuave=10;
 double movSentido=Double.NaN,latSentido=Double.NaN,lonSentido=Double.NaN;
'''+re.search(r' static final double AVANCE_DECIDE_M=[^;]+;',src).group(0)+re.search(r' static final double FUERA_M=[^;]+;',src).group(0)+re.search(r' static final long RECUERDA_MS=[^;]+;',src).group(0)+re.search(r' long fueraDesde=0;boolean recordado=false;long ultimoDesvio=0;',src).group(0)+re.search(r' static final double SEGUIDO_M=[^;]+;',src).group(0)+'''
 static class SystemClock {static long reloj=1000;static long elapsedRealtime(){return reloj;}}
 ArrayList<Integer> spoken=new ArrayList<>();int beeps=0;
 static class Location {double lat,lon;float acc=4; Location(double m){lat=m/111195.;lon=0;} Location(double m,float a){this(m);acc=a;} Location(double m,double off,float a){this(m);lon=off/111195.;acc=a;}double getLatitude(){return lat;}double getLongitude(){return lon;}boolean hasAccuracy(){return true;}float getAccuracy(){return acc;}}
 double avisoLargo(){return 80;}double avisoCorto(){return 20;}double avisoVoz(){return 200;}
 static class ToneGenerator{static final int TONE_PROP_ACK=2,TONE_PROP_BEEP=1;}
 void updateNotice(){}double posActual=Double.NaN,tresEn=Double.NaN;void pitidos(int n,int ms){beeps++;if(n==3&&Double.isNaN(tresEn))tresEn=posActual;}void pitidos(int n,int ms,int t){beeps++;}
 void pitidos(int n,int ms,int t,int volumen){require(t==ToneGenerator.TONE_PROP_BEEP&&volumen==100,"giro a volumen máximo");pitidos(n,ms);}
 ArrayList<String> dicho=new ArrayList<>();
 void habla(String s){dicho.add(s);try{spoken.add(Integer.parseInt(s.split("[ .]")[0]));}catch(NumberFormatException e){}}
 void hablaGiro(String s,String siguiente){habla(s);if(!siguiente.isEmpty())habla(siguiente);}
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
 static final String[] ORDINALES={"","primera","segunda","tercera","cuarta","quinta","sexta","séptima","octava"};
 String fraseGiro(int lado,int tipo,String fase,double ahead){return ""+lado;}
 String fraseGiro(int lado,int tipo,String fase,double ahead,int salida){return ""+lado;}
'''+''.join(method(m) for m in (
 ' static double coste(double ahead)',
 ' boolean confirmaMarchaCurva(double along,boolean fiable)',
 ' void checkTurns(Location l,NavigationMetrics.Projection position)',
 ' String siguienteManiobra(ArrayList<double[]> turns,int actual,boolean usaReves,double along)',
 ' String giroSeguido(ArrayList<double[]> turns,int actual,boolean usaReves)',' double avisoYa()',
 ' void decideSentido(double along,double lat,double lon)',' void decideSentido(double along)',' void ponSentido(int s)',
 ' void olvidaSentido()',' void tonoBien()',' void vuelveALaRuta()',
 ' void protegeAvisoRuta()',' String avisoSalida(Location l)',' void checkDeviation(Location l)',' double closest(double lat,double lon)'))+'''
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
  // Y siguiendo por la salida a pasos de 3 m, lo andado se suma y se llega.
  NavigationMetrics.Projection ult=salto;
  for(double x=15;x<=130;x+=3)ult=f.project(2/111195.,x/111195.,1,true);
  require(ult.along()>f.total()-5,"andando por la salida, se acaba llegando: "+Math.round(ult.along()));
  // Alejandote de la meta por la salida, retenido, no se llega nunca.
  NavigationMetrics g=new NavigationMetrics();g.configure(p,Collections.emptyList());
  for(double x=-20;x<=10;x+=10)g.project((x<0?20+x*-1:20)/111195.,(x<0?0:x)/111195.,1,true);
  g.project(20/111195.,10/111195.,1,true);
  NavigationMetrics.Projection lejos=g.project(2/111195.,200/111195.,1,true);
  for(double x=203;x<=290;x+=3)lejos=g.project(2/111195.,x/111195.,1,true);
  require(lejos.along()<g.total()-20,"alejandote de la meta no se llega: "+Math.round(lejos.along()));
 }
 // IDA Y VUELTA: el tramo que va hacia donde te mueves. Ida al norte por x=0,
 // vuelta al sur por x=8; se entra en y=300 pegado a la vuelta y se sube.
 static void idaYVuelta(){
  ArrayList<double[]> r=new ArrayList<>();
  for(int y=0;y<=1000;y+=10)r.add(new double[]{y/111195.,0,100});
  for(int y=1000;y>=0;y-=10)r.add(new double[]{y/111195.,8/111195.,100});
  NavigationMetrics m=new NavigationMetrics();m.configure(r,Collections.emptyList());
  NavigationMetrics.Projection first=m.project(300/111195.,6/111195.,1,true);
  require(first.ambiguous(),"Las dos pasadas son posibles con una sola posición");
  NavigationMetrics.Projection pr=null;
  for(int y=310;y<=420;y+=10)pr=m.project(y/111195.,6/111195.,1,true);
  require(Math.abs(pr.along()-420)<15,"va por la ida, km 0,42, no por la vuelta: "+Math.round(pr.along()));
  NavigationMetrics w=new NavigationMetrics();w.configure(r,Collections.emptyList());
  NavigationMetrics.Projection pw=null;
  for(double y=300;y<=360;y+=1.5)pw=w.project(y/111195.,6/111195.,1,true);
  require(Math.abs(pw.along()-360)<15,"andando (1,5 m por posicion) tambien va por la ida: "+Math.round(pw.along()));
  w.project(460/111195.,6/111195.,1,false);
  NavigationMetrics.Projection pb=w.project(361/111195.,6/111195.,1,true);
  require(Math.abs(pb.along()-361)<15,"tras una posicion mala sigue por la ida: "+Math.round(pb.along()));
 }
 // DOS GIROS SEGUIDOS SE DICEN JUNTOS: a 20 m, «y enseguida a la derecha»;
 // a 80 m, cada uno el suyo. Y al reves de la ruta, el siguiente es el de
 // atras y con el lado cambiado.
 static void girosSeguidos(){
  NativeTurnsTest c=new NativeTurnsTest();for(int m=0;m<=300;m+=10)c.route.add(new double[]{m/111195.,0});
  c.turns.add(new double[]{10,-1,1});c.turns.add(new double[]{12,1,1});c.turns.add(new double[]{20,-1,1});
  c.metrics.configure(c.route,Collections.emptyList());
  require(c.giroSeguido(c.turns,0,false).equals(" y enseguida a la derecha"),"a 20 m se dicen juntos: '"+c.giroSeguido(c.turns,0,false)+"'");
  require(c.giroSeguido(c.turns,1,false).isEmpty(),"a 80 m no");
  require(c.giroSeguido(c.turns,2,false).isEmpty(),"el ultimo no tiene siguiente");
  c.sentido=-1;
  require(c.giroSeguido(c.turns,1,false).equals(" y enseguida a la derecha"),"al reves, el de atras con el lado cambiado: '"+c.giroSeguido(c.turns,1,false)+"'");
  require(c.giroSeguido(c.turns,0,false).isEmpty(),"al reves, el primero ya es el ultimo");
  require(c.giroSeguido(c.turns,1,true).equals(" y enseguida a la izquierda"),"con la lista de vuelta, el lado ya viene puesto");
  c.sentido=1;
  require(c.siguienteManiobra(c.turns,1,false,120).equals("Siguiente cruce a 80 metros"),"distancia al siguiente cruce");
  require(c.siguienteManiobra(c.turns,2,false,200).isEmpty(),"sin maniobra después de la última");
  c.sentido=-1;
  require(c.siguienteManiobra(c.turns,2,false,200).equals("Siguiente cruce a 80 metros"),"distancia al volver");
  NativeTurnsTest fases=setup();
  fases.checkTurns(new Location(30));
  fases.checkTurns(new Location(83));
  require(fases.beeps==1,"sin pitido intermedio");
  fases.checkTurns(new Location(95));
  fases.checkTurns(new Location(95));
  require(fases.beeps==2,"dos avisos sonoros, sin repetición");
  require(fases.dicho.stream().filter(d->d.contains("Siguiente cruce")).count()==1,"la distancia solo se dice con el ahora");
  // Andando de verdad: el aviso del primero lleva el segundo.
  NativeTurnsTest w=new NativeTurnsTest();for(int m=0;m<=300;m+=10)w.route.add(new double[]{m/111195.,0});
  w.turns.add(new double[]{10,-1,1});w.turns.add(new double[]{12,1,1});
  for(int m=0;m<=95;m+=5)w.posicion(new Location(m));
  boolean junto=false;for(String d:w.dicho)if(d.startsWith("-1")&&d.endsWith(" y enseguida a la derecha"))junto=true;
  require(junto,"al acercarte al primero se dicen los dos: "+w.dicho);
 }
 // «AHORA» ANTES DEL CRUCE: a 36 km/h (velocidadSuave 10), 12 m antes; y
 // andando, 4 m antes. Antes sonaba al llegar a 0 m.
 static void ahoraAntes(){
  for(double v:new double[]{10,1.2}){
   NativeTurnsTest c=new NativeTurnsTest();c.velocidadSuave=v;for(int m=0;m<=300;m+=10)c.route.add(new double[]{m/111195.,0});
   c.turns.add(new double[]{10,-1,1});
   for(int m=0;m<=110;m+=1){c.posActual=m;c.posicion(new Location(m));}
   double ya=c.avisoYa(),antes=100-c.tresEn;
   require(Math.abs(ya-(v>5?12:4))<0.01,"adelanto a "+v+" m/s: "+ya);
   require(antes>=ya-1.01&&antes<=ya+0.01,"el «ahora» suena "+ya+" m antes, no encima: sono a "+antes+" m");
  }
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
  // UNA SUBIDA LARGA Y TENDIDA (17 nov 2026): 4 km al 6%, como de Eibar a
  // Elgeta, nunca llega al 10% en 200 m y no se decia. Ahora si, una vez.
  ArrayList<double[]> tendida=new ArrayList<>();
  for(int m=0;m<=4000;m+=10)tendida.add(new double[]{m/111195.,0,100+m*.06});
  NavigationMetrics mte=new NavigationMetrics();
  mte.configure(tendida,Collections.emptyList());
  ArrayList<String> tend=new ArrayList<>();
  for(int m=0;m<=4000;m+=50){NavigationMetrics.Notice av=mte.nextNotice(m,1);if(av!=null)tend.add(av.text());}
  require(tend.size()==1,"una subida larga y tendida se avisa una vez (salieron "+tend.size()+")");
  require(tend.get(0).startsWith("Empieza una subida de 4,0 kil"),tend.get(0));
  // Y un llano que sube poco (2%) sigue sin ser una subida.
  ArrayList<double[]> llano=new ArrayList<>();
  for(int m=0;m<=4000;m+=10)llano.add(new double[]{m/111195.,0,100+m*.02});
  NavigationMetrics mll=new NavigationMetrics();
  mll.configure(llano,Collections.emptyList());
  int enLlano=0;for(int m=0;m<=4000;m+=50)if(mll.nextNotice(m,1)!=null)enLlano++;
  require(enLlano==0,"un 2% no es una subida");
  // UNA SUBIDA QUE EMPIEZA JUNTO A UN CRUCE. Mientras se canta un giro no se
  // piden avisos, y si los 100 m de antes de la subida caian todos en la
  // ventana del giro, pasado el arranque ya no se ofrecia y no se decia nunca.
  // Ahora vale hasta 60 m despues del arranque; mas alla, no.
  for(int dir:new int[]{1,-1}){
   ArrayList<double[]> vaguada=new ArrayList<>();
   for(int m=0;m<=2000;m+=10)vaguada.add(new double[]{m/111195.,0,100+Math.abs(m-1000)*.18});
   NavigationMetrics mv=new NavigationMetrics();
   mv.configure(vaguada,Collections.emptyList());
   for(int m=200;m>=10;m-=10)
    require(mv.nextNotice(1000-dir*m,dir)==null,"no anticipar una subida en la bajada, sentido "+dir);
   require(mv.nextNotice(1000+dir*30,dir)!=null,"avisar al empezar a subir, sentido "+dir);
   require(mv.nextNotice(1000+dir*40,dir)==null,"un aviso por subida");
  }
  NavigationMetrics mt=new NavigationMetrics();
  mt.configure(puerto,Collections.emptyList());
  require(mt.nextNotice(40,1)!=null,"recien empezada la subida todavia se avisa");
  NavigationMetrics mt2=new NavigationMetrics();
  mt2.configure(puerto,Collections.emptyList());
  require(mt2.nextNotice(80,1)==null,"pasados 60 m del arranque ya no");
  require(mt2.nextNotice(80,1,12)!=null,"recupera la subida tras volver al pie y esperar a la voz");
  require(mt2.nextNotice(90,1,12)==null,"no repite la subida recuperada");
  NavigationMetrics vueltaTarde=new NavigationMetrics();
  vueltaTarde.configure(puerto,Collections.emptyList());
  require(vueltaTarde.nextNotice(150,1,100)==null,"volver lejos del inicio no recupera el aviso");
  require(vueltaTarde.nextNotice(vueltaTarde.total(),1,12)==null,"no recupera el aviso una vez en la cima");
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
 static void curvasCercanas(){
  NativeTurnsTest c=setup();
  c.turns.clear();
  c.turns.add(new double[]{10,-1,0,0,0,1});
  c.turns.add(new double[]{12,1,0,0,0,1});
  for(int m:new int[]{60,72,89})c.checkTurns(new Location(m));
  require(c.dicho.isEmpty(),"Las curvas no avisan de lejos");
  for(int m:new int[]{93,97,101,113,117})c.checkTurns(new Location(m));
  require(c.dicho.equals(Arrays.asList("Curva a la izquierda","Curva a la derecha")),"Dos curvas cercanas: "+c.dicho);
  require(c.beeps==0,"El aviso de curva nuevo tiene una sola locución");
  System.out.println("PASS: curvas separadas 20 m, una locución por curva");
  c=setup();c.turns.clear();c.turns.add(new double[]{10,-1,0,0,0,1});
  for(int m:new int[]{55,70,85,101,103})c.checkTurns(new Location(m,25));
  require(c.dicho.equals(Arrays.asList("Curva a la izquierda")),"Con 25 m de precisión y lectura pasada 1 m avisa una vez: "+c.dicho);

  c=setup();
  c.turns.clear();
  c.turns.add(new double[]{10,-1,0,0,0,1});
  c.checkTurns(new Location(95));
  c.checkTurns(new Location(96));
  c.checkTurns(new Location(98,50));
  require(c.dicho.isEmpty(),"Sin confirmar marcha o con señal imprecisa no se canta");
 }
 static void entradaDeRuta(){
  NativeTurnsTest c=setup();
  require(c.avisoSalida(new Location(-400)).equals("Estás fuera de ruta. A 400 metros hacia el norte está la salida de la ruta"),"distancia y rumbo hacia el inicio");
  require(c.avisoSalida(new Location(400)).equals("Estás fuera de ruta. A 400 metros hacia el sur está la salida de la ruta"),"rumbo al sur");
  for(int k=0;k<12;k++){c.checkDeviation(new Location(-400));SystemClock.reloj+=1000;}
  require(c.dicho.equals(Arrays.asList("Estás fuera de ruta. A 400 metros hacia el norte está la salida de la ruta")),"no interrumpir la salida: "+c.dicho);
  c=setup();
  c.checkDeviation(new Location(50,80,5));
  require(c.dicho.isEmpty(),"Estar fuera al empezar no anuncia entrada");
  c.checkDeviation(new Location(50,0,5));
  c.checkDeviation(new Location(60,0,5));
  require(Collections.frequency(c.dicho,"Ya estás en la ruta")==1,"La entrada se anuncia una sola vez");
  c.entradaAvisada=false;c.routeReached=false;c.dicho.clear();
  c.checkDeviation(new Location(100,0,5));
  require(c.dicho.equals(Arrays.asList("Ya estás en la ruta")),"Al cambiar de ruta vuelve a anunciar");
 }
 public static void main(String[] args){
  entradaDeRuta();saltoNoEsVuelta();desnivelYCircuito();idaYVuelta();girosSeguidos();ahoraAntes();System.out.println("PASS: el «ahora» suena dos segundos antes del cruce");System.out.println("PASS: dos giros a menos de 30 m se dicen juntos");
  System.out.println("PASS: el desnivel con umbral de 5 m y el final de un circuito");
  System.out.println("PASS: un salto de la proyeccion no es dar la vuelta");
  metricsChecks();
  curvasCercanas();
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
  // Con buena precisión, 14 m aún es margen; 19 m confirmado ya avisa.
  c=setup();SystemClock.reloj=1000;c.posicion(new Location(250,0,5));
  for(int k=0;k<8;k++){SystemClock.reloj+=1500;c.posicion(new Location(250,14,5));}
  require(!c.offRoute,"a 14 m del track no salta");
  for(int k=0;k<5;k++){SystemClock.reloj+=1500;c.posicion(new Location(250,30,5));}
  require(c.offRoute,"a 30 m si");
  // UN SEGUNDO AVISO, UNO SOLO: a mas de 50 m y tras 4 segundos.
  int veces=0;for(String t:c.dicho)if(t.startsWith("Sigues fuera"))veces++;
  require(veces==0,"a 30 m no se recuerda");
  for(int k=0;k<50;k++){SystemClock.reloj+=1500;c.posicion(new Location(250,70,5));}
  veces=0;for(String t:c.dicho)if(t.startsWith("Sigues fuera"))veces++;
  require(veces==1,"lejos, un recordatorio y solo uno: "+veces);
  // La captura del autor: empezar ya a 19 m, precision 4 m, sin entrada previa.
  c=setup();SystemClock.reloj=1000;
  for(int k=0;k<5;k++){c.checkDeviation(new Location(250,19,4));SystemClock.reloj+=1000;}
  require(c.offRoute&&c.dicho.stream().anyMatch(t->t.endsWith(" está la salida de la ruta")),"19 m desde el arranque: "+c.dicho);
  c.checkDeviation(new Location(250,5,4));
  require(!c.offRoute&&c.dicho.contains("De nuevo en la ruta"),"regreso tras empezar fuera");
  // Un hueco largo no equivale a cuatro segundos de posiciones fuera.
  c=setup();SystemClock.reloj=1000;c.checkDeviation(new Location(250,19,4));
  SystemClock.reloj+=3000;c.checkDeviation(new Location(250,19,4));
  SystemClock.reloj+=30000;c.checkDeviation(new Location(250,19,4));require(!c.offRoute,"hueco GPS no confirma");
  SystemClock.reloj+=3999;c.checkDeviation(new Location(250,19,4));require(!c.offRoute,"antes de cuatro segundos");
  SystemClock.reloj+=1;c.checkDeviation(new Location(250,19,4));require(c.offRoute,"cuatro segundos validos confirman");
  SystemClock.reloj=1000;

  System.out.println("PASS Java: giro proximo, voz unica, inverso, giro pasado, cruce atras, cruce recien pasado, avisos con mala señal, ruta al reves sin la pagina y vuelta a la ruta");
 }
}'''
if replay:
 code=code.replace('double avisoLargo(){return 80;}double avisoCorto(){return 20;}double avisoVoz(){return 200;}',
     ''.join(method(m) for m in (' void actualizaVelocidad(Location l)', ' double avisoLargo()', ' double avisoCorto()', ' double avisoVoz()')))
 code=code.replace('float acc=4;', 'float acc=4,speed=0; boolean hasSpeed(){return true;} float getSpeed(){return speed;}')
 code=code.replace('String fraseGiro(int lado,int tipo,String fase,double ahead,int salida){return ""+lado;}',
     method(' String fraseGiro(int lado,int tipo,String fase,double ahead,int salida)').replace(
         'int salida){','int salida){metrosAviso=ahead;',1))
 code=code.replace('double posActual=', 'double metrosAviso=Double.NaN; double posActual=')
 code=code.replace('  checkTurns(l,position);', '  if(l.getAccuracy()<=60)checkTurns(l,position);')
 code=code.replace('dicho.add(s);try', 'dicho.add(s); System.out.printf(Locale.ROOT,"%d\\t%s\\t%s%n",SystemClock.reloj-1000,Double.isFinite(metrosAviso)?String.format(Locale.ROOT,"%.1f",metrosAviso):"-",s); metrosAviso=Double.NaN; try')
 code=code.replace('public static void main(String[] args){', r"""public static void main(String[] args) throws Exception {
  NativeTurnsTest c=new NativeTurnsTest();
  c.velocidadSuave=0;
  c.hayReves=true;
  try(Scanner input=new Scanner(new java.io.File(args[0])).useLocale(Locale.ROOT)){
   int points=input.nextInt();
   for(int i=0;i<points;i++)c.route.add(new double[]{input.nextDouble(),input.nextDouble()});
   for(ArrayList<double[]> list:Arrays.asList(c.turns,c.turnsReves)){
    int count=input.nextInt();
    for(int i=0;i<count;i++)list.add(new double[]{input.nextInt(),input.nextInt(),input.nextInt(),input.nextInt(),input.nextInt()});
   }
   while(input.hasNextLong()){
    SystemClock.reloj=1000+input.nextLong();
    Location l=new Location(0);
    l.lat=input.nextDouble();l.lon=input.nextDouble();l.acc=input.nextFloat();l.speed=input.nextFloat();
    c.actualizaVelocidad(l);
    c.posicion(l);
   }
  }
 }
 public static void unitTests(String[] args){""")
if '--generate-junit' in sys.argv:
 dest=Path('android/app/src/test/java/com/trabakutik/gps/NativeTurnsTest.java')
 dest.parent.mkdir(parents=True,exist_ok=True)
 code=code.replace(' public static void main(String[] args){',' @org.junit.Test public void checks(){main(new String[0]);}\n public static void main(String[] args){')
 dest.write_text(code)
 print('Generado test JUnit con checkTurns de producción')
 sys.exit(0)
if replay:
 with tempfile.TemporaryDirectory() as d:
  # El lanzador Java compila las dos clases juntas desde un solo archivo.
  p=Path(d)/'NativeTurnsTest.java'
  p.write_text(code+'\n'+re.sub(r'^(package|import) .*;\n', '', metrics, flags=re.M))
  subprocess.run(['java',str(p),str(Path(sys.argv[sys.argv.index('--replay')+1]).resolve())],check=True)
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
