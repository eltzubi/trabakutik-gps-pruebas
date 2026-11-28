const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buscaTramosDocumentados,recortaTrackPublicado}=require('../src/js/12-alternativas.js');

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

const distancia=(a,b)=>Math.hypot((a[0]-b[0])*111195,(a[1]-b[1])*111195*Math.cos(lat*Math.PI/180));

test('un track publicado sale entre los puntos próximos en ambos sentidos y conserva su geometría',()=>{
 const original=[...recta(0,100),...recta(150,350,25),...recta(400,500)];
 const ida=recortaTrackPublicado(original,p(25,30),p(475,20),distancia);
 const vuelta=recortaTrackPublicado(original,p(475,20),p(25,30),distancia);
 assert.deepEqual(ida.points,vuelta.points.slice().reverse());
 assert.deepEqual(ida.points[0],p(25).concat(null));
 assert.deepEqual(ida.points.at(-1),p(475).concat(null));
 assert(Math.abs(ida.ajustes[0]-30)<.01);
 assert(ida.points.slice(1,-1).every(q=>original.includes(q)));
});

test('el recorte rechaza puntos alejados y no cruza un salto del track',()=>{
 assert.equal(recortaTrackPublicado(recta(0,500),p(25,70),p(475),distancia),null);
 assert.equal(recortaTrackPublicado([...recta(0,100),...recta(350,500)],p(25),p(475),distancia),null);
});

test('el catálogo oficial recorta un GPX real y conserva su procedencia',()=>{
 const {recortaSenderoOficial}=require('../src/js/12-alternativas.js');
 const catalogo=require('../data/senderos-bizkaia.json');
 assert.equal(catalogo.licencia,'CC BY 4.0');
 const ref=catalogo.tramos.find(t=>t.codigo==='PR-BI 120');
 const a=ref.puntos[100],b=ref.puntos[165];
 const r=recortaSenderoOficial(a,b,[ref],distancia);
 assert.equal(r.oficial.codigo,'PR-BI 120');
 assert.match(r.oficial.url,/^https:\/\/opengis\.bizkaia\.eus\//);
 assert(r.parts[0].length>3);
 assert.deepEqual(r.parts[0][0],a);
 assert.deepEqual(r.parts[0].at(-1),b);
 assert.equal(recortaSenderoOficial([a[0]+.00008,a[1]],b,[ref],distancia,[.8,20]),null);
});

test('Arrazola y la derivación de Atxarte se recortan por separado',()=>{
 const {recortaSenderoOficial}=require('../src/js/12-alternativas.js');
 const refs=require('../data/senderos-bizkaia.json').tramos.filter(t=>t.codigo==='PR-BI 85-2');
 assert.equal(refs.length,2);
 const rama=refs.find(t=>t.derivacion),vuelta=refs.find(t=>!t.derivacion);
 const a=rama.puntos.at(-1),b=vuelta.puntos[100];
 assert.equal(recortaSenderoOficial(a,b,refs,distancia),null);
 assert.match(recortaSenderoOficial(rama.puntos[190],a,refs,distancia).oficial.nombre,/derivación Atxarte/);
});
