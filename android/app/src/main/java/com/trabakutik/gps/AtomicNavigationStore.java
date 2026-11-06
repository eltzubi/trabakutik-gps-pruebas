package com.trabakutik.gps;

import android.util.AtomicFile;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

/** Evita dejar JSON de ruta o giros a medias si el proceso termina durante el guardado. */
public final class AtomicNavigationStore {
 private AtomicNavigationStore() {}

 public static synchronized void write(File destination, String content) throws IOException {
  if(destination==null||content==null)throw new IllegalArgumentException("Archivo o contenido ausente");
  AtomicFile atomic=new AtomicFile(destination);
  FileOutputStream output=null;
  try{
   output=atomic.startWrite();
   output.write(content.getBytes(StandardCharsets.UTF_8));
   atomic.finishWrite(output);
  }catch(IOException|RuntimeException error){
   if(output!=null)atomic.failWrite(output);
   throw error;
  }
 }
}
