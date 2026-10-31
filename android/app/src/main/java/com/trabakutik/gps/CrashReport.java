package com.trabakutik.gps;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.os.Build;
import java.io.File;
import java.io.FileOutputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Guarda solo diagnósticos técnicos locales; nunca envía datos del usuario. */
public final class CrashReport {
 private CrashReport(){}
 private static File reportFile(Context context){return new File(context.getFilesDir(),"ultimo-fallo.txt");}
 public static void install(Context context){
  final Context app=context.getApplicationContext();
  final Thread.UncaughtExceptionHandler previous=Thread.getDefaultUncaughtExceptionHandler();
  Thread.setDefaultUncaughtExceptionHandler((thread,error)->{
   try{
    StringWriter buffer=new StringWriter();
    error.printStackTrace(new PrintWriter(buffer));
    String message="Trabakutik GPS · fallo Android\n"+
      "Fecha: "+new SimpleDateFormat("yyyy-MM-dd HH:mm:ss",Locale.ROOT).format(new Date())+"\n"+
      "Android: "+Build.VERSION.RELEASE+" (API "+Build.VERSION.SDK_INT+")\n"+
      "Modelo: "+Build.MODEL+"\n"+
      "Hilo: "+thread.getName()+"\n\n"+buffer;
    try(FileOutputStream out=new FileOutputStream(reportFile(app),false)){
     out.write(message.getBytes(StandardCharsets.UTF_8));
    }
   }catch(Throwable ignored){}
   if(previous!=null)previous.uncaughtException(thread,error);
   else android.os.Process.killProcess(android.os.Process.myPid());
  });
 }
 public static void note(Context context,String message){
  try{
   String line="WebView: "+message+" · "+
       new SimpleDateFormat("yyyy-MM-dd HH:mm:ss",Locale.ROOT).format(new Date())+"\n";
   try(FileOutputStream out=new FileOutputStream(reportFile(context),false)){
    out.write(line.getBytes(StandardCharsets.UTF_8));
   }
  }catch(Exception ignored){}
 }
 public static void show(Activity activity){
  String report;
  try{File file=reportFile(activity);
   if(!file.exists()){report="No hay ningún cierre registrado todavía."; }
   else{
    byte[] b=new byte[(int)Math.min(file.length(),30000)];
    try(java.io.FileInputStream in=new java.io.FileInputStream(file)){int n=in.read(b);report=n>0?new String(b,0,n,StandardCharsets.UTF_8):"Sin detalles";}
   }
  }catch(Exception e){report="No se pudo abrir el diagnóstico";}
  final String text=report;
  new AlertDialog.Builder(activity).setTitle("Diagnóstico de Trabakutik")
   .setMessage(report)
   .setPositiveButton("Copiar informe",(d,w)->{
    ClipboardManager clipboard=(ClipboardManager)activity.getSystemService(Context.CLIPBOARD_SERVICE);
    clipboard.setPrimaryClip(ClipData.newPlainText("Fallo Trabakutik GPS",text));
   }).setNegativeButton("Cerrar",null).show();
 }
}
