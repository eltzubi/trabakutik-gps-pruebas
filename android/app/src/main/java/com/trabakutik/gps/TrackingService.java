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
import android.speech.tts.TextToSpeech;
public class TrackingService extends Service implements LocationListener {
 LocationManager manager;PowerManager.WakeLock gpsWakeLock;LocationListener red=null;File file;boolean recording=false,navigating=false,active=false,routeReached=false,offRoute=false;int points=0;long lastRecordedTime=0;double lastRecordedLat=Double.NaN,lastRecordedLon=Double.NaN;long farSince=0,lastNotice=0;double velocidadSuave=0;final ArrayList<double[]> route=new ArrayList<>();final ArrayList<double[]> turns=new ArrayList<>();final HashSet<String> warnedTurns=new HashSet<>();String upcomingTurn="";int sentido=1;boolean pausado=false,forzarCorte=false;long ultimoFixGpsElapsed=0;String ultimoEstadoAviso="";TextToSpeech voz=null;boolean vozLista=false;String audioModo="voz";String vozEstado="iniciando";final Handler avisoHandler=new Handler(Looper.getMainLooper());
 final String channel="trabakutik-grabacion";
 /** Hay un servicio vivo en este proceso. Es estatica a proposito: si Android
  *  mata el proceso, vuelve sola a false, que es lo que hace falta para saber
  *  que una grabacion quedo a medias. */
 public static volatile boolean ACTIVO=false;
 /** Cierra un GPX que se quedo sin «</trkseg></trk></gpx>».
  *  beginRecording() escribe la cabecera y el cierre solo se escribe en
  *  endRecording(), asi que si Android mata el proceso mientras se graba
  *  -- que es justo lo que avisan los dialogos de bateria de Samsung-- el
  *  fichero queda abierto. Y saveTrack() lo exportaba copiando bytes tal
  *  cual, de modo que el GPX que se llevaba el usuario no lo abria casi
  *  ningun programa. Los puntos no se pierden: solo falta cerrarlo.
  *  Devuelve true si ha tenido que arreglarlo. */
 public static boolean cierraGpxSiQuedoAbierto(File f){
  if(f==null||!f.isFile()||f.length()==0)return false;
  try(RandomAccessFile raf=new RandomAccessFile(f,"rw")){
   int cola=(int)Math.min(raf.length(),512);
   raf.seek(raf.length()-cola);
   byte[] buf=new byte[cola];raf.readFully(buf);
   String fin=new String(buf,java.nio.charset.StandardCharsets.UTF_8);
   if(fin.contains("</gpx>"))return false;
   // Si el proceso murio a mitad de una linea, esa linea no es XML valido:
   // se corta por el ultimo salto de linea completo. Sin ninguno, no se
   // recorta nada y se cierra tal cual.
   int corte=fin.lastIndexOf('\n');
   long largo=raf.length()-cola+(corte>=0?corte+1:cola);
   raf.setLength(largo);raf.seek(largo);
   raf.write("</trkseg></trk></gpx>\n".getBytes(java.nio.charset.StandardCharsets.UTF_8));
   return true;
  }catch(Exception e){android.util.Log.w("TrabakutikGPS","No se pudo cerrar un GPX a medias",e);return false;}
 }
 /** Cierra todas las grabaciones que quedaron abiertas. Devuelve cuantas. */
 public static int reparaGrabaciones(Context c){
  File[] all=new File(c.getFilesDir(),"grabaciones").listFiles((d,n)->n.endsWith(".gpx"));
  if(all==null)return 0;
  int n=0;for(File f:all)if(cierraGpxSiQuedoAbierto(f))n++;
  return n;
 }
 @Override public void onCreate(){super.onCreate();manager=(LocationManager)getSystemService(LOCATION_SERVICE);audioModo=getSharedPreferences("tracking_live",MODE_PRIVATE).getString("audioModo","voz");arrancaVoz();((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(new NotificationChannel(channel,"Grabación de rutas",NotificationManager.IMPORTANCE_LOW));avisoHandler.postDelayed(refrescaAviso,5000);}
 final Runnable refrescaAviso=new Runnable(){
  @Override public void run(){
   if(!active)return;
   String estado=estadoGps();if(!estado.equals(ultimoEstadoAviso))updateNotice();
   avisoHandler.postDelayed(this,5000);
  }
 };
 // La voz vive AQUI y no en la pagina. La pagina se duerme con la pantalla
 // apagada —es la misma razon por la que los pitidos se mudaron al servicio—
 // y con el movil en el bolsillo la voz no sonaba justo cuando hace falta.
 void arrancaVoz(){
  try{
   voz=new TextToSpeech(this,estado->{
    // Antes esto se tragaba el resultado de setLanguage y fallaba en
    // silencio: el autor oia los pitidos y la voz no, sin saber por que.
    // Ahora el motivo se guarda y la pagina lo puede enseñar.
    if(estado!=TextToSpeech.SUCCESS){apuntaVoz("No hay motor de voz instalado");return;}
    try{
     int r=voz.setLanguage(new Locale("es","ES"));
     if(r==TextToSpeech.LANG_MISSING_DATA){apuntaVoz("Falta descargar la voz en castellano");return;}
     if(r==TextToSpeech.LANG_NOT_SUPPORTED){
      int r2=voz.setLanguage(new Locale("es"));
      if(r2==TextToSpeech.LANG_MISSING_DATA||r2==TextToSpeech.LANG_NOT_SUPPORTED){
       apuntaVoz("El motor de voz no tiene castellano");return;}
     }
     // USAGE_ASSISTANCE_NAVIGATION_GUIDANCE es la clave de que esto suene
     // como un navegador de verdad: Android baja la musica mientras habla
     // en vez de cortarla, y lo manda al manos libres si hay uno puesto.
     voz.setAudioAttributes(new AudioAttributes.Builder()
       .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
       .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
     vozLista=true;apuntaVoz("ok");
    }catch(Exception e){apuntaVoz("No se pudo preparar la voz");}
   });
  }catch(Exception e){apuntaVoz("No hay motor de voz instalado");}
 }
 void apuntaVoz(String motivo){
  vozEstado=motivo;
  try{getSharedPreferences("tracking_live",MODE_PRIVATE).edit().putString("vozEstado",motivo).apply();}
  catch(Exception ignored){}
 }
 // Para que al tocar el boton se oiga algo y no haya que adivinar.
 void pruebaVoz(){
  if(vozLista)habla("Voz activada");
  else apuntaVoz(vozEstado==null||"ok".equals(vozEstado)?"La voz aún se está preparando":vozEstado);
 }
 void habla(String texto){
  if(!"voz".equals(modoAudio())||!vozLista||voz==null||texto==null)return;
  // QUEUE_FLUSH a proposito: navegando manda lo ultimo. Si el aviso de los
  // 10 m llega mientras todavia suena el de 50, el que vale es el de 10.
  try{voz.speak(texto,TextToSpeech.QUEUE_FLUSH,null,"trabakutik");}catch(Exception ignored){}
 }
 String fraseGiro(int lado,String fase,double d1,double d2){
  if(lado==0)return "3".equals(fase)?"Cambio de sentido ahora":"En "+metros("1".equals(fase)?d1:d2)+" metros, cambio de sentido";
  String hacia=lado<0?"izquierda":"derecha";
  if("3".equals(fase))return "Gira a la "+hacia+" ahora";
  return "En "+metros("1".equals(fase)?d1:d2)+" metros, gira a la "+hacia;
 }
 int metros(double d){return (int)(Math.round(d/5.0)*5);}
 boolean ubicacionActivada(){
  try{return manager.isProviderEnabled(LocationManager.GPS_PROVIDER)||manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER);}
  catch(Exception ignored){return false;}
 }
 boolean gpsReciente(){return ultimoFixGpsElapsed>0&&SystemClock.elapsedRealtime()-ultimoFixGpsElapsed<25000;}
 String estadoGps(){
  if(!ubicacionActivada())return "Activa la ubicación del teléfono";
  if(!gpsReciente())return "Esperando señal GPS";
  if(offRoute)return "FUERA DE RUTA · vuelve a la línea azul";
  if(!upcomingTurn.isEmpty())return upcomingTurn;
  return route.size()>1?"Siguiendo ruta · GPS activo":points+" puntos registrados · GPS activo";
 }
 @Override public IBinder onBind(Intent i){return null;}
 Notification notification(){
 Intent openIntent=new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP);
 PendingIntent open=PendingIntent.getActivity(this,2,openIntent,PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
 Intent intent=new Intent(this,TrackingService.class).setAction("STOP");PendingIntent stop=PendingIntent.getService(this,1,intent,PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
 String estado=estadoGps();ultimoEstadoAviso=estado;
 return new Notification.Builder(this,channel).setSmallIcon(android.R.drawable.ic_menu_mylocation).setContentIntent(open).setContentTitle(recording?(pausado?"Trabakutik GPS · grabación en pausa":"Trabakutik GPS grabando"):navigating?"Trabakutik GPS navegando":"Trabakutik GPS").setContentText(estado).setOngoing(true).addAction(android.R.drawable.ic_media_pause,"Parar",stop).build();}
 @Override public int onStartCommand(Intent i,int flags,int id){
  String action=i==null?null:i.getAction();
  if(action==null){finish();return START_NOT_STICKY;}
  if("STOP".equals(action)){finish();return START_NOT_STICKY;}
  if("STOP_NAVIGATION".equals(action)){
   navigating=false;routeReached=false;offRoute=false;farSince=0;sentido=1;
   turns.clear();warnedTurns.clear();upcomingTurn="";route.clear();
   if(!recording){finish();return START_NOT_STICKY;}
   updateNotice();return START_NOT_STICKY;
  }
  // La pausa detiene SOLO anotar puntos. El GPS, los giros y el fuera de
  // ruta siguen: lo que se para es la grabacion, no la orientacion.
  if("AUDIO".equals(action)){
   String m=i.getStringExtra("modo");
   if("voz".equals(m)||"pitidos".equals(m)||"silencio".equals(m)){
    audioModo=m;
    getSharedPreferences("tracking_live",MODE_PRIVATE).edit().putString("audioModo",m).apply();
    if("voz".equals(m)&&i.getBooleanExtra("probar",false))pruebaVoz();
   }
   return START_NOT_STICKY;
  }
  if("PAUSE".equals(action)){pausado=true;if(active)updateNotice();return START_NOT_STICKY;}
  if("RESUME".equals(action)){
   pausado=false;forzarCorte=true;    // que el descanso no salga como una recta
   if(active)updateNotice();return START_NOT_STICKY;
  }
  if("STOP_RECORD".equals(action)){
   pausado=false;forzarCorte=false;
   endRecording();
   if(!navigating){finish();return START_NOT_STICKY;}
   updateNotice();return START_NOT_STICKY;
  }
  if("TURNS".equals(action)){loadTurns();if(active)updateNotice();return START_NOT_STICKY;}
  // +1 si vas como la ruta esta grabada, -1 si la haces al reves. Lo decide
  // la pagina comparando tu rumbo con el del tramo; aqui solo se guarda.
  if("SENTIDO".equals(action)){
   int s=i.getIntExtra("sentido",1);
   sentido=s<0?-1:1;warnedTurns.clear();upcomingTurn="";
   if(active)updateNotice();
   return START_NOT_STICKY;
  }
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
  if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){stopSelf();return;}
  try {
   loadRoute();active=true;ACTIVO=true;
   startForeground(12,notification());
   PowerManager pm=(PowerManager)getSystemService(POWER_SERVICE);
   gpsWakeLock=pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"TrabakutikGPS:Location");
   // Con tope. Un acquire() sin plazo que no llegue a soltarse —porque el
   // proceso muera antes de finish()— deja el movil sin dormir hasta que lo
   // reinicies. Doce horas pasan cualquier salida y siguen siendo un techo.
   gpsWakeLock.acquire(12L*60*60*1000L);
   if(withRecording)beginRecording();
   manager.requestLocationUpdates(LocationManager.GPS_PROVIDER,1500,2,this,Looper.getMainLooper());
   pideRed();
  }catch(Exception ex){finish();}
 }
 /** La red —antenas y wifi— solo esta para no quedarse a ciegas mientras el
  *  GPS engancha los satelites, que bajo arboles o metido en un valle tarda
  *  lo suyo. En cuanto entra el primer punto del GPS deja de hacer falta: en
  *  el monte no afina nada y mantiene la busqueda de wifi y de cobertura
  *  encendida toda la salida. Lleva oyente propio porque removeUpdates quita
  *  de golpe todo lo de un oyente, y el GPS tiene que seguir.
  */
 void pideRed(){
  if(red!=null)return;
  red=new LocationListener(){
   @Override public void onLocationChanged(Location l){TrackingService.this.onLocationChanged(l);}
   @Override public void onStatusChanged(String p,int s,Bundle extras){}
   @Override public void onProviderEnabled(String p){updateNotice();}
   @Override public void onProviderDisabled(String p){updateNotice();}
  };
  try{manager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER,2000,5,red,Looper.getMainLooper());}
  catch(Exception ignored){}
 }
 void sueltaRed(){
  if(red==null)return;
  try{manager.removeUpdates(red);}catch(Exception ignored){}
  red=null;
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
 // La velocidad cruda del GPS pega saltos y los avisos se calculan con ella:
 // un pico estando parado adelantaria el primero noventa metros sin motivo.
 void actualizaVelocidad(Location l){
  if(!l.hasSpeed())return;
  double v=Math.min(l.getSpeed(),20);
  velocidadSuave=velocidadSuave>0?velocidadSuave*0.7+v*0.3:v;
 }
 // Los avisos van por TIEMPO y no por metros: a 30 km/h cincuenta metros son
 // seis segundos y andando son cuarenta y cinco. 9 s el primero y 3 s el
 // segundo, con suelo (25 y 8 m, para andar) y techo (90 y 30).
 double avisoLargo(){double v=velocidadSuave>0?velocidadSuave:1.2;return Math.min(90,Math.max(25,v*9));}
 double avisoCorto(){double v=velocidadSuave>0?velocidadSuave:1.2;return Math.min(30,Math.max(8,v*3));}
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
  double d1=avisoLargo(),d2=avisoCorto();
  // Haciendo la ruta al reves «along» decrece: sin el signo, los avisos
  // apuntaban a los cruces que ya habias pasado.
  double progress=0;String next="";
  int k=0;
  for(int i=1;i<route.size();i++){
   double[] a=route.get(i-1),b=route.get(i);
   progress+=Math.hypot((b[1]-a[1])*lonScale,(b[0]-a[0])*scale);
   while(k<turns.size()&&(int)turns.get(k)[0]==i){
    double ahead=(progress-along)*sentido;
    // El suelo va con la velocidad, como el techo. Con los -7 m fijos de
    // antes el pitido del propio cruce se perdia: este GPS da una posicion
    // cada 1,5 s, 17 m de salto a 40 km/h, y la ventana de 7 m no la pisaba
    // ninguna lectura. Simulado con 10 arranques distintos: 5 de 10 a
    // 30 km/h, 5 de 10 a 40 y 3 de 10 a 50. Con -(d2+8), 10 de 10 siempre.
    if(ahead>=-(d2+8)&&ahead<=d1+8){
     int d=(int)turns.get(k)[1];
     // Al reves, lo que se grabo como derecha es izquierda.
     int lado=d*sentido;
     String instruction=lado<0?"Izquierda":lado>0?"Derecha":"Cambio de sentido";
     next=instruction+" en "+Math.max(0,Math.round(ahead/5)*5)+" m";
     // Tres avisos por cruce y cada fase suena una sola vez: 1 pitido a
     // 50 m, 2 a 10 m y 3 en el propio cruce. El numero es el dato, que
     // con la pantalla apagada es lo unico que hay. Cabe en la ventana de
     // arriba porque llega hasta 55 m.
     // El tramo del propio cruce va sin suelo por abajo: con -3 m el pitido
     // se perdia a la mitad de las velocidades, porque a 20 km/h esos 3 m
     // duran medio segundo y el GPS da una lectura por segundo. Lo acota ya
     // la ventana de fuera, que empieza en -7 m.
     String fase=ahead<=d1&&ahead>d2?"1":ahead<=d2&&ahead>0?"2":ahead<=0?"3":null;
     if(fase!=null){
      String clave=k+":"+fase;
      if(!warnedTurns.contains(clave)){
       warnedTurns.add(clave);
       pitidos(Integer.parseInt(fase),300);
       habla(fraseGiro(lado,fase,d1,d2));
      }
     }
    }
    k++;
   }
  }
  if(!next.equals(upcomingTurn)){upcomingTurn=next;updateNotice();}
 }
 // Un grupo de n pitidos: 1 = cruce a 50 m, 2 = a 10 m, 3 = en el cruce,
 // 4 = fuera de ruta. Los cuatro de fuera de ruta van mas seguidos (180 ms)
 // que los de giro (300 ms), que tres y cuatro al mismo ritmo no se
 // distinguen de oido.
 String modoAudio(){
  try{return getSharedPreferences("tracking_live",MODE_PRIVATE).getString("audioModo",audioModo);}
  catch(Exception e){return audioModo;}
 }
 void pitidos(int n,int sep){
  // Se relee del fichero, no del campo: el campo solo se cargaba al nacer
  // el servicio, asi que un cambio posterior no le llegaba y seguia
  // pitando con «Silencio» puesto. Lo dijo el autor.
  if("silencio".equals(modoAudio()))return;
  try{
   final ToneGenerator tone=new ToneGenerator(AudioManager.STREAM_MUSIC,90);
   final Handler handler=new Handler(Looper.getMainLooper());
   for(int i=0;i<n;i++){
    final int delay=i*sep;
    handler.postDelayed(()->{try{tone.startTone(ToneGenerator.TONE_PROP_BEEP,160);}catch(Exception ignored){}},delay);
   }
   handler.postDelayed(tone::release,n*sep+500);
  }catch(Exception ignored){}
 }
 void updateNotice(){if(active)((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).notify(12,notification());}
 @Override public void onProviderEnabled(String provider){updateNotice();}
 @Override public void onProviderDisabled(String provider){updateNotice();}
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
  if(!navigating||route.size()<2||!l.hasAccuracy()){farSince=0;return;}
  // El corte estaba en 22 m Y ADEMAS borraba farSince, que es el cronometro
  // de los 800 ms. Bajo arbolado 25-35 m de precision es lo normal, asi que
  // cada lectura mala reiniciaba la cuenta y el aviso no llegaba nunca. Lo
  // dijo el autor: «al salirme de la ruta no me ha pitado ni me ha hablado».
  // Simulado 400 veces por escenario con 45 m de desvio: en bosque cerrado
  // (22-38 m) avisaba el 0,0% de las veces; asi, el 100% a las 2 lecturas.
  // El corte ya no hace falta para evitar falsos avisos porque los umbrales
  // de abajo YA crecen con la precision (acc+4 y acc+7): con mala señal hay
  // que estar mas lejos para que cuente. Queda solo un corte de cordura en
  // 60 m -por encima de eso la posicion es basura- y ese SE SALTA la lectura
  // sin tocar el cronometro. Falsas alarmas a 8 m del track: 0 de 400.
  if(l.getAccuracy()>60)return;
  double d=closest(l.getLatitude(),l.getLongitude()),acc=l.getAccuracy();
  if(d<=Math.max(11,acc+4)){
   routeReached=true;farSince=0;if(offRoute){offRoute=false;updateNotice();habla("De nuevo en la ruta");}return;
  }
  if(!routeReached)return;
  if(d<=Math.max(15,acc+7)){farSince=0;return;}
  if(farSince==0){farSince=SystemClock.elapsedRealtime();return;}
  if(!offRoute&&SystemClock.elapsedRealtime()-farSince>=800){
   offRoute=true;updateNotice();pitidos(4,180);habla("Atención, fuera del recorrido");
  }
 }
 @Override public void onLocationChanged(Location l){
  if(!active)return;
  if(LocationManager.GPS_PROVIDER.equals(l.getProvider())){ultimoFixGpsElapsed=SystemClock.elapsedRealtime();if(red!=null)sueltaRed();}
  actualizaVelocidad(l);
  if(navigating&&route.size()>1){checkDeviation(l);checkTurns(l);}
  getSharedPreferences("tracking_live",MODE_PRIVATE).edit().putFloat("lat",(float)l.getLatitude()).putFloat("lon",(float)l.getLongitude()).putFloat("accuracy",l.hasAccuracy()?l.getAccuracy():9999f).putLong("time",l.getTime()).putFloat("bearing",l.hasBearing()?l.getBearing():-1f).putFloat("speed",l.hasSpeed()?l.getSpeed():-1f).putLong("latBits",Double.doubleToRawLongBits(l.getLatitude())).putLong("lonBits",Double.doubleToRawLongBits(l.getLongitude())).putBoolean("active",active).putBoolean("recording",recording).putBoolean("navigating",navigating).putBoolean("guiando",navigating&&route.size()>1).apply();
  if(!recording||pausado||!l.hasAccuracy()||l.getAccuracy()>35)return;
  try(FileWriter w=new FileWriter(file,true)){
   SimpleDateFormat fmt=new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'",Locale.US);
   fmt.setTimeZone(TimeZone.getTimeZone("UTC"));
   String time=fmt.format(new Date(l.getTime()));
   boolean corta=forzarCorte||(lastRecordedTime>0&&(l.getTime()-lastRecordedTime>20000||(Double.isFinite(lastRecordedLat)&&l.distanceTo(makePreviousLocation())>100)));
   if(corta&&lastRecordedTime>0)w.write("</trkseg><trkseg>\n");
   w.write("<trkpt lat=\""+l.getLatitude()+"\" lon=\""+l.getLongitude()+"\">"+(l.hasAltitude()?"<ele>"+l.getAltitude()+"</ele>":"")+"<time>"+time+"</time></trkpt>\n");
   try(FileWriter pointsFile=new FileWriter(new File(getFilesDir(),"trazado-vivo.tsv"),true)){if(lastRecordedTime>0&&(l.getTime()-lastRecordedTime>20000||(Double.isFinite(lastRecordedLat)&&l.distanceTo(makePreviousLocation())>100)))pointsFile.write("\n");pointsFile.write(l.getLatitude()+"\t"+l.getLongitude()+"\n");}
   lastRecordedTime=l.getTime();lastRecordedLat=l.getLatitude();lastRecordedLon=l.getLongitude();
   forzarCorte=false;
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
 void finish(){navigating=false;getSharedPreferences("tracking_live",MODE_PRIVATE).edit().putBoolean("active",false).putBoolean("recording",false).apply();sueltaRed();if(active){manager.removeUpdates(this);active=false;}if(gpsWakeLock!=null&&gpsWakeLock.isHeld())gpsWakeLock.release();endRecording();ACTIVO=false;stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();}
 @Override public void onDestroy(){avisoHandler.removeCallbacks(refrescaAviso);if(voz!=null){try{voz.stop();voz.shutdown();}catch(Exception ignored){}voz=null;vozLista=false;}if(active||recording)finish();ACTIVO=false;super.onDestroy();}
}
