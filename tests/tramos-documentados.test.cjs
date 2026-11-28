const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buscaTramosDocumentados}=require('../src/js/12-alternativas.js');

const lat=43,lon=-2;
const p=(x,y=0)=>[lat+y/111195,lon+x/(111195*Math.cos(lat*Math.PI/180))];
const recta=(desde,hasta,y=0)=>Array.from({length:1+(hasta-desde)/50},(_,i)=>p(desde+i*50,y));
const ficha=(points,href='ruta.html')=>({points,href});

test('marca solo la parte compartida, incluso al andar en sentido contrario',()=>{
 const linea=recta(0,500),referencia=ficha(recta(100,350));
 const [ida,vuelta]=buscaTramosDocumentados([linea,linea.slice().reverse()],[referencia]);
 for(const r of [ida,vuelta]){
  assert(Math.abs(r.metros-250)<=15);
  assert.equal(r.lineas.length,1);
  assert.equal(r.tramos[0].ref,referencia);
 }
});

test('un cruce, un tramo paralelo separado y un salto de track quedan fuera',()=>{
 const refs=[
  ficha([p(150,-50),p(150,50)],'cruce.html'),
  ficha(recta(0,300,13),'paralelo.html'),
  ficha([p(0),p(300)],'salto.html'),
 ];
 const [r]=buscaTramosDocumentados([recta(0,300)],refs);
 assert.equal(r.metros,0);
 assert.deepEqual(r.lineas,[]);
});

test('una coincidencia breve se descarta y dos fichas del mismo trazado no se suman dos veces',()=>{
 const linea=recta(0,500);
 const refs=[ficha(recta(0,50),'breve.html'),ficha(recta(150,350),'a.html'),ficha(recta(150,350),'b.html')];
 const [r]=buscaTramosDocumentados([linea],refs);
 assert(Math.abs(r.metros-200)<=15);
 assert.deepEqual(r.tramos.map(t=>t.ref.href),['a.html','b.html']);
});
