// Creador: inicio fuera del catálogo, rutas OSM, alturas y guardado.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'nuevo.html'),'utf8');
function section(start, end) {
  const i = html.indexOf(start);
  assert(i >= 0, start);
  const j = html.indexOf(end, i + start.length);
  assert(j > i, end);
  return html.slice(i, j);
}
function run(code, ctx) {
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx;
}
function elements() {
  const nodes = {};
  return (id) =>
    (nodes[id] ??= {
      textContent: "",
      disabled: false,
      hidden: false,
      classList: { add() {}, remove() {}, toggle() {} },
      setAttribute() {},
    });
}
function creatorContext() {
  const ctx = run(section('const CELDA_M=', '// Perfil de altura del creador:'), {
    $: elements(), notice() {}, drawPoints:[], AbortController, setTimeout, clearTimeout, confirm:()=>true, dist:(a,b)=>Math.hypot((a[0]-b[0])*111320,(a[1]-b[1])*81000),
  });
  vm.runInContext(`redGps=construyeRed([{points:[[43,-2,100],[43.001,-2,120]]}],null);
    seguirMapaGps=false;
    globalThis.state=()=>({red:redGps,anchors:anclasGps,segments:tramosGps});
    globalThis.draft=(a,t)=>{anclasGps=a;tramosGps=t};
    globalThis.updateDraw=()=>{};`,ctx);
  run(section('function cierraCirculoGps()', 'let savedLine=null;'),ctx);
  return ctx;
}
test('un inicio manual conserva su posición y no abre atajos en la red pública',()=>{
  const c=creatorContext(), original=c.state().red.nodos.length;
  const home=c.nodoManualGps(43.01,-2.01), bend=c.nodoManualGps(43.0103,-2.0105);
  assert.equal(c.nodoCerca(c.state().red,43.01,-2.01),-1);
  assert.deepEqual(Array.from(c.state().red.nodos[home]),[43.01,-2.01,null]);
  assert.deepEqual(Array.from(c.tramoGps(home,bend,true)),[home,bend]);
  assert.equal(c.camino(c.state().red,home,0),null,'no se añade un acceso público');
  const junction=c.nodoCerca(c.state().red,43,-2);
  const link=c.tramoGps(bend,junction,false);
  assert.equal(link.manual,true,'el enlace a la red conserva la recta manual');
  assert(c.tramoGps(0,original-1,false).length>2,'después sigue los caminos');
});
test('mover, cerrar y deshacer conservan un trazado mixto',()=>{
  const c=creatorContext(),home=c.nodoManualGps(43.01,-2.01);
  const link=c.tramoGps(home,0,false),road=c.tramoGps(0,3,false);
  c.draft([home,0,3],[[home],link,road]);
  c.mueveAnclaGps(0,43.02,-2.02);
  let s=c.state();
  assert.equal(s.red.nodos[s.anchors[0]][0],43.02);
  assert(s.segments[1].manual);
  c.cierraCirculoGps();s=c.state();
  assert.equal(s.anchors.at(-1),s.anchors[0]);assert(s.segments.at(-1).manual);
  c.$('undo').onclick();assert.equal(c.state().anchors.length,3);
  c.idaYVueltaGps();s=c.state();
  assert.equal(s.anchors.at(-1),s.anchors[0]);assert(s.segments.at(-1).manual);
  assert.deepEqual(Array.from(s.segments.at(-1)),Array.from(s.segments[1]).reverse());
});
test('el GPX manual no inventa alturas y el resumen no une huecos',()=>{
  const c=run(section('function xmlEscape(', 'function download('),{});
  const points=[[43,-2,100],[43.01,-2.01,null],[43.02,-2.02,300]];
  const xml=c.gpx(points,'Ruta personal');
  assert.equal((xml.match(/<trkpt /g)||[]).length,3);
  assert(!xml.includes('<ele>null</ele>'));assert(!xml.includes('<ele>0</ele>'));
  const e=run(section('function elevationText(', 'function loadSaved('),{R:Math.PI/180});
  assert.match(e.elevationText(points),/\+0 \/ -0.*alturas incompletas/);
});

test('Manual permite mover un punto de la red fuera de los trazados',()=>{
  const c=creatorContext();
  c.draft([0,3],[[0],c.tramoGps(0,3,false)]);
  vm.runInContext('trazadoManual=true',c);
  c.mueveAnclaGps(0,43.03,-2.03);
  const s=c.state();
  assert.equal(s.red.nodos[s.anchors[0]][0],43.03);
  assert.equal(s.red.nodos[s.anchors[0]][1],-2.03);
  assert.equal(s.segments[1].manual,true);
});

function mapReply(coords){
 return {code:'Ok',waypoints:coords.map(p=>({location:[p[1],p[0]]})),routes:[{legs:coords.slice(1).map((p,i)=>({steps:[{geometry:{type:'LineString',coordinates:[[coords[i][1],coords[i][0]],[coords[i][1]+.001,coords[i][0]],[p[1]+.001,p[0]],[p[1],p[0]]]}}]}))}]};
}
test('el planificador conserva las curvas recibidas y funciona sin tracks guardados',async()=>{
 const c=creatorContext(),coords=[[43,-2],[43.001,-2]];
 vm.runInContext('seguirMapaGps=true;redGps=construyeRed([],null)',c);
 c.fetch=async url=>{
  if(url.includes('/height?')){const q=JSON.parse(new URL(url).searchParams.get('json'));return {ok:true,json:async()=>({height:q.shape.map((p,i)=>100+i*2),shape:q.shape})};}
  assert.match(url,/routed-foot/);assert.match(url,/geometries=geojson/);assert.match(url,/steps=true/);return {ok:true,status:200,json:async()=>mapReply(coords)};
 };
 await c.planificaMapaGps(coords);
 const s=c.state();assert.equal(s.anchors.length,2);assert(s.segments[1].length>=4);
 assert(s.segments[1].every(id=>Number.isFinite(s.red.nodos[id][2])),'el recorrido conserva alturas');
 assert(s.segments[1].some(id=>s.red.nodos[id][1]===-1.999),'no corta la curva');
 assert(!s.segments[1].manual,'la respuesta del motor no se etiqueta como recta manual');
});
test('si no hay camino o servicio conserva el borrador sin dibujar una recta',async()=>{
 const c=creatorContext(),before=c.state();
 c.fetch=async()=>({ok:true,status:200,json:async()=>({code:'NoRoute'})});
 await c.planificaMapaGps([[43,-2],[43.001,-2]]);
 assert.equal(c.state().anchors.length,0);assert.equal(c.state().red,before.red);
 assert.match(c.$('plannerStatus').textContent,/No hay conexión/);
 assert.throws(()=>c.respuestaMapaGps(mapReply([[43,-2],[43.001,-2]]),[[44,-2],[44.001,-2]]),/cerca/);
});
test('cancelar un cálculo impide que su respuesta tardía cambie el borrador',async()=>{
 const c=creatorContext(),coords=[[43,-2],[43.001,-2]];let finish;
 c.fetch=()=>new Promise(r=>{finish=r});
 const pending=c.planificaMapaGps(coords);
 c.cancelaMapaGps();await c.planificaMapaGps([[44,-3]]);
 finish({ok:true,status:200,json:async()=>mapReply(coords)});await pending;
 assert.equal(c.state().anchors.length,1);
 assert.equal(c.state().red.nodos[c.state().anchors[0]][0],44);
});
test('sin aceptar el servicio no se envían coordenadas',async()=>{
 const c=creatorContext();let sent=0;c.confirm=()=>false;c.fetch=async()=>{sent++;throw Error('no debe enviarse')};
 await c.planificaMapaGps([[43,-2],[43.001,-2]]);
 assert.equal(sent,0);assert.equal(c.state().anchors.length,0);
 assert.match(c.$('plannerStatus').textContent,/No se han enviado/);
});

test('rechaza geometrías separadas en vez de unirlas con una recta',()=>{
 const c=creatorContext(),coords=[[43,-2],[43.001,-2]],j=mapReply(coords);
 j.routes[0].legs[0].steps=[{geometry:{type:'LineString',coordinates:[[-2,43],[-1.999,43]]}},{geometry:{type:'LineString',coordinates:[[-1.998,43],[-2,43.001]]}}];
 assert.throws(()=>c.respuestaMapaGps(j,coords),/corte/);
 assert.throws(()=>c.respuestaMapaGps(null,coords),/no es válida/);
});

test('detecta una cima intermedia en una recta nueva y exporta sus alturas',async()=>{
 const c=creatorContext(),result={anchors:[[43,-2],[43.009,-2]],parts:[[[43,-2],[43.009,-2]]]};
 c.fetch=async url=>{const q=JSON.parse(new URL(url).searchParams.get('json'));return {ok:true,json:async()=>({height:q.shape.map(p=>100+100*(1-Math.abs((p.lat-43)/.009-.5)*2))})}};
 await c.alturasTerrenoGps(result,new AbortController().signal);
 assert(result.parts[0].length>20,'muestras dentro de la recta');
 const e=run(section('function elevationText(', 'function loadSaved('),{R:Math.PI/180});
 const summary=e.elevationText(result.parts[0]);assert.match(summary,/\+9\d \/ -9\d/);
 const xml=run(section('function xmlEscape(', 'function download('),{}).gpx(result.parts[0],'Cima nueva');
 assert.equal((xml.match(/<ele>/g)||[]).length,result.parts[0].length);
 assert(result.anchors.every(p=>Number.isFinite(p[2])));
});
test('una altura ausente no se sustituye por cero ni se interpola sobre el hueco',async()=>{
 const c=creatorContext(),result={anchors:[[43,-2],[43.001,-2]],parts:[[[43,-2],[43.001,-2]]]};let calls=0;
 c.fetch=async url=>{calls++;const q=JSON.parse(new URL(url).searchParams.get('json'));return {ok:true,json:async()=>({height:q.shape.map((p,i)=>i===2?null:100)})}};
 const original=JSON.parse(JSON.stringify(result));
 await c.alturasTerrenoGps(result,new AbortController().signal);
 assert(result.parts[0].some(p=>p[2]===null));assert(!result.parts[0].some(p=>p[2]===0));
 await c.alturasTerrenoGps(original,new AbortController().signal);assert.equal(calls,1,'se reutilizan las alturas consultadas');
});
test('si falla el servicio de alturas conserva el camino y permite guardarlo',async()=>{
 const c=creatorContext(),coords=[[43,-2],[43.001,-2]];
 c.fetch=async url=>url.includes('/height?')?{ok:false,status:503}:{ok:true,status:200,json:async()=>mapReply(coords)};
 await c.planificaMapaGps(coords);
 assert.equal(c.state().anchors.length,2);assert.match(c.$('plannerStatus').textContent,/Recorrido conservado/);
 assert(c.state().segments[1].every(id=>c.state().red.nodos[id][2]===null));
});
test('cancelar mientras llegan alturas impide modificar un borrador posterior',async()=>{
 const c=creatorContext(),coords=[[43,-2],[43.001,-2]];let finish,batch;
 c.fetch=async url=>{
  if(!url.includes('/height?'))return {ok:true,status:200,json:async()=>mapReply(coords)};
  batch=JSON.parse(new URL(url).searchParams.get('json')).shape;
  return new Promise(r=>{finish=r});
 };
 const pending=c.planificaMapaGps(coords);
 while(!finish)await new Promise(r=>setTimeout(r,1));
 c.cancelaMapaGps();await c.planificaMapaGps([[44,-3]]);
 finish({ok:true,json:async()=>({height:batch.map(()=>200)})});await pending;
 assert.equal(c.state().anchors.length,1);assert.equal(c.state().red.nodos[c.state().anchors[0]][0],44);
});

test('Crear no ofrece selector de métodos ni instrucciones permanentes',()=>{
 assert(!html.includes('id="drawMethod"'));
 assert(!html.includes("$('drawMethod')"));
 assert(!html.includes('Marca puntos en los caminos del mapa · a pie · necesita conexión.'));
});
