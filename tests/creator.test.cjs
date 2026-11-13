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
      // El aviso del planificador puede llevar un boton dentro -«Unir en
      // recta»-, asi que el doble tiene que saber recibirlo.
      hijos: [],
      append(x) { this.hijos.push(x); },
    });
}
function creatorContext() {
  const ctx = run(section('const CELDA_M=', '// Perfil de altura del creador:'), {
    $: elements(), notice() {}, drawPoints:[], AbortController, setTimeout, clearTimeout, confirm:()=>true, R:Math.PI/180,
    document: { createElement: () => ({ classList:{add(){},remove(){},toggle(){}}, style:{}, append(){} }) }, dist:(a,b)=>Math.hypot((a[0]-b[0])*111320,(a[1]-b[1])*81000),
  });
  vm.runInContext(`redGps=construyeRed([{points:[[43,-2,100],[43.001,-2,120]]}],null);
    seguirMapaGps=false;
    // Los caminos de la zona, ya bajados: aqui se prueban los mensajes del
    // planificador, no la espera de la descarga -eso va en su propia prueba-.
    redOsm={cestas:new Map()};
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

// Codifica una polilinea como la devuelve Valhalla: 6 decimales.
function codificaValhalla(pts){
 let salida='',lat=0,lon=0;
 const trozo=v=>{let s='',x=v<0?~(v<<1):(v<<1);
  while(x>=0x20){s+=String.fromCharCode((0x20|(x&0x1f))+63);x>>=5}
  return s+String.fromCharCode(x+63)};
 for(const p of pts){
  const la=Math.round(p[0]*1e6),lo=Math.round(p[1]*1e6);
  salida+=trozo(la-lat)+trozo(lo-lon);lat=la;lon=lo;
 }
 return salida;
}
// La respuesta del planificador, con el rodeo de +0,001 que usan las pruebas
// para comprobar que no se recorta la curva recibida.
function mapReply(coords){
 return {trip:{status:0,units:'kilometers',
  locations:coords.map(p=>({lat:p[0],lon:p[1],type:'break'})),
  legs:coords.slice(1).map((p,i)=>({shape:codificaValhalla(
    [[coords[i][0],coords[i][1]],[coords[i][0],coords[i][1]+.001],[p[0],p[1]+.001],[p[0],p[1]]])}))}};
}
test('el planificador conserva las curvas recibidas y funciona sin tracks guardados',async()=>{
 const c=creatorContext(),coords=[[43,-2],[43.001,-2]];
 vm.runInContext('seguirMapaGps=true;redGps=construyeRed([],null)',c);
 c.fetch=async(url,opciones)=>{
  if(url.includes('/height?')){const q=JSON.parse(new URL(url).searchParams.get('json'));return {ok:true,json:async()=>({height:q.shape.map((p,i)=>100+i*2),shape:q.shape})};}
  assert.match(url,/valhalla1\.openstreetmap\.de\/route/,'va al planificador de Valhalla');
  // A PIE. Con el perfil de coche las sendas y los caminos de monte no
  // existen, que es justo lo que el autor necesita que si exista.
  const pedido=JSON.parse(opciones.body);
  assert.equal(pedido.costing,'pedestrian','pide el perfil de a pie');
  assert.equal(pedido.locations.length,coords.length);
  return {ok:true,status:200,json:async()=>mapReply(coords)};
 };
 await c.planificaMapaGps(coords);
 const s=c.state();assert.equal(s.anchors.length,2);assert(s.segments[1].length>=4);
 assert(s.segments[1].every(id=>Number.isFinite(s.red.nodos[id][2])),'el recorrido conserva alturas');
 assert(s.segments[1].some(id=>s.red.nodos[id][1]===-1.999),'no corta la curva');
 assert(!s.segments[1].manual,'la respuesta del motor no se etiqueta como recta manual');
});
test('si no hay camino o servicio conserva el borrador sin dibujar una recta',async()=>{
 const c=creatorContext(),before=c.state();
 // Valhalla no contesta 200 con un codigo: contesta 400 con un numero.
 c.fetch=async()=>({ok:false,status:400,json:async()=>({error_code:171,error:'No suitable edges near location'})});
 await c.planificaMapaGps([[43,-2],[43.001,-2]]);
 assert.equal(c.state().anchors.length,0);assert.equal(c.state().red,before.red);
 const aviso=c.$('plannerStatus').textContent;
 assert.match(aviso,/No hay conexión/);
 // Y se le dice POR QUE: el lapiz solo conoce OpenStreetMap y las rutas de
 // la web, y el mapa del IGN dibuja sendas que OSM no tiene. Sin esto, el
 // autor se encontro con «no hay camino» sobre un sendero que veia pintado.
 assert.match(aviso,/IGN/,'falta la explicación de por qué no hay camino');
 assert.throws(()=>c.respuestaMapaGps(mapReply([[43,-2],[43.001,-2]]),[[44,-2],[44.001,-2]]),/cerca/);
});
test('un fallo del servidor no se cuenta como que no hay camino',async()=>{
 // La diferencia no es cosmetica: si el planificador esta caido y le decimos
 // «no hay camino», el autor mueve el punto en el monte buscando un paso que
 // si existe. Tiene que leer que el problema es del servicio.
 const c=creatorContext();
 c.fetch=async()=>({ok:false,status:500,json:async()=>({error:'Internal error'})});
 await c.planificaMapaGps([[43,-2],[43.001,-2]]);
 assert.match(c.$('plannerStatus').textContent,/No se pudo conectar/);
 assert.equal(c.state().anchors.length,0);
});
test('un tramo de menos en la respuesta no se toma por la ruta entera',async()=>{
 // Con tres puntos marcados pedimos dos tramos. Si llega uno solo y no se
 // cuenta, el tercer punto desaparece sin avisar y el trazado se queda corto.
 const c=creatorContext(),coords=[[43,-2],[43,-1.999],[43.001,-1.999]];
 const j=mapReply(coords);
 j.trip.legs.pop();
 assert.throws(()=>c.respuestaMapaGps(j,coords),/incompleta/);
 c.fetch=async()=>({ok:true,status:200,json:async()=>j});
 await c.planificaMapaGps(coords);
 assert.equal(c.state().anchors.length,0,'no se dibuja media ruta');
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
test('entre dos peticiones al planificador espera el segundo largo que pide OSM',async()=>{
 // El servidor de Valhalla es gratis y lo paga FOSSGIS: si se le aprieta
 // acaba cerrando la puerta y la aplicacion se queda sin planificador. Aqui
 // no se espera de verdad, solo se comprueba cuanto PIDE esperar.
 const c=creatorContext();
 vm.runInContext('seguirMapaGps=true;redGps=construyeRed([],null)',c);
 let rutas=0;const esperas=[];
 c.fetch=async(url,opciones)=>{
  if(url.includes('/height?')){const q=JSON.parse(new URL(url).searchParams.get('json'));return {ok:true,json:async()=>({height:q.shape.map(()=>100),shape:q.shape})};}
  rutas++;
  const pedido=JSON.parse(opciones.body).locations.map(l=>[l.lat,l.lon]);
  return {ok:true,status:200,json:async()=>mapReply(pedido)};
 };
 await c.planificaMapaGps([[43,-2],[43.001,-2]]);
 // Se adelantan solo las esperas cortas: el aviso de los 30 s que corta un
 // calculo encallado tiene que seguir siendo de 30 s, o aborta la peticion.
 c.setTimeout=(fn,ms)=>{if(ms<5000)esperas.push([ms,rutas]);return setTimeout(fn,ms<5000?0:ms)};
 // Otros puntos, para que sea una peticion nueva de verdad.
 await c.planificaMapaGps([[43.002,-2],[43.003,-2]]);
 assert.equal(rutas,2,'la segunda peticion se envia');
 const antes=esperas.filter(([,r])=>r===1);
 assert.equal(antes.length,1,'espera una sola vez antes de la segunda peticion');
 assert(antes[0][0]>900&&antes[0][0]<=1100,`espera ${antes[0][0]} ms, deberia ser algo menos de 1.100`);
});
test('sin aceptar el servicio no se envían coordenadas',async()=>{
 const c=creatorContext();let sent=0;c.confirm=()=>false;c.fetch=async()=>{sent++;throw Error('no debe enviarse')};
 await c.planificaMapaGps([[43,-2],[43.001,-2]]);
 assert.equal(sent,0);assert.equal(c.state().anchors.length,0);
 assert.match(c.$('plannerStatus').textContent,/No se han enviado/);
});

test('rechaza un recorrido con un corte en vez de unirlo con una recta',()=>{
 // Dos tramos que no se tocan: el primero acaba en 43,-1.999 y el segundo
 // empieza 80 m mas alla. Eso no se dibuja como si fuera un camino.
 const c=creatorContext(),coords=[[43,-2],[43,-1.999],[43.001,-1.999]];
 const j=mapReply(coords);
 j.trip.legs[1].shape=codificaValhalla([[43,-1.998],[43.001,-1.999]]);
 assert.throws(()=>c.respuestaMapaGps(j,coords),/corte/);
 assert.throws(()=>c.respuestaMapaGps(null,coords),/no es válida/);
 assert.throws(()=>c.respuestaMapaGps({trip:{legs:[]}},coords),/incompleta/);
});
test('un rodeo desproporcionado se trata como que no hay camino',()=>{
 // Valhalla, donde no hay paso, se inventa vueltas enormes: en un tramo de
 // 176 m del autor devolvio 11,4 km. Sus 21 tramos sanos no pasan de x2,13.
 const c=creatorContext(),coords=[[43,-2],[43.001,-2]];
 const j=mapReply(coords);
 j.trip.legs[0].shape=codificaValhalla([[43,-2],[43,-1.95],[43.001,-1.95],[43.001,-2]]);
 assert.throws(()=>c.respuestaMapaGps(j,coords),/No hay conexión/);
 // Y un rodeo normal sigue valiendo.
 assert.equal(c.respuestaMapaGps(mapReply(coords),coords).parts.length,1);
});
test('un rodeo normal en un tramo largo no se confunde con falta de camino',()=>{
 // El tope del rodeo tiene un suelo de 400 m para que en los tramos cortos no
 // salte por nada. En un tramo LARGO manda la proporcion, no el suelo, y eso
 // hay que comprobarlo aparte: con la prueba de arriba sola, un tope de x1,05
 // -que rechazaria media sierra- pasaria sin que nadie se enterase.
 const c=creatorContext(),coords=[[43,-2],[43.01,-2]];   // 1.113 m en linea recta
 const j=mapReply(coords);
 // Un camino que sale al este, sube y vuelve: 2.215 m, x1,99. El peor tramo
 // sano del autor es x2,13, asi que esto es un rodeo de los normales.
 j.trip.legs[0].shape=codificaValhalla([[43,-2],[43,-1.9932],[43.01,-1.9932],[43.01,-2]]);
 const r=c.respuestaMapaGps(j,coords);
 assert.equal(r.parts.length,1);
 let largo=0;const pts=r.parts[0];
 for(let k=1;k<pts.length;k++)largo+=c.dist(pts[k-1],pts[k]);
 assert(largo/c.dist(coords[0],coords[1])>1.5,'el tramo de prueba da un rodeo de verdad');
 assert(largo>400,'y es mas largo que el suelo de los 400 m');
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

// EL PRIMER PUNTO SE QUEDABA SIN ALTURA. En Caminos la primera ancla nace en
// el primer toque, cuando todavia no se le ha preguntado la altura a nadie, y
// anadeTramoMapa la reutiliza tal cual. La respuesta del servicio para ESE
// mismo punto llega con el primer tramo. Las dos mitades importan: ponersela
// cuando falta, y NO pisar la que presta tu propia red de rutas.
test('el primer punto de un recorrido en Caminos recibe altura, y la prestada no se pisa',()=>{
 const tramo=(lat,lon,h)=>({anchors:[[lat,lon,h],[lat+.001,lon,h+15]],
  parts:[[[lat,lon,h],[lat+.001,lon,h+15]]]});

 const lejos=creatorContext();
 const suelto=lejos.nodoManualGps(43.5,-2.5);
 assert.equal(lejos.state().red.nodos[suelto][2],null,'lejos de tus rutas nace sin altura');
 lejos.draft([suelto],[[suelto]]);
 lejos.anadeTramoMapa(tramo(43.5,-2.5,340));
 assert.equal(lejos.state().red.nodos[suelto][2],340,'el tramo del planificador le pone la altura');

 // La otra mitad: si el punto YA tiene altura no se le escribe encima. En el
 // movil esa altura es la que presta tu propia red de rutas (alturaCerca, 60 m),
 // que es lo que pediste el dia 8; aqui se pone a mano, porque la red de la
 // prueba se construye sin el fichero de alturas y no tiene ninguna que prestar.
 const cerca=creatorContext();
 const prestada=cerca.nodoManualGps(43.5,-2.5,412);
 assert.equal(cerca.state().red.nodos[prestada][2],412);
 cerca.draft([prestada],[[prestada]]);
 cerca.anadeTramoMapa(tramo(43.5,-2.5,777));
 assert.equal(cerca.state().red.nodos[prestada][2],412,'la altura que ya tenia no se pisa');

 // Y a un nodo de la red de caminos no se le escribe encima, aunque le falte:
 // esa red la comparten todas las rutas y su altura sale de data/alturas.json.
 // A cambio, una ruta empezada en Manual sobre un nodo de la red sin altura
 // conserva ese hueco. Es raro -en el movil los nodos la traen- y es a
 // proposito: antes de cambiarlo, preguntarselo al autor.
 const red=creatorContext();
 const nodo=red.nodoCerca(red.state().red,43,-2);
 assert(nodo>=0);assert.equal(red.state().red.nodos[nodo][2],null);
 red.draft([nodo],[[nodo]]);
 red.anadeTramoMapa(tramo(43,-2,500));
 assert.equal(red.state().red.nodos[nodo][2],null,'la red compartida no se toca');
});

// CUANDO NO HAY CAMINO, SE PUEDE TRAZAR A MANO. El mapa del IGN dibuja sendas
// que OpenStreetMap no tiene, y ahi el lapiz no calcula nada. El autor se
// quedo tirado a mitad de un sendero que veia pintado: «estoy marcando en
// sendero y de pronto no quiere seguir por el». Ahora, SOLO en ese caso, el
// aviso trae un boton para unir ese tramo en recta, y lo que mete va marcado
// como trazado a mano.
test('sin camino se ofrece unir en recta, y solo entonces',async()=>{
 const c=creatorContext();
 c.fetch=async()=>({ok:false,status:400,json:async()=>({error_code:171,error:'No suitable edges near location'})});
 await c.planificaTramoMapa([43,-2],[43.002,-2]);
 assert.equal(c.state().anchors.length,0,'un fallo no mete nada por su cuenta');
 assert.equal(c.$('plannerStatus').hijos.length,1,'se ofrece la salida');
 c.uneEnRectaMapa();
 const s=c.state();
 assert.equal(s.anchors.length,2,'el tramo a mano sí mete sus dos puntos');
 assert.equal(s.segments[1].aMano,true,'y queda marcado como trazado a mano');
 assert.equal(s.segments[1].length,2,'es una recta: dos puntos, sin forma inventada');
 c.uneEnRectaMapa();
 assert.equal(c.state().anchors.length,2,'no se puede unir dos veces el mismo tramo');
});
test('si falla el servicio NO se ofrece trazar a mano',async()=>{
 // Un servidor caido no significa que no haya camino. Ofrecer la recta ahi
 // seria empujar a dibujar a mano un sendero que existe.
 const c=creatorContext();
 c.fetch=async()=>({ok:false,status:500,json:async()=>({error:'Internal error'})});
 await c.planificaTramoMapa([43,-2],[43.002,-2]);
 assert.equal(c.$('plannerStatus').hijos.length,0,'nada de botones si el fallo es del servicio');
 c.uneEnRectaMapa();
 assert.equal(c.state().anchors.length,0,'y aunque se llame a mano, no mete nada');
});
test('sin los caminos de la zona bajados tampoco se ofrece',async()=>{
 const c=creatorContext();
 vm.runInContext('redOsm=null',c);
 c.fetch=async()=>({ok:false,status:400,json:async()=>({error_code:171,error:'No suitable edges near location'})});
 await c.planificaTramoMapa([43,-2],[43.002,-2]);
 assert.match(c.$('plannerStatus').textContent,/todavía se están bajando/);
 assert.equal(c.$('plannerStatus').hijos.length,0,'primero esperar, no dibujar rectas');
});
// CERRAR Y ARRASTRAR CON EL PLANIFICADOR, QUE ES EL MODO DE LA APLICACION.
// Las pruebas de arriba van por el modo antiguo (seguirMapaGps=false). En el
// de verdad, cerrar el circulo y arrastrar un punto le mandaban la ruta
// ENTERA al planificador, y un tramo unido en recta -donde no hay camino- la
// hacia fallar: el circulo no se cerraba y el punto volvia a su sitio.
function codificaValhalla(pts){
 let o='',pl=0,pn=0;
 const e=v=>{v=v<0?~(v<<1):(v<<1);let s='';while(v>=0x20){s+=String.fromCharCode((0x20|(v&0x1f))+63);v>>=5}return s+String.fromCharCode(v+63)};
 for(const [a,b] of pts){const la=Math.round(a*1e6),lo=Math.round(b*1e6);o+=e(la-pl)+e(lo-pn);pl=la;pn=lo}
 return o;
}
function planificadorConUnHueco(c,A,B,C){
 const pedidos=[];
 c.fetch=async(url,opt)=>{
  const body=JSON.parse(opt.body);pedidos.push(body.locations.length);
  const es=(x,P)=>Math.abs(x.lat-P[0])<1e-6&&Math.abs(x.lon-P[1])<1e-6;
  const legs=[];
  for(let k=1;k<body.locations.length;k++){
   const p=body.locations[k-1],q=body.locations[k];
   // Entre B y C no hay camino: Valhalla contesta con un rodeo enorme.
   const hueco=(es(p,B)&&es(q,C))||(es(p,C)&&es(q,B));
   legs.push({shape:codificaValhalla(hueco?[[p.lat,p.lon],[p.lat+0.05,p.lon],[q.lat,q.lon]]:[[p.lat,p.lon],[q.lat,q.lon]])});
  }
  return {ok:true,status:200,json:async()=>({trip:{legs}})};
 };
 vm.runInContext('seguirMapaGps=true;permisoMapaGps=true;ultimaPeticionMapaGps=0;alturasTerrenoGps=async r=>r;',c);
 return pedidos;
}
// Espera a que acabe el calculo en curso, mirandolo desde fuera del vm.
async function esperaCalculo(c){
 for(let k=0;k<400&&vm.runInContext('calculandoMapaGps',c);k++)await new Promise(r=>setTimeout(r,10));
}
async function trazadoConRecta(c,A,B,C){
 await c.planificaMapaGps([A]);
 await c.planificaTramoMapa(A,B);
 await c.planificaTramoMapa(B,C);
 assert.equal(c.$('uneRecta').onclick===undefined,true);
 c.uneEnRectaMapa();
 vm.runInContext('ultimaPeticionMapaGps=0',c);
}
test('con el planificador, cerrar el círculo solo pide el tramo de vuelta y respeta la recta',async()=>{
 const c=creatorContext(),A=[43.2,-2.5],B=[43.203,-2.5],C=[43.203,-2.496];
 const pedidos=planificadorConUnHueco(c,A,B,C);
 await trazadoConRecta(c,A,B,C);
 pedidos.length=0;
 c.cierraCirculoGps();
 await esperaCalculo(c);
 const s=c.state();
 assert.deepEqual(pedidos,[2],'solo el tramo de vuelta');
 assert.equal(s.anchors.at(-1),s.anchors[0],'el círculo queda cerrado');
 assert.equal(s.segments.filter(t=>t.aMano).length,1,'la recta sigue siendo recta');
});
test('con el planificador, arrastrar un punto solo recalcula sus tramos y deja la recta',async()=>{
 const c=creatorContext(),A=[43.2,-2.5],B=[43.203,-2.5],C=[43.203,-2.496];
 const pedidos=planificadorConUnHueco(c,A,B,C);
 await trazadoConRecta(c,A,B,C);
 pedidos.length=0;
 c.mueveAnclaGps(1,43.2032,-2.5001);
 await esperaCalculo(c);
 const s=c.state();
 assert.deepEqual(pedidos,[2],'solo el tramo con camino, el de la recta no se pide');
 assert.deepEqual(Array.from(s.red.nodos[s.anchors[1]].slice(0,2)),[43.2032,-2.5001],'el punto se mueve');
 assert.equal(s.segments[2].aMano,true,'la recta llega hasta la posición nueva');
 assert.equal(s.segments[2][0],s.anchors[1]);
});
