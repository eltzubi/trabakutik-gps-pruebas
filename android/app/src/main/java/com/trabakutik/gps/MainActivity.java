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
 WebView web,webRoutes; FrameLayout pages; TextView switchPage; boolean showingGps=true; File exportFile; String pendingGpx=null; String pendingGpsAction=null; String lastWebUrl="https://trabakutik.com/";
 @Override public void onCreate(Bundle b) {
  super.onCreate(b);
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
  showScreen(true);
  web.loadUrl("https://eltzubi.github.io/trabakutik-gps-pruebas/nuevo.html?appversion=20261030b");
  webRoutes.loadUrl("https://trabakutik.com/");
  if(getPreferences(MODE_PRIVATE).getBoolean("initial_permissions_guided_v1",false))showBatteryReminderIfNeeded();
  else beginPermissionSetup();
 }
 void showScreen(boolean gps){
  showingGps=gps;
  if(web==null||webRoutes==null)return;
  web.setVisibility(gps?View.VISIBLE:View.GONE);
  webRoutes.setVisibility(gps?View.GONE:View.VISIBLE);
  web.setImportantForAccessibility(gps?View.IMPORTANT_FOR_ACCESSIBILITY_AUTO:View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
  webRoutes.setImportantForAccessibility(gps?View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS:View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);
  switchPage.setText(gps?"Web":"Navegador");
  web.postDelayed(()->{if(gps)web.evaluateJavascript("window.dispatchEvent(new Event('resize'))",null);},80);
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
   @Override public void onGeolocationPermissionsShowPrompt(String origin,GeolocationPermissions.Callback cb){
    cb.invoke(origin,checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED,false);
   }
  });
  w.setWebViewClient(new WebViewClient(){
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
  String current=web.getUrl();
  if(current!=null&&!current.equals(url))web.loadUrl(url);
  showScreen(true);
 }
 public class Bridge {
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
    runOnUiThread(()->{if(serviceActive)getApplicationContext().startService(new Intent(MainActivity.this,TrackingService.class).setAction("ROUTE"));});
   }catch(Exception ignored){}
  }
  @JavascriptInterface public void setJunctions(String json){
   try{
    org.json.JSONArray turns=new org.json.JSONArray(json);
    if(turns.length()>400||json.length()>40000)return;
    File f=new File(getFilesDir(),"giros-activos.json");
    try(FileOutputStream out=new FileOutputStream(f)){out.write(json.getBytes(java.nio.charset.StandardCharsets.UTF_8));}
    runOnUiThread(()->{if(serviceActive)startService(new Intent(MainActivity.this,TrackingService.class).setAction("TURNS"));});
   }catch(Exception e){android.util.Log.w("TrabakutikGPS","No se pudieron registrar giros",e);}
  }
  @JavascriptInterface public void clearRoute(){
    File f=new File(getFilesDir(),"ruta-activa.json");if(f.exists())f.delete();
    File turns=new File(getFilesDir(),"giros-activos.json");if(turns.exists())turns.delete();
    runOnUiThread(()->{if(serviceActive)startService(new Intent(MainActivity.this,TrackingService.class).setAction("ROUTE"));});
  }
  @JavascriptInterface public void startNavigationWithRoute(String json){
    try{
      org.json.JSONArray list=new org.json.JSONArray(json);
      if(list.length()<2||list.length()>15000||json.length()>2000000)return;
      File f=new File(getFilesDir(),"ruta-activa.json");
      try(FileOutputStream out=new FileOutputStream(f)){out.write(json.getBytes(java.nio.charset.StandardCharsets.UTF_8));}
      runOnUiThread(()->{if(serviceActive)startService(new Intent(MainActivity.this,TrackingService.class).setAction("ROUTE"));startNavigationService();});
    }catch(Exception e){android.util.Log.e("TrabakutikGPS","Ruta de navegacion incorrecta",e);}
  }
  @JavascriptInterface public void startNavigation(){runOnUiThread(()->startNavigationService());}
  @JavascriptInterface public void startRecording(){runOnUiThread(()->startTrack());}
  @JavascriptInterface public void stopRecording(){runOnUiThread(()->stopNativeRecording());}
  @JavascriptInterface public void saveRecording(){runOnUiThread(()->saveTrack());}
  @JavascriptInterface public void discardRecording(){runOnUiThread(()->discardLastRecording());}
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
 @Override public void onActivityResult(int code,int result,Intent data){super.onActivityResult(code,result,data);if(code==201&&result==RESULT_OK&&data!=null&&pendingGpx!=null){try(java.io.OutputStream out=getContentResolver().openOutputStream(data.getData())){out.write(pendingGpx.getBytes(java.nio.charset.StandardCharsets.UTF_8));Toast.makeText(this,"GPX guardado",Toast.LENGTH_SHORT).show();}catch(Exception e){Toast.makeText(this,"No se pudo guardar el GPX",Toast.LENGTH_SHORT).show();}finally{pendingGpx=null;}}if(code==200&&result==RESULT_OK&&data!=null&&exportFile!=null)try(java.io.InputStream in=new java.io.FileInputStream(exportFile);java.io.OutputStream out=getContentResolver().openOutputStream(data.getData())){byte[] buf=new byte[8192];int n;while((n=in.read(buf))>0)out.write(buf,0,n);Toast.makeText(this,"GPX guardado",0).show();web.evaluateJavascript("window.trabakutikNativeGpxSaved&&window.trabakutikNativeGpxSaved()",null);}catch(Exception e){Toast.makeText(this,"No se pudo guardar",0).show();}}
 @Override public void onBackPressed(){WebView current=showingGps?web:webRoutes;if(current.canGoBack())current.goBack();else if(!showingGps)showScreen(true);else super.onBackPressed();}
}
