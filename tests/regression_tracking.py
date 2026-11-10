"""Regression tests executing production Java methods with Android test doubles."""
from pathlib import Path
import subprocess, tempfile, re
src=Path('android/app/src/main/java/com/trabakutik/gps/TrackingService.java').read_text()
def method(signature):
 a=src.index(signature);start=src.index('{',a);depth=1;i=start+1
 while depth:
  depth+=(src[i]=='{')-(src[i]=='}');i+=1
 return src[a:i]
br=method(' void beginRecording()').replace('try(FileOutputStream reset=new FileOutputStream(new File(getFilesDir(),"trazado-vivo.tsv"),false)){}','').replace('recording=true;getSharedPreferences("tracking_live",MODE_PRIVATE).edit().putBoolean("recording",true).apply();updateNotice();','recording=true;')
constant=re.search(r' static final long MAX_EDAD_FIX_NS=[^;]+;',src).group(0)
code='''import java.util.*;import java.io.*;import java.text.SimpleDateFormat;
public class TrackingRegression {
 static long nowNs=100_000_000_000L;
 static class SystemClock{static long elapsedRealtime(){return nowNs/1000000;}static long elapsedRealtimeNanos(){return nowNs;}}
 static class Location{double lat,lon;float acc=5;long ern=nowNs;Location(double m){lat=m/111195.;}
 double getLatitude(){return lat;}double getLongitude(){return lon;}boolean hasAccuracy(){return true;}float getAccuracy(){return acc;}long getElapsedRealtimeNanos(){return ern;}}
 File dirBase;File getFilesDir(){return dirBase;}
 File file;String errorGrabacion="";long lastRecordedTime;double lastRecordedLat,lastRecordedLon;int points;boolean recording;
 boolean navigating=true,offRoute=false;ArrayList<double[]> route=new ArrayList<>(),turns=new ArrayList<>();
 HashSet<String> warnedTurns=new HashSet<>();String upcomingTurn="";int sentido=1;double velocidadSuave=1.2;int beeps=0;
 double avisoLargo(){return 50;}double avisoCorto(){return 10;}double avisoVoz(){return 35;}
 void updateNotice(){}void pitidos(int n,int ms){beeps++;}void habla(String s){}
 String fraseGiro(int lado,boolean c,String f,double a){return "";}
 static void require(boolean condition,String message){if(!condition)throw new AssertionError(message);}
'''+br+method(' static double coste(double ahead)')+method(' void checkTurns(Location l)')+constant+method(' boolean esAntigua(Location l)')+'''
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
 TrackingRegression q=new TrackingRegression();for(int m=0;m<=300;m+=10)q.route.add(new double[]{m/111195.,0});q.turns.add(new double[]{10,-1,1});
 q.offRoute=true;q.checkTurns(new Location(60));require(q.beeps==0,"Turn sounded off-route");
 q.offRoute=false;q.checkTurns(new Location(60));require(q.beeps>0,"Turn did not resume on return");
 System.out.println("PASS: turns silent off-route and resume on return");
 }
}'''
with tempfile.TemporaryDirectory() as d:
 p=Path(d)/'TrackingRegression.java';p.write_text(code)
 subprocess.run(['javac',str(p)],check=True)
 subprocess.run(['java','-cp',d,'TrackingRegression',d],check=True)
