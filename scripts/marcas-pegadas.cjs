// LEE EL TEXTO DE «✋ AVISOS MARCADOS» TAL CUAL SE PEGA, y saca de el los
// trozos de trazado que ahora viaja cada marca. Con eso una marca de una ruta
// propia se puede comprobar sin ir a buscar el GPX a Descargas del movil, que
// es lo que pidio el autor el 24 de noviembre de 2026: «si este baile de
// ficheros te resulta pesado...» -«adelante».
//
//   node scripts/marcas-pegadas.cjs <fichero con el texto pegado>
//
// Escribe un GPX por marca en tests/referencia/trazados/ (esa carpeta NO se
// sube: son sus recorridos) y dice la linea de marcas-campo.json que le toca.
const fs=require('node:fs'),path=require('node:path');
const RAIZ=path.resolve(__dirname,'..');
const DESTINO=path.join(RAIZ,'tests/referencia/trazados');
const f=process.argv[2];
if(!f){console.error('Uso: node scripts/marcas-pegadas.cjs <fichero con el texto pegado>');process.exit(2)}
const texto=fs.readFileSync(f,'utf8');
const lineas=texto.split(/\r?\n/).filter(l=>l.startsWith('T|'));
if(!lineas.length){
 console.log('Ese texto no trae ningun trazado.');
 console.log('Los trazados los guarda la pagina desde el 24 de noviembre de 2026, al final');
 console.log('del texto, bajo «--- trazados de las marcas ---». Si no estan, la marca se hizo');
 console.log('con una version anterior y hace falta el GPX de la ruta.');
 process.exit(0);
}
const limpio=t=>String(t).toLowerCase().replace(/[^a-z0-9._-]+/g,'_').replace(/^_+|_+$/g,'')||'ruta';
let hechos=0;
for(const l of lineas){
 const [,ruta,km,m0,nums]=l.split('|');
 const v=String(nums||'').split(',').map(Number);
 if(v.length<6||v.some(x=>!Number.isFinite(x))){console.error('Trazado ilegible, me lo salto: '+l.slice(0,60));continue}
 // El primer par es el punto de partida en microgrados; los demas, diferencias.
 let la=v[0],lo=v[1];
 const pts=[[la,lo]];
 for(let k=2;k+1<v.length;k+=2){la+=v[k];lo+=v[k+1];pts.push([la,lo])}
 const nombre='marca-'+limpio(ruta)+'-km'+String(km).replace('.',',')+'.gpx';
 const gpx='<?xml version="1.0" encoding="UTF-8"?>\n'
  +'<gpx version="1.1" creator="marcas-pegadas"><trk><name>'
  +String(ruta).replace(/[<&>]/g,'')+' · trozo de la marca del km '+km+'</name><trkseg>\n'
  +pts.map(p=>'<trkpt lat="'+(p[0]/1e6).toFixed(6)+'" lon="'+(p[1]/1e6).toFixed(6)+'"/>').join('\n')
  +'\n</trkseg></trk></gpx>\n';
 fs.mkdirSync(DESTINO,{recursive:true});
 fs.writeFileSync(path.join(DESTINO,nombre),gpx);
 hechos++;
 console.log('\n'+ruta+' · km '+km+'  ('+pts.length+' puntos, empieza en el metro '+m0+' de la ruta)');
 console.log('  escrito: tests/referencia/trazados/'+nombre);
 console.log('  en la marca de marcas-campo.json: "grabacion":"'+nombre+'"');
 console.log('  (va por el PUNTO, que el kilometro de un trozo no es el de la ruta)');
}
console.log('\n'+hechos+' trazado'+(hechos===1?'':'s')+' de '+lineas.length+' linea'+(lineas.length===1?'':'s')+'.');
