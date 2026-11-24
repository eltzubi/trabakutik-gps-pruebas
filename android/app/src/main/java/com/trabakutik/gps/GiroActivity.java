package com.trabakutik.gps;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;

/**
 * LA PANTALLA DEL CRUCE (23 nov 2026). Lo pidio el autor para llevar el movil
 * en el soporte de la bici: «lo que quiero es que de un vistazo pueda ver
 * donde tengo que ir... tiene que ser un giro, un dibujo, algo que se entienda
 * de un plumazo».
 *
 * Se enciende sola al acercarse al cruce, por encima del bloqueo, y se cierra
 * sola. NO ABRE EL NAVEGADOR: dibuja aqui mismo, en Java. Despertar la pagina
 * es lo que costaba la bateria -de 10 %/h se bajo a 5,5 durmiendola-, asi que
 * esto no la toca: ni mapa, ni teselas, ni red.
 *
 * Lo que se ve: la flecha del giro lo mas grande que cabe, los metros, y el
 * lado en una palabra. El croquis del cruce SOLO si hay algun ramal que te
 * pueda engañar; en una curva del camino no sale, que si sale siempre deja de
 * mirarse. Los ramales llegan relativos a por donde llegas, asi que el dibujo
 * va con tu marcha hacia arriba y no hay que interpretar nada.
 *
 * Todo el dibujo va envuelto: si algo falla, la pantalla se cierra y la
 * navegacion sigue. Perder un dibujo es barato; perder la ruta no.
 */
public class GiroActivity extends Activity {
 public static final String EXTRA_LADO="lado",EXTRA_GRADOS="grados",EXTRA_METROS="metros",
   EXTRA_TEXTO="texto",EXTRA_RAMALES="ramales",EXTRA_SEGUNDOS="segundos",EXTRA_TIPO="tipo";
 static final int FONDO=0xFF06121A,CIAN=0xFF66E5FF,BLANCO=0xFFE9FDFF,GRIS=0xFF8FA6B2,RAMAL=0xFF5D7079;
 final Handler cierra=new Handler(Looper.getMainLooper());
 // LA FICHA SE VA CUANDO PASAS EL CRUCE. El servicio le va dando cuerda
 // («giroHasta») mientras el cruce siga por delante; en cuanto deja de
 // darsela -lo has pasado, te has salido o se acabo la navegacion- esto lo
 // ve y cierra. Antes solo habia un reloj a ciegas de 12 s: parado en el
 // cruce se quedaba los doce enteros y con cruces seguidos se solapaban unas
 // fichas con otras. El autor, el 24 de noviembre de 2026: «no se va de la
 // pantalla de cruces... o tarda demasiado en irse».
 final Handler cuerda=new Handler(Looper.getMainLooper());
 final Runnable miraCuerda=new Runnable(){@Override public void run(){
  try{
   long hasta=getSharedPreferences("tracking_live",MODE_PRIVATE).getLong("giroHasta",0);
   if(hasta>0&&android.os.SystemClock.elapsedRealtime()>hasta){finish();return;}
  }catch(Throwable ignored){}
  cuerda.postDelayed(this,500);
 }};

 public static Intent intent(Context c,int lado,int grados,int metros,String texto,int[] ramales,int segundos){
  return intent(c,lado,grados,metros,texto,ramales,segundos,1);
 }
 public static Intent intent(Context c,int lado,int grados,int metros,String texto,int[] ramales,int segundos,int tipo){
  Intent i=new Intent(c,GiroActivity.class)
    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_NO_HISTORY|Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS);
  i.putExtra(EXTRA_LADO,lado).putExtra(EXTRA_GRADOS,grados).putExtra(EXTRA_METROS,metros)
   .putExtra(EXTRA_TEXTO,texto==null?"":texto).putExtra(EXTRA_SEGUNDOS,segundos).putExtra(EXTRA_TIPO,tipo);
  if(ramales!=null&&ramales.length>0)i.putExtra(EXTRA_RAMALES,ramales);
  return i;
 }

 @Override protected void onCreate(Bundle b){
  super.onCreate(b);
  try{
   if(Build.VERSION.SDK_INT>=27){setShowWhenLocked(true);setTurnScreenOn(true);}
   getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
     |WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);
   FrameLayout raiz=new FrameLayout(this);
   raiz.setBackgroundColor(FONDO);
   raiz.addView(new Ficha(this,getIntent()));
   raiz.setOnClickListener(v->finish());
   setContentView(raiz);
   int seg=getIntent()!=null?getIntent().getIntExtra(EXTRA_SEGUNDOS,12):12;
   cierra.postDelayed(this::finish,Math.max(3,Math.min(40,seg))*1000L);
   cuerda.postDelayed(miraCuerda,1000);
  }catch(Throwable t){android.util.Log.w("TrabakutikGPS","Pantalla del cruce",t);finish();}
 }
 @Override protected void onNewIntent(Intent i){
  super.onNewIntent(i);setIntent(i);
  try{cierra.removeCallbacksAndMessages(null);
   FrameLayout raiz=new FrameLayout(this);raiz.setBackgroundColor(FONDO);
   raiz.addView(new Ficha(this,i));raiz.setOnClickListener(v->finish());setContentView(raiz);
   int seg=i!=null?i.getIntExtra(EXTRA_SEGUNDOS,12):12;
   cierra.postDelayed(this::finish,Math.max(3,Math.min(40,seg))*1000L);
   cuerda.removeCallbacksAndMessages(null);cuerda.postDelayed(miraCuerda,1000);
  }catch(Throwable t){android.util.Log.w("TrabakutikGPS","Pantalla del cruce",t);finish();}
 }
 @Override protected void onDestroy(){cierra.removeCallbacksAndMessages(null);cuerda.removeCallbacksAndMessages(null);super.onDestroy();}

 /** El dibujo. Nada de layouts: una vista que se pinta sola. */
 static class Ficha extends View {
  final int lado,grados,metros,tipo;final String texto;final int[] ramales;
  final Paint trazo=new Paint(Paint.ANTI_ALIAS_FLAG),relleno=new Paint(Paint.ANTI_ALIAS_FLAG),
    letra=new Paint(Paint.ANTI_ALIAS_FLAG);
  Ficha(Context c,Intent i){
   super(c);
   lado=i==null?1:i.getIntExtra(EXTRA_LADO,1);
   grados=i==null?90:Math.max(0,Math.min(180,i.getIntExtra(EXTRA_GRADOS,90)));
   metros=i==null?0:Math.max(0,i.getIntExtra(EXTRA_METROS,0));
   tipo=i==null?1:i.getIntExtra(EXTRA_TIPO,1);
   texto=i==null?"":String.valueOf(i.getStringExtra(EXTRA_TEXTO));
   int[] r=i==null?null:i.getIntArrayExtra(EXTRA_RAMALES);
   ramales=r==null?new int[0]:r;
   trazo.setStyle(Paint.Style.STROKE);trazo.setStrokeCap(Paint.Cap.ROUND);trazo.setStrokeJoin(Paint.Join.ROUND);
   letra.setTextAlign(Paint.Align.CENTER);letra.setFakeBoldText(true);
  }
  @Override protected void onDraw(Canvas g){
   try{pinta(g);}catch(Throwable t){android.util.Log.w("TrabakutikGPS","Dibujo del cruce",t);}
  }
  void pinta(Canvas g){
   final int w=getWidth(),h=getHeight();
   if(w<=0||h<=0)return;
   // UNA ROTONDA SE DIBUJA COMO UNA ROTONDA. Antes caia en el dibujo de
   // giro corriente -gradosDelGiro() devolvia 90 para el tipo 5- y el autor
   // veia una flecha de giro a la izquierda donde el texto decia «Rotonda,
   // 4.ª salida»: «me ha marcado, en vez de la cuarta salida, un dibujo de
   // giro a la izquierda directamente». El anillo ya ensena las bocas, asi
   // que no lleva croquis aparte.
   final boolean esRotonda=tipo==5;
   final boolean croquis=ramales.length>0&&!esRotonda;
   // Reparto del alto: la flecha manda. Con croquis se le deja un cuarto.
   final float altoFlecha=h*(croquis?0.40f:0.52f);
   final float cxF=w/2f,cyF=h*(croquis?0.055f:0.085f)+altoFlecha/2f;
   if(esRotonda)rotonda(g,cxF,cyF,Math.min(w*0.78f,altoFlecha));
   else flecha(g,cxF,cyF,Math.min(w*0.78f,altoFlecha));
   // Los metros, lo mas grande que cabe.
   float yNum=cyF+altoFlecha/2f+h*(croquis?0.085f:0.115f);
   letra.setColor(Color.WHITE);letra.setTextSize(h*(croquis?0.105f:0.135f));
   g.drawText(metros+" m",cxF,yNum,letra);
   // El lado, en una palabra.
   letra.setColor(CIAN);letra.setTextSize(h*(croquis?0.042f:0.050f));
   g.drawText(texto==null?"":texto,cxF,yNum+h*(croquis?0.055f:0.068f),letra);
   if(!croquis)return;
   float ladoC=Math.min(w*0.52f,h*0.24f);
   float cyC=h*0.80f;
   croquis(g,cxF,cyC,ladoC);
   letra.setColor(GRIS);letra.setTextSize(h*0.028f);
   int n=ramales.length+1;
   g.drawText(n+(n==1?" ramal":" ramales")+" · tú por donde marca la flecha",cxF,h*0.955f,letra);
  }
  /** La rotonda: el anillo, por donde entras abajo, el arco que recorres y
   *  tu salida con punta. SE CIRCULA POR LA DERECHA, o sea al reves de las
   *  agujas del reloj visto desde arriba: entrando por abajo se va hacia la
   *  derecha del dibujo, que es lo que se ve al llegar. Las otras bocas, en
   *  gris, para contar las salidas de un vistazo. */
  void rotonda(Canvas g,float cx,float cy,float tam){
   float t=Math.max(10f,tam);
   float R=t*0.30f,fuera=t*0.22f,grosor=Math.max(3f,t*0.085f);
   // Las otras bocas.
   trazo.setColor(RAMAL);trazo.setStrokeWidth(grosor);
   for(int r:ramales){
    double a=Math.toRadians(r);
    float sx=(float)Math.sin(a),sy=(float)-Math.cos(a);
    g.drawLine(cx+sx*R,cy+sy*R,cx+sx*(R+fuera),cy+sy*(R+fuera),trazo);
   }
   // El anillo.
   trazo.setColor(GRIS);trazo.setStrokeWidth(Math.max(2f,grosor*0.7f));
   g.drawCircle(cx,cy,R,trazo);
   // Por donde llegas, abajo.
   trazo.setColor(BLANCO);trazo.setStrokeWidth(grosor*1.5f);
   g.drawLine(cx,cy+R,cx,cy+R+fuera*1.3f,trazo);
   // El arco recorrido. En grados de Android el 0 son las tres y se crece en
   // el sentido del reloj; el rumbo b son b-90 grados, y entrando por abajo
   // (rumbo 180, o sea 90) se va RESTANDO hasta la salida.
   float s=Math.max(-170,Math.min(170,grados*(lado<0?-1:1)));
   RectF caja=new RectF(cx-R,cy-R,cx+R,cy+R);
   Path arco=new Path();
   arco.addArc(caja,90f,s-180f);
   g.drawPath(arco,trazo);
   // Tu salida, con punta.
   double a=Math.toRadians(s);
   float dx=(float)Math.sin(a),dy=(float)-Math.cos(a);
   float ex=cx+dx*R,ey=cy+dy*R,px=ex+dx*fuera*1.3f,py=ey+dy*fuera*1.3f;
   g.drawLine(ex,ey,px-dx*grosor,py-dy*grosor,trazo);
   float cab=t*0.13f,nx=-dy,ny=dx;
   Path punta=new Path();
   punta.moveTo(px+dx*cab*0.9f,py+dy*cab*0.9f);
   punta.lineTo(px-dx*cab*0.5f+nx*cab*0.8f,py-dy*cab*0.5f+ny*cab*0.8f);
   punta.lineTo(px-dx*cab*0.5f-nx*cab*0.8f,py-dy*cab*0.5f-ny*cab*0.8f);
   punta.close();
   relleno.setStyle(Paint.Style.FILL);relleno.setColor(BLANCO);
   g.drawPath(punta,relleno);
  }
  /** La flecha del giro: sube, tuerce «grados» hacia «lado» y acaba en punta. */
  void flecha(Canvas g,float cx,float cy,float tam){
   float t=Math.max(10f,tam);
   float grosor=t*0.17f;
   trazo.setStrokeWidth(grosor);trazo.setColor(BLANCO);
   float r=t*0.17f;                     // radio de la curva
   float entra=t*0.30f,sale=t*0.26f;    // tramo recto antes y despues
   float a=(float)Math.toRadians(grados)*(lado<0?-1:1);
   float ox=cx+r*(lado<0?-1:1),oy=cy;   // centro de la curva
   // El punto donde acaba la curva, girando (cx,cy) alrededor de (ox,oy).
   float ex=(float)(ox+(cx-ox)*Math.cos(a)-(cy-oy)*Math.sin(a));
   float ey=(float)(oy+(cx-ox)*Math.sin(a)+(cy-oy)*Math.cos(a));
   float dx=(float)Math.sin(a),dy=(float)-Math.cos(a);
   float px=ex+dx*sale,py=ey+dy*sale;
   Path p=new Path();
   p.moveTo(cx,cy+entra);p.lineTo(cx,cy);
   RectF caja=new RectF(ox-r,oy-r,ox+r,oy+r);
   float desde=lado<0?0f:180f;
   p.arcTo(caja,desde,(lado<0?1:-1)*(-grados),false);
   p.lineTo(px-dx*grosor*0.6f,py-dy*grosor*0.6f);
   g.drawPath(p,trazo);
   // La punta.
   float cab=t*0.17f,nx=-dy,ny=dx;
   Path punta=new Path();
   punta.moveTo(px+dx*cab*0.9f,py+dy*cab*0.9f);
   punta.lineTo(px-dx*cab*0.5f+nx*cab*0.85f,py-dy*cab*0.5f+ny*cab*0.85f);
   punta.lineTo(px-dx*cab*0.5f-nx*cab*0.85f,py-dy*cab*0.5f-ny*cab*0.85f);
   punta.close();
   relleno.setStyle(Paint.Style.FILL);relleno.setColor(BLANCO);
   g.drawPath(punta,relleno);
  }
  /** El croquis: tu llegada abajo, tu salida en el angulo del giro, y los
   *  otros ramales en gris. Todo con tu marcha hacia arriba. */
  void croquis(Canvas g,float cx,float cy,float tam){
   float L=tam*0.46f;
   trazo.setColor(RAMAL);trazo.setStrokeWidth(Math.max(4f,tam*0.075f));
   for(int r:ramales){
    double a=Math.toRadians(r);
    g.drawLine(cx,cy,cx+(float)(Math.sin(a)*L),cy-(float)(Math.cos(a)*L),trazo);
   }
   trazo.setColor(CIAN);trazo.setStrokeWidth(Math.max(5f,tam*0.095f));
   g.drawLine(cx,cy,cx,cy+L,trazo);                       // por donde llegas
   double s=Math.toRadians(grados*(lado<0?-1:1));
   g.drawLine(cx,cy,cx+(float)(Math.sin(s)*L),cy-(float)(Math.cos(s)*L),trazo); // por donde sales
   relleno.setStyle(Paint.Style.FILL);relleno.setColor(Color.WHITE);
   g.drawCircle(cx,cy,Math.max(4f,tam*0.055f),relleno);
  }
 }
}
