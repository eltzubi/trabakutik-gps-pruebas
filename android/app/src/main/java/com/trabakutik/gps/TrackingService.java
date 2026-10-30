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
 LocationManager manager;File file;boolean recording=false,active=false,routeReached=false,offRoute=false;int points=0;long farSince=0,lastNotice=0;final ArrayList<double[]> route=new ArrayList<>();
 final String channel="trabakutik-grabacion";
 @Override public void onCreate(){super.onCreate();manager=(LocationManager)getSystemService(LOCATION_SERVICE);((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(new NotificationChannel(channel,"Grabación de rutas",NotificationManager.IMPORTANCE_LOW));}
 @Override public IBinder onBind(Intent i){return null;}
 Notification notification(){Intent intent=new Intent(this,TrackingService.class).setAction("STOP");PendingIntent stop=PendingIntent.getService(this,1,intent,PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
 return new Notification.Builder(this,channel).setSmallIcon(android.R.drawable.ic_menu_mylocation).setContentTitle(recording?"Trabakutik GPS grabando":"Trabakutik GPS navegando").setContentText(offRoute?"FUERA DE RUTA · vuelve a la línea azul":(route.size()>1?"Siguiendo ruta · pantalla bloqueada activa":points+" puntos registrados")).setOngoing(true).addAction(android.R.drawable.ic_media_pause,"Parar",stop).build();}
 @Override public int onStartCommand(Intent i,int flags,int id){if(i!=null&&"STOP".equals(i.getAction())){finish();return START_NOT_STICKY;}if(i!=null&&"STOP_RECORD".equals(i.getAction())){endRecording();updateNotice();return active?START_STICKY:START_NOT_STICKY;}if(i!=null&&"ROUTE".equals(i.getAction())){loadRoute();if(active)updateNotice();return active?START_STICKY:START_NOT_STICKY;}boolean wantsRecord=i!=null&&"START".equals(i.getAction());if(!active)start(wantsRecord);else if(wantsRecord&&!recording){try{beginRecording();}catch(IOException ex){android.util.Log.e("TrabakutikGPS","No se pudo empezar grabacion",ex);}}return active?START_STICKY:START_NOT_STICKY;}
 void start(boolean withRecording){
  if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){stopSelf();return;}
  try {
   loadRoute();active=true;
   startForeground(12,notification());
   if(withRecording)beginRecording();
   manager.requestLocationUpdates(LocationManager.GPS_PROVIDER,1500,2,this,Looper.getMainLooper());
  }catch(Exception ex){finish();}
 }
 void beginRecording() throws IOException {
  File dir=new File(getFilesDir(),"grabaciones");dir.mkdirs();
  String name=new SimpleDateFormat("yyyyMMdd-HHmmss",Locale.ROOT).format(new Date());
  file=new File(dir,"trabakutik-"+name+".gpx");
  try(FileWriter w=new FileWriter(file)){w.write("<?xml version=\"1.0\" encoding=\"UTF-8\"?><gpx version=\"1.1\" creator=\"Trabakutik Android\" xmlns=\"http://www.topografix.com/GPX/1/1\"><trk><name>Grabacion</name><trkseg>\n");}
  recording=true;updateNotice();
 }
 void loadRoute(){
  route.clear();routeReached=false;offRoute=false;farSince=0;
  File f=new File(getFilesDir(),"ruta-activa.json");
  if(!f.exists())return;
  try {
   byte[] raw=new byte[(int)Math.min(f.length(),2000000)];
   try(FileInputStream in=new FileInputStream(f)){int n=0,k;while(n<raw.length&&(k=in.read(raw,n,raw.length-n))>0)n+=k;}
   JSONArray pts=new JSONArray(new String(raw,java.nio.charset.StandardCharsets.UTF_8));
   for(int i=0;i<pts.length()&&i<15000;i++){JSONArray p=pts.optJSONArray(i);if(p!=null&&p.length()>=2){double lat=p.optDouble(0,Double.NaN),lon=p.optDouble(1,Double.NaN);if(Double.isFinite(lat)&&Double.isFinite(lon))route.add(new double[]{lat,lon});}}
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
  if(route.size()<2||!l.hasAccuracy()||l.getAccuracy()>22){farSince=0;return;}
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
  checkDeviation(l);
  if(!recording||!l.hasAccuracy()||l.getAccuracy()>35)return;
  try(FileWriter w=new FileWriter(file,true)){
   SimpleDateFormat fmt=new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'",Locale.US);
   fmt.setTimeZone(TimeZone.getTimeZone("UTC"));
   String time=fmt.format(new Date(l.getTime()));
   w.write("<trkpt lat=\""+l.getLatitude()+"\" lon=\""+l.getLongitude()+"\">"+(l.hasAltitude()?"<ele>"+l.getAltitude()+"</ele>":"")+"<time>"+time+"</time></trkpt>\n");
   points++;if(points%10==0)updateNotice();
  }catch(Exception ignored){}
 }
 void endRecording(){
  if(!recording)return;
  try(FileWriter w=new FileWriter(file,true)){w.write("</trkseg></trk></gpx>\n");}
  catch(Exception e){android.util.Log.e("TrabakutikGPS","No se pudo cerrar GPX",e);}
  recording=false;
 }
 void finish(){if(active){manager.removeUpdates(this);active=false;}endRecording();stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();}
 @Override public void onDestroy(){if(active||recording)finish();super.onDestroy();}
}
