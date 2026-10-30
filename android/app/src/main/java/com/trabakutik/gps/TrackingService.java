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
public class TrackingService extends Service implements LocationListener {
 LocationManager manager;File file;boolean recording=false;int points=0;
 final String channel="trabakutik-grabacion";
 @Override public void onCreate(){super.onCreate();manager=(LocationManager)getSystemService(LOCATION_SERVICE);((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(new NotificationChannel(channel,"Grabación de rutas",NotificationManager.IMPORTANCE_LOW));}
 @Override public IBinder onBind(Intent i){return null;}
 Notification notification(){Intent intent=new Intent(this,TrackingService.class).setAction("STOP");PendingIntent stop=PendingIntent.getService(this,1,intent,PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
 return new Notification.Builder(this,channel).setSmallIcon(android.R.drawable.ic_menu_mylocation).setContentTitle("Trabakutik GPS grabando").setContentText(points+" puntos · funciona con la pantalla bloqueada").setOngoing(true).addAction(android.R.drawable.ic_media_pause,"Parar",stop).build();}
 @Override public int onStartCommand(Intent i,int flags,int id){if(i!=null&&"STOP".equals(i.getAction())){finish();return START_NOT_STICKY;}if(!recording)start();return recording?START_STICKY:START_NOT_STICKY;}
 void start(){if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){stopSelf();return;}
 try{File dir=new File(getFilesDir(),"grabaciones");dir.mkdirs();String name=new SimpleDateFormat("yyyyMMdd-HHmmss",Locale.ROOT).format(new Date());file=new File(dir,"trabakutik-"+name+".gpx");try(FileWriter w=new FileWriter(file)){w.write("<?xml version=\"1.0\" encoding=\"UTF-8\"?><gpx version=\"1.1\" creator=\"Trabakutik Android\" xmlns=\"http://www.topografix.com/GPX/1/1\"><trk><name>Grabacion</name><trkseg>\n");}
 recording=true;startForeground(12,notification());manager.requestLocationUpdates(LocationManager.GPS_PROVIDER,1500,2,this,Looper.getMainLooper());}
 catch(Exception ex){finish();}}
 @Override public void onLocationChanged(Location l){if(!recording||l.getAccuracy()>35)return;try(FileWriter w=new FileWriter(file,true)){String time=new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'",Locale.US){{setTimeZone(TimeZone.getTimeZone("UTC"));}}.format(new Date(l.getTime()));w.write("<trkpt lat=\""+l.getLatitude()+"\" lon=\""+l.getLongitude()+"\">"+(l.hasAltitude()?"<ele>"+l.getAltitude()+"</ele>":"")+"<time>"+time+"</time></trkpt>\n");points++;((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).notify(12,notification());}catch(Exception ignored){}}
 void finish(){if(recording){manager.removeUpdates(this);try(FileWriter w=new FileWriter(file,true)){w.write("</trkseg></trk></gpx>\n");}catch(Exception ignored){}recording=false;}stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();}
 @Override public void onDestroy(){if(recording)finish();super.onDestroy();}
}
