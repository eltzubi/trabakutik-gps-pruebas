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
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.telephony.SmsManager;
public class TrackingService extends Service implements LocationListener {
 LocationManager manager;PowerManager.WakeLock gpsWakeLock;LocationListener red=null;File file;boolean entradaAvisada=false;boolean recording=false,navigating=false,active=false,routeReached=false,offRoute=false;int points=0;long lastRecordedTime=0;double lastRecordedLat=Double.NaN,lastRecordedLon=Double.NaN;long farSince=0,lastNotice=0;double velocidadSuave=0;final ArrayList<double[]> route=new ArrayList<>();final ArrayList<double[]> turns=new ArrayList<>();final ArrayList<double[]> turnsReves=new ArrayList<>();boolean hayReves=false;final HashSet<String> warnedTurns=new HashSet<>();String upcomingTurn="";int sentido=1;double alongPrevio=Double.NaN,alongAcum=0;long cercaDesde=0;boolean pausado=false,forzarCorte=false;long ultimoFixGpsElapsed=0;String ultimoEstadoAviso="";boolean sinGpsAvisado=false;final Handler pitidoHandler=new Handler(Looper.getMainLooper());ToneGenerator tonoEnCurso=null;String errorGrabacion="",errorRuta="";TextToSpeech voz=null;boolean vozLista=false;String audioModo="voz";String vozEstado="iniciando";final Handler avisoHandler=new Handler(Looper.getMainLooper());
 final NavigationMetrics metrics=new NavigationMetrics();
 List<NavigationMetrics.Water> waterPoints;
 int metricsRouteKey;
 long lastImportantAudio=Long.MIN_VALUE/2;
 double climbRejoinAlong=Double.NaN;
 int climbRejoinDirection;
 long climbRejoinTime;
 final String channel="trabakutik-grabacion";
 /** Hay un servicio vivo en este proceso. Es estatica a proposito: si Android
  *  mata el proceso, vuelve sola a false, que es lo que hace falta para saber
  *  que una grabacion quedo a medias. */
 public static volatile boolean ACTIVO=false;
 // El fichero que se esta grabando ahora (solo el nombre), para que «Mis
 // rutas» no deje borrarlo. null si no se graba.
 public static volatile String GRABANDO=null;
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
 @Override public void onCreate(){super.onCreate();manager=(LocationManager)getSystemService(LOCATION_SERVICE);audioModo=getSharedPreferences("tracking_live",MODE_PRIVATE).getString("audioModo","voz");arrancaVoz();((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(new NotificationChannel(channel,"Grabación de rutas",NotificationManager.IMPORTANCE_LOW));creaCanalCaida();avisoHandler.postDelayed(refrescaAviso,5000);}
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
 String avisoRutaPendiente=null;
 void entregaAvisoRutaPendiente(){
  String pendiente=avisoRutaPendiente;avisoRutaPendiente=null;
  if(pendiente!=null&&navigating&&"voz".equals(modoAudio())){protegeAvisoRuta();habla(pendiente);}
 }
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
     vozLista=true;apuntaVoz("ok");entregaAvisoRutaPendiente();
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
  if(!"voz".equals(modoAudio())||texto==null)return;
  // Normalmente manda el aviso nuevo. Tras entrar, salir o volver, el giro
  // se encola: no corta el estado de ruta ni se pierde la indicacion.
  boolean estadoRuta=texto.equals("Ya estás en la ruta")||texto.equals("De nuevo en la ruta")||texto.equals("Atención, fuera del recorrido")||texto.equals("Sigues fuera del recorrido")||texto.startsWith("La salida de la ruta está a ");
  // El primer fix puede llegar antes de que Android prepare la voz.
  // Solo se conserva el ultimo estado: nunca se reproduce una salida vieja.
  if(!vozLista||voz==null){if(estadoRuta)avisoRutaPendiente=texto;return;}
  if(estadoRuta)avisoRutaPendiente=null;
  int cola=!estadoRuta&&SystemClock.elapsedRealtime()<avisoRutaHasta?TextToSpeech.QUEUE_ADD:TextToSpeech.QUEUE_FLUSH;
  try{voz.speak(texto,cola,null,"trabakutik");}catch(Exception ignored){}
 }
 void hablaGiro(String instruccion,String siguiente){
  habla(instruccion);
  if(siguiente.isEmpty()||!"voz".equals(modoAudio())||!vozLista||voz==null)return;
  try{
   int cola=TextToSpeech.QUEUE_ADD;
   if(voz.playSilentUtterance(2500,cola,"pausa-siguiente-giro")==TextToSpeech.SUCCESS)
    voz.speak(siguiente,cola,null,"siguiente-giro");
  }catch(Exception ignored){}
 }
 // CALLAR AHORA MISMO, no «a partir de ahora». Antes el modo se miraba solo
 // al empezar a hablar o a pitar, asi que al poner silencio la frase que ya
 // estaba sonando terminaba de decirse y los pitidos de esa tanda seguian
 // saliendo uno detras de otro.
 void callaYa(){
  avisoRutaPendiente=null;
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
 // EL BAROMETRO, mientras se graba: lo subido y lo bajado de TU salida,
 // tambien fuera de la ruta (AlturaBarometrica). Se pide una lectura por
 // segundo con hasta 10 s de lote, que el chip las junta y gasta casi nada.
 // Sin barometro no pasa nada: la pagina cuenta con el perfil de la ruta.
 final AvisoLlegada llegada=new AvisoLlegada();
 // El tiempo en movimiento de la salida (TiempoEnMarcha), para el panel de abajo.
 final TiempoEnMarcha enMarcha=new TiempoEnMarcha();
 // LA ALTITUD DEL GPS, SOBRE EL NIVEL DEL MAR (17 nov 2026). El autor, a
 // 157 m de la ruta y con satelites: «no me marca la altitud». La ficha la
 // sacaba solo del perfil de la ruta. getAltitude() es sobre el ELIPSOIDE,
 // no sobre el mar: aqui da unos 50 m de mas. Android 14 trae un modelo del
 // geoide sin conexion (AltitudeConverter); la conversion lee ese modelo y
 // puede tardar, asi que va en su propio hilo y la pagina recibe la ultima.
 // En un Android anterior no se da: mejor «—» que 50 m de error.
 final java.util.concurrent.ExecutorService hiloAltura=java.util.concurrent.Executors.newSingleThreadExecutor();
 Object conversorAltura=null;
 // Revision con GPT: la altura sobre el mar, su error, su hora y la
 // ondulacion del geoide (elipsoide menos mar) van JUNTOS en un objeto que no
 // cambia -antes, sueltos, podian mezclar una altura nueva con el error de la
 // anterior-; como mucho UNA conversion en marcha -antes se encolaba una por
 // posicion, sin limite-; y si el conversor falla, o en 30 s no ha dado
 // ninguna, el GPX se graba como antes en vez de quedarse sin alturas.
 static final class Altura{final double mar,ondulacion;final float error;final long tiempo;Altura(double m,double o,float e,long t){mar=m;ondulacion=o;error=e;tiempo=t;}}
 volatile Altura ultimaAltura=null;
 volatile boolean conversorRoto=false;
 // 0 sin decidir, 1 corregido, 2 en bruto: el del GPX de la grabacion en curso.
 final java.util.concurrent.atomic.AtomicInteger modoEle=new java.util.concurrent.atomic.AtomicInteger(0);
 long primerIntentoAltura=0;
 final java.util.concurrent.atomic.AtomicBoolean convirtiendo=new java.util.concurrent.atomic.AtomicBoolean(false);
 // EL <ele> DEL GPX, SOBRE EL NIVEL DEL MAR (17 nov 2026). Antes se escribia
 // getAltitude(), sobre el elipsoide: las grabaciones salian unos 50 m altas
 // (un pico de 800 se veia de 850 en Wikiloc o Strava). La ondulacion cambia
 // unos metros en decenas de km: se resta la de la ultima conversion. Hasta
 // tenerla (el primer segundo), el punto va sin altura antes que con una
 // equivocada. En un Android anterior al 14, o con el conversor roto, como
 // siempre: no hay modelo del geoide y no se inventa una cifra.
 String eleGpx(Location l){
  if(!l.hasAltitude())return "";
  if(Build.VERSION.SDK_INT<34)return String.valueOf(l.getAltitude());
  // EL MODO SE DECIDE UNA VEZ POR GRABACION (revision con GPT, rondas 2 y 3):
  // o todo el GPX corregido o todo en bruto, sin escalones de 50 m. Corregido
  // en cuanto hay una ondulacion (y se sigue usando la ultima aunque fallen
  // las siguientes: cambia unos metros en decenas de km); en bruto si el
  // conversor falla o tarda mas de 30 s antes de dar la primera. Una
  // conversion que llegue despues de decidir «en bruto» ya no lo cambia.
  Altura a=ultimaAltura;
  if(modoEle.get()==0){
   if(a!=null)modoEle.compareAndSet(0,1);
   else if(conversorRoto)modoEle.compareAndSet(0,2);
  }
  int m=modoEle.get();
  if(m==2)return String.valueOf(l.getAltitude());
  if(m==1&&a!=null)return String.format(java.util.Locale.ROOT,"%.1f",l.getAltitude()-a.ondulacion);
  return "";   // aun sin decidir (el primer segundo): sin altura antes que equivocada
 }
 void convierteAltura(Location l){
  if(!l.hasAltitude()||Build.VERSION.SDK_INT<34||(conversorRoto&&ultimaAltura==null))return;
  if(primerIntentoAltura==0)primerIntentoAltura=SystemClock.elapsedRealtime();
  if(ultimaAltura==null&&SystemClock.elapsedRealtime()-primerIntentoAltura>30_000L){conversorRoto=true;return;}
  if(!convirtiendo.compareAndSet(false,true))return;
  final Location copia=new Location(l);
  try{hiloAltura.execute(()->{
   try{
    if(conversorAltura==null)conversorAltura=new android.location.altitude.AltitudeConverter();
    ((android.location.altitude.AltitudeConverter)conversorAltura).addMslAltitudeToLocation(TrackingService.this,copia);
    if(copia.hasMslAltitude()){
     double mar=copia.getMslAltitudeMeters();
     float err=copia.hasMslAltitudeAccuracy()?copia.getMslAltitudeAccuracyMeters():(copia.hasVerticalAccuracy()?copia.getVerticalAccuracyMeters():-1f);
     ultimaAltura=new Altura(mar,copia.getAltitude()-mar,err,copia.getTime());
    }
   }catch(Throwable t){if(ultimaAltura==null)conversorRoto=true;}
   finally{convirtiendo.set(false);}
  });}catch(Exception e){convirtiendo.set(false);}
 }
 final AlturaBarometrica baro=new AlturaBarometrica();
 SensorManager baroSm=null;long baroGuardado=0,baroUltimaHora=0;
 final SensorEventListener oyenteBaro=new SensorEventListener(){
  @Override public void onSensorChanged(SensorEvent e){
   if(e==null||e.values==null||e.values.length<1)return;
   // La hora de la lectura va en el reloj desde el arranque, el mismo que
   // SystemClock.elapsedRealtime(): asi la pausa se compara bien.
   baro.muestra(e.values[0],e.timestamp/1_000_000L);
   baroUltimaHora=System.currentTimeMillis();
   long ahora=SystemClock.elapsedRealtime();
   if(ahora-baroGuardado>=5000){baroGuardado=ahora;guardaBaro();}
  }
  @Override public void onAccuracyChanged(Sensor s,int a){}
 };
 void guardaBaro(){
  try{getSharedPreferences("tracking_live",MODE_PRIVATE).edit()
    .putBoolean("baro",baroSm!=null&&baro.muestras>0)
    .putFloat("baroSube",(float)baro.sube).putFloat("baroBaja",(float)baro.baja)
    // La hora de la ultima lectura: si deja de llegar, la pagina lo marca.
    .putLong("baroT",baroUltimaHora).apply();}
  catch(Exception ignored){}
 }
 void arrancaBaro(){
  paraBaro();
  baro.reinicia();baroGuardado=0;baroUltimaHora=0;
  try{
   SensorManager sm=(SensorManager)getSystemService(SENSOR_SERVICE);
   Sensor s=sm==null?null:sm.getDefaultSensor(Sensor.TYPE_PRESSURE);
   if(s!=null&&sm.registerListener(oyenteBaro,s,1_000_000,10_000_000))baroSm=sm;
  }catch(Exception e){android.util.Log.w("TrabakutikGPS","Sin barometro",e);baroSm=null;}
  guardaBaro();
 }
 void paraBaro(){
  if(baroSm==null)return;
  try{baroSm.unregisterListener(oyenteBaro);}catch(Exception ignored){}
  guardaBaro();
  baroSm=null;
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
 // DOS GIROS MUY SEGUIDOS SE DICEN JUNTOS. Si el siguiente esta a menos de
 // SEGUIDO_M, al decir este se añade «y enseguida a la izquierda»: si no, el
 // segundo llegaba cuando ya estabas en el, o se te pasaba. Lo hace Locus
 // («dos giros a la vez») y lo piden los estudios de navegacion a pie. Lo
 // decidio el autor el 15 de noviembre de 2026.
 static final double SEGUIDO_M=30;
 String giroSeguido(ArrayList<double[]> turns,int actual,boolean usaReves){
  if(actual<0||actual>=turns.size())return "";
  double aqui=metrics.distance[(int)turns.get(actual)[0]];
  int sig=-1;double mejor=Double.POSITIVE_INFINITY;
  for(int k=0;k<turns.size();k++){
   if(k==actual)continue;
   int i=(int)turns.get(k)[0];if(i<0||i>=metrics.distance.length)continue;
   double hasta=(metrics.distance[i]-aqui)*sentido;
   if(hasta>0.5&&hasta<mejor){mejor=hasta;sig=k;}
  }
  if(sig<0||mejor>SEGUIDO_M)return "";
  int d=(int)turns.get(sig)[1],lado=usaReves?d:d*sentido;
  if(lado==0)return "";
  return " y enseguida a la "+(lado<0?"izquierda":"derecha");
 }
 String siguienteManiobra(ArrayList<double[]> turns,int actual,boolean usaReves,double along){
  double origen=metrics.distance[(int)turns.get(actual)[0]];
  double distancia=Double.POSITIVE_INFINITY;
  int tipoSiguiente=0;
  for(double[] giro:turns){
   int tipo=giro.length<3?1:(int)giro[2];
   if(tipo==5&&giro.length>4&&giro[4]==1&&(giro[3]==0||(sentido<0&&!usaReves)))continue;
   double progreso=metrics.distance[(int)giro[0]];
   if((progreso-origen)*sentido<=0.5)continue;
   double quedan=(progreso-along)*sentido;
   if(quedan>0.5&&quedan<distancia){distancia=quedan;tipoSiguiente=tipo;}
  }
  if(!Double.isFinite(distancia)||distancia<=SEGUIDO_M)return "";
  String maniobra=tipoSiguiente==5?"Siguiente rotonda":tipoSiguiente==0||tipoSiguiente==3?"Siguiente curva":"Siguiente cruce";
  long metros=Math.max(1,Math.round(distancia/10)*10);
  if(metros<1000)return maniobra+" a "+metros+(metros==1?" metro":" metros");
  double km=Math.round(metros/100.0)/10.0;
  String cantidad=km==Math.floor(km)?Long.toString((long)km):Double.toString(km).replace('.',',');
  return maniobra+" a "+cantidad+(km==1?" kilómetro":" kilómetros");
 }
 static final String[] ORDINALES={"","primera","segunda","tercera","cuarta","quinta","sexta","séptima","octava"};
 String fraseGiro(int lado,int tipo,String fase,double ahead,int salida){
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
  // tipo 6: SIGUE LA MISMA VIA, que tuerce en un cruce; «salida» trae la
  // clase de via (1 carretera, 2 calle, 3 camino).
  // tipo 5: ROTONDA. La pagina la cuenta como un solo cruce (lo que importa
  // es por donde entras y por donde sales) y aqui se dice como lo pidio el
  // autor el 15 de noviembre de 2026: «sal a la derecha». Cruzarla recto no
  // llega nunca: ahi no se dice nada. Va antes que la herradura, que tambien
  // es «tipo>=3».
  if(tipo==5){
   // Con el numero de la salida, «toma la segunda salida» (lo pidio el autor
   // el 16 de noviembre de 2026: la segunda, yendo recto, no se decia).
   String r=salida>=1&&salida<ORDINALES.length?"en la rotonda, toma la "+ORDINALES[salida]+" salida"
    :lado==0?"en la rotonda, da la vuelta":"en la rotonda, sal a la "+(lado<0?"izquierda":"derecha");
   if("3".equals(fase))return Character.toUpperCase(r.charAt(0))+r.substring(1)+" ahora";
   return "En "+Math.max(5,(int)(Math.round(ahead/10.0)*10))+" metros, "+r;
  }
  if(tipo==6&&lado!=0){
   // Sigues por la misma via y tuerce donde sale otra de frente: no es
   // «cruce a la izquierda», que suena a dejarla (el autor, 17 nov 2026).
   // Desde el mismo dia se dice «gira»: las frases dicen que hacer, no que
   // hay (lo pidio el autor). La clase de via se sigue guardando.
   String h="gira a la "+(lado<0?"izquierda":"derecha");
   if("3".equals(fase))return Character.toUpperCase(h.charAt(0))+h.substring(1)+" ahora";
   return "En "+Math.max(5,(int)(Math.round(ahead/10.0)*10))+" metros, "+h;
  }
  if((tipo==3||tipo==4)&&lado!=0){
   String h="curva de herradura a la "+(lado<0?"izquierda":"derecha");
   if("3".equals(fase))return Character.toUpperCase(h.charAt(0))+h.substring(1)+" ahora";
   return "En "+Math.max(5,(int)(Math.round(ahead/10.0)*10))+" metros, "+h;
  }
  // Sin lado, desde noviembre de 2026, solo llega una IDA Y VUELTA por el
  // mismo camino: ahi si hay que dar la vuelta.
  boolean esCruce=tipo!=0;
  String hacia=tipo==2
   // «SIGUE RECTO POR LA DERECHA» y no «sigue por la derecha»: el autor lo
   // oyo 45 m antes de una carretera que salia a la derecha (hacia Mallabia) y
   // se podia entender como «gira ahi». Con «recto» queda claro que no hay
   // giro, solo coger el ramal de ese lado. Lo propuso el 16 nov 2026.
   // Sin «recto» si la tuya no es la mas recta (salida==1): el autor, con una
   // carretera recta a la derecha que no era la suya, «lo de recto sobra».
   ?(salida==1?(lado<0?"sigue por la izquierda":"sigue por la derecha")
    :(lado<0?"sigue recto por la izquierda":"sigue recto por la derecha"))
   :lado==0
   ?"da la vuelta"
   // «GIRA», NO «CRUCE» (17 nov 2026). El autor: «se quita la palabra cruce
   // y se deja en todo gira a la derecha, gira a la izquierda o sigue recto;
   // asi no hay equivocacion». Donde la pagina ve un cruce de verdad se dice
   // que hacer; en una curva suelta, «curva cerrada».
   :esCruce?(lado<0?"gira a la izquierda":"gira a la derecha")
           :(lado<0?"curva cerrada a la izquierda":"curva cerrada a la derecha");
  if("3".equals(fase))return Character.toUpperCase(hacia.charAt(0))+hacia.substring(1)+" ahora";
  // La distancia de VERDAD, no el umbral: decia «en 200 metros» estando a 170.
  return "En "+Math.max(5,(int)(Math.round(ahead/10.0)*10))+" metros, "+hacia;
 }
 // Sin numero de salida: lo de siempre.
 String fraseGiro(int lado,int tipo,String fase,double ahead){return fraseGiro(lado,tipo,fase,ahead,0);}
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
  // EL AVISO DE CAIDA. Los dos botones de la cuenta atras, la prueba y el
  // cambio de ajustes (contactos o activado). Si el servicio solo estaba
  // vivo para la prueba, al acabar se para (ver terminaCaida).
  if("CAIDA_BIEN".equals(action)){terminaCaida(false);return START_NOT_STICKY;}
  if("CAIDA_ENVIA".equals(action)){terminaCaida(true);return START_NOT_STICKY;}
  if("CAIDA_PRUEBA".equals(action)){disparaCaida(true);return START_NOT_STICKY;}
  if("CAIDAS_AJUSTES".equals(action)){
   // Apagar el aviso con una cuenta atras en marcha la cancela: si no,
   // salia el SOS igual (lo vio la revision con GPT).
   if(caidaEnCurso&&!prefsSos().getBoolean("caidas_activo",true))terminaCaida(false);
   if(active){paraCaidas();arrancaCaidas();}
   else if(!caidaEnCurso)stopSelf();
   return START_NOT_STICKY;
  }
  if("STOP_NAVIGATION".equals(action)){
   navigating=false;avisoRutaPendiente=null;entradaAvisada=false;routeReached=false;offRoute=false;farSince=0;cercaDesde=0;ultimoDesvio=0;fueraDesde=0;recordado=false;olvidaSentido();
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
  if("PAUSE".equals(action)){pausado=true;enMarcha.pausa();baro.pausa(SystemClock.elapsedRealtime());metrics.pausePace();if(active)updateNotice();return START_NOT_STICKY;}
  if("RESUME".equals(action)){
   pausado=false;forzarCorte=true;    // que el descanso no salga como una recta
   baro.sigue(SystemClock.elapsedRealtime()); // lo medido en pausa no cuenta
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

 // ===== EL AVISO DE CAIDA =====
 // Lo pidio el autor el 15 de noviembre de 2026, con la idea de Garmin: un
 // golpe fuerte estando en marcha y quedarse quieto (DetectorCaidas), una
 // alarma con cuenta atras de 30 s, y si nadie la para, un SMS con la
 // posicion a los contactos que haya metido el usuario (ContactosSos). Va
 // en el servicio porque tiene que funcionar con la pantalla apagada, y solo
 // mientras se graba o se navega. Activado de serie, pero sin contactos no
 // arranca: no habria a quien avisar.
 static final String CANAL_CAIDA="caida";
 static final int NOTIF_CAIDA=7,NOTIF_CAIDA_FIN=8;
 static final long CUENTA_MS=30_000;
 /** Cuando acaba la cuenta atras (elapsedRealtime), 0 si no hay. La lee MainActivity. */
 static volatile long CAIDA_FIN=0;
 static volatile boolean CAIDA_PRUEBA=false;
 final DetectorCaidas detectorCaidas=new DetectorCaidas();
 SensorManager sensores;Location ultimaPosicion;
 boolean caidaEnCurso=false,caidaPrueba=false;
 ToneGenerator tonoCaida;
 final Handler caidaHandler=new Handler(Looper.getMainLooper());
 int golpesGuardados=0,caidasGuardadas=0;
 final SensorEventListener oyenteCaida=new SensorEventListener(){
  @Override public void onSensorChanged(SensorEvent e){
   if(e==null||e.values==null||e.values.length<3)return;
   boolean aviso=detectorCaidas.muestra(e.values[0],e.values[1],e.values[2],e.timestamp/1_000_000L);
   if(detectorCaidas.golpes!=golpesGuardados||detectorCaidas.caidas!=caidasGuardadas)apuntaGolpes();
   if(aviso)disparaCaida(false);
  }
  @Override public void onAccuracyChanged(Sensor s,int a){}
 };
 SharedPreferences prefsSos(){return getSharedPreferences("sos",MODE_PRIVATE);}
 // Que se vean de verdad: las notificaciones de la app permitidas Y el canal
 // del aviso de caida sin bloquear (se puede bloquear solo ese).
 static boolean avisosCaidaVisibles(Context c){
  NotificationManager nm=(NotificationManager)c.getSystemService(NOTIFICATION_SERVICE);
  if(nm==null||!nm.areNotificationsEnabled())return false;
  NotificationChannel canal=nm.getNotificationChannel(CANAL_CAIDA);
  return canal==null||canal.getImportance()!=NotificationManager.IMPORTANCE_NONE;
 }
 void creaCanalCaida(){
  NotificationChannel c=new NotificationChannel(CANAL_CAIDA,"Aviso de caída",NotificationManager.IMPORTANCE_HIGH);
  c.setDescription("La cuenta atrás de 30 s antes de enviar el SOS");
  c.enableVibration(true);
  ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(c);
 }
 void arrancaCaidas(){
  if(sensores!=null)return;
  if(!prefsSos().getBoolean("caidas_activo",true))return;
  if(ContactosSos.lee(prefsSos().getString("contactos","")).isEmpty())return;
  // SOLO SI PUEDE FUNCIONAR: sin permiso de SMS la cuenta atras acabaria
  // siempre en «no se ha podido enviar», y sin notificaciones no salen los
  // botones para cancelarla. La hoja SOS dice que falta (getSosConfig).
  if(checkSelfPermission(Manifest.permission.SEND_SMS)!=PackageManager.PERMISSION_GRANTED)return;
  if(!avisosCaidaVisibles(this))return;
  SensorManager sm=(SensorManager)getSystemService(SENSOR_SERVICE);
  Sensor acel=sm==null?null:sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
  if(acel==null)return;
  // 25 muestras por segundo (40 ms): un golpe dura decenas de milisegundos
  // y con eso se ve; mas, gasta sin ver mas.
  if(sm.registerListener(oyenteCaida,acel,40_000))sensores=sm;
 }
 void paraCaidas(){
  if(sensores==null)return;
  try{sensores.unregisterListener(oyenteCaida);}catch(Exception ignored){}
  sensores=null;
 }
 void apuntaGolpes(){
  SharedPreferences p=prefsSos();
  int g=p.getInt("golpes",0)+(detectorCaidas.golpes-golpesGuardados);
  int c=p.getInt("caidas",0)+(detectorCaidas.caidas-caidasGuardadas);
  golpesGuardados=detectorCaidas.golpes;caidasGuardadas=detectorCaidas.caidas;
  p.edit().putInt("golpes",g).putInt("caidas",c).apply();
 }
 void disparaCaida(boolean prueba){
  if(caidaEnCurso)return;
  // Se vuelve a mirar AHORA que se ven los botones para cancelar: el canal se
  // puede bloquear despues de armar. Sin ellos no se arranca una cuenta atras
  // que no se podria parar (revision con GPT).
  if(!avisosCaidaVisibles(this)){android.util.Log.w("TrabakutikGPS","Aviso de caida sin notificaciones visibles: no se arranca");return;}
  caidaEnCurso=true;caidaPrueba=prueba;CAIDA_PRUEBA=prueba;
  CAIDA_FIN=SystemClock.elapsedRealtime()+CUENTA_MS;
  NotificationManager nm=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
  nm.cancel(NOTIF_CAIDA_FIN);
  nm.notify(NOTIF_CAIDA,notificacionCaida());
  caidaHandler.postDelayed(finCuentaCaida,CUENTA_MS);
  caidaHandler.post(pitaCaida);
  habla(prueba?"Prueba del aviso de caída":"¿Te has caído? Si estás bien, pulsa Estoy bien");
  // La pantalla de la app, si el sistema deja abrirla desde aqui. Si no,
  // queda la notificacion con sus dos botones.
  try{startActivity(new Intent(this,MainActivity.class).putExtra("caida",true)
    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_SINGLE_TOP));}catch(Exception ignored){}
 }
 final Runnable finCuentaCaida=()->terminaCaida(true);
 final Runnable pitaCaida=new Runnable(){@Override public void run(){
  if(!caidaEnCurso)return;
  try{
   if(tonoCaida==null)tonoCaida=new ToneGenerator(AudioManager.STREAM_ALARM,100);
   tonoCaida.startTone(ToneGenerator.TONE_CDMA_EMERGENCY_RINGBACK,1200);
  }catch(Exception ignored){}
  try{
   Vibrator v=(Vibrator)getSystemService(VIBRATOR_SERVICE);
   if(v!=null)v.vibrate(VibrationEffect.createOneShot(900,VibrationEffect.DEFAULT_AMPLITUDE));
  }catch(Exception ignored){}
  caidaHandler.postDelayed(this,2000);
 }};
 void terminaCaida(boolean enviar){
  if(!caidaEnCurso)return;
  caidaEnCurso=false;CAIDA_FIN=0;
  caidaHandler.removeCallbacks(finCuentaCaida);caidaHandler.removeCallbacks(pitaCaida);
  try{if(tonoCaida!=null){tonoCaida.stopTone();tonoCaida.release();}}catch(Exception ignored){}
  tonoCaida=null;
  try{Vibrator v=(Vibrator)getSystemService(VIBRATOR_SERVICE);if(v!=null)v.cancel();}catch(Exception ignored){}
  ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).cancel(NOTIF_CAIDA);
  List<ContactosSos.Contacto> contactos=ContactosSos.lee(prefsSos().getString("contactos",""));
  if(caidaPrueba){
   avisoCaida(enviar?"Prueba terminada: aquí se habría enviado el SOS a "+nombres(contactos)+". No se ha enviado nada."
     :"Prueba cancelada. No se ha enviado nada.");
  }else if(enviar)enviaSos(contactos);
  else avisoCaida("Aviso de caída cancelado. No se ha enviado nada.");
  if(!active)stopSelf();
 }
 static String nombres(List<ContactosSos.Contacto> l){
  if(l.isEmpty())return "nadie (no hay contactos)";
  StringBuilder sb=new StringBuilder();
  for(ContactosSos.Contacto c:l){if(sb.length()>0)sb.append(", ");sb.append(c.nombre());}
  return sb.toString();
 }
 void enviaSos(List<ContactosSos.Contacto> contactos){
  if(contactos.isEmpty()){avisoCaida("No se ha enviado el SOS: no hay ningún contacto.");return;}
  if(checkSelfPermission(Manifest.permission.SEND_SMS)!=PackageManager.PERMISSION_GRANTED){
   avisoCaida("No se ha podido enviar el SOS: la app no tiene permiso para mandar SMS. Abre la app y pulsa SOS.");return;}
  Location p=ultimaPosicion;
  try{if(p==null)p=manager.getLastKnownLocation(LocationManager.GPS_PROVIDER);}catch(SecurityException ignored){}
  long seg=p==null?0:Math.max(0,(SystemClock.elapsedRealtimeNanos()-p.getElapsedRealtimeNanos())/1_000_000_000L);
  boolean hay=p!=null&&seg<=15*60;
  String msg=ContactosSos.mensaje(hay,hay?p.getLatitude():0,hay?p.getLongitude():0,hay&&p.hasAccuracy()?p.getAccuracy():0,seg);
  // Se dice primero que se esta enviando y, cuando el telefono contesta
  // trozo a trozo (EnvioSms), a quien ha salido y a quien no.
  prefsSos().edit().putLong("ultimo_sos",System.currentTimeMillis()).apply();
  avisoCaida("Enviando el SOS por SMS a "+nombres(contactos)+"…");
  final boolean conPosicion=hay;
  EnvioSms.envia(this,contactos,msg,res->avisoCaida(res.startsWith("Enviado")
    ?"SOS: "+res+(conPosicion?" Con tu posición.":" Sin posición GPS reciente.")
    :"No se ha podido enviar el SOS por SMS ("+res+"). Comprueba la cobertura y pide ayuda con el botón SOS."));
 }
 void avisoCaida(String texto){
  Intent abre=new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP);
  PendingIntent pa=PendingIntent.getActivity(this,44,abre,PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
  ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).notify(NOTIF_CAIDA_FIN,
   new Notification.Builder(this,CANAL_CAIDA).setSmallIcon(android.R.drawable.ic_dialog_alert)
    .setContentTitle("Aviso de caída").setContentText(texto).setStyle(new Notification.BigTextStyle().bigText(texto))
    .setContentIntent(pa).setAutoCancel(true).build());
 }
 Notification notificacionCaida(){
  PendingIntent bien=PendingIntent.getService(this,41,new Intent(this,TrackingService.class).setAction("CAIDA_BIEN"),
    PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
  PendingIntent envia=PendingIntent.getService(this,42,new Intent(this,TrackingService.class).setAction("CAIDA_ENVIA"),
    PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
  PendingIntent abre=PendingIntent.getActivity(this,43,new Intent(this,MainActivity.class).putExtra("caida",true)
    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
  String quien=nombres(ContactosSos.lee(prefsSos().getString("contactos","")));
  return new Notification.Builder(this,CANAL_CAIDA).setSmallIcon(android.R.drawable.ic_dialog_alert)
   .setContentTitle(caidaPrueba?"Prueba: ¿te has caído?":"¿Te has caído?")
   .setContentText(caidaPrueba?"Prueba: en 30 s terminará sin enviar nada.":"Si no respondes, en 30 s se envía un SOS a "+quien+".")
   .setCategory(Notification.CATEGORY_ALARM).setOngoing(true).setAutoCancel(false)
   .setUsesChronometer(true).setChronometerCountDown(true).setWhen(System.currentTimeMillis()+CUENTA_MS)
   .setFullScreenIntent(abre,true).setContentIntent(abre)
   .addAction(new Notification.Action.Builder((android.graphics.drawable.Icon)null,"Estoy bien",bien).build())
   .addAction(new Notification.Action.Builder((android.graphics.drawable.Icon)null,caidaPrueba?"Terminar prueba":"Enviar S.O.S. ya",envia).build())
   .build();
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
   arrancaCaidas();
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
  GRABANDO=file.getName();
  errorGrabacion="";
  try(FileWriter w=new FileWriter(file)){w.write("<?xml version=\"1.0\" encoding=\"UTF-8\"?><gpx version=\"1.1\" creator=\"Trabakutik Android\" xmlns=\"http://www.topografix.com/GPX/1/1\"><trk><name>Grabacion</name><trkseg>\n");}
  lastRecordedTime=0;lastRecordedLat=Double.NaN;lastRecordedLon=Double.NaN;points=0;
  try(FileOutputStream reset=new FileOutputStream(new File(getFilesDir(),"trazado-vivo.tsv"),false)){}
  recording=true;enMarcha.reinicia();modoEle.set(0);getSharedPreferences("tracking_live",MODE_PRIVATE).edit().putBoolean("recording",true).putLong("tiempoMov",0).remove("gasto").apply();
  arrancaBateria();
  arrancaBaro();
  updateNotice();
 }
 void loadRoute(){
  entradaAvisada=false;
  climbRejoinAlong=Double.NaN;
  inicioCurva=Double.NaN;
  avisoRutaPendiente=null;route.clear();routeReached=false;offRoute=false;farSince=0;cercaDesde=0;ultimoDesvio=0;fueraDesde=0;recordado=false;errorRuta="";llegada.reinicia();
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
  turns.clear();turnsReves.clear();warnedTurns.clear();upcomingTurn="";
  leeGiros(new File(getFilesDir(),"giros-activos.json"),turns);
  // Los calculados al reves (la pagina nueva los manda aparte): yendo al
  // reves se usan estos, ya con su lado, en vez de darle la vuelta a los de
  // la ida. En un cruce darle la vuelta al lado no vale: al reves llegas por
  // otra rama.
  File reves=new File(getFilesDir(),"giros-reves.json");
  // Que el fichero este, aunque sea vacio, es que se calcularon: al reves
  // puede no hacer falta ningun aviso, y entonces no se usan los de la ida.
  hayReves=reves.exists();
  leeGiros(reves,turnsReves);
 }
 void leeGiros(File f,ArrayList<double[]> turns){
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
    // «ro»:1, rotonda (la pagina desde el 15 de noviembre de 2026): tipo 5.
    // Una APK anterior no lo conoce y dice «cruce a la derecha», el lado bueno.
    if(p.optInt("ro",0)==1)tipo=5;
    // «rs»: el NUMERO DE LA SALIDA de la rotonda (la pagina desde el 16 de
    // noviembre de 2026). Va en la cuarta casilla del giro; 0 = sin numero.
    int salida=tipo==5?p.optInt("rs",0):0;
    if(salida<0||salida>8)salida=0;
    // «sg»: SIGUE LA MISMA VIA, que tuerce en un cruce (la pagina desde el 17
    // de noviembre de 2026): tipo 6, y en la casilla de la salida la via:
    // 1 carretera, 2 calle, 3 camino. «Sigue la carretera a la izquierda».
    int sg=p.optInt("sg",0);
    if((tipo==1||tipo==2)&&sg>=1&&sg<=3){tipo=6;salida=sg;}
    // «nr»:1 en una horquilla (tipo 2): la tuya no es la mas recta, y se dice
    // «sigue por la izquierda», sin «recto» (18 nov 2026). Va en la casilla de
    // la salida, que en el tipo 2 no se usaba.
    if(tipo==2&&p.optInt("nr",0)==1)salida=1;
    // «rr»:1, esa rotonda se cruza recto (solo llega con numero).
    int recta=tipo==5&&p.optInt("rr",0)==1?1:0;
    // at>=1 y no >=0: checkTurns recorre la ruta desde i=1 y solo avanza por
    // la lista cuando el giro cae en ese punto, asi que un giro en el 0 no se
    // pasaria nunca y bloquearia TODOS los de detras. La pagina no genera
    // ninguno ahi (un giro necesita un punto antes), pero un fichero raro no
    // puede dejar la ruta muda.
    if(at>=1&&at<route.size()&&direction>=-1&&direction<=1){
     boolean curvaNueva=tipo==0&&direction!=0&&p.optInt("cn",0)==1;
     turns.add(curvaNueva?new double[]{at,direction,tipo,salida,recta,1}
                         :new double[]{at,direction,tipo,salida,recta});
    }
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
 // «… AHORA» UN POCO ANTES DEL CRUCE, NO ENCIMA. Sonaba al llegar a 0 m, y a
 // eso se suman el retraso del GPS (1-2 s) y lo que tarda en arrancar la voz:
 // en bici a 20 km/h caia 5-10 m pasado el cruce. Es la queja de un hilo
 // entero del foro de Suunto sobre rutas de Komoot («the vibration is inside
 // but mostly after the turns»). Lo pidio el autor el 15 de noviembre de 2026.
 // Dos segundos de marcha, entre 4 y 12 m, y siempre por debajo del aviso
 // corto para que este no se quede sin sitio.
 double avisoYa(){double v=velocidadSuave>0?velocidadSuave:1.2;return Math.min(avisoCorto()-2,Math.min(12,Math.max(4,v*2)));}
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
 double inicioCurva=Double.NaN,maximoCurva=Double.NaN;
 long ultimoFixCurva=0;
 boolean confirmaMarchaCurva(double along,boolean fiable){
  if(!fiable){inicioCurva=Double.NaN;return false;}
  long ahora=SystemClock.elapsedRealtime();
  double avance=along*sentido;
  if(!Double.isFinite(inicioCurva)||ahora-ultimoFixCurva>5000||avance<maximoCurva-12||avance>maximoCurva+40){
   inicioCurva=maximoCurva=avance;
  }
  maximoCurva=Math.max(maximoCurva,avance);
  ultimoFixCurva=ahora;
  return maximoCurva-inicioCurva>=12;
 }
 void checkTurns(Location l,NavigationMetrics.Projection position){
  // Yendo al reves, la lista calculada al reves si la hay (lado ya bueno).
  boolean usaReves=sentido<0&&hayReves;
  ArrayList<double[]> turns=usaReves?turnsReves:this.turns;
  if(!navigating||route.size()<2||turns.isEmpty()||!l.hasAccuracy()||l.getAccuracy()>60)return;
  if(offRoute||position.ambiguous()||position.distance()>25){
   inicioCurva=Double.NaN;
   if(!upcomingTurn.isEmpty()){upcomingTurn="";updateNotice();}
   return;
  }
  double along=position.along();
  boolean curvaConfirmada=confirmaMarchaCurva(along,l.getAccuracy()>0&&l.getAccuracy()<=35&&position.distance()<=25);
  double d1=avisoLargo(),d2=avisoCorto(),dv=avisoVoz(),dYa=avisoYa();
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
    double[] candidato=turns.get(k);
    boolean curvaNueva=candidato.length>5&&candidato[5]==1;
    if((!curvaNueva||(curvaConfirmada&&ahead>=-dYa))&&ahead>=-(d2+8)&&ahead<=Math.max(d1,dv)+8
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
     boolean herradura=tipo==3||tipo==4;
     boolean esCruce=tipo==1||tipo==2||tipo==4||tipo==6;
     // Al reves, lo que se grabo como derecha es izquierda... salvo con la
     // lista calculada al reves, que ya trae el lado de quien va al reves.
     int lado=usaReves?d:d*sentido;
     String instruction=lado<0?"Izquierda":lado>0?"Derecha":esCruce?"Da la vuelta":"Herradura";
     if(!esCruce&&lado!=0)instruction="Curva "+(lado<0?"izqda.":"dcha.");
     if(tipo==2&&lado!=0)instruction="Sigue "+(lado<0?"izqda.":"dcha.");

     if(herradura&&lado!=0)instruction="Herradura "+(lado<0?"izqda.":"dcha.");
     // El numero de la salida vale en el sentido en que se calculo: con la
     // lista de ida dada la vuelta (sin la de vuelta) no, y no se dice.
     int salida=tipo==5&&giro.length>3&&(usaReves||sentido>0)?(int)giro[3]:0;
     // En el tipo 6 esa casilla es la clase de via, y en el 2 si lleva «recto»;
     // las dos valen en los dos sentidos.
     if(tipo==6||tipo==2)salida=giro.length>3?(int)giro[3]:(tipo==6?3:0);
     // La rotonda era tipo>=3 y salia «Herradura dcha.» en la notificacion.
     if(tipo==5)instruction=salida>=1&&salida<ORDINALES.length?"Rotonda, "+salida+".ª salida"
      :lado==0?"Rotonda, da la vuelta":"Rotonda "+(lado<0?"izqda.":"dcha.");
     next=instruction+" en "+Math.max(0,Math.round(ahead/5)*5)+" m";
     // La voz puede adelantarse al primer pitido. El aviso intermedio se omite.
     boolean curvaNueva=giro.length>5&&giro[5]==1;
     String fase=curvaNueva?null:ahead<=dYa?"3":ahead<=d2?null:ahead<=d1?"1"
       :ahead<=dv?"v":null;
     // Una rotonda que se cruza RECTO solo se avisa con su numero. Yendo al
     // reves con la lista de ida el numero no vale, y sin el diria «sal a la
     // izquierda» en una recta: entonces, nada (revision con GPT).
     boolean rectaSinNumero=tipo==5&&salida==0&&giro.length>4&&giro[4]==1;
     if(curvaNueva&&ahead<=10&&warnedTurns.add((usaReves?"r":"")+mejor+":curva"))
      hablaGiro(lado<0?"Curva a la izquierda":"Curva a la derecha",siguienteManiobra(turns,mejor,usaReves,along));
     if(fase!=null&&!rectaSinNumero){
      String clave=(usaReves?"r":"")+mejor+":"+fase;
      if(!warnedTurns.contains(clave)){
       warnedTurns.add(clave);
       // Solo los giros y cruces usan el máximo del tono. El volumen multimedia manda.
       if(!"v".equals(fase))pitidos(Integer.parseInt(fase),300,ToneGenerator.TONE_PROP_BEEP,100);
       if("v".equals(fase)||"3".equals(fase)||("1".equals(fase)&&warnedTurns.add((usaReves?"r":"")+mejor+":v")))
        if("3".equals(fase))hablaGiro(fraseGiro(lado,tipo,fase,ahead,salida),siguienteManiobra(turns,mejor,usaReves,along));
        else habla(fraseGiro(lado,tipo,fase,ahead,salida)+giroSeguido(turns,mejor,usaReves));
      }
     }
  }
  if(!next.equals(upcomingTurn)){upcomingTurn=next;updateNotice();}
 }
 // Un grupo de n pitidos: 1 = aproximación, 3 = en el cruce,
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
 void pitidos(int n,int sep,int tono){pitidos(n,sep,tono,90);}
 void pitidos(int n,int sep,int tono,int volumen){
  // Se relee del fichero, no del campo: el campo solo se cargaba al nacer
  // el servicio, asi que un cambio posterior no le llegaba y seguia
  // pitando con «Silencio» puesto. Lo dijo el autor.
  if("silencio".equals(modoAudio()))return;
  try{
   sueltaTono();pitidoHandler.removeCallbacksAndMessages(null);
   final ToneGenerator tone=new ToneGenerator(AudioManager.STREAM_MUSIC,volumen);
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
   double rejoinedAt=climbRejoinDirection==sentido&&now-climbRejoinTime<=20000
           ?climbRejoinAlong:Double.NaN;
   climbRejoinAlong=Double.NaN;
   NavigationMetrics.Notice notice=metrics.nextNotice(along,sentido,rejoinedAt);
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
  sentido=s;inicioCurva=Double.NaN;warnedTurns.clear();upcomingTurn="";
  habla(sentido<0?"Vas en sentido inverso, los giros van corregidos"
    :"Vuelves al sentido de la ruta");
 }
 // Al cambiar de ruta, callando: «vuelves al sentido de la ruta» en una ruta
 // que acabas de cargar no quiere decir nada.
 void olvidaSentido(){inicioCurva=Double.NaN;sentido=1;alongPrevio=Double.NaN;alongAcum=0;latSentido=Double.NaN;lonSentido=Double.NaN;movSentido=Double.NaN;}
 void vuelveALaRuta(){entradaAvisada=true;routeReached=true;offRoute=false;farSince=0;cercaDesde=0;fueraDesde=0;recordado=false;protegeAvisoRuta();updateNotice();tonoBien();habla("De nuevo en la ruta");}
 String avisoSalida(Location l){
  double[] inicio=route.get(0);
  double norte=(inicio[0]-l.getLatitude())*111195;
  double este=(inicio[1]-l.getLongitude())*111195*Math.cos(Math.toRadians(l.getLatitude()));
  long metros=Math.round(Math.hypot(norte,este)/10)*10;
  String[] rumbos={"norte","noreste","este","sureste","sur","suroeste","oeste","noroeste"};
  int rumbo=(int)Math.floorMod(Math.round(Math.toDegrees(Math.atan2(este,norte))/45),8);
  return "La salida de la ruta está a "+metros+" metros en línea recta hacia el "+rumbos[rumbo];
 }
 void checkDeviation(Location l){
  if(!navigating||route.size()<2||!l.hasAccuracy()){farSince=0;cercaDesde=0;ultimoDesvio=0;return;}
  double acc=l.getAccuracy();
  // Sin una medida válida no se confirma ni salida ni regreso.
  if(!Double.isFinite(acc)||acc<0||acc>60){farSince=0;cercaDesde=0;ultimoDesvio=0;return;}
  double d=closest(l.getLatitude(),l.getLongitude());
  if(!Double.isFinite(d)||d<0){farSince=0;cercaDesde=0;ultimoDesvio=0;return;}
  long now=SystemClock.elapsedRealtime();
  // Un hueco de señal no cuenta como cuatro segundos de posiciones fuera.
  if(ultimoDesvio>0&&(now<ultimoDesvio||now-ultimoDesvio>10000)){farSince=0;cercaDesde=0;}
  ultimoDesvio=now;
  boolean dentro=acc<=35&&d<=FUERA_M;
  if(dentro&&d<=Math.max(11,acc+4)){
   if(!entradaAvisada&&!offRoute&&acc<=35&&d<=FUERA_M){entradaAvisada=true;protegeAvisoRuta();tonoBien();habla("Ya estás en la ruta");}
   routeReached=true;farSince=0;cercaDesde=0;
   if(offRoute)vuelveALaRuta();
   return;
  }
  // Se vigila desde Empezar, incluso si aún no se ha pisado el track o se
  // acaba de elegir otra ruta. Antes routeReached bloqueaba ambos casos.
  if(d<=Math.max(FUERA_M,acc+7)){
   farSince=0;
   if(dentro&&(offRoute||!entradaAvisada)){
    if(cercaDesde==0)cercaDesde=now;
    else if(now-cercaDesde>=4000){
     if(offRoute)vuelveALaRuta();
     else if(acc<=35&&d<=FUERA_M){entradaAvisada=true;routeReached=true;cercaDesde=0;protegeAvisoRuta();tonoBien();habla("Ya estás en la ruta");}
    }
   }else cercaDesde=0;
   return;
  }
  cercaDesde=0;
  if(farSince==0){farSince=now;return;}
  if(!offRoute&&now-farSince>=4000){
   offRoute=true;fueraDesde=now;recordado=false;protegeAvisoRuta();updateNotice();pitidos(4,180);habla(routeReached?"Atención, fuera del recorrido":avisoSalida(l));
  }
  // Un recordatorio por salida, a 50 m del track, dejando terminar la voz.
  else if(offRoute&&!recordado&&d>=RECUERDA_M&&now-fueraDesde>=RECUERDA_MS){
   recordado=true;protegeAvisoRuta();pitidos(4,180);habla("Sigues fuera del recorrido");
  }
 }
 static final double FUERA_M=15,RECUERDA_M=50;
 static final long RECUERDA_MS=4_000;
 long fueraDesde=0;boolean recordado=false;long ultimoDesvio=0;
 long avisoRutaHasta=0;
 void protegeAvisoRuta(){lastImportantAudio=SystemClock.elapsedRealtime();avisoRutaHasta=lastImportantAudio+4000;}
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
  ultimaPosicion=l;
  // Una velocidad de una posicion mala no arma ni descarta un golpe.
  detectorCaidas.velocidad(l.hasSpeed()&&l.hasAccuracy()&&l.getAccuracy()<=30?l.getSpeed():Double.NaN,l.getElapsedRealtimeNanos()/1_000_000L);
  if(recording&&!pausado)bateriaFixes++;
  String liveMetrics="{}";
  if(navigating&&route.size()>1){
   boolean entradaAnterior=entradaAvisada;
   boolean wasOff=offRoute;
   int previousWarnings=warnedTurns.size();
   checkDeviation(l);
   if(l.hasAccuracy()&&l.getAccuracy()<=60){
    NavigationMetrics.Projection position=metrics.project(l.getLatitude(),l.getLongitude(),sentido,l.getAccuracy()<=35&&!offRoute);
    // Antes de los giros, que el lado de este mismo aviso ya salga bien.
    if(!offRoute&&!position.ambiguous()&&l.getAccuracy()<=35&&position.distance()<=30)decideSentido(position.along(),l.getLatitude(),l.getLongitude());
    if(entradaAnterior==entradaAvisada)checkTurns(l,position);
    // El final de la ruta se dice (AvisoLlegada): una vez, y solo si de
    // verdad la has andado, que en una circular se empieza en el final.
    llegada.posicion(l.getLatitude(),l.getLongitude(),l.getAccuracy());
    if(!offRoute&&!position.ambiguous()&&l.getAccuracy()<=35&&position.distance()<=30){
     double total=metrics.total(),hecho=sentido>0?position.along():total-position.along();
     if(llegada.llega(hecho,total)){tonoBien();habla("Has llegado al final de la ruta");}
    }
    long now=SystemClock.elapsedRealtime();
    if(wasOff!=offRoute||previousWarnings!=warnedTurns.size())lastImportantAudio=now;
    if(offRoute||climbRejoinDirection!=sentido)climbRejoinAlong=Double.NaN;
    if(!offRoute&&!position.ambiguous()&&position.distance()<=30&&l.getAccuracy()<=35){
     if(wasOff){
      climbRejoinAlong=position.along();climbRejoinDirection=sentido;climbRejoinTime=now;
     }
     if(entradaAnterior==entradaAvisada)liveMetrics=updateNavigationMetrics(l,position,now);
    }else{inicioCurva=Double.NaN;metrics.pausePace();}
   }else{inicioCurva=Double.NaN;metrics.pausePace();}
  }
  // Con la hora de la MEDIDA y la velocidad del GPS (Doppler): ver TiempoEnMarcha.
  if(recording&&!pausado&&l.hasAccuracy())enMarcha.posicion(l.getLatitude(),l.getLongitude(),l.getAccuracy(),l.getElapsedRealtimeNanos()/1_000_000L,l.hasSpeed()?l.getSpeed():Double.NaN);
  convierteAltura(l);
  final Altura alt=ultimaAltura;  // una sola lectura: altura, error y hora de la misma muestra
  getSharedPreferences("tracking_live",MODE_PRIVATE).edit().putFloat("altMar",alt==null?-9999f:(float)alt.mar).putFloat("altError",alt==null?-1f:alt.error).putLong("altTiempo",alt==null?0L:alt.tiempo).putLong("tiempoMov",enMarcha.totalMs()).putString("metrics",liveMetrics).putFloat("lat",(float)l.getLatitude()).putFloat("lon",(float)l.getLongitude()).putFloat("accuracy",l.hasAccuracy()?l.getAccuracy():9999f).putLong("time",l.getTime()).putFloat("bearing",l.hasBearing()?l.getBearing():-1f).putFloat("speed",l.hasSpeed()?l.getSpeed():-1f).putLong("latBits",Double.doubleToRawLongBits(l.getLatitude())).putLong("lonBits",Double.doubleToRawLongBits(l.getLongitude())).putBoolean("active",active).putBoolean("recording",recording).putBoolean("navigating",navigating).putBoolean("guiando",navigating&&route.size()>1).putInt("giros",turns.size()).apply();
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
   String ele=eleGpx(l);
   w.write("<trkpt lat=\""+l.getLatitude()+"\" lon=\""+l.getLongitude()+"\">"+(ele.isEmpty()?"":"<ele>"+ele+"</ele>")+"<time>"+time+"</time></trkpt>\n");
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
  paraBaro();
  recording=false;GRABANDO=null;
  getSharedPreferences("tracking_live",MODE_PRIVATE).edit().putBoolean("recording",false).putString("gasto",gastoUltimo).apply();
 }
 void finish(){paraCaidas();if(caidaEnCurso)terminaCaida(false);navigating=false;route.clear();getSharedPreferences("tracking_live",MODE_PRIVATE).edit().putBoolean("active",false).putBoolean("recording",false).putBoolean("navigating",false).putBoolean("guiando",false).apply();sueltaRed();if(active){manager.removeUpdates(this);active=false;}if(gpsWakeLock!=null&&gpsWakeLock.isHeld())gpsWakeLock.release();endRecording();ACTIVO=false;stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();}
 @Override public void onDestroy(){try{hiloAltura.shutdownNow();}catch(Exception ignored){}avisoHandler.removeCallbacks(refrescaAviso);callaYa();if(voz!=null){try{voz.stop();voz.shutdown();}catch(Exception ignored){}voz=null;vozLista=false;}if(active||recording)finish();ACTIVO=false;super.onDestroy();}
}
