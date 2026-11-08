"""Comprueba el ciclo real de MainActivity con dobles de Android."""
import pathlib
import subprocess
import tempfile

source = pathlib.Path("android/app/src/main/java/com/trabakutik/gps/MainActivity.java").read_text()
start = source.index(" boolean appEnSegundoPlano=")
methods = source[start:source.index(" void showScreen(", start)]
harness = """
import java.util.function.Consumer;
class Activity {
 protected void onResume(){} protected void onStop(){}
 boolean isFinishing(){return false;} boolean isDestroyed(){return false;}
}
class TrackingService { static boolean ACTIVO=false; }
class WebView {
 int paused=0,resumed=0,timersPaused=0,timersResumed=0; Consumer<String> callback;
 void evaluateJavascript(String code,Consumer<String> cb){callback=cb;}
 void onPause(){paused++;} void onResume(){resumed++;}
 void pauseTimers(){timersPaused++;} void resumeTimers(){timersResumed++;}
 void postDelayed(Runnable r,int delay){}
 void respond(String result){Consumer<String> cb=callback;callback=null;cb.accept(result);}
}
public class BackgroundLifecycleTest extends Activity {
 WebView web=new WebView(),webRoutes=new WebView();
 boolean showingGps=true; String pendingGpsAction=null;
 void restoreGpsWeb(){}
""" + methods + """
 static void check(boolean value){if(!value)throw new AssertionError();}
 public static void main(String[] args){
  BackgroundLifecycleTest idle=new BackgroundLifecycleTest();
  idle.onStop();idle.web.respond("true");
  check(idle.web.paused==1&&idle.webRoutes.paused==1&&idle.web.timersPaused==1);
  idle.onResume();
  check(idle.web.resumed==1&&idle.webRoutes.resumed==1&&idle.web.timersResumed==1);
  idle.onResume();check(idle.web.timersResumed==1);
  for(String result:new String[]{"false","null"}){
   BackgroundLifecycleTest busy=new BackgroundLifecycleTest();
   busy.onStop();busy.web.respond(result);check(busy.web.timersPaused==0);
  }
  BackgroundLifecycleTest visible=new BackgroundLifecycleTest();
  visible.onStop();visible.onResume();visible.web.respond("true");
  check(visible.web.timersPaused==0);
  BackgroundLifecycleTest cycles=new BackgroundLifecycleTest();
  cycles.onStop();Consumer<String> old=cycles.web.callback;
  cycles.onResume();cycles.onStop();old.accept("true");
  check(cycles.web.timersPaused==0);
  cycles.web.respond("true");check(cycles.web.timersPaused==1);
  TrackingService.ACTIVO=true;
  BackgroundLifecycleTest active=new BackgroundLifecycleTest();
  active.onStop();check(active.web.callback==null&&active.web.timersPaused==0);
  TrackingService.ACTIVO=false;
  BackgroundLifecycleTest race=new BackgroundLifecycleTest();
  race.onStop();TrackingService.ACTIVO=true;race.web.respond("true");
  check(race.web.timersPaused==0);TrackingService.ACTIVO=false;
  BackgroundLifecycleTest pending=new BackgroundLifecycleTest();
  pending.pendingGpsAction="START";pending.onStop();check(pending.web.callback==null);
  BackgroundLifecycleTest permissionRace=new BackgroundLifecycleTest();
  permissionRace.onStop();permissionRace.pendingGpsAction="NAVIGATE";
  permissionRace.web.respond("true");check(permissionRace.web.timersPaused==0);
  System.out.println("OK: reposo, reanudacion, salida activa, permisos y respuestas tardias");
 }
}
"""
with tempfile.TemporaryDirectory(prefix="trabakutik-lifecycle-") as tmp:
    file = pathlib.Path(tmp) / "BackgroundLifecycleTest.java"
    file.write_text(harness)
    subprocess.run(["java", "-m", "jdk.compiler/com.sun.tools.javac.Main", str(file)], check=True)
    subprocess.run(["java", "-cp", tmp, "BackgroundLifecycleTest"], check=True)
