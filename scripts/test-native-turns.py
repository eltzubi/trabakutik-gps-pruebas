"""Ejecuta checkTurns de producción con posiciones simuladas, sin Android."""
from pathlib import Path
import subprocess,tempfile
src=Path('android/app/src/main/java/com/trabakutik/gps/TrackingService.java').read_text()
def method(signature):
 a=src.index(signature);start=src.index('{',a);depth=1;i=start+1
 while depth:
  depth += (src[i]=='{')-(src[i]=='}');i+=1
 return src[a:i]
code='''import java.util.*;
public class NativeTurnsTest {
 boolean navigating=true;ArrayList<double[]> route=new ArrayList<>(),turns=new ArrayList<>();
 HashSet<String> warnedTurns=new HashSet<>();String upcomingTurn="";int sentido=1;
 ArrayList<Integer> spoken=new ArrayList<>();int beeps=0;
 static class Location {double lat,lon; Location(double m){lat=m/111195.;lon=0;}double getLatitude(){return lat;}double getLongitude(){return lon;}boolean hasAccuracy(){return true;}float getAccuracy(){return 4;}}
 double avisoLargo(){return 80;}double avisoCorto(){return 20;}double avisoVoz(){return 200;}
 void updateNotice(){}void pitidos(int n,int ms){beeps++;}void habla(String s){spoken.add(Integer.parseInt(s));}
 String fraseGiro(int lado,boolean cruce,String fase,double ahead){return ""+lado;}
'''+method(' void checkTurns(Location l)')+'''
 static NativeTurnsTest setup(){NativeTurnsTest c=new NativeTurnsTest();for(int m=0;m<=300;m+=10)c.route.add(new double[]{m/111195.,0});c.turns.add(new double[]{10,-1,1});c.turns.add(new double[]{18,1,1});return c;}
 static void require(boolean b,String s){if(!b)throw new AssertionError(s);}
 public static void main(String[] args){
  NativeTurnsTest c=setup();c.checkTurns(new Location(0));require(c.spoken.equals(Arrays.asList(-1)),"Debe anunciar solo la izquierda próxima, no la derecha posterior: "+c.spoken);require(c.upcomingTurn.startsWith("Izquierda"),c.upcomingTurn);
  c.checkTurns(new Location(0));require(c.spoken.size()==1,"No repetir la misma fase");
  c=setup();c.sentido=-1;c.checkTurns(new Location(280));require(c.spoken.equals(Arrays.asList(-1)),"En inverso, la derecha próxima se convierte en izquierda: "+c.spoken);
  c=setup();c.checkTurns(new Location(145));require(c.upcomingTurn.startsWith("Derecha"),"Un giro ya pasado no debe tapar el siguiente");
  System.out.println("PASS Java: giro próximo, voz única, inverso y giro pasado");
 }
}'''
with tempfile.TemporaryDirectory() as d:
 p=Path(d)/'NativeTurnsTest.java';p.write_text(code)
 subprocess.run(['javac',str(p)],check=True)
 subprocess.run(['java','-cp',d,'NativeTurnsTest'],check=True)
