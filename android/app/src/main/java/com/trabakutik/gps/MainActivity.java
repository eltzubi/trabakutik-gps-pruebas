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
  LinearLayout root=new LinearLayout(this);root.setOrientation(1);root.setBackgroundColor(0xff07131d);
  LinearLayout bar=new LinearLayout(this);Button start=new Button(this);start.setText("● Grabar con pantalla apagada");start.setOnClickListener(v->startTrack());
  Button stop=new Button(this);stop.setText("■ Parar");stop.setOnClickListener(v->startService(new Intent(this,TrackingService.class).setAction("STOP")));
  bar.addView(start,new LinearLayout.LayoutParams(0,-2,2));bar.addView(stop,new LinearLayout.LayoutParams(0,-2,1));root.addView(bar);
  Button save=new Button(this);save.setText("Guardar grabación GPX");save.setOnClickListener(v->saveTrack());root.addView(save);
  web=new WebView(this);web.getSettings().setJavaScriptEnabled(true);web.getSettings().setDomStorageEnabled(true);web.getSettings().setGeolocationEnabled(true);
  web.setWebChromeClient(new WebChromeClient(){@Override public void onGeolocationPermissionsShowPrompt(String origin,GeolocationPermissions.Callback cb){cb.invoke(origin,checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED,false);}});
  web.setWebViewClient(new WebViewClient(){@Override public boolean shouldOverrideUrlLoading(WebView w,WebResourceRequest r){String host=r.getUrl().getHost();if("eltzubi.github.io".equals(host)||"trabakutik.com".equals(host))return false;startActivity(new Intent(Intent.ACTION_VIEW,r.getUrl()));return true;}});
  root.addView(web,new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,0,1));setContentView(root);
  web.loadUrl("https://eltzubi.github.io/trabakutik-gps-pruebas/nuevo.html");
  requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},100);
 }
 void startTrack(){if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},100);return;}
  if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},101);
  startForegroundService(new Intent(this,TrackingService.class).setAction("START"));
 }
 void saveTrack(){File dir=new File(getFilesDir(),"grabaciones");File[] all=dir.listFiles((d,n)->n.endsWith(".gpx"));if(all==null||all.length==0){Toast.makeText(this,"Primero graba y para una ruta",0).show();return;}File latest=null;for(File f:all)if(f.length()>0&&(latest==null||f.lastModified()>latest.lastModified()))latest=f;exportFile=latest;
 Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("application/gpx+xml");i.putExtra(Intent.EXTRA_TITLE,,latest.getName());startActivityForResult(i,200);}
 @Override public void onActivityResult(int code,int result,Intent data){super.onActivityResult(code,result,data);if(code==200&&result==RESULT_OK&&data!=null&&exportFile!=null)try(java.io.InputStream in=new java.io.FileInputStream(exportFile);java.io.OutputStream out=getContentResolver().openOutputStream(data.getData())){byte[] buf=new byte[8192];int n;while((n=in.read(buf))>0)out.write(buf,0,n);Toast.makeText(this,"GPX guardado",0).show();}catch(Exception e){Toast.makeText(this,"No se pudo guardar",0).show();}}
 @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
}
