'use strict';
// Los kilómetros que faltan sobre el perfil de alturas (22 de noviembre de 2026).
const test=require('node:test'),assert=require('node:assert');
const {pieza}=require('./pieza.cjs');

function carga(sentido){
 const nodos={tripPerfilMarcas:{innerHTML:''}};
 const c=pieza('07-servicio.js',{$:id=>nodos[id]||null});
 c.sentidoRuta=sentido;
 return {c,caja:nodos.tripPerfilMarcas};
}

test('el paso de las rayas deja como mucho tres por delante',()=>{
 const {c}=carga(1);
 assert.strictEqual(c.pasoMarcas(700),500);
 assert.strictEqual(c.pasoMarcas(2000),500);
 assert.strictEqual(c.pasoMarcas(2100),1000);
 assert.strictEqual(c.pasoMarcas(9000),5000);
 assert.strictEqual(c.pasoMarcas(35000),10000);
 for(const q of [300,1999,4100,12000,61000,150000]){
  const s=c.pasoMarcas(q);let n=0;for(let f=s;f<q;f+=s)n++;
  assert.ok(n<=3,q+' m: '+n+' rayas');
 }
});

test('el texto: metros redondeados a diez y kilómetros con coma',()=>{
 const {c}=carga(1);
 assert.strictEqual(c.textoFalta(713),'710 m');
 assert.strictEqual(c.textoFalta(1000),'1 km');
 assert.strictEqual(c.textoFalta(1500),'1,5 km');
 assert.strictEqual(c.textoFalta(-3),'0 m');
});

test('ida: faltan 713 m, una raya a 500 m de la meta',()=>{
 const {c,caja}=carga(1);
 c.pintaMarcasFalta({T:2600},1887);
 assert.match(caja.innerHTML,/faltan 710 m/);
 assert.match(caja.innerHTML,/>500 m</);
 assert.strictEqual((caja.innerHTML.match(/tm-raya/g)||[]).length,1);
 assert.match(caja.innerHTML,/left:80\.77%/); // 500 m antes de la meta, a la derecha
 assert.match(caja.innerHTML,/tm-meta/);
});

test('al revés: lo que falta es lo que queda hasta el principio del track',()=>{
 const {c,caja}=carga(-1);
 c.pintaMarcasFalta({T:2600},713);
 assert.match(caja.innerHTML,/faltan 710 m/);
});

test('sin perfil o fuera de la ruta no se pinta nada',()=>{
 const {c,caja}=carga(1);
 c.pintaMarcasFalta({T:2600},1887);assert.ok(caja.innerHTML);
 c.pintaMarcasFalta({T:2600},null);assert.strictEqual(caja.innerHTML,'');
 c.pintaMarcasFalta(null,100);assert.strictEqual(caja.innerHTML,'');
});
