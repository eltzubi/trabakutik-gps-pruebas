"""Ejecuta limpiaNombre() de produccion, sin Android.

Es lo que decide con que nombre se guarda un GPX o un KML bajado desde la
pestana Web. El nombre viene de la propia ficha -«Garai, los canales de
Arrierreka y la ermita de Urdaixa.gpx»- y tiene que llegar entero, pero sin
barras ni saltos de linea, que eso ya no seria un nombre de fichero.
"""
from pathlib import Path
import subprocess,tempfile,sys
src=(Path('android/app/src/main/java/com/trabakutik/gps')/'MainActivity.java').read_text()
def metodo(firma):
 a=src.index(firma);inicio=src.index('{',a);profundidad=1;i=inicio+1
 while profundidad:
  profundidad+=(src[i]=='{')-(src[i]=='}');i+=1
 return src[a:i]
codigo='''public class NombreTest {
'''+metodo(' static String limpiaNombre(')+'''
 static void igual(String esperado,String real){
  if(esperado==null?real!=null:!esperado.equals(real))
   throw new AssertionError("esperaba <"+esperado+"> y salio <"+real+">");
 }
 public static void main(String[] a){
  // El nombre bueno de una ficha llega entero: tildes, comas y espacios.
  igual("Garai, los canales de Arrierreka y la ermita de Urdaixa.gpx",
        limpiaNombre("Garai, los canales de Arrierreka y la ermita de Urdaixa.gpx"));
  igual("Zengotitagane ta Osmagain.kml",limpiaNombre("Zengotitagane ta Osmagain.kml"));
  // Nada de carpetas: una barra no puede colarse en el nombre.
  igual(".. .. etc passwd",limpiaNombre("../../etc/passwd"));
  igual("a b.gpx",limpiaNombre("a\\\\b.gpx"));
  // Ni saltos de linea ni caracteres de control.
  igual("a b.gpx",limpiaNombre("a\\nb.gpx"));
  igual("ruta.gpx",limpiaNombre("  ruta.gpx  "));
  // Sin nombre, sin invento: que lo adivine quien llama.
  igual(null,limpiaNombre(null));
  igual(null,limpiaNombre("   "));
  igual(null,limpiaNombre("."));
  igual(null,limpiaNombre(".."));
  igual(null,limpiaNombre("/"));
  // Y un nombre absurdamente largo se corta.
  StringBuilder largo=new StringBuilder();
  for(int i=0;i<300;i++)largo.append('x');
  igual(120,limpiaNombre(largo.toString()).length());
  System.out.println("12 comprobaciones del nombre de la descarga, todas bien");
 }
 static void igual(int esperado,int real){
  if(esperado!=real)throw new AssertionError("esperaba "+esperado+" y salio "+real);
 }
}
'''
with tempfile.TemporaryDirectory() as d:
 p=Path(d)/'NombreTest.java';p.write_text(codigo)
 subprocess.run(['javac','-d',d,str(p)],check=True)
 r=subprocess.run(['java','-cp',d,'NombreTest'],capture_output=True,text=True,timeout=120)
 print(r.stdout.strip() or r.stderr.strip())
 sys.exit(r.returncode)
