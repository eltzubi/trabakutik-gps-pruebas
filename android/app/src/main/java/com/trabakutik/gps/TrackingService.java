package com.trabakutik.gps;
import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.location.*;
import android.os.*;
import java.io.*;
import java.text.SimpleDateFormat;
import java.util.*;
import org.json.*;
import android.media.*;
public class TrackingService extends Service implements LocationListener {
 LocationManager manager;PowerManager.WakeLock gpsWakeLock;File file;boolean recording=false,navigating=false,active=false,routeReached=false,offRoute=false,hasFix=false;int points=0;long lastRecordedTime=0;double lastRecordedLat=Double.NaN,lastRecordedLon=Double.NaN;long farSince=0,lastNotice=0;final ArrayList<double[]> route=new ArrayList<>();final ArrayList<double[]> turns=new ArrayList<>();final HashSet<Integer> warnedTurns=new HashSet<>();String upcomingTurn="";
 final String channel="trabakutik-grabacion";
 @Override public void onCreate(){super.onCreate();manager=(LocationManager)getSystemService(LOCATION_SERVICE);((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(new NotificationChannel(channel,"Grabación de rutas",NotificationManager.IMPORTANCE_LOW));}
 @Override public IBinder onBind(Intent i){return null;}
 Notification notification(){
 Intent openIntent=new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP);
 PendingIntent open=PendingIntent.getActivity(this,2,openIntent,PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
 Intent intent=new Intent(this,TrackingService.class).setAction("STOP");PendingIntent stop=PendingIntent.getService(this,1,intent,PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
 return new Notification.Builder(this,channel).setSmallIcon(android.R.drawable.ic_menu_mylocation).setContentIntent(open).setContentTitle(recording?"Trabakutik GPS grabando":navigating?"Trabakutik GPS navegando":"Trabakutik GPS").setContentText(offRoute?"FUERA DE RUTA · vuelve a la línea azul":(!hasFix?"Buscando ubicación GPS…":(!upcomingTurn.isEmpty()?upcomingTurn:(route.size()>1?"Siguiendo ruta · GPS activo":points+" puntos registrados")))).setOngoing(true).addAction(android.R.drawable.ic_media_pause,"Parar",stop).build();}
 @Override public int onStartCommand(Intent i,int flags,int id){
  String action=i==null?null:i.getAction();
  if(action==null){finish();return START_NOT_STICKY;}
  if("STOP".equals(action)){finish();return START_NOT_STICKY;}
  if("STOP_NAVIGATION".equals(action)){
   navigating=false;routeReached=false;offRoute=false;farSince=0;
   turns.clear();warnedTurns.clear();upcomingTurn="";route.clear();
   if(!recording){finish();return START_NOT_STICKY;}
   updateNotice();return START_NOT_STICKY;
  }
  if("STOP_RECORD".equals(action)){
   endRecording();
   if(!navigating){finish();return START_NOT_STICKY;}
   updateNotice();return START_NOT_STICKY;
  }
  if("TURNS".equals(action)){loadTurns();if(active)updateNotice();return START_NOT_STICKY;}
  if("ROUTE".equals(action)){
   loadRoute();
   if(route.size()<2)navigating=false;
   if(!navigating&&!recording){finish();return START_NOT_STICKY;}
   if(active)updateNotice();
   return START_NOT_STICKY;
  }
  if("NAVIGATE".equals(action)){
   navigating=true;
   if(!active)start(false);
   else{loadRoute();updateNotice();}
  }else if("START".equals(action)){
   if(!active)start(true);
   else if(!recording){try{beginRecording();}catch(IOException ex){android.util.Log.e("TrabakutikGPS","No se pudo empezar grabacion",ex);}}
  }
  return START_NOT_STICKY;
 }
 void start(boolean withRecording){
  if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){getSharedPreferences("tracking_live",MODE_PRIVATE).edit().putString("gpsState","permission_denied").putBoolean("active",false).apply();stopSelf();return;}
  try {
   loadRoute();active=true;hasFix=false;
   getSharedPreferences("tracking_live",MODE_PRIVATE).edit().putString("gpsState","searching").putBoolean("active",true).apply();
   startForeground(12,notification());
   PowerManager pm=(PowerManager)getSystemService(POWER_SERVICE);
   gpsWakeLock=pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"TrabakutikGPS:Location");
   gpsWakeLock.acquire();
   if(withRecording)beginRecording();
   manager.requestLocationUpdates(LocationManager.GPS_PROVIDER,1500,2,this,Looper.getMainLooper());
   try{manager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER,2000,5,this,Looper.getMainLooper());}catch(Exception ignored){}
  }catch(Exception ex){finish();}
 }
 void beginRecording() throws IOException {
  File dir=new File(getFilesDir(),"grabaciones");dir.mkdirs();
  String name=new SimpleDateFormat("yyyyMMdd-HHmmss",Locale.ROOT).format(new Date());
  file=new File(dir,"trabakutik-"+name+".gpx");
  try(FileWriter w=new FileWriter(file)){w.write("<?xml version=\"1.0\" encoding=\"UTF-8\"?><gpx version=\"1.1\" creator=\"Trabakutik Android\" xmlns=\"http://www.topografix.com/GPX/1/1\"><trk><name>Grabacion</name><trkseg>\n");}
  lastRecordedTime=0;lastRecordedLat=Double.NaN;lastRecordedLon=Double.NaN;points=0;
  try(FileOutputStream reset=new FileOutputStream(new File(getFilesDir(),"trazado-vivo.tsv"),false)){}
  recording=true;getSharedPreferences("tracking_live",MODE_PRIVATE).edit().putBoolean("recording",true).apply();updateNotice();
 }
 void loadRoute(){
  route.clear();routeReached=false;offRoute=false;farSince=0;
  File f=new File(getFilesDir(),"ruta-activa.json");
  if(!f.exists()){loadTurns();return;}
  try {
   byte[] raw=new byte[(int)Math.min(f.length(),2000000)];
   try(FileInputStream in=new FileInputStream(f)){int n=0,k;while(n<raw.length&&(k=in.read(raw,n,raw.length-n))>0)n+=k;}
   JSONArray pts=new JSONArray(new String(raw,java.nio.charset.StandardCharsets.UTF_8));
   for(int i=0;i<pts.length()&&i<15000;i++){JSONArray p=pts.optJSONArray(i);if(p!=null&&p.length()>=2){double lat=p.optDouble(0,Double.NaN),lon=p.optDouble(1,Double.NaN);if(Double.isFinite(lat)&&Double.isFinite(lon))route.add(new double[]{lat,lon});}}
  }catch(Exception ignored){}
  loadTurns();
 }
 void loadTurns(){
  turns.clear();warnedTurns.clear();upcomingTurn="";
  File f=new File(getFilesDir(),"giros-activos.json");
  if(!f.exists())return;
  try{
   byte[] raw=new byte[(int)Math.min(f.length(),40000)];
   try(FileInputStream in=new FileInputStream(f)){int n=0,k;while(n<raw.length&&(k=in.read(raw,n,raw.length-n))>0)n+=k;}
   JSONArray list=new JSONArray(new String(raw,java.nio.charset.StandardCharsets.UTF_8));
   for(int i=0;i<list.length()&&i<400;i++){
    JSONObject p=list.optJSONObject(i);if(p==null)continue;
    int at=p.optInt("i",-1),direction=p.optInt("dir",0);
    if(at>=0&&at<route.size()&&direction>=-1&&direction<=1)turns.add(new double[]{at,direction});
   }
  }catch(Exception e){android.util.Log.w("TrabakutikGPS","Giros no disponibles",e);}
 }
 void checkTurns(Location l){
  if(!navigating||route.size()<2||turns.isEmpty()||!l.hasAccuracy()||l.getAccuracy()>22)return;
  double lat=l.getLatitude(),lon=l.getLongitude();
  double scale=111195,lonScale=scale*Math.cos(Math.toRadians(lat));
  double closest=Double.POSITIVE_INFINITY,along=0,cumulative=0;
  for(int i=1;i<route.size();i++){
   double[] a=route.get(i-1),b=route.get(i);
   double dx=(b[1]-a[1])*lonScale,dy=(b[0]-a[0])*scale;
   double ax=(a[1]-lon)*lonScale,ay=(a[0]-lat)*scale;
   double length=Math.hypot(dx,dy);
   double t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy+1e-10)));
   double error=Math.hypot(ax+t*dx,ay+t*dy);
   if(error<closest){closest=error;along=cumulative+t*length;}
   cumulative+=length;
  }
  if(closest>25){if(!upcomingTurn.isEmpty()){upcomingTurn="";updateNotice();}return;}
  double progress=0;String next="";
  int k=0;
  for(int i=1;i<route.size();i++){
   double[] a=route.get(i-1),b=route.get(i);
   progress+=Math.hypot((b[1]-a[1])*lonScale,(b[0]-a[0])*scale);
   while(k<turns.size()&&(int)turns.get(k)[0]==i){
    double ahead=progress-along;
    if(ahead>=-7&&ahead<=55){
     int d=(int)turns.get(k)[1];
     String instruction=d<0?"Izquierda":d>0?"Derecha":"Cambio de sentido";
     next=instruction+" en "+Math.max(0,Math.round(ahead/5)*5)+" m";
     if(ahead<=15&&ahead>=-3&&!warnedTurns.contains(k)){
      warnedTurns.add(k);singleBeep();
     }
    }
    k++;
   }
  }
  if(!next.equals(upcomingTurn)){upcomingTurn=next;updateNotice();}
 }
 void singleBeep(){
  try{
   ToneGenerator tone=new ToneGenerator(AudioManager.STREAM_MUSIC,90);
   tone.startTone(ToneGenerator.TONE_PROP_ACK,220);
   new Handler(Looper.getMainLooper()).postDelayed(tone::release,450);
  }catch(Exception ignored){}
 }
 void updateNotice(){if(active)((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).notify(12,notification());}
 double closest(double lat,double lon){
  if(route.size()<2)return Double.POSITIVE_INFINITY;
  double scale=111195,lonScale=scale*Math.cos(Math.toRadians(lat)),best=Double.POSITIVE_INFINITY;
  for(int i=1;i<route.size();i++){
   double[] a=route.get(i-1),b=route.get(i);
   double ax=(a[1]-lon)*lonScale,ay=(a[0]-lat)*scale,bx=(b[1]-lon)*lonScale,by=(b[0]-lat)*scale;
   double dx=bx-ax,dy=by-ay,tt=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy+1e-10)));
   best=Math.min(best,Math.hypot(ax+tt*dx,ay+tt*dy));
  }
  return best;
 }
 void checkDeviation(Location l){
  if(!navigating||route.size()<2||!l.hasAccuracy()||l.getAccuracy()>22){farSince=0;return;}
  double d=closest(l.getLatitude(),l.getLongitude()),acc=l.getAccuracy();
  if(d<=Math.max(14,acc+4)){
   routeReached=true;farSince=0;if(offRoute){offRoute=false;updateNotice();}return;
  }
  if(!routeReached)return;
  if(d<=Math.max(18,acc+7)){farSince=0;return;}
  if(farSince==0){farSince=SystemClock.elapsedRealtime();return;}
  if(!offRoute&&SystemClock.elapsedRealtime()-farSince>=800){
   offRoute=true;updateNotice();tripleBeep();
  }
 }
 void tripleBeep(){
  try{
   final ToneGenerator tone=new ToneGenerator(AudioManager.STREAM_MUSIC,85);
   final Handler handler=new Handler(Looper.getMainLooper());
   for(int i=0;i<3;i++){final int delay=i*320;handler.postDelayed(()->{try{tone.startTone(ToneGenerator.TONE_PROP_BEEP,180);}catch(Exception ignored){}},delay);}
   handler.postDelayed(tone::release,1200);
  }catch(Exception ignored){}
 }
 @Override public void onLocationChanged(Location l){
  if(!active)return;
  hasFix=true;
  if(navigating&&route.size()>1){checkDeviation(l);checkTurns(l);}
  getSharedPreferences("tracking_live",MODE_PRIVATE).edit().putFloat("lat",(float)l.getLatitude()).putFloat("lon",(float)l.getLongitude()).putFloat("accuracy",l.hasAccuracy()?l.getAccuracy():9999f).putLong("time",l.getTime()).putBoolean("active",active).putBoolean("recording",recording).putString("gpsState","available").apply();
  if(!recording||!l.hasAccuracy()||l.getAccuracy()>35)return;
  try(FileWriter w=new FileWriter(file,true)){
   SimpleDateFormat fmt=new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'",Locale.US);
   fmt.setTimeZone(TimeZone.getTimeZone("UTC"));
   String time=fmt.format(new Date(l.getTime()));
   if(lastRecordedTime>0&&(l.getTime()-lastRecordedTime>20000||(Double.isFinite(lastRecordedLat)&&l.distanceTo(makePreviousLocation())>100)))w.write("</trkseg><trkseg>\n");
   w.write("<trkpt lat=\""+l.getLatitude()+"\" lon=\""+l.getLongitude()+"\">"+(l.hasAltitude()?"<ele>"+l.getAltitude()+"</ele>":"")+"<time>"+time+"</time></trkpt>\n");
   try(FileWriter pointsFile=new FileWriter(new File(getFilesDir(),"trazado-vivo.tsv"),true)){if(lastRecordedTime>0&&(l.getTime()-lastRecordedTime>20000||(Double.isFinite(lastRecordedLat)&&l.distanceTo(makePreviousLocation())>100)))pointsFile.write("\n");pointsFile.write(l.getLatitude()+"\t"+l.getLongitude()+"\n");}
   lastRecordedTime=l.getTime();lastRecordedLat=l.getLatitude();lastRecordedLon=l.getLongitude();
   points++;if(points%10==0)updateNotice();
  }catch(Exception ignored){}
 }
 Location makePreviousLocation(){Location p=new Location(LocationManager.GPS_PROVIDER);p.setLatitude(lastRecordedLat);p.setLongitude(lastRecordedLon);return p;}
 void endRecording(){
  if(!recording)return;
  try(FileWriter w=new FileWriter(file,true)){w.write("</trkseg></trk></gpx>\n");}
  catch(Exception e){android.util.Log.e("TrabakutikGPS","No se pudo cerrar GPX",e);}
  recording=false;
  getSharedPreferences("tracking_live",MODE_PRIVATE).edit().putBoolean("recording",false).apply();
 }
 void finish(){navigating=false;getSharedPreferences("tracking_live",MODE_PRIVATE).edit().putBoolean("active",false).putBoolean("recording",false).apply();if(active){manager.removeUpdates(this);active=false;}if(gpsWakeLock!=null&&gpsWakeLock.isHeld())gpsWakeLock.release();endRecording();stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();}
 @Override public void onDestroy(){if(active||recording)finish();super.onDestroy();}
}
