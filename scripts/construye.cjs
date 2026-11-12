// MONTA nuevo.html A PARTIR DE src/
//
// POR QUE. El navegador era un solo fichero de 3.700 lineas de JavaScript en
// un unico ambito. Tocar una parte podia romper otra sin que se notara, y las
// pruebas cogian el codigo recortandolo por marcadores de texto: mover una
// linea rompia una prueba que no tenia nada que ver. Ahora cada parte es un
// fichero de src/js y esto las junta.
//
// EL ORDEN ES EL QUE DICE EL NOMBRE, y eso importa: las 73 variables que se
// comparten se declaran en un sitio y se usan en otro, asi que juntar los
// ficheros en otro orden cambiaria cuando existe cada cosa. Por eso van
// numerados: 01, 02, 03...
//
// REGLA: nuevo.html NO SE TOCA A MANO. Se edita src/ y se vuelve a montar.
// La comprobacion de integracion falla si los dos no cuadran.
const fs=require('node:fs'),path=require('node:path');
const raiz=path.resolve(__dirname,'..');
const dir=path.join(raiz,'src','js');
const piezas=fs.readdirSync(dir).filter(f=>f.endsWith('.js')).sort();
if(!piezas.length){console.error('No hay piezas en src/js');process.exit(1)}
const js=piezas.map(f=>fs.readFileSync(path.join(dir,f),'utf8')).join('').replace(/\n$/,'');
const plantilla=fs.readFileSync(path.join(raiz,'src','nuevo.plantilla.html'),'utf8');
if(!plantilla.includes('\n@@JS@@\n')){console.error('La plantilla no tiene la marca @@JS@@');process.exit(1)}
const salida=plantilla.replace('\n@@JS@@\n',js);
const destino=path.join(raiz,'nuevo.html');
const antes=fs.existsSync(destino)?fs.readFileSync(destino,'utf8'):'';
if(process.argv.includes('--comprueba')){
 if(antes!==salida){
  console.error('nuevo.html NO cuadra con src/. Pasa «node scripts/construye.cjs» y sube el resultado.');
  process.exit(1);
 }
 console.log('nuevo.html cuadra con src/ (%d piezas)',piezas.length);
 process.exit(0);
}
fs.writeFileSync(destino,salida);
console.log('nuevo.html montado con %d piezas%s',piezas.length,antes===salida?' · sin cambios':'');
