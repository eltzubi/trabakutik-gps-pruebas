// LOS CRUCES DE TODA EUSKADI EN CUADRADOS (22 nov 2026): fuera de la zona de
// Mallabia la pagina baja los cuadrados que toca la ruta y los guarda en la
// cache del navegador. Se prueba con un cuadrado de verdad (Gorbeia) y una red
// y una cache de mentira.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pieza}=require('./pieza.cjs');
const R=Math.PI/180;
const dist=(a,b)=>{const y=(a[0]-b[0])*R,x=(a[1]-b[1])*R;return 6371000*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(y/2)**2+Math.cos(a[0]*R)*Math.cos(b[0]*R)*Math.sin(x/2)**2)))};
// Un cuadrado pequeño hecho a mano, con el formato de verdad: dos cruces.
const b64=a=>Buffer.from(a).toString('base64');
const tesela={bbox:[43.0,-2.8,43.1,-2.7],escala:100000,paso_rama:6,dif:[4305000,-273000,10,10],ramas:b64([0,15|64,30|128,0,15,30|128]),fecha_osm:'2026-11-21',rotondas:[],rotondas_salidas:[]};
function entorno(red){
 const pedidas=[],guardado=new Map();
 const respuesta=(cuerpo,ok=true,status=200)=>({ok,status,json:async()=>JSON.parse(JSON.stringify(cuerpo)),clone(){return respuesta(cuerpo,ok,status)},_c:cuerpo});
 const c=pieza('08-cruces.js',{R,dist,atob:s=>Buffer.from(s,'base64').toString('binary'),notice(){},
  fetch:async url=>{pedidas.push(url);if(!red.on)throw new Error('sin red');
   if(url.endsWith('indice.json'))return respuesta({fecha_osm:'2026-11-21',paso:0.1,teselas:[[430,-28]]});
   if(url.includes('t_430_-28.json'))return respuesta(tesela);
   return respuesta({},false,404)},
  caches:{open:async()=>({match:async(u,o)=>{for(const [k,v] of guardado)if(k===u||(o&&o.ignoreSearch&&k.split('?')[0]===u))return v;return undefined},put:async(u,r)=>{guardado.set(u,r)}})}});
 return {c,pedidas,guardado};
}
const gorbeia=[[43.0500,-2.7350],[43.0510,-2.7340],[43.0520,-2.7330]];
test('Los cuadrados que toca una ruta, y si se sale de la zona de Mallabia',()=>{
 const {c}=entorno({on:true});
 assert.deepEqual(c.teselasDeRuta(gorbeia),['430_-28']);
 // Una ruta pegada a la raya de dos cuadrados se lleva los dos (margen de 200 m).
 assert.deepEqual(c.teselasDeRuta([[43.0999,-2.75]]).sort(),['430_-28','431_-28']);
 const zona=[43.1,-2.72,43.42,-2.34];
 assert.equal(c.fueraDeZona(gorbeia,zona),true);
 assert.equal(c.fueraDeZona([[43.2,-2.55]],zona),false);
});
test('Baja el cuadrado, lo guarda, no lo vuelve a pedir y sin red usa la copia guardada',async()=>{
 const red={on:true},{c,pedidas,guardado}=entorno(red);
 let r=await c.cargaTeselas(gorbeia);
 assert.equal(r.zonas.length,1);assert.equal(r.faltan,0);
 assert.equal(r.zonas[0].puntos.length,2,'los dos cruces del cuadrado');
 assert(pedidas.some(u=>u.includes('t_430_-28.json?f=2026-11-21')),pedidas.join(' '));
 assert([...guardado.keys()].some(k=>k.includes('t_430_-28.json')),'queda guardado en la cache');
 const antes=pedidas.length;
 r=await c.cargaTeselas(gorbeia);
 assert.equal(pedidas.length,antes,'la segunda vez no pide nada');
 // Otra sesion, sin red: el indice y el cuadrado salen de la cache.
 const otra=entorno({on:false});
 for(const [k,v] of guardado)otra.guardado.set(k,v);
 r=await otra.c.cargaTeselas(gorbeia);
 assert.equal(r.zonas.length,1,'sin cobertura vale la copia guardada');assert.equal(r.faltan,0);
 // Sin red y sin nada guardado: falta, y no rompe.
 const vacia=entorno({on:false});
 r=await vacia.c.cargaTeselas(gorbeia);
 assert.equal(r.zonas.length,0);
});
test('Al juntar la zona y los cuadrados no se repiten cruces ni rotondas',()=>{
 const {c}=entorno({on:true});
 const a=[43.05,-2.73,[[0]]],b=[43.06,-2.72,[[0]]];
 const z=c.juntaZonas([{puntos:[a],rotondas:[[1,2,10]]},{puntos:[a,b],rotondas:[[1,2,10],[3,4,12]]}]);
 assert.equal(z.puntos.length,2);assert.equal(z.rotondas.length,2);
});
test('Los cuadrados de Euskadi publicados se leen con el lector del navegador',()=>{
 const dir='/home/user/Rutas-Mallabia/data/cruces/';
 if(!fs.existsSync(dir+'indice.json'))return;   // fuera de la maquina del autor
 const {c}=entorno({on:true});
 const ind=JSON.parse(fs.readFileSync(dir+'indice.json'));
 assert(ind.teselas.length>100,'toda Euskadi');
 const z=c.descifraZona(JSON.parse(fs.readFileSync(dir+'t_430_-28.json')));
 assert(z.puntos.length>100&&z.puntos.every(p=>Array.isArray(p.lejos)||p.lejos===undefined),'Gorbeia, con la forma de las ramas');
});
