"""Ejecuta loadTurns y girosQueCaben de produccion, sin Android.

Dos fallos que salieron al repasar el navegador con un segundo modelo (13 de
noviembre de 2026):

1. Con mas de 400 giros el puente hacia «return» sin escribir nada y el
   servicio se quedaba con la lista de la RUTA ANTERIOR: la pagina manda los
   puntos nuevos y despues sus giros, que se rechazaban. Con la pantalla
   apagada avisaba cruces de otro sitio. Ahora caben 2000 y, si aun asi se
   pasa, se escribe una lista vacia.
2. Un giro en el punto 0 no se pasaba nunca en checkTurns -recorre desde
   i=1 y solo avanza por la lista cuando el giro cae en ese punto- y dejaba
   mudos TODOS los de detras. Ahora loadTurns lo ignora.
"""
from pathlib import Path
import subprocess, tempfile

src = Path('android/app/src/main/java/com/trabakutik/gps/TrackingService.java').read_text()


def metodo(firma):
    a = src.index(firma)
    inicio = src.index('{', a)
    hondo = 1
    i = inicio + 1
    while hondo:
        hondo += (src[i] == '{') - (src[i] == '}')
        i += 1
    return src[a:i]


def linea(texto):
    a = src.index(texto)
    return src[a:src.index('\n', a)]


code = r'''import java.io.*;import java.util.*;import java.util.regex.*;
public class GirosLimiteTest {
 // org.json de mentira: solo lo que lee loadTurns, y solo el formato de giros.
 static class JSONObject{String optString(String k,String d){return d;}final Map<String,Integer> m=new HashMap<>();
  JSONObject(String s){Matcher k=Pattern.compile("\"(\\w+)\":(-?\\d+)").matcher(s);while(k.find())m.put(k.group(1),Integer.parseInt(k.group(2)));}
  int optInt(String k,int d){return m.getOrDefault(k,d);}}
 static class JSONArray{final List<JSONObject> l=new ArrayList<>();
  JSONArray(String s){Matcher k=Pattern.compile("\\{[^}]*\\}").matcher(s);while(k.find())l.add(new JSONObject(k.group()));}
  int length(){return l.size();} JSONObject optJSONObject(int i){return l.get(i);}}
 static class Log{static void w(String a,String b,Throwable t){}}
 static class android{static class util{static class Log{static void w(String a,String b,Throwable t){}}}}
 File dir;File getFilesDir(){return dir;}
 final ArrayList<double[]> route=new ArrayList<>(),turns=new ArrayList<>(),turnsReves=new ArrayList<>();boolean hayReves=false;
 final HashSet<String> warnedTurns=new HashSet<>();String upcomingTurn="";
 static class ConfirmaRamal {void reinicia(){} static class Cruce{}}
 ConfirmaRamal confirmaRamal=new ConfirmaRamal();
 Map<Integer,ConfirmaRamal.Cruce> ramalesIda=new HashMap<>(),ramalesVuelta=new HashMap<>();
 void cargaRamales(JSONObject p,int at,ArrayList<double[]> lista){}
 Map<double[],String> hitosDeGiro=new HashMap<>();
''' + linea(' static final int GIROS_MAX=') + '\n' + metodo(' static String girosQueCaben(') + metodo(' void loadTurns()') + metodo(' void leeGiros(') + linea(' static final String[] ORDINALES=') + '\n' + metodo(' String fraseGiro(int lado,int tipo,String fase,double ahead,int salida)') + metodo(' String fraseGiro(int lado,int tipo,String fase,double ahead){') + r'''
 static void require(boolean b,String s){if(!b)throw new AssertionError(s);}
 static String lista(int n,int desde){StringBuilder b=new StringBuilder("[");
  for(int i=0;i<n;i++){if(i>0)b.append(',');b.append("{\"i\":"+(desde+i)+",\"dir\":"+(i%2==0?1:-1)+",\"t\":1}");}
  return b.append(']').toString();}
 GirosLimiteTest(int puntos)throws IOException{dir=java.nio.file.Files.createTempDirectory("giros").toFile();for(int i=0;i<puntos;i++)route.add(new double[]{0,0,0});}
 void escribe(String s)throws IOException{try(FileWriter w=new FileWriter(new File(dir,"giros-activos.json"))){w.write(s);}}
 public static void main(String[] a)throws Exception{
  // 1. Lo que antes se tiraba entero (y dejaba los giros viejos) ahora cabe.
  String mil=lista(1000,1);
  require(girosQueCaben(mil,1000).equals(mil),"1000 giros tienen que caber");
  GirosLimiteTest t=new GirosLimiteTest(5000);t.escribe(girosQueCaben(mil,1000));t.loadTurns();
  require(t.turns.size()==1000,"el servicio carga los 1000: "+t.turns.size());
  // 2. Por encima del tope: lista VACIA, nunca «nada» (que dejaba la anterior).
  require(girosQueCaben(lista(2001,1),2001).equals("[]"),"2001 giros: lista vacia");
  StringBuilder enorme=new StringBuilder("[");while(enorme.length()<=GIROS_MAX_BYTES)enorme.append("{\"i\":1,\"dir\":1,\"t\":1},");
  require(girosQueCaben(enorme.toString(),10).equals("[]"),"por bytes tambien");
  t.escribe(girosQueCaben(lista(2001,1),2001));t.loadTurns();
  require(t.turns.isEmpty(),"y el servicio se queda sin giros, no con los de otra ruta: "+t.turns.size());
  // 3. Un giro en el punto 0 se ignora y no tapa a los de detras.
  t=new GirosLimiteTest(100);t.escribe("[{\"i\":0,\"dir\":1,\"t\":1},{\"i\":10,\"dir\":-1,\"t\":1},{\"i\":20,\"dir\":1,\"t\":0}]");t.loadTurns();
  require(t.turns.size()==2&&(int)t.turns.get(0)[0]==10,"el giro del punto 0 fuera, los otros dentro: "+t.turns.size());
  // 4. Una curva de herradura llega con su lado y se dice con el: nunca «da
  //    la vuelta», que en plena revuelta suena a volver atras.
  t=new GirosLimiteTest(100);t.escribe("[{\"i\":10,\"dir\":1,\"t\":1,\"h\":1},{\"i\":20,\"dir\":-1,\"t\":0,\"h\":1},{\"i\":30,\"dir\":1,\"t\":1}]");t.loadTurns();
  require((int)t.turns.get(0)[2]==4&&(int)t.turns.get(1)[2]==3&&(int)t.turns.get(2)[2]==1,"herradura en cruce=4, suelta=3, cruce normal=1");
  String enCruce=t.fraseGiro(1,4,"1",48),suelta=t.fraseGiro(-1,3,"3",0),normal=t.fraseGiro(1,1,"1",50);
  require(enCruce.equals("En 50 metros, curva de herradura a la derecha"),enCruce);
  require(suelta.equals("Curva de herradura a la izquierda ahora"),suelta);
  require(normal.equals("En 50 metros, gira a la derecha en el cruce"),normal);
  require(!enCruce.contains("da la vuelta")&&!suelta.contains("da la vuelta"),"nunca «da la vuelta»");
  // 5. Sin lado solo llega una ida y vuelta por el mismo camino: ahi si.
  String retorno=t.fraseGiro(0,0,"1",50);
  require(retorno.equals("En 50 metros, da la vuelta"),retorno);
  // 6. Rotonda: «sal a la derecha», y dar la vuelta en ella.
  t=new GirosLimiteTest(100);t.escribe("[{\"i\":10,\"dir\":1,\"t\":1,\"ro\":1},{\"i\":20,\"dir\":0,\"t\":1,\"ro\":1}]");t.loadTurns();
  require((int)t.turns.get(0)[2]==5&&(int)t.turns.get(1)[2]==5,"rotonda=5");
  String rot=t.fraseGiro(1,5,"1",48),rotYa=t.fraseGiro(-1,5,"3",0),rotVuelta=t.fraseGiro(0,5,"1",50);
  require(rot.equals("En 50 metros, en la rotonda, sal a la derecha"),rot);
  require(rotYa.equals("En la rotonda, sal a la izquierda ahora"),rotYa);
  require(rotVuelta.equals("En 50 metros, en la rotonda, da la vuelta"),rotVuelta);
  // 6b. Con el NUMERO de la salida («rs»): «toma la segunda salida», tambien
  //     yendo recto (lado 0), que antes diria «da la vuelta».
  t=new GirosLimiteTest(100);t.escribe("[{\"i\":10,\"dir\":-1,\"t\":1,\"ro\":1,\"rs\":2},{\"i\":20,\"dir\":1,\"t\":1,\"rs\":3}]");t.loadTurns();
  require(t.turns.get(0).length==5&&(int)t.turns.get(0)[3]==2&&(int)t.turns.get(0)[4]==0,"rs leido, sin rr");
  require((int)t.turns.get(1)[3]==0,"rs sin rotonda no vale");
  t=new GirosLimiteTest(100);t.escribe("[{\"i\":10,\"dir\":-1,\"t\":1,\"ro\":1,\"rs\":2,\"rr\":1}]");t.loadTurns();
  require((int)t.turns.get(0)[4]==1,"rr leido: rotonda recta");
  String sal=t.fraseGiro(-1,5,"1",48,2),salYa=t.fraseGiro(0,5,"3",0,2),salMal=t.fraseGiro(1,5,"1",48,9);
  require(sal.equals("En 50 metros, en la rotonda, toma la segunda salida"),sal);
  require(salYa.equals("En la rotonda, toma la segunda salida ahora"),salYa);
  require(salMal.equals("En 50 metros, en la rotonda, sal a la derecha"),salMal);
  // 7. «Sigue RECTO por la derecha»: con «sigue por la derecha» se entendia
  //    «gira» si justo despues salia una carretera a ese lado.
  String sigue=t.fraseGiro(1,2,"1",48),sigueYa=t.fraseGiro(-1,2,"3",0);
  require(sigue.equals("En 50 metros, sigue recto por la derecha"),sigue);
  require(sigueYa.equals("Sigue recto por la izquierda ahora"),sigueYa);
  t=new GirosLimiteTest(100);t.escribe("[{\"i\":10,\"dir\":0,\"t\":1,\"df\":1}]");t.loadTurns();
  require((int)t.turns.get(0)[2]==7,"df: cruce de frente");
  require(t.fraseGiro(0,7,"3",0,0).equals("Sigue de frente"),"aviso de frente al entrar");
  require(t.fraseGiro(0,7,"1",50,0).equals("En 50 metros, sigue de frente"),"aviso de frente al acercarse");
  // 8. «Sigue la carretera a la izquierda» (sg, 17 nov 2026): sigues la misma
  //    via, que tuerce en un cruce. Tipo 6 y la via en la cuarta casilla. En
  //    una herradura o una rotonda no cuenta.
  t=new GirosLimiteTest(100);t.escribe("[{\"i\":10,\"dir\":-1,\"t\":1,\"sg\":1},{\"i\":20,\"dir\":1,\"t\":1,\"sg\":3},{\"i\":30,\"dir\":1,\"t\":1,\"sg\":2,\"ro\":1},{\"i\":40,\"dir\":1,\"t\":1,\"sg\":9}]");t.loadTurns();
  require((int)t.turns.get(0)[2]==6&&(int)t.turns.get(0)[3]==1,"sg=1: tipo 6, carretera");
  require((int)t.turns.get(1)[2]==6&&(int)t.turns.get(1)[3]==3,"sg=3: tipo 6, camino");
  require((int)t.turns.get(2)[2]==5,"una rotonda sigue siendo rotonda");
  require((int)t.turns.get(3)[2]==1,"un sg raro no cambia nada");
  String via=t.fraseGiro(-1,6,"1",48,1),camino=t.fraseGiro(1,6,"3",0,3),calle=t.fraseGiro(1,6,"1",50,2);
  require(via.equals("En 50 metros, sigue por este camino, que curva a la izquierda"),via);
  require(camino.equals("Sigue por este camino, que curva a la derecha"),camino);
  require(calle.equals("En 50 metros, sigue por este camino, que curva a la derecha"),calle);
  // 9. «Sigue por la izquierda», sin «recto», cuando la tuya no es la mas
  //    recta (nr, 18 nov 2026). Sin nr, como siempre.
  t=new GirosLimiteTest(100);t.escribe("[{\"i\":10,\"dir\":-1,\"t\":2,\"nr\":1},{\"i\":20,\"dir\":1,\"t\":2},{\"i\":30,\"dir\":1,\"t\":1,\"nr\":1}]");t.loadTurns();
  require((int)t.turns.get(0)[2]==2&&(int)t.turns.get(0)[3]==1,"nr en una horquilla: casilla 1");
  require((int)t.turns.get(1)[3]==0,"sin nr: casilla 0");
  require((int)t.turns.get(2)[2]==1&&(int)t.turns.get(2)[3]==0,"nr fuera de una horquilla no cuenta");
  String sinRecto=t.fraseGiro(-1,2,"1",48,1),conRecto=t.fraseGiro(1,2,"1",48,0);
  require(sinRecto.equals("En 50 metros, sigue por la izquierda"),sinRecto);
  require(conRecto.equals("En 50 metros, sigue recto por la derecha"),conRecto);
  System.out.println("OK: caben 2000 giros, por encima se vacia la lista, un giro en el punto 0 no tapa a los demas y la herradura dice su lado");
 }
}'''

with tempfile.TemporaryDirectory() as d:
    Path(d, 'GirosLimiteTest.java').write_text(code)
    subprocess.run(['javac', '-d', d, str(Path(d, 'GirosLimiteTest.java'))], check=True)
    subprocess.run(['java', '-cp', d, 'GirosLimiteTest'], check=True)
