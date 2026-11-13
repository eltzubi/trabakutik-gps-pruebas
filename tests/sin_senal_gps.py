"""Ejecuta avisaSinGps de produccion con un reloj de mentira, sin Android.

El autor corto los satelites a proposito y la aplicacion no dijo nada: solo
cambiaba el texto de la notificacion. Lo que se comprueba aqui es que ahora lo
dice EN ALTO, que no lo dice dos veces, que avisa de la vuelta de la señal y
-lo mas delicado- que NO grita «sin señal» al encender, cuando todavia no ha
llegado la primera posicion.
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


code = '''import java.util.*;
public class SinSenalGpsTest {
 static long ahora=600000;
 static class SystemClock {static long elapsedRealtime(){return ahora;}}
 boolean ubicacion=true;long ultimoFixGpsElapsed=0;boolean sinGpsAvisado=false;
 ArrayList<String> dicho=new ArrayList<>();int tonos=0;
 void habla(String s){dicho.add(s);}
 static class ToneGenerator{static final int TONE_PROP_ACK=2;}
 void pitidos(int n,int sep){tonos+=n;}
 void pitidos(int n,int sep,int tono){tonos+=n;}
 boolean ubicacionActivada(){return ubicacion;}
''' + metodo(' boolean gpsReciente()') + metodo(' void tonoBien()')+metodo(' void avisaSinGps()') + '''
 static void require(boolean b,String s){if(!b)throw new AssertionError(s);}
 public static void main(String[] args){
  // 1. Al encender no hay posicion todavia. Eso NO es perder la señal.
  SinSenalGpsTest c=new SinSenalGpsTest();
  c.avisaSinGps();c.avisaSinGps();
  require(c.dicho.isEmpty(),"Al arrancar no se puede decir que no hay señal: "+c.dicho);

  // 2. Con posicion fresca, callado.
  c=new SinSenalGpsTest();c.ultimoFixGpsElapsed=ahora-2000;
  c.avisaSinGps();
  require(c.dicho.isEmpty(),"Con posicion reciente no se avisa: "+c.dicho);

  // 3. Se cortan los satelites: se dice en alto, con pitidos.
  c.ultimoFixGpsElapsed=ahora-30000;
  c.avisaSinGps();
  require(c.dicho.equals(Arrays.asList("Atención, sin señal GPS")),"Tiene que avisar: "+c.dicho);
  require(c.tonos>0,"Y sonar, para el modo de solo pitidos");
  int antes=c.tonos;

  // 4. Mientras siga sin señal, no se repite cada cinco segundos.
  c.avisaSinGps();c.avisaSinGps();
  require(c.dicho.size()==1,"No puede repetirse: "+c.dicho);

  // 5. Vuelve la señal y se dice.
  c.ultimoFixGpsElapsed=ahora;
  c.avisaSinGps();
  require(c.dicho.size()==2&&c.dicho.get(1).equals("Señal GPS recuperada"),c.dicho.toString());
  // Y LA VUELTA SUENA. Iba muda, y en el coche una frase sola se pierde.
  require(c.tonos>antes,"la señal recuperada tambien tiene que sonar: "+c.tonos);
  c.avisaSinGps();
  require(c.dicho.size()==2,"La vuelta tampoco se repite: "+c.dicho);

  // 6. La ubicacion apagada SI se dice desde el primer momento, aunque no
  //    haya habido ninguna posicion: eso no se arregla esperando.
  c=new SinSenalGpsTest();c.ubicacion=false;
  c.avisaSinGps();
  require(c.dicho.equals(Arrays.asList("Atención, la ubicación del teléfono está apagada")),c.dicho.toString());

  System.out.println("OK: sin señal se avisa en alto, una sola vez, y la vuelta tambien; al arrancar se calla");
 }
}'''

with tempfile.TemporaryDirectory() as d:
    p = Path(d) / 'SinSenalGpsTest.java'
    p.write_text(code)
    subprocess.run(['javac', str(p)], check=True)
    subprocess.run(['java', '-cp', d, 'SinSenalGpsTest'], check=True)
