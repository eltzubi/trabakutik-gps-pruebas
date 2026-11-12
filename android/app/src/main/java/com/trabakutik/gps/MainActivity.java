package com.trabakutik.gps;
import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.*;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationManager;
import android.location.LocationListener;
import android.os.*;
import android.view.ViewGroup;
import android.view.View;
import android.view.WindowInsets;
import android.widget.FrameLayout;
import android.graphics.drawable.GradientDrawable;
import android.webkit.*;
import android.widget.*;
import java.io.*;
import android.webkit.JavascriptInterface;
public class MainActivity extends Activity {
 WebView web,webRoutes; FrameLayout pages; TextView switchPage; boolean showingGps=true; File exportFile; String pendingGpx=null; String pendingGpsAction=null; String lastWebUrl="https://trabakutik.com/"; long lastWebLoadAt=0; long lastRouteOpenAt=0; String lastRouteOpenUrl=""; ValueCallback<android.net.Uri[]> pendingFileChooser;
 @Override public void onCreate(Bundle b) {
  super.onCreate(b);
  CrashReport.install(this);
  // Si el proceso anterior murio grabando, su GPX se quedo sin cerrar y las
  // marcas de «grabando» siguen puestas en las preferencias, porque solo se
  // borran en finish(). Aqui no hay ningun servicio vivo -- TrackingService
  // .ACTIVO es estatica, asi que un proceso nuevo la ve en false--, de modo
  // que es seguro cerrar lo que quedo a medias y limpiar las marcas.
  if(!TrackingService.ACTIVO){
   int cerrados=TrackingService.reparaGrabaciones(this);
   getSharedPreferences("tracking_live",MODE_PRIVATE).edit()
     .putBoolean("active",false).putBoolean("recording",false).apply();
   if(cerrados>0)Toast.makeText(this,cerrados==1
     ?"Se ha cerrado una grabación que quedó a medias"
     :"Se han cerrado "+cerrados+" grabaciones que quedaron a medias",Toast.LENGTH_LONG).show();
  }
  getWindow().setStatusBarColor(0xff07131d);
  getWindow().setNavigationBarColor(0xff07131d);
  LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(0xff07131d);
  LinearLayout bar=new LinearLayout(this);
  bar.setGravity(android.view.Gravity.CENTER_VERTICAL);
  bar.setPadding(dp(12),dp(1),dp(9),dp(1));
  bar.setBackgroundColor(0xff0b1e28);
  TextView title=new TextView(this);
  title.setText("Trabakutik");title.setTextColor(0xffd9edec);title.setTextSize(12);
  title.setTypeface(null,android.graphics.Typeface.BOLD);title.setGravity(android.view.Gravity.CENTER_VERTICAL);
  title.setOnLongClickListener(v->{CrashReport.show(MainActivity.this);return true;});
  bar.addView(title,new LinearLayout.LayoutParams(0,dp(30),1));

  switchPage=new TextView(this);switchPage.setText("Web");
  switchPage.setTextColor(0xffb9eaf1);switchPage.setTextSize(10);
  switchPage.setGravity(android.view.Gravity.CENTER);
  GradientDrawable outline=new GradientDrawable();
  outline.setColor(0xff122936);outline.setCornerRadius(dp(10));
  outline.setStroke(dp(1),0xff375767);
  switchPage.setBackground(outline);
  switchPage.setPadding(dp(9),0,dp(9),0);
  switchPage.setSingleLine(true);
  switchPage.setEllipsize(null);
  switchPage.setIncludeFontPadding(false);
  switchPage.setMinWidth(dp(125));
  switchPage.setMaxLines(1);
  bar.addView(switchPage,new LinearLayout.LayoutParams(dp(138),dp(29)));
  switchPage.setOnClickListener(v->showScreen(!showingGps));

  root.addView(bar,new LinearLayout.LayoutParams(-1,dp(35)));
  if(Build.VERSION.SDK_INT>=30)root.setOnApplyWindowInsetsListener((v,insets)->{
   int top=insets.getInsets(WindowInsets.Type.statusBars()).top;
   root.setPadding(0,top,0,0);
   return insets;
  });
  pages=new FrameLayout(this);
  web=new WebView(this);
  webRoutes=new WebView(this);
  configureWebView(web,true);
  configureWebView(webRoutes,false);
  pages.addView(webRoutes,new FrameLayout.LayoutParams(-1,-1));
  pages.addView(web,new FrameLayout.LayoutParams(-1,-1));
  root.addView(pages,new LinearLayout.LayoutParams(-1,0,1));
  setContentView(root);
  // Abrir primero Trabakutik.com. El navegador GPS queda cargado en la otra vista.
  // Pero si Android ha RECREADO la Activity hay que volver a donde estaba el
  // visitante, no empezar de cero. El giro de pantalla ya no la recrea
  // (configChanges en el manifiesto), pero Android puede recrearla por otros
  // motivos y el resultado era el mismo: nuevo.html sin la ruta y de vuelta a
  // trabakutik.com, con la navegacion perdida de vista.
  String urlGps = b == null ? null : b.getString("url_gps");
  String urlWeb = b == null ? null : b.getString("url_web");
  boolean verGps = b != null && b.getBoolean("ver_gps", false);
  showScreen(verGps);
  web.loadUrl(urlGps != null && urlGps.startsWith("https://eltzubi.github.io/trabakutik-gps-pruebas/nuevo.html")
    ? urlGps : "https://eltzubi.github.io/trabakutik-gps-pruebas/nuevo.html?appversion=20261110");
  webRoutes.loadUrl(urlWeb != null && urlWeb.startsWith("https://trabakutik.com/")
    ? urlWeb : "https://trabakutik.com/");
  handleExternalRoute(getIntent());
  if(getPreferences(MODE_PRIVATE).getBoolean("initial_permissions_guided_v1",false))showBatteryReminderIfNeeded();
  else beginPermissionSetup();
 }
 @Override protected void onSaveInstanceState(Bundle out){
  super.onSaveInstanceState(out);
  if (web != null && web.getUrl() != null) out.putString("url_gps", web.getUrl());
  if (webRoutes != null && webRoutes.getUrl() != null) out.putString("url_web", webRoutes.getUrl());
  out.putBoolean("ver_gps", showingGps);
 }
 void handleExternalRoute(Intent incoming){
  if(incoming==null||incoming.getData()==null)return;
  android.net.Uri uri=incoming.getData();
  if(!"trabakutikgps".equals(uri.getScheme())||!"navegar".equals(uri.getHost()))return;
  String slug=uri.getQueryParameter("ruta");
  if(slug==null||!slug.matches("[a-zA-Z0-9_-]{1,120}"))return;
  String url="https://eltzubi.github.io/trabakutik-gps-pruebas/nuevo.html?ruta="+android.net.Uri.encode(slug);
  openRouteUrl(url);
 }
 @Override protected void onNewIntent(Intent incoming){
  super.onNewIntent(incoming);
  setIntent(incoming);
  handleExternalRoute(incoming);
 }
 void restoreGpsWeb(){
  if(web==null)return;
  web.evaluateJavascript("window.trabakutikSyncNative&&window.trabakutikSyncNative()",null);
 }
 // Una respuesta de JavaScript puede llegar despues de volver a la app.
 // El numero de ciclo impide que esa respuesta suspenda una pantalla visible.
 boolean appEnSegundoPlano=false;
 int cicloSegundoPlano=0;
 // SOS pedido que se quedo esperando a que la app vuelva al frente.
 long sosPendienteDesde=0;
 @Override protected void onResume(){
  super.onResume();
  appEnSegundoPlano=false;
  cicloSegundoPlano++;
  if(sosPendienteDesde>0){
   boolean aTiempo=SystemClock.elapsedRealtime()-sosPendienteDesde<=60_000L;
   sosPendienteDesde=0;
   if(aTiempo)startSosLocation();
  }
  // Los temporizadores son globales: reanudar tambien si Android recreo
  // la Activity mientras la anterior estaba suspendida.
  if(web!=null){web.resumeTimers();web.onResume();}
  if(webRoutes!=null)webRoutes.onResume();
  if(web!=null&&showingGps)web.postDelayed(this::restoreGpsWeb,300);
 }
 @Override protected void onStop(){
  super.onStop();
  stopSosLocation();
  if(sosDialog!=null)sosDialog.dismiss();
  appEnSegundoPlano=true;
  final int ciclo=++cicloSegundoPlano;
  if(web==null||pendingGpsAction!=null)return;
  // Consultar a la pagina en que anda. Si no responde, se conserva su
  // funcionamiento; nunca se adivina que esta inactiva.
  //   0 · no se toca (creando, o la pagina lleva ella la salida)
  //   1 · parada: ni grabando ni guiada
  //   2 · salida en marcha, pero LA LLEVA EL SERVICIO
  //
  // EL 2 ES NUEVO Y ES DONDE ESTABA EL GASTO. Con una salida en marcha la
  // pagina no se dormia nunca, asi que con la pantalla apagada el mapa
  // seguia moviendose y BAJANDO TESELAS PARA NADIE. Medido por el autor en
  // coche: 10 %/h con la pantalla apagada, cruzando 44 km de mapa cada hora.
  // Cuando la salida la lleva el servicio -el GPS, los avisos de voz y el
  // GPX son suyos- la pagina solo pinta, y con la pantalla apagada no hay
  // nada que pintar. No se pierde ni un punto: al volver, la pagina relee el
  // trazado entero del servicio (restoreGpsWeb -> trabakutikSyncNative).
  web.evaluateJavascript(
    "(function(){if(typeof mode==='undefined'||typeof recording==='undefined'"+
    "||typeof navegaNativo==='undefined'||typeof fuenteNativa==='undefined')return 0;"+
    "if(mode==='create')return 0;"+
    "if(!recording&&!navegaNativo)return 1;"+
    "return fuenteNativa?2:0;})()",
    estado->{
     if(!appEnSegundoPlano||ciclo!=cicloSegundoPlano||isFinishing()||isDestroyed()
       ||pendingGpsAction!=null)return;
     boolean parada="1".equals(estado),delServicio="2".equals(estado);
     // Si mientras se preguntaba ha arrancado una salida, la respuesta
     // «parada» ya no vale; y si el servicio se ha parado, tampoco vale la
     // otra.
     if(parada&&TrackingService.ACTIVO)return;
     if(delServicio&&!TrackingService.ACTIVO)return;
     if(!parada&&!delServicio)return;
     web.onPause();
     if(webRoutes!=null)webRoutes.onPause();
     // pauseTimers afecta a las dos WebView. Se llama solo estando inactiva.
     web.pauseTimers();
    });
 }
 void showScreen(boolean gps){
  showingGps=gps;
  if(web==null||webRoutes==null)return;
  web.setVisibility(gps?View.VISIBLE:View.GONE);
  webRoutes.setVisibility(gps?View.GONE:View.VISIBLE);
  web.setImportantForAccessibility(gps?View.IMPORTANT_FOR_ACCESSIBILITY_AUTO:View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
  webRoutes.setImportantForAccessibility(gps?View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS:View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);
  switchPage.setText(gps?"Web":"Navegador");
  if(!gps&&webRoutes!=null){
   // Sin esto, la pestana Web ensenaba para siempre la pagina que quedo en
   // memoria la primera vez que se abrio: solo se cargaba estando en blanco,
   // asi que una ruta nueva o un texto corregido no aparecian nunca. GitHub
   // Pages da sus paginas por buenas 10 minutos (max-age=600); pasados esos,
   // se vuelve a pedir.
   if("about:blank".equals(webRoutes.getUrl())){
    webRoutes.loadUrl(lastWebUrl);
   }else if(lastWebLoadAt==0||System.currentTimeMillis()-lastWebLoadAt>600000L){
    webRoutes.reload();
   }
  }
  web.postDelayed(()->{if(gps){web.evaluateJavascript("window.dispatchEvent(new Event('resize'))",null);restoreGpsWeb();}},120);
 }
 // Necesita Android 10: MediaStore.Downloads no existe antes. Quien llama ya
 // comprueba SDK_INT>=29; esto lo deja escrito aqui, y asi salta el aviso si
 // algun dia se le llama sin comprobarlo.
 @androidx.annotation.RequiresApi(29)
 boolean guardaEnDescargas(String name,String xml){
  android.net.Uri uri=null;
  try{
   android.content.ContentValues v=new android.content.ContentValues();
   v.put(android.provider.MediaStore.Downloads.DISPLAY_NAME,name);
   v.put(android.provider.MediaStore.Downloads.MIME_TYPE,"application/gpx+xml");
   v.put(android.provider.MediaStore.Downloads.RELATIVE_PATH,android.os.Environment.DIRECTORY_DOWNLOADS);
   uri=getContentResolver().insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI,v);
   if(uri==null)return false;
   java.io.OutputStream out=getContentResolver().openOutputStream(uri);
   if(out==null)return false;
   try{out.write(xml.getBytes(java.nio.charset.StandardCharsets.UTF_8));}finally{out.close();}
   String fin=nombreDe(uri);
   if(fin!=null&&!fin.toLowerCase(java.util.Locale.ROOT).endsWith(".gpx")){
    android.content.ContentValues r=new android.content.ContentValues();
    r.put(android.provider.MediaStore.Downloads.DISPLAY_NAME,name);
    try{getContentResolver().update(uri,r,null,null);}catch(Exception ignored){}
    fin=nombreDe(uri);
   }
   Toast.makeText(this,"Guardado en Descargas como "+(fin!=null?fin:name),Toast.LENGTH_LONG).show();
   return true;
  }catch(Exception e){
   if(uri!=null)try{getContentResolver().delete(uri,null,null);}catch(Exception ignored){}
   return false;
  }
 }
 String nombreDe(android.net.Uri uri){
  android.database.Cursor c=getContentResolver().query(uri,
    new String[]{android.provider.OpenableColumns.DISPLAY_NAME},null,null,null);
  if(c==null)return null;
  try{return c.moveToFirst()?c.getString(0):null;}finally{c.close();}
 }
 void configureWebView(WebView w,boolean navigator){
  w.setBackgroundColor(0xff07131d);
  w.getSettings().setJavaScriptEnabled(true);
  w.getSettings().setDomStorageEnabled(true);
   if(navigator)w.getSettings().setCacheMode(android.webkit.WebSettings.LOAD_NO_CACHE);
  w.getSettings().setGeolocationEnabled(true);
  w.getSettings().setUseWideViewPort(true);
  w.getSettings().setLoadWithOverviewMode(true);
  w.getSettings().setTextZoom(100);
  if(!navigator){
   // Pestana Web: el WebView trae el zoom con los dedos apagado de fabrica, asi
   // que las fotos del visor no se podian ampliar a pellizco como en Chrome.
   // Solo aqui: el navegador tiene su propio mapa, que ya gestiona el pellizco.
   w.getSettings().setSupportZoom(true);
   w.getSettings().setBuiltInZoomControls(true);
   w.getSettings().setDisplayZoomControls(false);
  }
  if(navigator)w.addJavascriptInterface(new Bridge(),"TrabakutikAndroid");
  else w.addJavascriptInterface(new RouteBridge(),"TrabakutikRoutes");
  // EL GPX Y EL KML DE LAS FICHAS. Un WebView no se baja nada por su cuenta:
  // el servidor manda el GPX como application/gpx+xml, que no sabe pintar, y
  // sin oyente de descargas el toque no hacia absolutamente nada -ni error ni
  // aviso-. Lo encontro el autor: «no deja descargar las rutas ni el gpx ni
  // kml». Las fichas ademas ponen el nombre bueno en el atributo «download»
  // del enlace -«Garai, los canales de Arrierreka y la ermita de Urdaixa.gpx»-
  // y eso un WebView lo tira: por eso los enlaces de trabakutik.com pasan por
  // el puente, que si lo conserva, y esto queda de red para todo lo demas.
  if(!navigator)w.setDownloadListener((url,agente,disposicion,tipo,bytes)->bajaFichero(url,disposicion,tipo,null));
  w.setWebChromeClient(new WebChromeClient(){
   @Override public boolean onShowFileChooser(WebView view,ValueCallback<android.net.Uri[]> callback,FileChooserParams params){
    if(pendingFileChooser!=null){pendingFileChooser.onReceiveValue(null);pendingFileChooser=null;}
    pendingFileChooser=callback;
    try{
     Intent picker=new Intent(Intent.ACTION_OPEN_DOCUMENT);
     picker.addCategory(Intent.CATEGORY_OPENABLE);
     picker.setType("*/*");
     // Mostrar todos los documentos: algunos proveedores marcan GPX con MIME desconocido.
     startActivityForResult(picker,302);
     return true;
    }catch(Exception e){
     pendingFileChooser=null;callback.onReceiveValue(null);
     Toast.makeText(MainActivity.this,"No se pudo abrir Archivos",Toast.LENGTH_SHORT).show();
     return true;
    }
   }
   @Override public void onGeolocationPermissionsShowPrompt(String origin,GeolocationPermissions.Callback cb){
    cb.invoke(origin,checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED,false);
   }
  });
  w.setWebViewClient(new WebViewClient(){
   @Override public boolean onRenderProcessGone(WebView view,android.webkit.RenderProcessGoneDetail detail){
    // Android puede matar el renderizador de WebView por falta de memoria.
    // Retirar el WebView muerto: si devolvemos false, se cierra toda la APK.
    final boolean wasNavigator=view==web;
    final String restore=wasNavigator?(view.getUrl()!=null?view.getUrl():"https://eltzubi.github.io/trabakutik-gps-pruebas/nuevo.html"):lastWebUrl;
    CrashReport.note(MainActivity.this,"Proceso del mapa cerrado (didCrash="+detail.didCrash()+")");
    pages.removeView(view);
    view.destroy();
    WebView replacement=new WebView(MainActivity.this);
    if(wasNavigator)web=replacement;else webRoutes=replacement;
    configureWebView(replacement,wasNavigator);
    if(wasNavigator)pages.addView(replacement,new FrameLayout.LayoutParams(-1,-1));
    else pages.addView(replacement,0,new FrameLayout.LayoutParams(-1,-1));
    replacement.setVisibility(wasNavigator==showingGps?View.VISIBLE:View.GONE);
    replacement.loadUrl(restore);
    android.util.Log.e("TrabakutikGPS","Reiniciado WebView tras cierre de renderizador; memoria",null);
    Toast.makeText(MainActivity.this,"El mapa se ha recargado tras un problema de memoria",Toast.LENGTH_LONG).show();
    return true;
   }
   @Override public void onPageFinished(WebView view,String url){
    super.onPageFinished(view,url);
    if(!navigator&&url!=null&&url.startsWith("https://trabakutik.com/")){
      lastWebUrl=url;
      lastWebLoadAt=System.currentTimeMillis();
      view.evaluateJavascript("(function(){if(window.__routeLinkFixed)return;window.__routeLinkFixed=1;document.addEventListener('click',function(e){var a=e.target.closest('a[href]');if(!a)return;if(a.href.indexOf('https://eltzubi.github.io/trabakutik-gps-pruebas/nuevo.html')===0){e.preventDefault();e.stopPropagation();TrabakutikRoutes.openNavigator(a.href);return;}if(a.hasAttribute('download')&&a.protocol&&a.protocol.indexOf('http')===0){e.preventDefault();e.stopPropagation();TrabakutikRoutes.descarga(a.href,a.getAttribute('download'));}},true)})()",null);
    }
   }
   @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
    android.net.Uri url=request.getUrl();String host=url.getHost();
    if("eltzubi.github.io".equals(host)&&url.getPath().equals("/trabakutik-gps-pruebas/nuevo.html")){
      if(!navigator){openRouteUrl(url.toString());return true;}
      return false;
    }
    if("trabakutik.com".equals(host)||"www.trabakutik.com".equals(host)){
      if(navigator){webRoutes.loadUrl(url.toString());showScreen(false);return true;}
      return false;
    }
    try{startActivity(new Intent(Intent.ACTION_VIEW,url));}catch(Exception ignored){}
    return true;
   }
  });
 }
 public class RouteBridge{
  /** Un GPX, un KML o el zip de todas las rutas, con el nombre que le pone la
   *  ficha. Llega del clic que intercepta el JavaScript de onPageFinished. */
  @JavascriptInterface public void descarga(String url,String nombre){
   runOnUiThread(()->bajaFichero(url,null,null,nombre));
  }
  @JavascriptInterface public void openNavigator(String url){
   if(url!=null&&url.startsWith("https://eltzubi.github.io/trabakutik-gps-pruebas/nuevo.html"))
    runOnUiThread(()->openRouteUrl(url));
  }
 }
 /** Baja un fichero de la web a la carpeta de Descargas del telefono.
  *  «nombre» es el del atributo download de la ficha, si lo hubo; si no, se
  *  adivina de la direccion y del tipo que mando el servidor. */
 void bajaFichero(String url,String disposicion,String tipo,String nombre){
  if(url==null)return;
  android.net.Uri uri;
  try{uri=android.net.Uri.parse(url);}catch(Exception e){return;}
  String esquema=uri.getScheme()==null?"":uri.getScheme().toLowerCase(java.util.Locale.ROOT);
  if(!esquema.equals("http")&&!esquema.equals("https")){
   // blob: y data: no los sabe bajar el gestor de descargas de Android.
   try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(Exception ignored){}
   return;
  }
  String fichero=limpiaNombre(nombre);
  if(fichero==null)fichero=limpiaNombre(android.webkit.URLUtil.guessFileName(url,disposicion,tipo));
  if(fichero==null)fichero="trabakutik.gpx";
  android.app.DownloadManager gestor=(android.app.DownloadManager)getSystemService(DOWNLOAD_SERVICE);
  if(gestor==null){Toast.makeText(this,"Este teléfono no tiene gestor de descargas",Toast.LENGTH_LONG).show();return;}
  // Primero la carpeta de Descargas de siempre, que es donde se busca luego
  // con el explorador o con otra aplicacion de mapas. En Android 8 y 9 eso
  // pide permiso de escritura, asi que si el sistema lo rechaza se guarda en
  // la carpeta de la aplicacion antes que dejarle sin fichero.
  for(boolean publica:new boolean[]{true,false}){
   try{
    android.app.DownloadManager.Request pide=new android.app.DownloadManager.Request(uri);
    pide.setTitle(fichero);
    if(tipo!=null&&!tipo.isEmpty())pide.setMimeType(tipo);
    pide.setNotificationVisibility(android.app.DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
    if(publica)pide.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS,fichero);
    else pide.setDestinationInExternalFilesDir(this,Environment.DIRECTORY_DOWNLOADS,fichero);
    gestor.enqueue(pide);
    Toast.makeText(this,"Descargando "+fichero,Toast.LENGTH_SHORT).show();
    return;
   }catch(Exception e){
    android.util.Log.w("TrabakutikGPS","No se pudo encolar la descarga"+(publica?" en Descargas":""),e);
   }
  }
  Toast.makeText(this,"No se pudo descargar "+fichero,Toast.LENGTH_LONG).show();
 }
 /** Deja el nombre en algo que pueda ser un fichero: sin carpetas ni saltos
  *  de linea. Las tildes, los espacios y las comas se quedan, que el nombre
  *  bueno de una ruta los lleva. */
 static String limpiaNombre(String nombre){
  if(nombre==null)return null;
  String n=nombre.replaceAll("[\\\\/\\u0000-\\u001f]"," ").replaceAll("\\s+"," ").trim();
  if(n.isEmpty()||n.equals(".")||n.equals(".."))return null;
  return n.length()>120?n.substring(0,120):n;
 }
 void openRouteUrl(String url){
  if(url==null||!url.startsWith("https://eltzubi.github.io/trabakutik-gps-pruebas/nuevo.html"))return;
  // Las fichas contienen galerias grandes; no conservar dos paginas pesadas
  // en memoria al mismo tiempo. La ficha se recarga al pulsar Web.
  String origin=webRoutes==null?null:webRoutes.getUrl();
  if(origin!=null&&origin.startsWith("https://trabakutik.com/"))lastWebUrl=origin;
  if(webRoutes!=null)webRoutes.loadUrl("about:blank");
  showScreen(true);
  long now=android.os.SystemClock.elapsedRealtime();
  if(url.equals(lastRouteOpenUrl)&&now-lastRouteOpenAt<1200)return;
  lastRouteOpenUrl=url;lastRouteOpenAt=now;
  String current=web.getUrl();
  if(current==null||!current.equals(url))web.loadUrl(url);
 }
 public class Bridge {
  // La version de la APK, para que la pagina la pueda ensenar. Se saca del
  // paquete instalado y no de una constante escrita a mano, que se queda vieja.
  @JavascriptInterface public String getAppVersion(){
   try{String v=getPackageManager().getPackageInfo(getPackageName(),0).versionName;return v==null?"":v;}
   catch(Exception e){return "";}
  }
  @JavascriptInterface public void clearLiveTrack(){new File(getFilesDir(),"trazado-vivo.tsv").delete();}
  /** Solo la posicion, sin el trazado. El snapshot entero devuelve los puntos
   *  cada vez que cambia el archivo, que grabando es con cada punto nuevo, y
   *  pueden ser miles. Para mover la flecha hay que mirar cada segundo, y cada
   *  segundo no se puede estar leyendo todo eso. */
  // El boton de sonido de la pagina solo callaba a la pagina, y navegando
  // dentro de la app quien pita es el servicio: «Silencio» no silenciaba
  // nada. Ahora el modo se guarda aqui y el servicio lo lee al nacer, asi
  // que vale tambien si todavia no esta levantado.
  @JavascriptInterface public void setAudioModo(String modo){
   if(!"voz".equals(modo)&&!"pitidos".equals(modo)&&!"silencio".equals(modo))return;
   getSharedPreferences("tracking_live",MODE_PRIVATE).edit().putString("audioModo",modo).apply();
   if(!TrackingService.ACTIVO)return;
   try{startService(new Intent(MainActivity.this,TrackingService.class).setAction("AUDIO").putExtra("modo",modo).putExtra("probar",true));}
   catch(Exception ignored){}
  }
  @JavascriptInterface public void shareSos(){runOnUiThread(()->{
   if(!showingGps||web==null||appEnSegundoPlano||isFinishing()||isDestroyed())return;
   android.net.Uri page=android.net.Uri.parse(web.getUrl()==null?"":web.getUrl());
   if("https".equals(page.getScheme())&&"eltzubi.github.io".equals(page.getHost())
      &&"/trabakutik-gps-pruebas/nuevo.html".equals(page.getPath()))startSosLocation();
  });}
  @JavascriptInterface public String getPosition(){
   try{
    android.content.SharedPreferences pref=getSharedPreferences("tracking_live",MODE_PRIVATE);
    org.json.JSONObject o=new org.json.JSONObject();
    LocationManager locationManager=(LocationManager)getSystemService(LOCATION_SERVICE);
    boolean locationEnabled;
    if(android.os.Build.VERSION.SDK_INT>=28)locationEnabled=locationManager.isLocationEnabled();
    else locationEnabled=locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)||locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
    o.put("locationEnabled",locationEnabled);
    o.put("active",pref.getBoolean("active",false));
    o.put("recording",pref.getBoolean("recording",false));
    // La pagina necesita saberlo para callarse: si pita ella y pita el
    // servicio, cada cruce suena dos veces.
    o.put("navigating",pref.getBoolean("navigating",false));
    // No basta con «navigating»: el servicio solo avisa si ademas tiene la
    // ruta cargada. Si no, callaban los dos.
    o.put("guiando",pref.getBoolean("guiando",false));
    // Por que no habla, si no habla. Antes fallaba en silencio.
    o.put("vozEstado",pref.getString("vozEstado","iniciando"));
    // Cuantos giros tiene cargados. Sin esto la pagina se callaba los
    // giros aunque el servicio no tuviera ninguno que avisar.
    o.put("giros",pref.getInt("giros",-1));
    long lb=pref.getLong("latBits",0),ob=pref.getLong("lonBits",0);
    o.put("lat",lb!=0?Double.longBitsToDouble(lb):(double)pref.getFloat("lat",0f));
    o.put("lon",ob!=0?Double.longBitsToDouble(ob):(double)pref.getFloat("lon",0f));
    o.put("accuracy",pref.getFloat("accuracy",9999f));
    o.put("time",pref.getLong("time",0));
    o.put("bearing",pref.getFloat("bearing",-1f));
    o.put("speed",pref.getFloat("speed",-1f));
    if(pref.getBoolean("guiando",false)){
     try{o.put("metrics",new org.json.JSONObject(pref.getString("metrics","{}")));}
     catch(org.json.JSONException ignored){}
    }
    return o.toString();
   }catch(Exception e){return "";}
  }
  /** El gasto de bateria de la ultima grabacion, medido por el servicio.
   *  Cadena vacia mientras no haya ninguna cerrada: beginRecording() la
   *  borra, para que al parar no se lea el resumen de la salida anterior. */
  @JavascriptInterface public String gastoBateria(){
   try{return getSharedPreferences("tracking_live",MODE_PRIVATE).getString("gasto","");}
   catch(Exception e){return "";}
  }
  @JavascriptInterface public String getTrackingSnapshot(){return trackingSnapshot("");}
  @JavascriptInterface public String getTrackingSnapshotIfChanged(String knownVersion){return trackingSnapshot(knownVersion);}
  private String trackingSnapshot(String knownVersion){
   try{
    android.content.SharedPreferences pref=getSharedPreferences("tracking_live",MODE_PRIVATE);
    org.json.JSONObject o=new org.json.JSONObject();
    o.put("active",pref.getBoolean("active",false));
    o.put("recording",pref.getBoolean("recording",false));
    o.put("time",pref.getLong("time",0));
    o.put("lat",pref.getFloat("lat",0f));
    o.put("lon",pref.getFloat("lon",0f));
    o.put("accuracy",pref.getFloat("accuracy",9999));
    File f=new File(getFilesDir(),"trazado-vivo.tsv");
    String trackVersion=f.exists()?f.lastModified()+":"+f.length():"none";
    o.put("trackVersion",trackVersion);
    if(trackVersion.equals(knownVersion))return o.toString();
    // Se devuelven los ULTIMOS puntos, no los primeros, y ya no hay un corte
    // por tamaño que dejaba la lista VACIA. Antes: si el fichero pasaba de
    // 1,5 MB no se devolvia ni un punto -la linea roja desaparecia de golpe-,
    // y con menos se leian los 25.000 PRIMEROS, asi que en una salida muy
    // larga el trazado dejaba de avanzar en pantalla mientras el GPX seguia
    // creciendo. Andando se anota un punto cada dos segundos: 25.000 son unas
    // catorce horas, de modo que esto solo se nota en salidas muy largas,
    // pero cuando se nota lo que interesa es lo ULTIMO, no lo primero.
    // El GPX no se toca: ahi va todo.
    org.json.JSONArray pts=new org.json.JSONArray();
    if(f.exists()&&f.length()<50000000){
     java.util.ArrayDeque<String> cola=new java.util.ArrayDeque<>();
     try(BufferedReader br=new BufferedReader(new FileReader(f))){
      String line;
      while((line=br.readLine())!=null){
       cola.addLast(line);
       if(cola.size()>25000)cola.removeFirst();
      }
     }
     for(String line:cola){
      if(line.isEmpty()){pts.put(org.json.JSONObject.NULL);continue;}
      String[] p=line.split("\\t");
      if(p.length==2){try{double lat=Double.parseDouble(p[0]),lon=Double.parseDouble(p[1]);if(Double.isFinite(lat)&&Double.isFinite(lon)){org.json.JSONArray coord=new org.json.JSONArray();coord.put(lat);coord.put(lon);pts.put(coord);}}catch(Exception ignored){}}
     }
    }
    o.put("points",pts);
    return o.toString();
   }catch(Exception e){android.util.Log.w("TrabakutikGPS","No se pudo leer seguimiento nativo",e);return "";}
  }
  @JavascriptInterface public String getLastLocation(){
   if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED &&
      checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)!=PackageManager.PERMISSION_GRANTED)return "";
   try{
    LocationManager lm=(LocationManager)getSystemService(LOCATION_SERVICE);
    Location best=null;
    for(String provider:new String[]{LocationManager.GPS_PROVIDER,LocationManager.NETWORK_PROVIDER,LocationManager.PASSIVE_PROVIDER}){
     try{
      Location l=lm.getLastKnownLocation(provider);
      if(l==null)continue;
      long age=System.currentTimeMillis()-l.getTime();
      if(age<0||age>120000)continue;
      if(best==null||l.getTime()>best.getTime()&&l.getAccuracy()<best.getAccuracy()*2)best=l;
     }catch(Exception ignored){}
    }
    if(best==null)return "";
    org.json.JSONObject o=new org.json.JSONObject();
    o.put("lat",best.getLatitude());o.put("lon",best.getLongitude());
    o.put("accuracy",best.hasAccuracy()?best.getAccuracy():9999);
    o.put("age",Math.max(0,System.currentTimeMillis()-best.getTime()));
    return o.toString();
   }catch(Exception e){return "";}
  }
  @JavascriptInterface public void setRoute(String json){
   try{
    org.json.JSONArray list=new org.json.JSONArray(json);
    if(list.length()<2||list.length()>15000||json.length()>2000000)return;
    File f=new File(getFilesDir(),"ruta-activa.json");
    try(FileOutputStream out=new FileOutputStream(f)){out.write(json.getBytes(java.nio.charset.StandardCharsets.UTF_8));}
    // Y AVISAR AL SERVICIO. Antes solo se guardaba el fichero, con un
    // comentario que decia que NAVIGATE lo lee una vez al empezar. Eso dejaba
    // al servicio midiendo la ruta vieja: al cambiar de ruta con el servicio
    // vivo, y -peor- al llegar el trazado fino despues de empezar a navegar,
    // porque desde la 4.0 los GIROS si se refrescaban (accion TURNS) y los
    // puntos no. Giros del trazado fino sobre los puntos del general: avisos
    // donde no toca, y con la pantalla bloqueada ni te enteras de por que.
    // Como TURNS: solo si hay servicio vivo, aqui no se arranca nada.
    if(TrackingService.ACTIVO){
     try{startService(new Intent(MainActivity.this,TrackingService.class).setAction("ROUTE"));}
     catch(Exception ignored2){}
    }
   }catch(Exception ignored){}
  }
  // La pagina decide si vas al reves comparando tu rumbo con el del tramo.
  // El servicio lo necesita para sus avisos con la pantalla apagada. No
  // arranca nada: si no hay servicio vivo, no hay a quien avisar.
  @JavascriptInterface public void setSentido(int s){
   try{
    if(!TrackingService.ACTIVO)return;
    startService(new Intent(MainActivity.this,TrackingService.class)
      .setAction("SENTIDO").putExtra("sentido",s<0?-1:1));
   }catch(Exception e){android.util.Log.w("TrabakutikGPS","No se pudo enviar el sentido",e);}
  }
  @JavascriptInterface public void setJunctions(String json){
   try{
    org.json.JSONArray turns=new org.json.JSONArray(json);
    if(turns.length()>400||json.length()>40000)return;
    File f=new File(getFilesDir(),"giros-activos.json");
    try(FileOutputStream out=new FileOutputStream(f)){out.write(json.getBytes(java.nio.charset.StandardCharsets.UTF_8));}
    // Antes esto se quedaba aqui: «se leen al iniciar NAVIGATE». Pero si ya
    // se estaba navegando, el servicio no se enteraba nunca y se quedaba sin
    // giros -o con los de la ruta anterior-, mientras la pagina se callaba
    // por cederle el turno. Resultado: los giros no los avisaba nadie. La
    // orden TURNS existia en el servicio y no la mandaba nadie.
    if(!TrackingService.ACTIVO)return;
    try{startService(new Intent(MainActivity.this,TrackingService.class).setAction("TURNS"));}
    catch(Exception ignored){}
   }catch(Exception e){android.util.Log.w("TrabakutikGPS","No se pudieron registrar giros",e);}
  }
  @JavascriptInterface public void stopNavigation(){
   runOnUiThread(()->{
    new File(getFilesDir(),"ruta-activa.json").delete();
    new File(getFilesDir(),"giros-activos.json").delete();
    // La misma guarda que clearRoute, y por la misma razon: sin ella esto
    // puede LEVANTAR un servicio -con su motor de voz- solo para matarlo.
    // Antes solo lo llamaba una persona tocando la equis; ahora tambien lo
    // llama la pagina sola, asi que la guarda hace falta de verdad.
    if(!TrackingService.ACTIVO)return;
    try{startService(new Intent(MainActivity.this,TrackingService.class).setAction("STOP_NAVIGATION"));}
    catch(Exception e){android.util.Log.w("TrabakutikGPS","No se pudo detener la navegacion",e);}
   });
  }
  @JavascriptInterface public void clearRoute(){
    File f=new File(getFilesDir(),"ruta-activa.json");if(f.exists())f.delete();
    File turns=new File(getFilesDir(),"giros-activos.json");if(turns.exists())turns.delete();
    // Borrar los ficheros NO basta: el servicio ya tiene la ruta y los giros
    // cargados en memoria y sigue pitando giros y «fuera de ruta» de una ruta
    // que el usuario acaba de quitar. Hay que decirselo.
    // Se sigue sin crear un servicio para nada: si no hay ninguno vivo
    // (TrackingService.ACTIVO) no se manda nada, que es lo que buscaba el
    // comentario que habia aqui.
    if(!TrackingService.ACTIVO)return;
    runOnUiThread(()->{
     try{startService(new Intent(MainActivity.this,TrackingService.class).setAction("STOP_NAVIGATION"));}
     catch(Exception e){android.util.Log.w("TrabakutikGPS","No se pudo parar la navegacion al quitar la ruta",e);}
    });
  }
  @JavascriptInterface public void startNavigationWithRoute(String json){
    try{
      org.json.JSONArray list=new org.json.JSONArray(json);
      if(list.length()<2||list.length()>15000||json.length()>2000000)return;
      File f=new File(getFilesDir(),"ruta-activa.json");
      try(FileOutputStream out=new FileOutputStream(f)){out.write(json.getBytes(java.nio.charset.StandardCharsets.UTF_8));}
      runOnUiThread(()->startNavigationService());
    }catch(Exception e){android.util.Log.e("TrabakutikGPS","Ruta de navegacion incorrecta",e);}
  }
  @JavascriptInterface public void startNavigation(){runOnUiThread(()->startNavigationService());}
  @JavascriptInterface public void startRecording(){runOnUiThread(()->startTrack());}
  @JavascriptInterface public void stopRecording(){runOnUiThread(()->stopNativeRecording());}
  // Pausar y reanudar la grabacion. No arrancan nada: si no hay servicio
  // vivo, no hay nada que pausar.
  @JavascriptInterface public void pauseRecording(){enviaAlServicio("PAUSE");}
  @JavascriptInterface public void resumeRecording(){enviaAlServicio("RESUME");}
  private void enviaAlServicio(String accion){
   try{
    if(!TrackingService.ACTIVO)return;
    startService(new Intent(MainActivity.this,TrackingService.class).setAction(accion));
   }catch(Exception e){android.util.Log.w("TrabakutikGPS","No se pudo enviar "+accion,e);}
  }
  @JavascriptInterface public void saveRecording(){runOnUiThread(()->saveTrack());}
  @JavascriptInterface public void discardRecording(){runOnUiThread(()->{discardLastRecording();new File(getFilesDir(),"trazado-vivo.tsv").delete();});}
  // Guardar dejaba el fichero en el almacenamiento y ahi se acababa: Android
  // lo ofrecia con el tipo application/gpx+xml, que casi ninguna app
  // registra, asi que no habia con que abrirlo. Wikiloc y OsmAnd reciben
  // rutas por la hoja de compartir, y para eso hace falta una URI de
  // contenido: desde Android 7 no se puede pasar un file:// a otra app.
  @JavascriptInterface public void shareGpx(String filename,String xml){
   if(xml==null||xml.length()>3000000||!xml.startsWith("<?xml"))return;
   String safe=filename==null?"trabakutik.gpx":filename.replaceAll("[^a-zA-Z0-9._-]","_");
   if(!safe.endsWith(".gpx"))safe+=".gpx";
   final String name=safe;
   runOnUiThread(()->{
    try{
     java.io.File dir=new java.io.File(getCacheDir(),"compartir");
     if(!dir.exists()&&!dir.mkdirs())throw new java.io.IOException("sin carpeta");
     // Buzon de salida, no archivo: se vacia antes de cada envio para no ir
     // dejando copias de todas las rutas en la cache.
     java.io.File[] viejos=dir.listFiles();
     if(viejos!=null)for(java.io.File v:viejos)v.delete();
     java.io.File f=new java.io.File(dir,name);
     java.io.Writer w=new java.io.OutputStreamWriter(new java.io.FileOutputStream(f),"UTF-8");
     try{w.write(xml);}finally{w.close();}
     android.net.Uri uri=androidx.core.content.FileProvider.getUriForFile(
       MainActivity.this,"com.trabakutik.gps.fileprovider",f);
     Intent envio=new Intent(Intent.ACTION_SEND)
       .setType("application/gpx+xml")
       .putExtra(Intent.EXTRA_STREAM,uri)
       .putExtra(Intent.EXTRA_SUBJECT,name)
       .putExtra(Intent.EXTRA_TITLE,name)
       .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
     startActivity(Intent.createChooser(envio,"Enviar la ruta"));
    }catch(Exception e){
     Toast.makeText(MainActivity.this,"No se pudo preparar el GPX para compartir",Toast.LENGTH_SHORT).show();
    }
   });
  }
  @JavascriptInterface public void saveGpx(String filename,String xml){
   if(xml==null||xml.length()>3000000||!xml.startsWith("<?xml"))return;
   String safe=filename==null?"trabakutik.gpx":filename.replaceAll("[^a-zA-Z0-9._-]","_");
   if(!safe.endsWith(".gpx"))safe+=".gpx";
   final String name=safe;
   // Ya no se pasa por el selector si se puede evitar. El selector decide el
   // nombre final y con un tipo que no conoce se comia el «.gpx»: el autor
   // acabo con un fichero llamado «froga3» que no abria nada. Escribiendolo
   // en Descargas por MediaStore el nombre lo ponemos nosotros, y por si
   // acaso se comprueba como quedo y se corrige. El selector queda de
   // reserva para Android 9 y anteriores.
   runOnUiThread(()->{
    if(android.os.Build.VERSION.SDK_INT>=29&&guardaEnDescargas(name,xml))return;
    pendingGpx=xml;Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("*/*");i.putExtra(Intent.EXTRA_TITLE,name);startActivityForResult(i,201);});
  }
 }
 void startNavigationService(){ensureGpsPermissions("NAVIGATE");}
 int dp(int px){return Math.round(px*getResources().getDisplayMetrics().density);}
 // TrackingService.ACTIVO y no «serviceActive»: ese campo es de ESTA
 // instancia de la Activity y nace en false. Si Android rehace la pantalla
 // -girarla, o recuperarla despues de un rato en segundo plano- mientras el
 // servicio sigue vivo, la instancia nueva lo tenia en false y «Parar» no
 // mandaba nada: la pantalla se quedaba como parada y el servicio seguia
 // grabando. ACTIVO es estatica del servicio, que va en el mismo proceso.
 void stopNativeRecording(){if(TrackingService.ACTIVO)startService(new Intent(this,TrackingService.class).setAction("STOP_RECORD"));}
 void discardLastRecording(){File dir=new File(getFilesDir(),"grabaciones");File[] files=dir.listFiles((d,n)->n.endsWith(".gpx"));if(files==null||files.length==0)return;File last=files[0];for(File f:files)if(f.lastModified()>last.lastModified())last=f;if(last.delete())Toast.makeText(this,"Grabación descartada",Toast.LENGTH_SHORT).show();}
 // Configuración inicial: Android concede cada permiso únicamente tras confirmación.
 void beginPermissionSetup(){
  if(getPreferences(MODE_PRIVATE).getBoolean("initial_permissions_guided_v1",false))return;
  new AlertDialog.Builder(this).setTitle("Preparar Trabakutik GPS")
   .setMessage("Para navegar y grabar con la pantalla bloqueada, permite la ubicación precisa y las notificaciones. Después podrás revisar la batería para evitar que Samsung suspenda el GPS.")
   .setPositiveButton("Configurar", (d,w)->requestStartupLocation())
   .setNegativeButton("Más tarde",(d,w)->getPreferences(MODE_PRIVATE).edit().putBoolean("initial_permissions_guided_v1",true).apply())
   .show();
 }
 void requestStartupLocation(){
  if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){
   requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},100);return;
  }
  requestStartupNotifications();
 }
 void requestStartupNotifications(){
  if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED){
   requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},101);return;
  }
  showBatterySetup();
 }
 void showBatteryReminderIfNeeded(){
  if(getPreferences(MODE_PRIVATE).getBoolean("battery_reminder_v13",false))return;
  getPreferences(MODE_PRIVATE).edit().putBoolean("battery_reminder_v13",true).apply();
  new AlertDialog.Builder(this).setTitle("GPS con pantalla bloqueada")
   .setMessage("Para que Samsung no suspenda el seguimiento cuando se apaga la pantalla, configura Trabakutik GPS en Batería > No restringido. Debes elegirlo tú; la aplicación no puede cambiarlo automáticamente. Puede aumentar el consumo de batería.")
   .setPositiveButton("Abrir ajustes", (d,w)->openBatteryAppSettings())
   .setNegativeButton("Ahora no",null).show();
 }
 void openBatteryAppSettings(){
  try{
   Intent intent=new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,android.net.Uri.parse("package:"+getPackageName()));
   startActivity(intent);
  }catch(Exception e){Toast.makeText(this,"Ajustes > Aplicaciones > Trabakutik GPS > Batería",Toast.LENGTH_LONG).show();}
 }
 void showBatterySetup(){
  getPreferences(MODE_PRIVATE).edit().putBoolean("initial_permissions_guided_v1",true).putBoolean("battery_reminder_v13",true).apply();
  new AlertDialog.Builder(this).setTitle("Grabación con pantalla apagada")
   .setMessage("Para reducir cortes del track, en Ajustes de Trabakutik GPS revisa Batería y selecciona Sin restricciones si tu Samsung lo permite. Android no deja que la aplicación active esta opción por sí sola.")
   .setPositiveButton("Abrir ajustes", (d,w)->{
    openBatteryAppSettings();
   })
   .setNegativeButton("Ahora no",null).show();
 }
 void startTrack(){ensureGpsPermissions("START");}
 void ensureGpsPermissions(String action){
  pendingGpsAction=action;
  if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){
   requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},100);return;
  }
  if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED){
   requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},101);return;
  }
  launchGps();
 }
 void launchGps(){
  if(pendingGpsAction==null)return;
  String action=pendingGpsAction;pendingGpsAction=null;
  // Sin «serviceActive»: ese campo se ha quitado. Era estado de la Activity
  // que fingia saber si el servicio estaba vivo, y despues de rehacerse la
  // pantalla mentia. Quien lo sabe es TrackingService.ACTIVO.
  try{startForegroundService(new Intent(this,TrackingService.class).setAction(action));}
  catch(Exception ex){Toast.makeText(this,"No se pudo activar el GPS. Revisa permisos y ubicación.",Toast.LENGTH_LONG).show();}
 }
 private static final int SOS_LOCATION_PERMISSION=102;
 private final Handler sosHandler=new Handler(Looper.getMainLooper());
 private LocationListener sosListener;
 private AlertDialog sosDialog;
 private final Runnable sosTimeout=()->{
  stopSosLocation();
  Toast.makeText(this,"SOS: no hay una posición reciente y precisa. Vuelve a intentarlo.",Toast.LENGTH_LONG).show();
 };
 private void stopSosLocation(){
  sosHandler.removeCallbacks(sosTimeout);
  if(sosListener==null)return;
  LocationListener listener=sosListener;
  sosListener=null;
  LocationManager manager=(LocationManager)getSystemService(LOCATION_SERVICE);
  if(manager!=null)try{manager.removeUpdates(listener);}catch(SecurityException ignored){}
 }
 private static boolean usableSosLocation(Location location){
  if(location==null||!location.hasAccuracy()||location.getElapsedRealtimeNanos()<=0)return false;
  long age=SystemClock.elapsedRealtimeNanos()-location.getElapsedRealtimeNanos();
  return age>=0&&age<=10_000_000_000L&&location.getAccuracy()>=0&&location.getAccuracy()<=35
    &&Math.abs(location.getLatitude())<=90&&Math.abs(location.getLongitude())<=180;
 }
 private void startSosLocation(){
  if(appEnSegundoPlano||isFinishing()||isDestroyed()||sosListener!=null||sosDialog!=null)return;
  if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){
   requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},SOS_LOCATION_PERMISSION);
   return;
  }
  LocationManager manager=(LocationManager)getSystemService(LOCATION_SERVICE);
  if(manager==null)return;
  String[] providers={LocationManager.GPS_PROVIDER,LocationManager.NETWORK_PROVIDER};
  try{
   Location latest=null;
   boolean enabled=false;
   for(String provider:providers){
    if(!manager.isProviderEnabled(provider))continue;
    enabled=true;
    Location fix=manager.getLastKnownLocation(provider);
    if(usableSosLocation(fix)&&(latest==null||fix.getElapsedRealtimeNanos()>latest.getElapsedRealtimeNanos()))latest=fix;
   }
   if(latest!=null){confirmSosLocation(manager,latest);return;}
   if(!enabled){
    Toast.makeText(this,"Activa la ubicación del teléfono para compartir las coordenadas.",Toast.LENGTH_LONG).show();
    return;
   }
   sosListener=new LocationListener(){
    @Override public void onLocationChanged(Location location){
     if(sosListener!=this||!usableSosLocation(location))return;
     stopSosLocation();
     if(!appEnSegundoPlano&&!isFinishing()&&!isDestroyed())confirmSosLocation(manager,location);
    }
    @Override public void onStatusChanged(String provider,int status,Bundle extras){}
    @Override public void onProviderEnabled(String provider){}
    @Override public void onProviderDisabled(String provider){}
   };
   for(String provider:providers)if(manager.isProviderEnabled(provider))
    manager.requestLocationUpdates(provider,0,0,sosListener,Looper.getMainLooper());
   sosHandler.postDelayed(sosTimeout,20_000);
   Toast.makeText(this,"SOS: buscando una posición precisa…",Toast.LENGTH_SHORT).show();
  }catch(SecurityException|IllegalArgumentException e){
   stopSosLocation();
   Toast.makeText(this,"SOS: revisa la ubicación y sus permisos.",Toast.LENGTH_LONG).show();
  }
 }
 private void confirmSosLocation(LocationManager manager,Location location){
  // EL MENSAJE DEL SOS, EN TRES LINEAS Y POR ESTE ORDEN. Antes salian solo
  // las coordenadas y quien lo recibia no sabia si era una emergencia o si
  // le estabas enseñando donde habias comido. Lo dijo el autor al probarlo.
  //  1. QUE PASA, en mayusculas y lo primero que se lee.
  //  2. UN ENLACE que abre el mapa de un toque. Esto es lo que mas cambia:
  //     con numeros sueltos hay que copiarlos a mano, y con prisa eso no lo
  //     hace nadie. El enlace de Google Maps abre la aplicacion si la hay y
  //     el navegador si no, asi que le vale a cualquiera que lo reciba.
  //  3. LOS NUMEROS, su precision y de cuando son, por si el enlace falla o
  //     quien lo lee los quiere meter en otro sitio.
  // Y nada mas: cuanto mas corto, antes se entiende.
  String grados=String.format(java.util.Locale.ROOT,"%.6f, %.6f",location.getLatitude(),location.getLongitude());
  String mapa=String.format(java.util.Locale.ROOT,"https://maps.google.com/?q=%.6f,%.6f",
    location.getLatitude(),location.getLongitude());
  String message="NECESITO AYUDA\n"+mapa+"\n"+grados+" · ±"+(int)Math.ceil(location.getAccuracy())+" m";
  long age=Math.max(0,(SystemClock.elapsedRealtimeNanos()-location.getElapsedRealtimeNanos())/1_000_000_000L);
  sosDialog=new AlertDialog.Builder(this).setTitle("Pedir ayuda")
   .setMessage(message+" · tomada hace "+age+" s\n\nEsto es lo que se va a enviar. El envío depende del medio que elijas.")
   .setNegativeButton("Cancelar",null).setPositiveButton("Elegir destinatario",(dialog,which)->{
    // AQUI NO SE VUELVE A EXIGIR QUE LA POSICION SEA RECIENTE, y es a
    // proposito. Antes se repetia la comprobacion de los 10 segundos, pero
    // la posicion ya no cambia: solo envejece mientras lees el aviso. O sea
    // que habia que leer y decidir en seis o siete segundos o te decia «la
    // posicion ya no es reciente» y, como el dialogo se cierra solo al
    // pulsar, a empezar otra vez. Con frio, con nervios o con alguien en el
    // suelo, eso no funciona. Y no hace falta: una coordenada de hace dos
    // minutos le sigue valiendo a quien te viene a buscar. Lo que se hace
    // es DECIR la hora dentro del mensaje, que es lo que de verdad necesita
    // quien lo recibe.
    long seg=Math.max(0,(SystemClock.elapsedRealtimeNanos()-location.getElapsedRealtimeNanos())/1_000_000_000L);
    String cuando=seg<60?"hace "+seg+" s":"hace "+(seg/60)+" min";
    Intent share=new Intent(Intent.ACTION_SEND).setType("text/plain")
      .putExtra(Intent.EXTRA_TEXT,message+" · tomada "+cuando);
    try{startActivity(Intent.createChooser(share,"Compartir coordenadas SOS"));}
    catch(ActivityNotFoundException e){
     Toast.makeText(this,"No hay ninguna aplicación para compartir las coordenadas.",Toast.LENGTH_LONG).show();
    }
   }).create();
  sosDialog.setOnDismissListener(dialog->sosDialog=null);
  sosDialog.show();
 }
 @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] results){
  super.onRequestPermissionsResult(code,permissions,results);
  if(code==SOS_LOCATION_PERMISSION){
   // En algunos moviles la pantalla del permiso manda la app a segundo
   // plano, y la respuesta llega ANTES de que vuelva al frente. Ahi
   // startSosLocation se iba sin hacer nada y sin decirlo: concedias el
   // permiso y no pasaba absolutamente nada. Si llega asi, se apunta y se
   // retoma al volver. Pasado un minuto ya no, que un SOS que aparece solo
   // media hora despues asusta mas que ayuda.
   if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED){
    if(appEnSegundoPlano)sosPendienteDesde=SystemClock.elapsedRealtime();
    else startSosLocation();
   }
   else Toast.makeText(this,"Permite la ubicación precisa para compartir tus coordenadas.",Toast.LENGTH_LONG).show();
   return;
  }
  if(code!=100&&code!=101)return;
  if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){
   // Hay que mirar si veniamos de una accion ANTES de borrarla: decia
   // «if(pendingGpsAction==null)» despues de ponerla a null, o sea que
   // entraba siempre y el aviso de la bateria saltaba tambien a quien
   // acababa de denegar la ubicacion, donde no pinta nada. El dialogo de
   // la bateria solo es el siguiente paso de la configuracion inicial.
   boolean veniaDeUnaAccion=pendingGpsAction!=null;
   pendingGpsAction=null;
   Toast.makeText(this,"Para navegar necesitas permitir la ubicación precisa.",Toast.LENGTH_LONG).show();
   if(!veniaDeUnaAccion)showBatterySetup();
   return;
  }
  if(pendingGpsAction!=null){
   if(code==101){launchGps();return;}
   ensureGpsPermissions(pendingGpsAction);
  }else if(code==100)requestStartupNotifications();
  else if(code==101)showBatterySetup();
 }
 void saveTrack(){File dir=new File(getFilesDir(),"grabaciones");File[] all=dir.listFiles((d,n)->n.endsWith(".gpx"));if(all==null||all.length==0){Toast.makeText(this,"Primero graba y para una ruta",Toast.LENGTH_SHORT).show();return;}File latest=null;for(File f:all)if(f.length()>0&&(latest==null||f.lastModified()>latest.lastModified()))latest=f;
 if(latest==null){Toast.makeText(this,"Primero graba y para una ruta",Toast.LENGTH_SHORT).show();return;}
 // Red de seguridad: nunca exportar un GPX sin cerrar. Solo si no hay
 // servicio vivo, que si lo hay es el que lo esta escribiendo y lo cerrara el.
 if(!TrackingService.ACTIVO)TrackingService.cierraGpxSiQuedoAbierto(latest);
 exportFile=latest;
 Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("*/*");i.putExtra(Intent.EXTRA_TITLE,latest.getName());startActivityForResult(i,200);}
 // El selector de Android decide el nombre final, y con un tipo que no
 // conoce se come la extension: el autor acabo con «froga3» a secas, sin
 // «.gpx», y asi no hay app que lo reconozca. Se comprueba como quedo y, si
 // falta, se renombra. ExternalStorageProvider admite renombrar.
 String aseguraExtensionGpx(android.net.Uri uri){
  String nombre=null;
  android.database.Cursor c=getContentResolver().query(uri,
    new String[]{android.provider.OpenableColumns.DISPLAY_NAME},null,null,null);
  if(c!=null)try{if(c.moveToFirst())nombre=c.getString(0);}finally{c.close();}
  if(nombre==null)return "GPX";
  if(nombre.toLowerCase(java.util.Locale.ROOT).endsWith(".gpx"))return nombre;
  try{
   android.net.Uri nueva=android.provider.DocumentsContract.renameDocument(
     getContentResolver(),uri,nombre+".gpx");
   if(nueva!=null)return nombre+".gpx";
  }catch(Exception ignored){}
  return nombre;
 }
 @Override public void onActivityResult(int code,int result,Intent data){super.onActivityResult(code,result,data);if(code==302){if(pendingFileChooser!=null){android.net.Uri[] selection=result==RESULT_OK&&data!=null&&data.getData()!=null?new android.net.Uri[]{data.getData()}:null;pendingFileChooser.onReceiveValue(selection);pendingFileChooser=null;}return;}if(code==201&&result==RESULT_OK&&data!=null&&pendingGpx!=null){try(java.io.OutputStream out=getContentResolver().openOutputStream(data.getData())){out.write(pendingGpx.getBytes(java.nio.charset.StandardCharsets.UTF_8));}catch(Exception e){Toast.makeText(this,"No se pudo guardar el GPX",Toast.LENGTH_SHORT).show();pendingGpx=null;return;}try{String fin=aseguraExtensionGpx(data.getData());Toast.makeText(this,"Guardado como "+fin,Toast.LENGTH_LONG).show();}catch(Exception e){Toast.makeText(this,"GPX guardado",Toast.LENGTH_SHORT).show();}pendingGpx=null;}if(code==200&&result==RESULT_OK&&data!=null&&exportFile!=null){boolean copiado=true;try(java.io.InputStream in=new java.io.FileInputStream(exportFile);java.io.OutputStream out=getContentResolver().openOutputStream(data.getData())){byte[] buf=new byte[8192];int n;while((n=in.read(buf))>0)out.write(buf,0,n);}catch(Exception e){copiado=false;Toast.makeText(this,"No se pudo guardar",Toast.LENGTH_SHORT).show();}if(copiado){String fin;try{fin=aseguraExtensionGpx(data.getData());}catch(Exception e){fin="GPX";}Toast.makeText(this,"Guardado como "+fin,Toast.LENGTH_LONG).show();new File(getFilesDir(),"trazado-vivo.tsv").delete();web.evaluateJavascript("window.trabakutikNativeGpxSaved&&window.trabakutikNativeGpxSaved()",null);}}}
 @Override public void onBackPressed(){WebView current=showingGps?web:webRoutes;if(current.canGoBack())current.goBack();else if(!showingGps)showScreen(true);else super.onBackPressed();}
}
