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
 LocationManager manager;PowerManager.WakeLock gpsWakeLock;LocationListener red=null;File file;boolean recording=false,navigating=false,active=false,routeReached=false,offRoute=false;int points=0;long lastRecordedTime=0;double lastRecordedLat=Double.NaN,lastRecordedLon=Double.NaN;long farSince=0,lastNotice=0;double velocidadSuave=0;final ArrayList<double[]> route=new ArrayList<>();final ArrayList<double[]> turns=new ArrayList<>();final HashSet<String> warnedTurns=new HashSet<>();String upcomingTurn="";int sentido=1;double alongPrevio=Double.NaN,alongAcum=0;long cercaDesde=0;boolean pausado=false,forzarCorte=false;long ultimoFixGpsElapsed=0;String ultimoEstadoAviso="";boolean sinGpsAvisado=false;final Handler pitidoHandler=new Handler(Looper.getMainLooper());ToneGenerator tonoEnCurso=null;String errorGrabacion="",errorRuta="";TextToSpeech voz=null;boolean vozLista=false;String audioModo="voz";String vozEstado="iniciando";final Handler avisoHandler=new Handler(Looper.getMainLooper());
 final NavigationMetrics metrics=new NavigationMetrics();
 List<NavigationMetrics.Water> waterPoints;
 int metricsRouteKey;
 long lastImportantAudio=Long.MIN_VALUE/2;
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
   avisaSinGps();
   if(recording&&!pausado)apuntaBateria(false);
   avisoHandler.postDelayed(this,5000);
  }
 };
 // QUEDARSE SIN SATELITES SE DICE EN ALTO. Antes solo cambiaba el texto de la
 // notificacion, y con el movil en el bolsillo no te enterabas de que habias
 // dejado de estar guiado: seguias andando creyendo que la aplicacion te iba
 // a avisar del siguiente cruce. Lo pidio el autor despues de cortar los
 // satelites a proposito y no oir nada.
 //
 // Solo se avisa de una PERDIDA, no del arranque: al encender todavia no hay
 // posicion y decir «sin señal» ahi seria mentira y ademas asustaria. Por eso
 // hace falta haber tenido al menos un punto (ultimoFixGpsElapsed>0). La
 // ubicacion apagada si se dice desde el primer momento: eso no se arregla
 // esperando.
 // Tres casos que salieron en el repaso completo (13 de noviembre de 2026):
 //  - Si ya se habia avisado «sin señal» y DESPUES se apagaba la ubicacion,
 //    no se decia nada: el aviso era un solo si/no. Ahora se recuerda si lo
 //    avisado fue la ubicacion apagada, y pasar a ella se dice.
 //  - Si el GPS no llegaba NUNCA a dar la primera posicion, no se decia en
 //    alto: el aviso pedia haber tenido una. Ahora, pasado SIN_PRIMER_FIX_MS
 //    desde que arranca el GPS, tambien se avisa; y al llegar, «recuperada».
 //  - loadRoute y STOP_NAVIGATION ponian el aviso a cero, asi que si llegaba
 //    el trazado fino estando sin señal se volvia a gritar «sin señal». El
 //    estado de la señal no depende de la ruta: ya no se toca alli.
 static final long SIN_PRIMER_FIX_MS=60000;
 long gpsArrancadoElapsed=0;
 boolean avisadaApagada=false;
 void avisaSinGps(){
  boolean apagada=!ubicacionActivada();
  // Encender la ubicacion no es recuperar la señal: hasta que entra la
  // primera posicion no hay nada recuperado. Sin esto, con la ubicacion
  // apagada al empezar, al encenderla se decia «Señal GPS recuperada» con el
  // GPS todavia buscando satelites, y ya no se volvia a decir al llegar.
  boolean nuncaLlega=gpsArrancadoElapsed>0
    &&SystemClock.elapsedRealtime()-gpsArrancadoElapsed>=SIN_PRIMER_FIX_MS;
  boolean sinGps=apagada||(ultimoFixGpsElapsed>0?!gpsReciente():(sinGpsAvisado||nuncaLlega));
  boolean pasaAApagada=sinGps&&sinGpsAvisado&&apagada&&!avisadaApagada;
  if(sinGps==sinGpsAvisado&&!pasaAApagada)return;
  sinGpsAvisado=sinGps;
  if(!sinGps){avisadaApagada=false;tonoBien();habla("Señal GPS recuperada");return;}
  avisadaApagada=apagada;
  // Dos pitidos lentos: los giros van de uno a tres seguidos y el de fuera
  // de ruta son cuatro rapidos, asi que este no se confunde con ninguno.
  pitidos(2,700);
  habla(apagada?"Atención, la ubicación del teléfono está apagada"
               :"Atención, sin señal GPS");
 }
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
 // CALLAR AHORA MISMO, no «a partir de ahora». Antes el modo se miraba solo
 // al empezar a hablar o a pitar, asi que al poner silencio la frase que ya
 // estaba sonando terminaba de decirse y los pitidos de esa tanda seguian
 // saliendo uno detras de otro.
 void callaYa(){
  try{if(voz!=null)voz.stop();}catch(Exception ignored){}
  pitidoHandler.removeCallbacksAndMessages(null);
  // Los pitidos pendientes se han quedado sin reloj, asi que el que iba a
  // soltar el tono tampoco va a correr: hay que soltarlo aqui o se queda
  // cogido.
  sueltaTono();
 }
 void sueltaTono(){
  ToneGenerator t=tonoEnCurso;tonoEnCurso=null;
  if(t!=null)try{t.release();}catch(Exception ignored){}
 }
 // --- LO QUE GASTA LA BATERIA, MEDIDO ---
 // El autor pregunto cuanto gasta la aplicacion. A ojo no se contesta: se
 // apunta. Mientras graba, una linea cada cinco minutos en bateria.tsv
 // -minutos, nivel, metros, posiciones, si estaba cargando- y al parar, el
 // resumen de la salida. Primero medir; bajar el gasto pidiendo posiciones
 // mas despacio, despues, y con el numero delante.
 static final long BATERIA_CADA_MS=300000;
 static final long BATERIA_TOPE_FICHERO=100000;
 static final int GASTO_SIN_LEER=999;
 long bateriaDesde=0,bateriaApunte=0;
 int bateriaInicio=-1,bateriaFixes=0,bateriaNivel=-1;
 double bateriaMetros=0;
 boolean bateriaCargando=false;
 String gastoUltimo="";
 int nivelBateria(){
  try{
   BatteryManager bm=(BatteryManager)getSystemService(BATTERY_SERVICE);
   if(bm!=null){int n=bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY);if(n>=0&&n<=100)return n;}
  }catch(Exception e){android.util.Log.w("TrabakutikGPS","Sin lectura de bateria",e);}
  return -1;
 }
 boolean cargando(){
  try{BatteryManager bm=(BatteryManager)getSystemService(BATTERY_SERVICE);return bm!=null&&bm.isCharging();}
  catch(Exception e){return false;}
 }
 void arrancaBateria(){
  bateriaDesde=SystemClock.elapsedRealtime();bateriaApunte=0;bateriaFixes=0;bateriaMetros=0;
  bateriaInicio=nivelBateria();bateriaNivel=bateriaInicio;bateriaCargando=cargando();gastoUltimo="";
  File f=new File(getFilesDir(),"bateria.tsv");
  // El fichero es un cuaderno, no un registro eterno: si se pasa de 100 kB
  // se tira lo viejo. Son unas 5.000 lineas, muchas salidas.
  if(f.length()>BATERIA_TOPE_FICHERO)f.delete();
  escribeBateria("# "+new SimpleDateFormat("yyyy-MM-dd HH:mm",Locale.ROOT).format(new Date())
    +" empieza con "+bateriaInicio+" %");
  apuntaBateria(true);
 }
 void escribeBateria(String linea){
  try(FileWriter w=new FileWriter(new File(getFilesDir(),"bateria.tsv"),true)){w.write(linea+"\n");}
  catch(Exception e){android.util.Log.w("TrabakutikGPS","No se pudo apuntar la bateria",e);}
 }
 /** Una linea del cuaderno. Con «ya» no espera a que toquen los cinco minutos. */
 void apuntaBateria(boolean ya){
  if(bateriaDesde==0)return;
  long ahora=SystemClock.elapsedRealtime();
  if(!ya&&bateriaApunte>0&&ahora-bateriaApunte<BATERIA_CADA_MS)return;
  bateriaApunte=ahora;
  int nivel=nivelBateria();
  if(nivel>=0)bateriaNivel=nivel;
  if(cargando())bateriaCargando=true;
  escribeBateria((ahora-bateriaDesde)/60000+"\t"+nivel+"\t"+Math.round(bateriaMetros)
    +"\t"+bateriaFixes+"\t"+(bateriaCargando?1:0));
 }
 /** El resumen que lee el autor al parar. Sin Android, para poder probarlo. */
 static String textoGasto(long ms,int gastado,double metros,int fixes,boolean cargando){
  long min=Math.max(0,Math.round(ms/60000.0));
  StringBuilder t=new StringBuilder(min>=60?(min/60)+" h "+(min%60)+" min":min+" min");
  if(metros>=1000)t.append(" · ").append(unDecimal(metros/1000)).append(" km");
  else if(metros>0)t.append(" · ").append(Math.round(metros/10)*10).append(" m");
  if(gastado==GASTO_SIN_LEER)t.append(" · no se pudo leer la batería");
  // Si el nivel ha subido, o el telefono iba al cargador, el numero no mide
  // lo que gasta la aplicacion. Mejor decirlo que dar un gasto falso.
  else if(cargando||gastado<0)t.append(" · ibas cargando, el gasto no vale");
  else {
   t.append(" · ").append(gastado).append(" % de batería");
   // Con poco rato, el % por hora es un invento: a 10 minutos, un solo
   // punto de bateria son 6 %/h o 0 %/h segun cuando lo marque el telefono.
   if(min>=15)t.append(" · ").append(unDecimal(gastado*60.0/min)).append(" % por hora");
  }
  if(fixes>0&&min>0)t.append(" · ").append(Math.round(fixes/(double)min)).append(" posiciones/min");
  return t.toString();
 }
 static String unDecimal(double v){return String.format(Locale.ROOT,"%.1f",v).replace('.',',');}
 String fraseGiro(int lado,int tipo,String fase,double ahead){
  // Lo que pidio el autor fue que le avisaran de los CRUCES, asi que la voz
  // dice si es un cruce o una curva. Y «cambio de sentido» en un sendero
  // suena a «date la vuelta», que no es lo que pasa en una herradura.
  // tipo: 0 curva de herradura, 1 cruce, 2 cruce donde hay que seguir por un
  // lado sin apenas girar. El 2 lo manda la pagina desde noviembre de 2026,
  // cuando los cruces pasaron a traer los rumbos de sus ramas: ahi el giro
  // son pocos grados y decir «cruce a la derecha» enganaria, porque lo que
  // hay que hacer es no seguir la via que se va por el otro lado.
  // tipo 3 y 4: curva de herradura con su lado, suelta o en un cruce. Antes
  // una herradura llegaba sin lado y en un cruce se decia «cruce, da la
  // vuelta»: en plena revuelta de carretera suena a volver atras. Lo conto el
  // autor: «me decia una vuelta en plena curva».
  if(tipo>=3&&lado!=0){
   String h=(tipo==4?"en el cruce, curva de herradura a la ":"curva de herradura a la ")+(lado<0?"izquierda":"derecha");
   if("3".equals(fase))return Character.toUpperCase(h.charAt(0))+h.substring(1)+" ahora";
   return "En "+Math.max(5,(int)(Math.round(ahead/10.0)*10))+" metros, "+h;
  }
  boolean esCruce=tipo!=0;
  String hacia=tipo==2
   ?(lado<0?"en el cruce, sigue por la izquierda":"en el cruce, sigue por la derecha")
   :lado==0
   ?(esCruce?"cruce, da la vuelta":"curva de herradura")
   :esCruce?(lado<0?"cruce a la izquierda":"cruce a la derecha")
           :(lado<0?"curva cerrada a la izquierda":"curva cerrada a la derecha");
  if("3".equals(fase))return Character.toUpperCase(hacia.charAt(0))+hacia.substring(1)+" ahora";
  // La distancia de VERDAD, no el umbral: decia «en 200 metros» estando a 170.
  return "En "+Math.max(5,(int)(Math.round(ahead/10.0)*10))+" metros, "+hacia;
 }
 boolean ubicacionActivada(){
  try{return manager.isProviderEnabled(LocationManager.GPS_PROVIDER)||manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER);}
  catch(Exception ignored){return false;}
 }
 boolean gpsReciente(){return ultimoFixGpsElapsed>0&&SystemClock.elapsedRealtime()-ultimoFixGpsElapsed<25000;}
 String estadoGps(){
  // Un fallo guardando va el primero: es el unico que te hace perder la
  // salida entera, y antes no se decia en ninguna parte.
  // Cada aviso, solo mientras tenga sentido: sin esto, un fallo al grabar
  // seguia en pantalla despues de parar, y el de la ruta salia aunque
  // estuvieras solo grabando sin navegar.
  if(recording&&!errorGrabacion.isEmpty())return errorGrabacion;
  if(navigating&&!errorRuta.isEmpty())return errorRuta;
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
   navigating=false;routeReached=false;offRoute=false;farSince=0;cercaDesde=0;olvidaSentido();
   turns.clear();warnedTurns.clear();upcomingTurn="";route.clear();
   publicaEstado();
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
    if(!"voz".equals(m))callaYa();
    if("voz".equals(m)&&i.getBooleanExtra("probar",false))pruebaVoz();
   }
   return START_NOT_STICKY;
  }
  if("PAUSE".equals(action)){pausado=true;metrics.pausePace();if(active)updateNotice();return START_NOT_STICKY;}
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
  if("TURNS".equals(action)){loadTurns();publicaEstado();if(active)updateNotice();return START_NOT_STICKY;}
  // +1 si vas como la ruta esta grabada, -1 si la haces al reves. AHORA LO
  // DECIDE EL SERVICIO, en decideSentido; esto es solo lo que opina la
  // pagina, que viene bien cuando estas mirando el movil -decide con la
  // primera posicion, sin esperar los 30 m- y no estorba cuando no: las dos
  // cuentas son la misma y salen igual. Ponerlo por aqui no reinicia el
  // avance a proposito: si la pagina se equivoca, el servicio la corrige.
  if("SENTIDO".equals(action)){
   ponSentido(i.getIntExtra("sentido",1)<0?-1:1);
   if(active)updateNotice();
   return START_NOT_STICKY;
  }
  if("ROUTE".equals(action)){
   // Ruta nueva: el sentido de la anterior no vale. Sin esto, el servicio se
   // quedaba con el «al reves» de la ruta de antes y cantaba izquierda por
   // derecha en la nueva. Solo se reiniciaba al PARAR la navegacion.
   olvidaSentido();
   loadRoute();loadTurns();
   if(route.size()<2)navigating=false;
   publicaEstado();
   if(!navigating&&!recording){finish();return START_NOT_STICKY;}
   if(active)updateNotice();
   return START_NOT_STICKY;
  }
  if("NAVIGATE".equals(action)){
   navigating=true;
   if(!active)start(false);
   else{loadRoute();updateNotice();}
   publicaEstado();
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
   // Antes: 1500 ms Y 2 m de desplazamiento. El filtro de 2 m era el que
  // mandaba andando -2 m a 4 km/h son 1,7 s, y cuesta arriba 2,5- y parado
  // no llegaba NINGUNA posicion. Lo pregunto el autor: «por que no graba
  // cada segundo?». Ahora una por segundo y sin filtro de distancia; lo que
  // se GUARDA se filtra mas abajo, al escribir.
  manager.requestLocationUpdates(LocationManager.GPS_PROVIDER,1000,0,this,Looper.getMainLooper());
  gpsArrancadoElapsed=SystemClock.elapsedRealtime();
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
  // Sin permiso, requestLocationUpdates lanza SecurityException. Antes se
  // tragaba la excepcion con «red» ya asignada, asi que esta funcion no
  // volvia a intentarlo nunca: la posicion por red se quedaba muerta para
  // siempre aunque luego concedieras el permiso.
  if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED
    && checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)!=PackageManager.PERMISSION_GRANTED){
   android.util.Log.w("TrabakutikGPS","Sin permiso para la ubicación por red");
   red=null;
   return;
  }
  try{manager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER,2000,5,red,Looper.getMainLooper());}
  catch(SecurityException ex){
   android.util.Log.w("TrabakutikGPS","Permiso de ubicación revocado al registrar red",ex);
   red=null;
  }catch(IllegalArgumentException ex){
   android.util.Log.w("TrabakutikGPS","Proveedor de ubicación por red no disponible",ex);
   red=null;
  }
 }
 void sueltaRed(){
  if(red==null)return;
  try{manager.removeUpdates(red);}catch(Exception ignored){}
  red=null;
 }
 void beginRecording() throws IOException {
  File dir=new File(getFilesDir(),"grabaciones");dir.mkdirs();
  String name=new SimpleDateFormat("yyyyMMdd-HHmmss",Locale.ROOT).format(new Date());
  // Dos grabaciones en el mismo segundo iban al mismo fichero y la segunda
  // borraba la primera. Como OsmAnd y OpenTracks: si ya existe, _2, _3...
  file=new File(dir,"trabakutik-"+name+".gpx");
  for(int n=2;file.exists();n++)file=new File(dir,"trabakutik-"+name+"_"+n+".gpx");
  errorGrabacion="";
  try(FileWriter w=new FileWriter(file)){w.write("<?xml version=\"1.0\" encoding=\"UTF-8\"?><gpx version=\"1.1\" creator=\"Trabakutik Android\" xmlns=\"http://www.topografix.com/GPX/1/1\"><trk><name>Grabacion</name><trkseg>\n");}
  lastRecordedTime=0;lastRecordedLat=Double.NaN;lastRecordedLon=Double.NaN;points=0;
  try(FileOutputStream reset=new FileOutputStream(new File(getFilesDir(),"trazado-vivo.tsv"),false)){}
  recording=true;getSharedPreferences("tracking_live",MODE_PRIVATE).edit().putBoolean("recording",true).remove("gasto").apply();
  arrancaBateria();
  updateNotice();
 }
 void loadRoute(){
  route.clear();routeReached=false;offRoute=false;farSince=0;cercaDesde=0;errorRuta="";
  metrics.configure(route,Collections.emptyList());
  metricsRouteKey=0;
  getSharedPreferences("tracking_live",MODE_PRIVATE).edit().remove("metrics").apply();
  File f=new File(getFilesDir(),"ruta-activa.json");
  if(!f.exists()){loadTurns();return;}
  // Los dos topes de antes -2 MB de fichero y 15.000 puntos- recortaban la
  // ruta sin decir nada: te ibas al monte navegando media ruta y creyendo
  // que la llevabas entera. Mejor no navegar que navegar a medias.
  if(f.length()>2000000){
   android.util.Log.e("TrabakutikGPS","Ruta de "+f.length()+" bytes, por encima del limite");
   errorRuta="Ruta demasiado grande para navegar";loadTurns();return;
  }
  try {
   byte[] raw=new byte[(int)f.length()];
   try(FileInputStream in=new FileInputStream(f)){int n=0,k;while(n<raw.length&&(k=in.read(raw,n,raw.length-n))>0)n+=k;}
   String routeJson=new String(raw,java.nio.charset.StandardCharsets.UTF_8);
   JSONArray pts=new JSONArray(routeJson);
   metricsRouteKey=routeJson.hashCode();
   if(pts.length()>15000)throw new IllegalArgumentException("Ruta con mas de 15000 puntos");
   for(int i=0;i<pts.length();i++){
    JSONArray p=pts.optJSONArray(i);if(p==null||p.length()<2)continue;
    double lat=p.optDouble(0,Double.NaN),lon=p.optDouble(1,Double.NaN);
    if(Double.isFinite(lat)&&Double.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180)
     route.add(new double[]{lat,lon,p.optDouble(2,Double.NaN)});
   }
  }catch(Exception ex){
   route.clear();
   android.util.Log.e("TrabakutikGPS","Ruta ilegible o incompleta",ex);
   errorRuta="No se pudo leer la ruta para navegar";
  }
  if(route.size()>1)metrics.configure(route,waterPoints());
  loadTurns();
 }
 List<NavigationMetrics.Water> waterPoints(){
  if(waterPoints!=null)return waterPoints;
  waterPoints=new ArrayList<>();
  // Catálogo de Trabakutik.com (Rutas-Mallabia, data/fuentes.json).
  try(InputStream input=getAssets().open("fuentes-gps.json");
      ByteArrayOutputStream bytes=new ByteArrayOutputStream()){
   byte[] buffer=new byte[4096];int read;
   while((read=input.read(buffer))!=-1)bytes.write(buffer,0,read);
   JSONArray rows=new JSONArray(new String(bytes.toByteArray(),java.nio.charset.StandardCharsets.UTF_8));
   for(int i=0;i<rows.length();i++){
    JSONArray point=rows.getJSONArray(i);
    waterPoints.add(new NavigationMetrics.Water(point.getString(1),point.getDouble(2),point.getDouble(3),point.getBoolean(4)));
   }
  }catch(IOException|JSONException e){android.util.Log.w("TrabakutikGPS","No se pudieron cargar las fuentes",e);}
  return waterPoints;
 }
 /** Tope de giros por ruta. Lo usa tambien el puente (setJunctions). */
 static final int GIROS_MAX=2000,GIROS_MAX_BYTES=200000;
 /** Lo que el puente escribe en giros-activos.json: la lista tal cual si
  *  cabe, y si no una vacia. Nunca «nada», que dejaba la de la ruta anterior. */
 static String girosQueCaben(String json,int cuantos){
  return cuantos<=GIROS_MAX&&json.length()<=GIROS_MAX_BYTES?json:"[]";
 }
 void loadTurns(){
  turns.clear();warnedTurns.clear();upcomingTurn="";
  File f=new File(getFilesDir(),"giros-activos.json");
  if(!f.exists())return;
  try{
   byte[] raw=new byte[(int)Math.min(f.length(),GIROS_MAX_BYTES)];
   try(FileInputStream in=new FileInputStream(f)){int n=0,k;while(n<raw.length&&(k=in.read(raw,n,raw.length-n))>0)n+=k;}
   JSONArray list=new JSONArray(new String(raw,java.nio.charset.StandardCharsets.UTF_8));
   for(int i=0;i<list.length()&&i<GIROS_MAX;i++){
    JSONObject p=list.optJSONObject(i);if(p==null)continue;
    int at=p.optInt("i",-1),direction=p.optInt("dir",0);
    // "t": 1 si es un CRUCE de verdad -nodo de OpenStreetMap con tres ramas o
    // mas-, 0 si es una curva de herradura y 2 si es un cruce en el que hay
    // que seguir por un lado sin apenas girar. No se dicen igual. Un APK
    // viejo guardaba ficheros sin "t"; por defecto cruce, que es el caso
    // normal. Un valor que no conozcamos se trata como cruce, nunca se tira
    // el giro: perder el matiz es barato, perder el aviso no.
    int tipo=p.optInt("t",1);
    if(tipo<0||tipo>2)tipo=1;
    // «h»:1, curva de herradura con su lado (la pagina desde noviembre de
    // 2026): se guarda como tipo 3 si es suelta y 4 si cae en un cruce.
    if(p.optInt("h",0)==1)tipo=tipo==0?3:4;
    // at>=1 y no >=0: checkTurns recorre la ruta desde i=1 y solo avanza por
    // la lista cuando el giro cae en ese punto, asi que un giro en el 0 no se
    // pasaria nunca y bloquearia TODOS los de detras. La pagina no genera
    // ninguno ahi (un giro necesita un punto antes), pero un fichero raro no
    // puede dejar la ruta muda.
    if(at>=1&&at<route.size()&&direction>=-1&&direction<=1)turns.add(new double[]{at,direction,tipo});
   }
   // Ordenados por el punto de la ruta al que pertenecen. El recorrido de
   // avisos va de i=1 hacia arriba y solo avanza mientras el giro que toca
   // caiga en ese mismo punto, asi que un giro con indice menor que el que
   // ya se ha pasado NO SE AVISA NUNCA. Los que calcula la pagina llegan en
   // orden, pero los de una ruta importada no tienen por que.
   java.util.Collections.sort(turns,(a,b)->Double.compare(a[0],b[0]));
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
 // La voz necesita MUCHO mas sitio que un pitido. Un pitido informa al
 // instante; una frase tarda dos o tres segundos en decirse, y para cuando
 // acaba ya estas en el cruce. El autor lo vio: «estaba diciendo que girara
 // dentro de 25 metros cuando ya estaba girando». 25 m a 10 km/h son nueve
 // segundos. Asi que la voz avisa aparte y antes: 18 segundos de margen, con
 // 60 m de suelo para ir despacio y 200 de techo para no avisar desde lejos.
 // El suelo estaba en 60 m, pensado para la bici. Andando a 4 km/h eso son
 // 54 segundos de antelacion: oyes «en 60 metros gira» y sigues andando casi
 // un minuto. El autor va ANDANDO, no en bici. Con 35 m quedan 32 s andando y
 // de 12 km/h para arriba no cambia nada, porque ahi manda ya el v*18.
 double avisoVoz(){double v=velocidadSuave>0?velocidadSuave:1.2;return Math.min(200,Math.max(35,v*18));}
 double avisoCorto(){double v=velocidadSuave>0?velocidadSuave:1.2;return Math.min(30,Math.max(8,v*3));}
 // Cual de los giros de la ventana es «el tuyo». Manda el que tienes
 // DELANTE y mas cerca; uno ya pasado solo gana si lo acabas de cruzar,
 // que es para lo que existe el suelo negativo de la ventana: que no se
 // pierda el pitido del propio cruce cuando el GPS da un salto de 17 m.
 // Penalizar los metros de atras por cuatro deja las dos cosas: a -5 m
 // gana al que viene a +75, y a -30 ya no le gana al que viene a +70.
 static double coste(double ahead){return ahead>=0?ahead:-ahead*4;}
 // EL CORTE ESTABA EN 22 m Y DEJABA AL AUTOR SIN AVISOS. Este mismo fichero,
 // unas lineas mas abajo, tiene medido que bajo arbolado 25-35 m de precision
 // es lo normal y que con el movil en el bolsillo son 20-45: o sea que con el
 // corte en 22 casi ninguna lectura pasaba, y los giros no se cantaban justo
 // donde mas falta hacen, con la pantalla apagada y el cielo tapado.
 //
 // Es el MISMO fallo que ya se arreglo en el aviso de fuera de ruta -donde
 // estaba medido que avisaba el 0,0% de las veces bajo arbolado, y lo conto
 // el autor: «al salirme de la ruta no me ha pitado ni me ha hablado»-. Alli
 // se subio a 60 y aqui se quedo en 22.
 //
 // 60 m es el mismo corte de cordura que usa checkDeviation y el mismo que
 // usa la pagina para esto. Por encima de eso la posicion es basura. Con 40 m
 // de error el «ahora» puede llegar unos metros antes o despues; callarse del
 // todo es peor.
 void checkTurns(Location l,NavigationMetrics.Projection position){
  if(!navigating||route.size()<2||turns.isEmpty()||!l.hasAccuracy()||l.getAccuracy()>60)return;
  if(offRoute||position.distance()>25){
   if(!upcomingTurn.isEmpty()){upcomingTurn="";updateNotice();}
   return;
  }
  double along=position.along();
  double d1=avisoLargo(),d2=avisoCorto(),dv=avisoVoz();
  // Haciendo la ruta al reves «along» decrece: sin el signo, los avisos
  // apuntaban a los cruces que ya habias pasado.
  String next="";
  int k=0,mejor=-1;double mejorAhead=0;
  for(int i=1;i<route.size();i++){
   double progress=metrics.distance[i];
   while(k<turns.size()&&(int)turns.get(k)[0]==i){
    double ahead=(progress-along)*sentido;
    // El suelo va con la velocidad, como el techo. Con los -7 m fijos de
    // antes el pitido del propio cruce se perdia: este GPS da una posicion
    // cada 1,5 s, 17 m de salto a 40 km/h, y la ventana de 7 m no la pisaba
    // ninguna lectura. Simulado con 10 arranques distintos: 5 de 10 a
    // 30 km/h, 5 de 10 a 40 y 3 de 10 a 50. Con -(d2+8), 10 de 10 siempre.
    if(ahead>=-(d2+8)&&ahead<=Math.max(d1,dv)+8
       &&(mejor<0||coste(ahead)<coste(mejorAhead))){
     mejor=k;mejorAhead=ahead;
    }
    k++;
   }
  }
  // UN SOLO giro por posicion. Anunciando todos los que caian en la
  // ventana, dos cruces seguidos sonaban pisados -«izquierda» y
  // «derecha» de una tirada- y no habia forma de saber cual era cual.
  // Se queda el que esta a unos 15 m, que es el que tienes delante.
  if(mejor>=0){
     double ahead=mejorAhead;
     double[] giro=turns.get(mejor);
     int d=(int)giro[1];
     int tipo=giro.length<3?1:(int)giro[2];
     boolean herradura=tipo>=3;
     boolean esCruce=tipo==1||tipo==2||tipo==4;
     // Al reves, lo que se grabo como derecha es izquierda.
     int lado=d*sentido;
     String instruction=lado<0?"Izquierda":lado>0?"Derecha":esCruce?"Da la vuelta":"Herradura";
     if(!esCruce&&lado!=0)instruction="Curva "+(lado<0?"izqda.":"dcha.");
     if(tipo==2&&lado!=0)instruction="Sigue "+(lado<0?"izqda.":"dcha.");
     if(herradura&&lado!=0)instruction="Herradura "+(lado<0?"izqda.":"dcha.");
     next=instruction+" en "+Math.max(0,Math.round(ahead/5)*5)+" m";
     // Tres avisos por cruce y cada fase suena una sola vez: 1 pitido a
     // 50 m, 2 a 10 m y 3 en el propio cruce. El numero es el dato, que
     // con la pantalla apagada es lo unico que hay. Cabe en la ventana de
     // arriba porque llega hasta 55 m.
     // El tramo del propio cruce va sin suelo por abajo: con -3 m el pitido
     // se perdia a la mitad de las velocidades, porque a 20 km/h esos 3 m
     // duran medio segundo y el GPS da una lectura por segundo. Lo acota ya
     // la ventana de fuera, que empieza en -7 m.
     // Fase "v": solo voz, y la primera de todas. Los pitidos siguen
     // exactamente donde estaban, que para eso van bien.
     String fase=ahead<=d1&&ahead>d2?"1":ahead<=d2&&ahead>0?"2":ahead<=0?"3"
       :ahead<=dv?"v":null;
     if(fase!=null){
      String clave=mejor+":"+fase;
      if(!warnedTurns.contains(clave)){
       warnedTurns.add(clave);
       if(!"v".equals(fase))pitidos(Integer.parseInt(fase),300);
       if("v".equals(fase)||"3".equals(fase)||("1".equals(fase)&&warnedTurns.add(mejor+":v")))
        habla(fraseGiro(lado,tipo,fase,ahead));
      }
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
 void pitidos(int n,int sep){pitidos(n,sep,ToneGenerator.TONE_PROP_BEEP);}
 // EL «TODO BIEN» TAMBIEN TIENE QUE SONAR. Lo conto el autor el 13 de
 // noviembre de 2026, saliendo de un tunel: «la perdida aviso, la recuperada
 // no creo, igual que no dijo cuando recupero ruta». La frase SI se decia
 // -lo prueba sin_senal_gps.py desde entonces-, pero iba sin pitidos
 // mientras que el aviso de perder la señal lleva dos y el de salirse de la
 // ruta lleva cuatro. En el coche, una frase corta sin nada que te haga
 // levantar la oreja se pierde entre el ruido: lo que te hace escuchar es el
 // pitido, y los avisos de vuelta eran lo unico mudo de la aplicacion.
 //
 // Suena distinto a proposito, y no con otro ritmo: las tandas de 1, 2, 3 y
 // 4 pitidos ya estan cogidas (giros y fuera de ruta) y una quinta no se
 // distingue conduciendo. TONE_PROP_ACK es el «ti-ti» de confirmacion, que
 // no se parece a una alarma, que es justo lo que hay que decir.
 void tonoBien(){pitidos(2,140,ToneGenerator.TONE_PROP_ACK);}
 void pitidos(int n,int sep,int tono){
  // Se relee del fichero, no del campo: el campo solo se cargaba al nacer
  // el servicio, asi que un cambio posterior no le llegaba y seguia
  // pitando con «Silencio» puesto. Lo dijo el autor.
  if("silencio".equals(modoAudio()))return;
  try{
   sueltaTono();pitidoHandler.removeCallbacksAndMessages(null);
   final ToneGenerator tone=new ToneGenerator(AudioManager.STREAM_MUSIC,90);
   tonoEnCurso=tone;
   for(int i=0;i<n;i++){
    final int delay=i*sep;
    pitidoHandler.postDelayed(()->{try{tone.startTone(tono,160);}catch(Exception ignored){}},delay);
   }
   pitidoHandler.postDelayed(this::sueltaTono,n*sep+500);
  }catch(Exception ignored){}
 }
 // «guiando» y «navigating» se escribian SOLO dentro de onLocationChanged.
 // Si dejan de llegar posiciones -y dejan de llegar en cuanto se para la
 // navegacion y no se graba- se quedaban viejos, y la pagina seguia creyendo
 // que el servicio guia. Se publican en el momento en que cambian.
 String updateNavigationMetrics(Location location,NavigationMetrics.Projection position,long now){
  double along=position.along();
  boolean moving=!pausado&&(!location.hasSpeed()||location.getSpeed()>=.5f);
  long eta=metrics.eta(along,sentido,location.getLatitude(),location.getLongitude(),
      location.getElapsedRealtimeNanos()/1_000_000L,moving);
  if(moving&&farSince==0&&upcomingTurn.isEmpty()&&now-lastImportantAudio>=8000&&!"silencio".equals(modoAudio())){
   NavigationMetrics.Notice notice=metrics.nextNotice(along,sentido);
   if(notice!=null){
    // OTRO TONO PARA LO QUE SOLO INFORMA. La subida era 1 pitido, igual que
    // «giro a 50 m», y la fuente 2 pitidos lentos, casi igual que «sin señal
    // GPS» (900 ms contra 700): en «solo pitidos» no se distinguian. Ahora
    // suben y fuentes suenan con TONE_PROP_PROMPT, un tono suave que no se
    // parece a los pitidos de giro ni al «ti-ti» de que todo va bien; siguen
    // siendo 1 (subida) y 2 (fuente) para distinguirlas entre si.
    pitidos(notice.beeps(),400,ToneGenerator.TONE_PROP_PROMPT);habla(notice.text());lastImportantAudio=now;
   }
  }
  try{
   JSONObject data=new JSONObject().put("key",metricsRouteKey).put("etaMs",eta);
   double gain=metrics.gain(along,sentido);
   if(Double.isFinite(gain))data.put("gain",gain);
   return data.toString();
  }catch(JSONException e){return "{}";}
 }
 void publicaEstado(){
  try{getSharedPreferences("tracking_live",MODE_PRIVATE).edit()
    .putBoolean("active",active).putBoolean("recording",recording)
    .putBoolean("navigating",navigating)
    .putBoolean("guiando",navigating&&route.size()>1)
    .putInt("giros",turns.size()).apply();}
  catch(Exception ignored){}
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
// EL SENTIDO LO DECIDE EL SERVICIO, NO LA PAGINA. Lo conto el autor el 13 de
 // noviembre de 2026: hizo al reves una ruta de ayer y le canto TODOS los
 // giros al lado contrario -«cuando era derecha me decia izquierda»-, con los
 // avisos cayendo en el sitio justo. El fallo lo metimos en la 4.9.17, al
 // dormir la pagina con la pantalla apagada para que no se comiera la
 // bateria: el sentido lo decidia la pagina y se lo mandaba por setSentido,
 // y una pagina dormida no decide nada, asi que el servicio se quedaba con
 // el +1 de salida y cantaba los giros tal como estaban grabados.
 //
 // Lo que no se puede volver a hacer: que algo que se oye con la pantalla
 // apagada dependa de que la pagina este despierta. El servicio ya tiene el
 // avance sobre la ruta -el mismo numero con el que elige los giros-, asi
 // que la cuenta es suya. Es la misma regla que la pagina, medida y escrita
 // en 07-servicio.js: NO se comparan rumbos, porque en una lazada el tramo
 // mas cercano puede ser el de vuelta y en 3 km daba ocho cambios falsos;
 // se miran los 30 m netos de avance, que el baile del GPS no los da.
 static final double AVANCE_DECIDE_M=30;
 double movSentido=Double.NaN,latSentido=Double.NaN,lonSentido=Double.NaN;
 /** decideSentido con lo que de verdad te has movido desde la anterior. */
 void decideSentido(double along,double lat,double lon){
  movSentido=Double.isFinite(latSentido)
    ?111195*Math.hypot(lat-latSentido,(lon-lonSentido)*Math.cos(Math.toRadians(lat))):Double.NaN;
  latSentido=lat;lonSentido=lon;
  decideSentido(along);
 }
 void decideSentido(double along){
  if(!Double.isFinite(along))return;
  if(!Double.isFinite(alongPrevio)){alongPrevio=along;return;}
  double paso=along-alongPrevio;alongPrevio=along;
  if(Math.abs(paso)>200)return;            // salto raro: no cuenta
  // NI UN AVANCE QUE NO TE HAS MOVIDO. Si sobre la ruta se avanza mucho mas
  // de lo que de verdad te has movido, es la proyeccion saltando de tramo -en
  // una curva, a la otra rama-, no tu: no cuenta. Visto con la grabacion del
  // autor del 14 de noviembre de 2026: un salto asi le dio 31 s de «vas en
  // sentido inverso», con los lados de los giros cambiados mientras durara.
  if(Double.isFinite(movSentido)&&Math.abs(paso)>2*movSentido+10)return;
  alongAcum=sentido>0?Math.min(0,alongAcum+paso):Math.max(0,alongAcum+paso);
  if(Math.abs(alongAcum)<AVANCE_DECIDE_M)return;
  int nuevo=alongAcum>0?1:-1;alongAcum=0;
  ponSentido(nuevo);
 }
 // Solo cuando cambia DE VERDAD: limpiando warnedTurns en cada posicion, los
 // giros ya avisados volvian a avisarse una y otra vez.
 void ponSentido(int s){
  if(s==sentido)return;
  sentido=s;warnedTurns.clear();upcomingTurn="";
  habla(sentido<0?"Vas en sentido inverso, los giros van corregidos"
    :"Vuelves al sentido de la ruta");
 }
 // Al cambiar de ruta, callando: «vuelves al sentido de la ruta» en una ruta
 // que acabas de cargar no quiere decir nada.
 void olvidaSentido(){sentido=1;alongPrevio=Double.NaN;alongAcum=0;latSentido=Double.NaN;lonSentido=Double.NaN;movSentido=Double.NaN;}
 void vuelveALaRuta(){offRoute=false;cercaDesde=0;updateNotice();tonoBien();habla("De nuevo en la ruta");}
 void checkDeviation(Location l){
  if(!navigating||route.size()<2||!l.hasAccuracy()){farSince=0;cercaDesde=0;return;}
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
   routeReached=true;farSince=0;
   if(offRoute)vuelveALaRuta();
   return;
  }
  if(!routeReached)return;
  // LA FRANJA MUERTA. El aviso de salir pide pasar de acc+7 y el de volver
  // pedia bajar de acc+4, y entre los dos no pasaba nada: volviendo a la
  // ruta y quedandote ahi -lo normal cuando el track se grabo por el otro
  // lado del camino, o del carril- te quedabas «fuera de ruta» para siempre,
  // sin que te lo dijera y, peor, sin avisos de giro, que checkTurns se
  // calla estando fuera. Lo conto el autor: «al volver no me ha indicado que
  // entra en ruta, solo al salir». Ahora la franja tambien devuelve, con los
  // mismos 4 s que saca: cuatro segundos fuera para avisar, cuatro dentro
  // para volver, y asi el baile del GPS en el borde no enciende y apaga.
  if(d<=Math.max(15,acc+7)){
   farSince=0;
   if(offRoute){
    if(cercaDesde==0)cercaDesde=SystemClock.elapsedRealtime();
    else if(SystemClock.elapsedRealtime()-cercaDesde>=4000)vuelveALaRuta();
   }
   return;
  }
  cercaDesde=0;
  if(farSince==0){farSince=SystemClock.elapsedRealtime();return;}
  // 800 ms a 1,5 s por lectura significa DOS lecturas: basta un par de
  // saltos del GPS para dar la alarma. En el bolsillo, con el cuerpo
  // tapando el cielo y 20-45 m de precision, eso son 2,2 falsos avisos
  // por hora -el autor lo sufrio-. Con 4 s hacen falta cuatro lecturas
  // seguidas fuera: simulado, 0,0 falsos por hora, y un desvio de
  // verdad se detecta a 104 m en vez de a 86. Barato.
  if(!offRoute&&SystemClock.elapsedRealtime()-farSince>=4000){
   offRoute=true;updateNotice();pitidos(4,180);habla("Atención, fuera del recorrido");
  }
 }
 static final long MAX_EDAD_FIX_NS=10_000_000_000L;
 boolean esAntigua(Location l){
  long t=l.getElapsedRealtimeNanos();
  return t>0&&SystemClock.elapsedRealtimeNanos()-t>MAX_EDAD_FIX_NS;
 }
 @Override public void onLocationChanged(Location l){
  if(!active)return;
  // Posicion vieja: Android puede entregar una posicion guardada de hace
  // rato. Si tiene mas de 10 s no vale ni para guiar ni para grabar.
  if(esAntigua(l))return;
  if(LocationManager.GPS_PROVIDER.equals(l.getProvider())){ultimoFixGpsElapsed=SystemClock.elapsedRealtime();if(red!=null)sueltaRed();}
  actualizaVelocidad(l);
  if(recording&&!pausado)bateriaFixes++;
  String liveMetrics="{}";
  if(navigating&&route.size()>1){
   boolean wasOff=offRoute;
   int previousWarnings=warnedTurns.size();
   checkDeviation(l);
   if(l.hasAccuracy()&&l.getAccuracy()<=60){
    NavigationMetrics.Projection position=metrics.project(l.getLatitude(),l.getLongitude(),sentido,l.getAccuracy()<=35&&!offRoute);
    // Antes de los giros, que el lado de este mismo aviso ya salga bien.
    if(!offRoute&&l.getAccuracy()<=35&&position.distance()<=30)decideSentido(position.along(),l.getLatitude(),l.getLongitude());
    checkTurns(l,position);
    long now=SystemClock.elapsedRealtime();
    if(wasOff!=offRoute||previousWarnings!=warnedTurns.size())lastImportantAudio=now;
    if(!offRoute&&position.distance()<=30&&l.getAccuracy()<=35){
     liveMetrics=updateNavigationMetrics(l,position,now);
    }else metrics.pausePace();
   }else metrics.pausePace();
  }
  getSharedPreferences("tracking_live",MODE_PRIVATE).edit().putString("metrics",liveMetrics).putFloat("lat",(float)l.getLatitude()).putFloat("lon",(float)l.getLongitude()).putFloat("accuracy",l.hasAccuracy()?l.getAccuracy():9999f).putLong("time",l.getTime()).putFloat("bearing",l.hasBearing()?l.getBearing():-1f).putFloat("speed",l.hasSpeed()?l.getSpeed():-1f).putLong("latBits",Double.doubleToRawLongBits(l.getLatitude())).putLong("lonBits",Double.doubleToRawLongBits(l.getLongitude())).putBoolean("active",active).putBoolean("recording",recording).putBoolean("navigating",navigating).putBoolean("guiando",navigating&&route.size()>1).putInt("giros",turns.size()).apply();
  if(!recording||pausado||!l.hasAccuracy()||l.getAccuracy()>35)return;
  // Con una posicion por segundo y sin filtro de distancia, parado el GPS
  // deja un nido de puntos de puro ruido. Se guarda si te has movido 1,5 m
  // o si han pasado 4 s, asi que una parada queda registrada -un punto cada
  // cuatro segundos- sin ensuciar el trazado.
  if(lastRecordedTime>0&&Double.isFinite(lastRecordedLat)&&!forzarCorte
     &&l.getTime()-lastRecordedTime<4000&&l.distanceTo(makePreviousLocation())<1.5)return;
  try(FileWriter w=new FileWriter(file,true)){
   SimpleDateFormat fmt=new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'",Locale.US);
   fmt.setTimeZone(TimeZone.getTimeZone("UTC"));
   String time=fmt.format(new Date(l.getTime()));
   boolean corta=cortaTrack(forzarCorte,lastRecordedTime>0,l.getTime()-lastRecordedTime,
     Double.isFinite(lastRecordedLat)?l.distanceTo(makePreviousLocation()):0);
   if(corta&&lastRecordedTime>0)w.write("</trkseg><trkseg>\n");
   w.write("<trkpt lat=\""+l.getLatitude()+"\" lon=\""+l.getLongitude()+"\">"+(l.hasAltitude()?"<ele>"+l.getAltitude()+"</ele>":"")+"<time>"+time+"</time></trkpt>\n");
   // El MISMO corte que el GPX, «corta», y no una copia de la condicion sin
   // forzarCorte. Al reanudar una pausa se enciende forzarCorte: el GPX abria
   // tramo nuevo y el trazado de la pantalla no, asi que si parabas y seguias
   // en menos de 20 s y 100 m la linea roja unia el descanso con una recta.
   try(FileWriter pointsFile=new FileWriter(new File(getFilesDir(),"trazado-vivo.tsv"),true)){if(corta&&lastRecordedTime>0)pointsFile.write("\n");pointsFile.write(l.getLatitude()+"\t"+l.getLongitude()+"\n");}
   if(!corta&&lastRecordedTime>0&&Double.isFinite(lastRecordedLat))bateriaMetros+=l.distanceTo(makePreviousLocation());
   lastRecordedTime=l.getTime();lastRecordedLat=l.getLatitude();lastRecordedLon=l.getLongitude();
   forzarCorte=false;
   points++;if(points%10==0)updateNotice();
   if(!errorGrabacion.isEmpty()){errorGrabacion="";updateNotice();}
  }catch(Exception ex){
   android.util.Log.e("TrabakutikGPS","No se pudo escribir el punto en el GPX",ex);
   if(errorGrabacion.isEmpty()){
    errorGrabacion="ERROR guardando GPX · comprueba el espacio libre";
    updateNotice();
   }
  }
 }
 // CORTAR EL TRACK SOLO CUANDO EL HUECO NO SE PUEDE HABER RECORRIDO. El
 // corte dice «aqui falta trozo» y pone el aviso de «el track tiene cortes»;
 // si salta por nada, el aviso deja de valer.
 //
 // Los 100 m fijos cortaban en coche. En el GPX del autor del 13 de
 // noviembre de 2026 -22 min, 20,4 km- salen DOS cortes y solo uno es de
 // verdad: el bueno son 78 s y 1.911 m sin posicion, un tunel; el falso son
 // 8 s y 177 m, que a 80 km/h es el coche yendo normal. 100 m a 80 km/h se
 // hacen en cuatro segundos y medio, asi que cualquier tropiezo del GPS en
 // carretera partia el track.
 //
 // La regla pasa a ser la de siempre en esta casa: por tiempo, no por
 // metros. Se corta si el hueco pasa de 20 s, o si el salto no cabe en el
 // tiempo que ha pasado. 40 m/s son 144 km/h, mas que cualquier carretera de
 // aqui; y el suelo de 100 m deja fuera los teletransportes del GPS parado o
 // andando, donde un salto asi nunca es un paseo.
 static final double VEL_IMPOSIBLE=40;
 static boolean cortaTrack(boolean forzar,boolean hayAnterior,long huecoMs,double salto){
  if(forzar)return true;
  if(!hayAnterior)return false;
  if(huecoMs>20000)return true;
  return salto>100&&salto>VEL_IMPOSIBLE*(huecoMs/1000.0);
 }
 Location makePreviousLocation(){Location p=new Location(LocationManager.GPS_PROVIDER);p.setLatitude(lastRecordedLat);p.setLongitude(lastRecordedLon);return p;}
 void endRecording(){
  if(!recording)return;
  try(FileWriter w=new FileWriter(file,true)){w.write("</trkseg></trk></gpx>\n");}
  catch(Exception e){android.util.Log.e("TrabakutikGPS","No se pudo cerrar GPX",e);}
  apuntaBateria(true);
  int gastado=bateriaInicio>=0&&bateriaNivel>=0?bateriaInicio-bateriaNivel:GASTO_SIN_LEER;
  gastoUltimo=textoGasto(SystemClock.elapsedRealtime()-bateriaDesde,gastado,bateriaMetros,bateriaFixes,bateriaCargando);
  escribeBateria("# termina · "+gastoUltimo);
  bateriaDesde=0;
  recording=false;
  getSharedPreferences("tracking_live",MODE_PRIVATE).edit().putBoolean("recording",false).putString("gasto",gastoUltimo).apply();
 }
 void finish(){navigating=false;route.clear();getSharedPreferences("tracking_live",MODE_PRIVATE).edit().putBoolean("active",false).putBoolean("recording",false).putBoolean("navigating",false).putBoolean("guiando",false).apply();sueltaRed();if(active){manager.removeUpdates(this);active=false;}if(gpsWakeLock!=null&&gpsWakeLock.isHeld())gpsWakeLock.release();endRecording();ACTIVO=false;stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();}
 @Override public void onDestroy(){avisoHandler.removeCallbacks(refrescaAviso);callaYa();if(voz!=null){try{voz.stop();voz.shutdown();}catch(Exception ignored){}voz=null;vozLista=false;}if(active||recording)finish();ACTIVO=false;super.onDestroy();}
}
