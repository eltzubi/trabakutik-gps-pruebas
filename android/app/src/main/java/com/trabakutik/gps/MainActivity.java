package com.trabakutik.gps;
import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.*;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationManager;
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
 WebView web,webRoutes; FrameLayout pages; TextView switchPage; boolean showingGps=true; File exportFile; String pendingGpx=null; String pendingGpsAction=null; String lastWebUrl="https://trabakutik.com/"; long lastRouteOpenAt=0; String lastRouteOpenUrl=""; ValueCallback<android.net.Uri[]> pendingFileChooser;
 @Override public void onCreate(Bundle b) {
  super.onCreate(b);
  CrashReport.install(this);
  getWindow().setStatusBarColor(0xff07131d);
  getWindow().setNavigationBarColor(0xff07131d);
  LinearLayout root=new LinearLayout(this);root.setOrientation(1);root.setBackgroundColor(0xff07131d);
  LinearLayout bar=new LinearLayout(this);
  bar.setGravity(android.view.Gravity.CENTER_VERTICAL);
  bar.setPadding(dp(12),dp(1),dp(9),dp(1));
  bar.setBackgroundColor(0xff0b1e28);
  TextView title=new TextView(this);
  title.setText("Trabakutik");title.setTextColor(0xffd9edec);title.setTextSize(12);
  title.setTypeface(null,1);title.setGravity(android.view.Gravity.CENTER_VERTICAL);
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
  showScreen(false);
  web.loadUrl("https://eltzubi.github.io/trabakutik-gps-pruebas/nuevo.html?appversion=20261030b");
  webRoutes.loadUrl("https://trabakutik.com/");
  if(getPreferences(MODE_PRIVATE).getBoolean("initial_permissions_guided_v1",false))showBatteryReminderIfNeeded();
  else beginPermissionSetup();
 }
 void restoreGpsWeb(){
  if(web==null)return;
  web.evaluateJavascript("window.trabakutikSyncNative&&window.trabakutikSyncNative()",null);
 }
 @Override protected void onResume(){
  super.onResume();
  if(web!=null&&showingGps)web.postDelayed(this::restoreGpsWeb,300);
 }
 void showScreen(boolean gps){
  showingGps=gps;
  if(web==null||webRoutes==null)return;
  web.setVisibility(gps?View.VISIBLE:View.GONE);
  webRoutes.setVisibility(gps?View.GONE:View.VISIBLE);
  web.setImportantForAccessibility(gps?View.IMPORTANT_FOR_ACCESSIBILITY_AUTO:View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
  webRoutes.setImportantForAccessibility(gps?View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS:View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);
  switchPage.setText(gps?"Web":"Navegador");
  if(!gps&&webRoutes!=null&&"about:blank".equals(webRoutes.getUrl())){
   webRoutes.loadUrl(lastWebUrl);
  }
  web.postDelayed(()->{if(gps){web.evaluateJavascript("window.dispatchEvent(new Event('resize'))",null);restoreGpsWeb();}},120);
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
  if(navigator)w.addJavascriptInterface(new Bridge(),"TrabakutikAndroid");
  else w.addJavascriptInterface(new RouteBridge(),"TrabakutikRoutes");
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
      view.evaluateJavascript("(function(){if(window.__routeLinkFixed)return;window.__routeLinkFixed=1;document.addEventListener('click',function(e){var a=e.target.closest('a[href]');if(a&&a.href.indexOf('https://eltzubi.github.io/trabakutik-gps-pruebas/nuevo.html')===0){e.preventDefault();e.stopPropagation();TrabakutikRoutes.openNavigator(a.href);}},true)})()",null);
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
  @JavascriptInterface public void openNavigator(String url){
   if(url!=null&&url.startsWith("https://eltzubi.github.io/trabakutik-gps-pruebas/nuevo.html"))
    runOnUiThread(()->openRouteUrl(url));
  }
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
  @JavascriptInterface public void clearLiveTrack(){new File(getFilesDir(),"trazado-vivo.tsv").delete();}
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
    org.json.JSONArray pts=new org.json.JSONArray();
    if(f.exists()&&f.length()<1500000){
     try(BufferedReader br=new BufferedReader(new FileReader(f))){
      String line;int count=0;
      while((line=br.readLine())!=null&&count<25000){
       if(line.isEmpty()){pts.put(org.json.JSONObject.NULL);continue;}
       String[] p=line.split("\\t");
       if(p.length==2){try{double lat=Double.parseDouble(p[0]),lon=Double.parseDouble(p[1]);if(Double.isFinite(lat)&&Double.isFinite(lon)){org.json.JSONArray coord=new org.json.JSONArray();coord.put(lat);coord.put(lon);pts.put(coord);count++;}}catch(Exception ignored){}}
      }
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
    // No arrancar ni reactivar un servicio por actualizar los puntos.
    // NAVIGATE lee el archivo una sola vez al comenzar la navegación.
   }catch(Exception ignored){}
  }
  @JavascriptInterface public void setJunctions(String json){
   try{
    org.json.JSONArray turns=new org.json.JSONArray(json);
    if(turns.length()>400||json.length()>40000)return;
    File f=new File(getFilesDir(),"giros-activos.json");
    try(FileOutputStream out=new FileOutputStream(f)){out.write(json.getBytes(java.nio.charset.StandardCharsets.UTF_8));}
    // Los giros quedan guardados y se leen al iniciar NAVIGATE.
   }catch(Exception e){android.util.Log.w("TrabakutikGPS","No se pudieron registrar giros",e);}
  }
  @JavascriptInterface public void stopNavigation(){
   runOnUiThread(()->{
    new File(getFilesDir(),"ruta-activa.json").delete();
    new File(getFilesDir(),"giros-activos.json").delete();
    try{startService(new Intent(MainActivity.this,TrackingService.class).setAction("STOP_NAVIGATION"));}
    catch(Exception e){android.util.Log.w("TrabakutikGPS","No se pudo detener la navegacion",e);}
   });
  }
  @JavascriptInterface public void clearRoute(){
    File f=new File(getFilesDir(),"ruta-activa.json");if(f.exists())f.delete();
    File turns=new File(getFilesDir(),"giros-activos.json");if(turns.exists())turns.delete();
    // No crear un servicio solo para limpiar una ruta ya inactiva.
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
  @JavascriptInterface public void saveRecording(){runOnUiThread(()->saveTrack());}
  @JavascriptInterface public void discardRecording(){runOnUiThread(()->{discardLastRecording();new File(getFilesDir(),"trazado-vivo.tsv").delete();});}
  @JavascriptInterface public void saveGpx(String filename,String xml){
   if(xml==null||xml.length()>3000000||!xml.startsWith("<?xml"))return;
   String safe=filename==null?"trabakutik.gpx":filename.replaceAll("[^a-zA-Z0-9._-]","_");
   if(!safe.endsWith(".gpx"))safe+=".gpx";
   final String name=safe;
   runOnUiThread(()->{pendingGpx=xml;Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("application/gpx+xml");i.putExtra(Intent.EXTRA_TITLE,name);startActivityForResult(i,201);});
  }
 }
 boolean serviceActive=false;
 void startNavigationService(){ensureGpsPermissions("NAVIGATE");}
 boolean onNavigator(){return showingGps;}
 int dp(int px){return Math.round(px*getResources().getDisplayMetrics().density);}
 void stopNativeRecording(){if(serviceActive)startService(new Intent(this,TrackingService.class).setAction("STOP_RECORD"));}
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
  try{serviceActive=true;startForegroundService(new Intent(this,TrackingService.class).setAction(action));}
  catch(Exception ex){serviceActive=false;Toast.makeText(this,"No se pudo activar el GPS. Revisa permisos y ubicación.",Toast.LENGTH_LONG).show();}
 }
 @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] results){
  super.onRequestPermissionsResult(code,permissions,results);
  if(code!=100&&code!=101)return;
  if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){
   pendingGpsAction=null;
   Toast.makeText(this,"Para navegar necesitas permitir la ubicación precisa.",Toast.LENGTH_LONG).show();
   if(pendingGpsAction==null)showBatterySetup();
   return;
  }
  if(pendingGpsAction!=null){
   if(code==101){launchGps();return;}
   ensureGpsPermissions(pendingGpsAction);
  }else if(code==100)requestStartupNotifications();
  else if(code==101)showBatterySetup();
 }
 void saveTrack(){File dir=new File(getFilesDir(),"grabaciones");File[] all=dir.listFiles((d,n)->n.endsWith(".gpx"));if(all==null||all.length==0){Toast.makeText(this,"Primero graba y para una ruta",0).show();return;}File latest=null;for(File f:all)if(f.length()>0&&(latest==null||f.lastModified()>latest.lastModified()))latest=f;exportFile=latest;
 Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("application/gpx+xml");i.putExtra(Intent.EXTRA_TITLE,latest.getName());startActivityForResult(i,200);}
 @Override public void onActivityResult(int code,int result,Intent data){super.onActivityResult(code,result,data);if(code==302){if(pendingFileChooser!=null){android.net.Uri[] selection=result==RESULT_OK&&data!=null&&data.getData()!=null?new android.net.Uri[]{data.getData()}:null;pendingFileChooser.onReceiveValue(selection);pendingFileChooser=null;}return;}if(code==201&&result==RESULT_OK&&data!=null&&pendingGpx!=null){try(java.io.OutputStream out=getContentResolver().openOutputStream(data.getData())){out.write(pendingGpx.getBytes(java.nio.charset.StandardCharsets.UTF_8));Toast.makeText(this,"GPX guardado",Toast.LENGTH_SHORT).show();}catch(Exception e){Toast.makeText(this,"No se pudo guardar el GPX",Toast.LENGTH_SHORT).show();}finally{pendingGpx=null;}}if(code==200&&result==RESULT_OK&&data!=null&&exportFile!=null)try(java.io.InputStream in=new java.io.FileInputStream(exportFile);java.io.OutputStream out=getContentResolver().openOutputStream(data.getData())){byte[] buf=new byte[8192];int n;while((n=in.read(buf))>0)out.write(buf,0,n);Toast.makeText(this,"GPX guardado",0).show();new File(getFilesDir(),"trazado-vivo.tsv").delete();web.evaluateJavascript("window.trabakutikNativeGpxSaved&&window.trabakutikNativeGpxSaved()",null);}catch(Exception e){Toast.makeText(this,"No se pudo guardar",0).show();}}
 @Override public void onBackPressed(){WebView current=showingGps?web:webRoutes;if(current.canGoBack())current.goBack();else if(!showingGps)showScreen(true);else super.onBackPressed();}
}
