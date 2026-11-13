"""Ejecuta callaYa y pitidos de produccion con dobles, sin Android.

«Silencio» miraba el modo solo al EMPEZAR a hablar o a pitar: la frase que
ya sonaba terminaba de decirse y los pitidos de esa tanda seguian saliendo
uno detras de otro. Aqui se comprueba que ahora se corta en el acto, y
-igual de importante- que al cortar no se queda cogido el generador de
tonos, que es un recurso del sistema.
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
public class SilencioTest {
 static class ToneGenerator {
  static final int TONE_PROP_BEEP=1,TONE_PROP_ACK=2; static int vivos=0,soltados=0;
  ToneGenerator(int a,int b){vivos++;}
  void startTone(int t,int ms){} void release(){vivos--;soltados++;}
 }
 static class AudioManager{static final int STREAM_MUSIC=3;}
 static class Voz{int parado=0;void stop(){parado++;}}
 static class Handler{
  ArrayList<Runnable> cola=new ArrayList<>(); int limpiezas=0;
  void postDelayed(Runnable r,long d){cola.add(r);}
  void corre(){for(Runnable r:new ArrayList<>(cola))r.run();cola.clear();}
  void removeCallbacksAndMessages(Object o){cola.clear();limpiezas++;}
 }
 Voz voz=new Voz(); final Handler pitidoHandler=new Handler(); ToneGenerator tonoEnCurso=null;
 String modo="voz"; String modoAudio(){return modo;}
''' + metodo(' void callaYa()') + metodo(' void sueltaTono()') + metodo(' void pitidos(int n,int sep)')+metodo(' void pitidos(int n,int sep,int tono)')+metodo(' void tonoBien()') + '''
 static void require(boolean b,String s){if(!b)throw new AssertionError(s);}
 public static void main(String[] args){
  SilencioTest c=new SilencioTest();

  // 1. Una tanda de tres pitidos: tres avisos programados mas el que suelta
  //    el tono al final, y un generador de tonos cogido.
  c.pitidos(3,300);
  require(c.pitidoHandler.cola.size()==4,"tres pitidos y la suelta: "+c.pitidoHandler.cola.size());
  require(ToneGenerator.vivos==1,"hay un generador cogido");

  // 2. Silencio: se corta la voz, se tira la cola y se suelta el tono.
  c.callaYa();
  require(c.voz.parado==1,"la frase en curso se corta");
  require(c.pitidoHandler.cola.isEmpty(),"los pitidos pendientes no suenan");
  require(ToneGenerator.vivos==0,"y el generador NO se queda cogido");

  // 3. Llamarlo dos veces no suelta dos veces el mismo tono.
  int antes=ToneGenerator.soltados;
  c.callaYa();
  require(ToneGenerator.soltados==antes,"no se suelta dos veces");

  // 4. En silencio ya no se programa ningun pitido nuevo.
  c.modo="silencio";
  c.pitidos(2,300);
  require(c.pitidoHandler.cola.isEmpty(),"en silencio no se pita");
  require(ToneGenerator.vivos==0,"ni se coge el generador");

  // 5. Una tanda nueva suelta la anterior: dos avisos seguidos no dejan
  //    generadores sueltos por ahi.
  c.modo="voz";
  c.pitidos(1,300); c.pitidos(1,300); c.pitidos(1,300);
  require(ToneGenerator.vivos==1,"solo uno vivo, no tres: "+ToneGenerator.vivos);

  System.out.println("OK: silencio corta la voz y los pitidos pendientes, y no deja el tono cogido");
 }
}'''

with tempfile.TemporaryDirectory() as d:
    p = Path(d) / 'SilencioTest.java'
    p.write_text(code)
    subprocess.run(['javac', str(p)], check=True)
    subprocess.run(['java', '-cp', d, 'SilencioTest'], check=True)
