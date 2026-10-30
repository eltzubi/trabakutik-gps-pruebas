package com.trabakutik.gps;
import android.Manifest;
import android.app.Activity;
import android.content.*;
import android.content.pm.PackageManager;
import android.os.*;
import android.view.ViewGroup;
import android.view.View;
import android.view.WindowInsets;
import android.graphics.drawable.GradientDrawable;
import android.webkit.*;
import android.widget.*;
import java.io.*;
import android.webkit.JavascriptInterface;
public class MainActivity extends Activity {
 WebView web; File exportFile; String pendingGpx=null; String pendingGpsAction=null; String lastWebUrl="https://trabakutik.com/";
 @Override public void onCreate(Bundle b) {
  super.onCreate(b);
  getWindow().setStatusBarColor(0xff07131d);
  getWindow().setNavigationBarColor(0xff07131d);
  LinearLayout root=new LinearLayout(this);root.setOrientation(1);root.setBackgroundColor(0xff07131d);
  LinearLayout bar=new LinearLayout(this);bar.setGravity(android.view.Gravity.CENTER_VERTICAL);bar.setPadding(dp(12),dp(2),dp(7),dp(2));bar.setBackgroundColor(0xff0b1e28);
  TextView title=new TextView(this);title.setText("Trabakutik");title.setTextColor(0xffd9edec);title.setTextSize(13);title.setTypeface(null,1);
  title.setGravity(android.view.Gravity.CENTER_VERTICAL);
  bar.addView(title,new LinearLayout.LayoutParams(0,dp(34),1));
  TextView switchPage=new TextView(this);
  switchPage.setText("Web");switchPage.setTextColor(0xffa7d9e4);switchPage.setTextSize(11);switchPage.setTypeface(null,1);
  switchPage.setGravity(android.view.Gravity.CENTER);
  GradientDrawable outline=new GradientDrawable();outline.setColor(0xff112a37);outline.setCornerRadius(dp(13));outline.setStroke(dp(1),0xff355264);switchPage.setBackground(outline);
  LinearLayout.LayoutParams switchParams=new LinearLayout.LayoutParams(dp(82),dp(29));switchParams.setMargins(0,0,dp(4),0);bar.addView(switchPage,switchParams);
  switchPage.setOnClickListener(v->{if(onNavigator())web.loadUrl(lastWebUrl);else web.loadUrl("https://eltzubi.github.io/trabakutik-gps-pruebas/nuevo.html");});
  TextView menu=new TextView(this);menu.setText("⋮");menu.setTextColor(0xffb1c8d4);menu.setTextSize(23);menu.setGravity(android.view.Gravity.CENTER);
  bar.addView(menu,new LinearLayout.LayoutParams(dp(32),dp(34)));
  menu.setOnClickListener(v->{PopupMenu popup=new PopupMenu(this,menu);popup.getMenu().add("● Iniciar grabación GPS").setOnMenuItemClickListener(item->{if(onNavigator())web.evaluateJavascript("document.getElementById('modeRecord').click();document.getElementById('recordStart').click();",null);else startTrack();return true;});popup.getMenu().add("■ Parar grabación").setOnMenuItemClickListener(item->{if(onNavigator())web.evaluateJavascript("if(!document.getElementById('recordStop').classList.contains('hidden'))document.getElementById('recordStop').click();",null);else stopNativeRecording();return true;});popup.getMenu().add("↓ Guardar grabación GPX").setOnMenuItemClickListener(item->{if(onNavigator())web.evaluateJavascript("if(!document.getElementById('saveRecording').classList.contains('hidden'))document.getElementById('saveRecording').click();",null);else saveTrack();return true;});popup.getMenu().add("▤ Ver todas las rutas").setOnMenuItemClickListener(item->{web.loadUrl("https://trabakutik.com/");return true;});popup.getMenu().add("■ Detener GPS").setOnMenuItemClickListener(item->{serviceActive=false;startService(new Intent(this,TrackingService.class).setAction("STOP"));return true;});popup.getMenu().add("↻ Volver al navegador GPS").setOnMenuItemClickListener(item->{web.loadUrl("https://eltzubi.github.io/trabakutik-gps-pruebas/nuevo.html");return true;});popup.show();});
  root.addView(bar,new LinearLayout.LayoutParams(-1,dp(39)));
  // Android moderno dibuja por defecto bajo la barra de estado.
  // Reservar su área evita que hora y batería tapen la cabecera.
  if(Build.VERSION.SDK_INT>=30)root.setOnApplyWindowInsetsListener((v,insets)->{
   int top=insets.getInsets(WindowInsets.Type.statusBars()).top;
   root.setPadding(0,top,0,0);
   return insets;
  });
  web=new WebView(this);web.getSettings().setJavaScriptEnabled(true);web.getSettings().setDomStorageEnabled(true);web.getSettings().setGeolocationEnabled(true);web.getSettings().setUseWideViewPort(true);web.getSettings().setLoadWithOverviewMode(true);web.getSettings().setTextZoom(100);web.addJavascriptInterface(new Bridge(),"TrabakutikAndroid");
  web.setWebChromeClient(new WebChromeClient(){@Override public void onGeolocationPermissionsShowPrompt(String origin,GeolocationPermissions.Callback cb){cb.invoke(origin,checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED,false);}});
  web.setWebViewClient(new WebViewClient(){
   @Override public void onPageFinished(WebView w,String url){
    super.onPageFinished(w,url);
    if(!onNavigator()&&url!=null&&(url.startsWith("https://trabakutik.com/")||url.startsWith("https://www.trabakutik.com/")))lastWebUrl=url;
    switchPage.setText(onNavigator()?"Web":"Navegador");
    // Los enlaces "Navegar esta ruta" de la web deben abrirse
    // dentro de la aplicación aunque tengan target="_blank".
    if(!onNavigator()&&url!=null&&url.startsWith("https://trabakutik.com/")){
     w.evaluateJavascript("(function(){document.addEventListener('click',function(ev){var a=ev.target.closest('a[href]');if(a&&a.href.indexOf('eltzubi.github.io/trabakutik-gps-pruebas/nuevo.html')>=0){ev.preventDefault();window.location.href=a.href;}},true);})()",null);
    }
   }
   @Override public boolean shouldOverrideUrlLoading(WebView w,WebResourceRequest r){
    String host=r.getUrl().getHost();
    if("eltzubi.github.io".equals(host)||"trabakutik.com".equals(host)||"www.trabakutik.com".equals(host))return false;
    startActivity(new Intent(Intent.ACTION_VIEW,r.getUrl()));return true;
   }
  });
  root.addView(web,new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,0,1));setContentView(root);
  web.loadUrl("https://eltzubi.github.io/trabakutik-gps-pruebas/nuevo.html");
  if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},100);
 }
 public class Bridge {
  @JavascriptInterface public void setRoute(String json){
   try{
    org.json.JSONArray list=new org.json.JSONArray(json);
    if(list.length()<2||list.length()>15000||json.length()>2000000)return;
    File f=new File(getFilesDir(),"ruta-activa.json");
    try(FileOutputStream out=new FileOutputStream(f)){out.write(json.getBytes(java.nio.charset.StandardCharsets.UTF_8));}
    runOnUiThread(()->{if(serviceActive)getApplicationContext().startService(new Intent(MainActivity.this,TrackingService.class).setAction("ROUTE"));});
   }catch(Exception ignored){}
  }
  @JavascriptInterface public void clearRoute(){
    File f=new File(getFilesDir(),"ruta-activa.json");if(f.exists())f.delete();
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
 boolean onNavigator(){return web!=null&&web.getUrl()!=null&&web.getUrl().startsWith("https://eltzubi.github.io/trabakutik-gps-pruebas/nuevo.html");}
 int dp(int px){return Math.round(px*getResources().getDisplayMetrics().density);}
 void stopNativeRecording(){if(serviceActive)startService(new Intent(this,TrackingService.class).setAction("STOP_RECORD"));}
 void discardLastRecording(){File dir=new File(getFilesDir(),"grabaciones");File[] files=dir.listFiles((d,n)->n.endsWith(".gpx"));if(files==null||files.length==0)return;File last=files[0];for(File f:files)if(f.lastModified()>last.lastModified())last=f;if(last.delete())Toast.makeText(this,"Grabación descartada",Toast.LENGTH_SHORT).show();}
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
   return;
  }
  if(code==101){launchGps();return;}
  if(pendingGpsAction!=null)ensureGpsPermissions(pendingGpsAction);
 }
 void saveTrack(){File dir=new File(getFilesDir(),"grabaciones");File[] all=dir.listFiles((d,n)->n.endsWith(".gpx"));if(all==null||all.length==0){Toast.makeText(this,"Primero graba y para una ruta",0).show();return;}File latest=null;for(File f:all)if(f.length()>0&&(latest==null||f.lastModified()>latest.lastModified()))latest=f;exportFile=latest;
 Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("application/gpx+xml");i.putExtra(Intent.EXTRA_TITLE,latest.getName());startActivityForResult(i,200);}
 @Override public void onActivityResult(int code,int result,Intent data){super.onActivityResult(code,result,data);if(code==201&&result==RESULT_OK&&data!=null&&pendingGpx!=null){try(java.io.OutputStream out=getContentResolver().openOutputStream(data.getData())){out.write(pendingGpx.getBytes(java.nio.charset.StandardCharsets.UTF_8));Toast.makeText(this,"GPX guardado",Toast.LENGTH_SHORT).show();}catch(Exception e){Toast.makeText(this,"No se pudo guardar el GPX",Toast.LENGTH_SHORT).show();}finally{pendingGpx=null;}}if(code==200&&result==RESULT_OK&&data!=null&&exportFile!=null)try(java.io.InputStream in=new java.io.FileInputStream(exportFile);java.io.OutputStream out=getContentResolver().openOutputStream(data.getData())){byte[] buf=new byte[8192];int n;while((n=in.read(buf))>0)out.write(buf,0,n);Toast.makeText(this,"GPX guardado",0).show();web.evaluateJavascript("window.trabakutikNativeGpxSaved&&window.trabakutikNativeGpxSaved()",null);}catch(Exception e){Toast.makeText(this,"No se pudo guardar",0).show();}}
 @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
}
