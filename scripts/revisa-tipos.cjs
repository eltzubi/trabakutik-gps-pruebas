// MIRA LOS NOMBRES ANTES DE QUE CORRA NADA.
//
// El JavaScript de nuevo.html son 3.698 lineas en un solo ambito, y el fallo
// que mas me repito al tocarlo es de nombres: llamar a algo que no existe en
// ese ambito, escribirlo mal, o usar una variable antes de declararla. Eso no
// se ve hasta que corre esa rama concreta, y a veces no corre en ninguna
// prueba. TypeScript lo dice en dos segundos leyendo el fichero, SIN cambiar
// ni una linea de lo que se publica: aqui solo se usa como corrector.
//
// Lo que tumba la comprobacion son los fallos de nombre, que hoy son cero:
//   TS2304 no existe ese nombre      TS2552 no existe, ¿querias decir...?
//   TS2448 usado antes de declarar   TS2454 usado sin asignar
//   TS2300 declarado dos veces       TS2588 asignar a una constante
// Lo demas -propiedades sobre any, un numero donde se espera un texto- sale
// como aviso y no corta: en JavaScript funciona y el codigo lleva asi años.
const {execFileSync}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const raiz=path.resolve(__dirname,'..');
const MORTALES=new Set(['TS2304','TS2552','TS2448','TS2454','TS2300','TS2588']);
const html=fs.readFileSync(path.join(raiz,'nuevo.html'),'utf8');
const a=html.indexOf('<script>'),b=html.lastIndexOf('</script>');
if(a<0||b<a){console.error('No encuentro el bloque de JavaScript de nuevo.html');process.exit(1)}
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tipos-'));
fs.writeFileSync(path.join(dir,'app.js'),html.slice(a+8,b));
// Lo que el navegador trae puesto y el fichero no declara: Leaflet y los
// puentes que mete la aplicacion de Android.
fs.writeFileSync(path.join(dir,'globales.d.ts'),`declare const L: any;
interface Window {
  TrabakutikAndroid?: any; TrabakutikRoutes?: any; webkitAudioContext?: any;
  trabakutikSyncNative?: any; trabakutikNativeGpxSaved?: any;
  __creator?: any; __sinRed?: any; __native?: any; __m?: any; __avisaMapaTamano?: any;
}
`);
// En esta maquina tsc esta en el PATH; en un runner limpio, no. Se prueba
// primero el binario y si no esta se tira de npx, que lo baja.
function corre(orden,args){return execFileSync(orden,args,{cwd:dir,encoding:'utf8'})}
let salida='';
try{
 try{corre('tsc',['--version'])}catch(e){corre('npx',['-y','typescript@5.6.3','--version'])}
}catch(e){console.error('No hay TypeScript y no se ha podido bajar: '+e.message);process.exit(1)}
let cual='tsc';
try{corre('tsc',['--version'])}catch(e){cual='npx'}
const antes=cual==='npx'?['-y','typescript@5.6.3']:[];
try{
 corre(cual,[...antes,'--noEmit','--allowJs','--checkJs','--noImplicitAny','false',
   '--strictNullChecks','false','--target','es2022','--lib','es2022,dom',
   'globales.d.ts','app.js']);
}catch(e){salida=(e.stdout||'')+(e.stderr||'')}
const lineas=salida.split('\n').filter(l=>/error TS\d+/.test(l));
const mortales=lineas.filter(l=>MORTALES.has((l.match(/error (TS\d+)/)||[])[1]));
for(const l of mortales)console.error('FALLO  '+l);
console.log('revisa-tipos: %d avisos, %d de nombres',lineas.length-mortales.length,mortales.length);
if(mortales.length){
 console.error('\nSon fallos de nombre: algo que no existe en ese ámbito, mal escrito o usado antes de declararlo.');
 process.exit(1);
}
