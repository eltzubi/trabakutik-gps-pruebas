"""CrashReport.note ya no borra el informe de un cierre de verdad.

Con FileOutputStream(..., false) una recarga del mapa por falta de memoria
pisaba el fichero del ultimo fallo, y se perdia justo el informe que hace
falta para saber por que se cerro la app. Ejecuta note() de produccion.
"""
from pathlib import Path
import subprocess, tempfile

src = Path('android/app/src/main/java/com/trabakutik/gps/CrashReport.java').read_text()


def metodo(firma):
    a = src.index(firma)
    i = src.index('{', src.index(')', a)) + 1
    h = 1
    while h:
        h += (src[i] == '{') - (src[i] == '}')
        i += 1
    return src[a:i]


def linea(texto):
    a = src.index(texto)
    return src[a:src.index('\n', a)]


code = '''import java.io.*;import java.nio.charset.StandardCharsets;import java.text.SimpleDateFormat;import java.util.*;
public class InformeFalloTest {
 static class Context{File dir;Context(File d){dir=d;}File getFilesDir(){return dir;}}
''' + linea(' static final long NOTAS_TOPE') + '\n' + metodo(' private static File reportFile(') + '\n' + metodo(' public static void note(') + '''
 static void require(boolean b,String s){if(!b)throw new AssertionError(s);}
 public static void main(String[] a)throws Exception{
  File d=java.nio.file.Files.createTempDirectory("informe").toFile();Context c=new Context(d);
  File f=reportFile(c);
  try(FileWriter w=new FileWriter(f)){w.write("Trabakutik GPS · fallo Android\\nNullPointerException en algo\\n");}
  note(c,"Proceso del mapa cerrado");
  String t=new String(java.nio.file.Files.readAllBytes(f.toPath()),StandardCharsets.UTF_8);
  require(t.contains("NullPointerException"),"la nota no puede borrar el cierre de antes: "+t);
  require(t.contains("Proceso del mapa cerrado"),"y la nota tiene que quedar");
  // Un informe de cierre grande -una traza larga- tampoco se puede perder:
  // con el fichero lleno, lo que no entra es la nota.
  try(FileWriter w=new FileWriter(f)){w.write("Trabakutik GPS · fallo Android\\n");char[] x=new char[(int)NOTAS_TOPE];Arrays.fill(x,'x');w.write(x);}
  long antes=f.length();
  note(c,"otra");
  String t2=new String(java.nio.file.Files.readAllBytes(f.toPath()),StandardCharsets.UTF_8);
  require(t2.startsWith("Trabakutik GPS · fallo Android")&&f.length()==antes,"un informe grande no se borra ni crece: "+f.length());
  System.out.println("OK: una nota del mapa no borra el informe del ultimo cierre, ni aunque sea grande");
 }
}'''

with tempfile.TemporaryDirectory() as d:
    Path(d, 'InformeFalloTest.java').write_text(code)
    subprocess.run(['javac', '-d', d, str(Path(d, 'InformeFalloTest.java'))], check=True)
    subprocess.run(['java', '-cp', d, 'InformeFalloTest'], check=True)
