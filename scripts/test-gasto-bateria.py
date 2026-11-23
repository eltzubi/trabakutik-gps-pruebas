"""Ejecuta textoGasto() de produccion, sin Android.

Lo que el autor pidio medir: cuanto gasta la aplicacion en una salida. El
resumen que ve al parar sale de este metodo, asi que se comprueba con
numeros a mano, no a ojo.
"""
from pathlib import Path
import subprocess,tempfile,sys,re
produccion=Path('android/app/src/main/java/com/trabakutik/gps')
src=(produccion/'TrackingService.java').read_text()
def metodo(firma):
 a=src.index(firma);inicio=src.index('{',a);profundidad=1;i=inicio+1
 while profundidad:
  profundidad+=(src[i]=='{')-(src[i]=='}');i+=1
 return src[a:i]
def constante(nombre):
 for linea in src.splitlines():
  if nombre in linea and linea.strip().startswith('static final'):return linea.strip()
 raise AssertionError('no esta la constante '+nombre)
codigo='''import java.util.*;
public class GastoTest {
'''+constante('GASTO_SIN_LEER')+'\n'+constante('FUERA_M')+'\n'+metodo(' static String textoGasto(')+'\n'+metodo(' static String unDecimal(') \
+re.search(r' int\[\] desvioAvisos=[^\n]+',src).group(0)+re.search(r' long desvioLecturas=[^\n]+',src).group(0) \
+metodo(' static double umbralDesvio(')+metodo(' void olvidaDesvio()')+metodo(' void mideDesvio(')+metodo(' static String textoDesvio(')+'''
 static void igualD(double esperado,double real){
  if(Math.abs(esperado-real)>1e-9)throw new AssertionError("esperaba "+esperado+" y salio "+real);
 }
 static String av(int[] a){return a[0]+"/"+a[1]+"/"+a[2];}
 static void igual(String esperado,String real){
  if(!esperado.equals(real))throw new AssertionError("esperaba <"+esperado+"> y salio <"+real+">");
 }
 static void contiene(String trozo,String real){
  if(!real.contains(trozo))throw new AssertionError("falta <"+trozo+"> en <"+real+">");
 }
 static void noContiene(String trozo,String real){
  if(real.contains(trozo))throw new AssertionError("sobra <"+trozo+"> en <"+real+">");
 }
 static long min(double m){return Math.round(m*60000);}
 public static void main(String[] a){
  // La salida larga: 6 h 12 min gastando 34 puntos de bateria.
  igual("6 h 12 min · 34 % de batería · 5,5 % por hora",textoGasto(min(372),34,0,0,false));
  // Con kilometros y posiciones, el resumen entero.
  igual("6 h 12 min · 42,3 km · 34 % de batería · 5,5 % por hora · 58 posiciones/min",
        textoGasto(min(372),34,42300,21576,false));
  // Menos de un kilometro se dice en metros redondos.
  contiene("150 m",textoGasto(min(30),2,148,0,false));
  noContiene("km",textoGasto(min(30),2,148,0,false));
  // Menos de una hora no lleva horas.
  igual("59 min · 3 % de batería · 3,1 % por hora",textoGasto(min(59),3,0,0,false));
  igual("1 h 0 min · 6 % de batería · 6,0 % por hora",textoGasto(min(60),6,0,0,false));
  // POCO RATO NO ES UN GASTO POR HORA. A diez minutos, un solo punto de
  // bateria daria 6 %/h, que no mide nada.
  contiene("1 % de batería",textoGasto(min(10),1,0,0,false));
  noContiene("por hora",textoGasto(min(10),1,0,0,false));
  contiene("por hora",textoGasto(min(15),1,0,0,false));
  // Cargando, el numero no vale y se dice.
  igual("2 h 0 min · ibas cargando, el gasto no vale",textoGasto(min(120),4,0,0,true));
  // Y si el nivel SUBIO, tampoco vale aunque no se notara el cargador.
  contiene("ibas cargando",textoGasto(min(120),-3,0,0,false));
  noContiene("-3",textoGasto(min(120),-3,0,0,false));
  // Sin lectura de bateria se dice, no se inventa un 0 %.
  igual("2 h 0 min · no se pudo leer la batería",textoGasto(min(120),GASTO_SIN_LEER,0,0,false));
  noContiene("999",textoGasto(min(120),GASTO_SIN_LEER,0,0,false));
  // Gasto cero es un resultado, no un fallo.
  igual("1 h 0 min · 0 % de batería · 0,0 % por hora",textoGasto(min(60),0,0,0,false));
  // Una salida de cero minutos no divide por cero ni saca un gasto por hora.
  igual("0 min · 5 % de batería",textoGasto(0,5,0,10,false));
  igual("0 min · no se pudo leer la batería",textoGasto(0,GASTO_SIN_LEER,0,0,false));
  // LA MEDIDA DEL DESVIO. No decide nada: apunta que habria hecho cada
  // regla, para elegir el umbral con los metros del autor y no con un modelo.
  igualD(15,umbralDesvio(0,5));igualD(15,umbralDesvio(1,5));igualD(15,umbralDesvio(2,5));
  igualD(32,umbralDesvio(0,25));igualD(50,umbralDesvio(1,25));igualD(75,umbralDesvio(2,25));
  igualD(47,umbralDesvio(0,40));igualD(120,umbralDesvio(2,40));
  // Una salida de un minuto, o sin ruta, no dice nada.
  igual("",textoDesvio(59,590,20,5,new int[]{0,0,0}));
  igual(" · precisión media 18 m (máx 45) · lo más lejos de la ruta 23 m · desvíos 2/0/0 (ahora, ×2, ×3)",
        textoDesvio(3600,18*3600.0,45,23,new int[]{2,0,0}));
  // 35 m de distancia con 25 de precisión: pasa el umbral de ahora (32 m) y
  // no los de ×2 y ×3 (50 y 75). Diez segundos seguidos: un aviso, no diez.
  GastoTest c=new GastoTest();long t=0;
  for(int i=0;i<10;i++){t+=1000;c.mideDesvio(35,25,t);}
  igual("1/0/0",av(c.desvioAvisos));
  for(int i=0;i<20;i++){t+=1000;c.mideDesvio(35,25,t);}
  igual("1/0/0",av(c.desvioAvisos));
  // Vuelve a la ruta y se va otra vez: ahora sí, dos.
  for(int i=0;i<6;i++){t+=1000;c.mideDesvio(5,25,t);}
  for(int i=0;i<10;i++){t+=1000;c.mideDesvio(35,25,t);}
  igual("2/0/0",av(c.desvioAvisos));
  // Con 60 m de distancia también avisan ×2 (50) pero no ×3 (75).
  GastoTest b=new GastoTest();long u=0;
  for(int i=0;i<10;i++){u+=1000;b.mideDesvio(60,25,u);}
  igual("1/1/0",av(b.desvioAvisos));
  // Un hueco de señal no son cuatro segundos fuera.
  GastoTest h=new GastoTest();long v=0;
  v+=1000;h.mideDesvio(35,25,v);v+=11000;h.mideDesvio(35,25,v);v+=1000;h.mideDesvio(35,25,v);
  igual("0/0/0",av(h.desvioAvisos));
  // Y la media, el máximo y lo más lejos salen de lo apuntado.
  GastoTest m=new GastoTest();long w=0;
  for(int i=0;i<60;i++){w+=1000;m.mideDesvio(i,10+i%3,w);}
  contiene("precisión media 11 m (máx 12)",textoDesvio(m.desvioLecturas,m.desvioAccSuma,m.desvioAccMax,m.desvioDmax,m.desvioAvisos));
  contiene("lo más lejos de la ruta 59 m",textoDesvio(m.desvioLecturas,m.desvioAccSuma,m.desvioAccMax,m.desvioDmax,m.desvioAvisos));
  m.olvidaDesvio();
  igual("",textoDesvio(m.desvioLecturas,m.desvioAccSuma,m.desvioAccMax,m.desvioDmax,m.desvioAvisos));
  System.out.println("15 comprobaciones del gasto de bateria y 18 de la medida del desvio, todas bien");
 }
}
'''
with tempfile.TemporaryDirectory() as d:
 p=Path(d)/'GastoTest.java';p.write_text(codigo)
 subprocess.run(['javac','-d',d,str(p)],check=True)
 r=subprocess.run(['java','-cp',d,'GastoTest'],capture_output=True,text=True,timeout=120)
 print(r.stdout.strip() or r.stderr.strip())
 sys.exit(r.returncode)
