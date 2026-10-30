package com.trabakutik.gps;
import android.Manifest;
import android.app.Activity;
import android.content.*;
import android.content.pm.PackageManager;
import android.os.*;
import android.view.ViewGroup;
import android.webkit.*;
import android.widget.*;
import java.io.File;
public class MainActivity extends Activity {
 WebView web; File exportFile;
 @Override public void onCreate(Bundle b) {
  super.onCreate(b);
  getWindow().setStatusBarColor(0xff07131d);
  getWindow().setNavigationBarColor(0xff07131d);
  LinearLayout root=new LinearLayout(this);root.setOrientation(1);root.setBackgroundColor(0xff07131d);
  LinearLayout bar=new LinearLayout(this);bar.setGravity(android.view.Gravity.CENTER_VERTICAL);bar.setPadding(dp(12),dp(5),dp(10),dp(5));bar.setBackgroundColor(0xff0c2330);
  TextView title=new TextView(this);title.setText("TRABAKUTIK  GPS");title.setTextColor(0xffd9f7ff);title.setTextSize(13);title.setTypeface(null,1);bar.addView(title,new LinearLayout.LayoutParams(0,dp(40),1));title.setGravity(android.view.Gravity.CENTER_VERTICAL);
  TextView menu=new TextView(this);menu.setText("⋮");menu.setTextColor(0xffd9f7ff);menu.setTextSize(27);menu.setGravity(android.view.Gravity.CENTER);bar.addView(menu,new LinearLayout.LayoutParams(dp(44),dp(40)));
  menu.setOnClickListener(v->{PopupMenu popup=new PopupMenu(this,menu);popup.getMenu().add("● Iniciar grabación GPS").setOnMenuItemClickListener(item->{startTrack();return true;});popup.getMenu().add("■ Parar grabación").setOnMenuItemClickListener(item->{startService(new Intent(this,TrackingService.class).setAction("STOP"));return true;});popup.getMenu().add("↓ Guardar grabación GPX").setOnMenuItemClickListener(item->{saveTrack();return true;});popup.getMenu().add("↻ Volver al navegador GPS").setOnMenuItemClickListener(item->{web.loadUrl("https://eltzubi.github.io/trabakutik-gps-pruebas/nuevo.html");return true;});popup.show();});
  root.addView(bar,new LinearLayout.LayoutParams(-1,dp(50)));
  web=new WebView(this);web.getSettings().setJavaScriptEnabled(true);web.getSettings().setDomStorageEnabled(true);web.getSettings().setGeolocationEnabled(true);web.getSettings().setUseWideViewPort(true);web.getSettings().setLoadWithOverviewMode(true);web.getSettings().setTextZoom(100);
  web.setWebChromeClient(new WebChromeClient(){@Override public void onGeolocationPermissionsShowPrompt(String origin,GeolocationPermissions.Callback cb){cb.invoke(origin,checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED,false);}});
  web.setWebViewClient(new WebViewClient(){@Override public boolean shouldOverrideUrlLoading(WebView w,WebResourceRequest r){String host=r.getUrl().getHost();if("eltzubi.github.io".equals(host))return false;startActivity(new Intent(Intent.ACTION_VIEW,r.getUrl()));return true;}});
  root.addView(web,new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,0,1));setContentView(root);
  web.loadUrl("https://eltzubi.github.io/trabakutik-gps-pruebas/nuevo.html");
  requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},100);
 }
 int dp(int px){return Math.round(px*getResources().getDisplayMetrics().density);}\n void startTrack(){if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},100);return;}
  if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},101);
  startForegroundService(new Intent(this,TrackingService.class).setAction("START"));
 }
 void saveTrack(){File dir=new File(getFilesDir(),"grabaciones");File[] all=dir.listFiles((d,n)->n.endsWith(".gpx"));if(all==null||all.length==0){Toast.makeText(this,"Primero graba y para una ruta",0).show();return;}File latest=null;for(File f:all)if(f.length()>0&&(latest==null||f.lastModified()>latest.lastModified()))latest=f;exportFile=latest;
 Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("application/gpx+xml");i.putExtra(Intent.EXTRA_TITLE,latest.getName());startActivityForResult(i,200);}
 @Override public void onActivityResult(int code,int result,Intent data){super.onActivityResult(code,result,data);if(code==200&&result==RESULT_OK&&data!=null&&exportFile!=null)try(java.io.InputStream in=new java.io.FileInputStream(exportFile);java.io.OutputStream out=getContentResolver().openOutputStream(data.getData())){byte[] buf=new byte[8192];int n;while((n=in.read(buf))>0)out.write(buf,0,n);Toast.makeText(this,"GPX guardado",0).show();}catch(Exception e){Toast.makeText(this,"No se pudo guardar",0).show();}}
 @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
}
