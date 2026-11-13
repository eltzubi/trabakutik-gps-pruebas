// EL CREADOR, CALCULANDO SIN COBERTURA. El modo «Caminos» usa Valhalla, que
// es lo mejor que hay pero necesita red; en el monte el creador se quedaba
// en «revisa la conexion». Ahora, cuando Valhalla no contesta, se calcula
// con la red de caminos guardada -la misma del lapiz de la web-.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../nuevo.html'),'utf8');
function source(start,end){
 const a=html.indexOf(start),b=html.indexOf(end,a);
 assert(a>=0&&b>a,`No se encontró ${start}`);
 return html.slice(a,b);
}
// La pieza 04 esta cerrada: se pide con require() y no se recorta del HTML.
// Lo que usa de fuera -«dist» y «R»- se le deja en el ambito global, igual
// que se lo da la pagina.
const R=Math.PI/180;
const dist=(a,b)=>{const y=(a[0]-b[0])*R,x=(a[1]-b[1])*R;return 6371000*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(y/2)**2+Math.cos(a[0]*R)*Math.cos(b[0]*R)*Math.sin(x/2)**2)))};
globalThis.R=R;globalThis.dist=dist;
const red04=require('../src/js/04-creador-red.js');
function contexto(){
 // planLocalMapa es de la pieza 05, que todavia no esta cerrada: esa si se
 // recorta, y se le dan las funciones de la 04 ya cargadas.
 const c={Math,Number,Array,JSON,console,R,dist,redOsm:null,
  enganchaOsm:red04.enganchaOsm,rutaOsm:red04.rutaOsm,RODEO_MAXIMO:red04.RODEO_MAXIMO};
 vm.createContext(c);
 vm.runInContext(source('function porQueNoHayCamino(','function respuestaMapaGps('),c);
 c.descifraCaminos=red04.descifraCaminos;
 c.ponRed=red=>{c.redOsm=red};
 return c;
}
// Una red de juguete en forma de T, con las coordenadas en centesimas de
// milesima de grado y en diferencias, igual que el fichero de verdad.
//   0 --tramo0-- 1 --tramo1-- 2        y de 1 cuelga el 3 (tramo2)
function redDeJuguete(){
 return redDe([[43.2,-2.5],[43.2,-2.4988],[43.2,-2.4976],[43.2012,-2.4988]],
  [0,1,1,98,0, 1,2,1,98,0, 1,3,1,133,0]);
}
function redDe(pts,tramos){
 const esc=100000;
 const dif=[];let px=0,py=0;
 for(const p of pts){
  const ex=Math.round(p[0]*esc),ey=Math.round(p[1]*esc);
  dif.push(ex-px,ey-py);px=ex;py=ey;
 }
 // tramos: a, b, clase, largo, cuantos puntos de forma (ninguno)
 return {escala:esc,nodos:dif,tramos};
}

test('La red se descifra con sus cruces, sus tramos y su forma',()=>{
 const c=contexto();
 const red=c.descifraCaminos(redDeJuguete());
 assert.equal(red.n,4);
 assert.equal(red.m,3);
 assert(Math.abs(red.lat[0]-43.2)<1e-6);
 // Cada tramo va en los dos sentidos: seis entradas de adyacencia.
 assert.equal(red.vecino.length,6);
 // Y del cruce 1 salen tres ramas.
 assert.equal(red.arranque[2]-red.arranque[1],3);
});
// EL FALLO DE LA REJILLA. La de verdad empieza en 43,12 (el primer cruce del
// fichero) y llega a 43,42. Con la escala sacada de ese primer cruce, un toque
// encima de un camino de Markina buscaba en otra casilla y no enganchaba: con
// la red real, 207 de 541 toques. Aqui, un camino en el sur que fija el
// primer cruce y otro en el norte donde se toca.
test('Engancha igual en el norte de la zona que en el sur',()=>{
 const red=red04.descifraCaminos(redDe(
  [[43.1224,-2.55],[43.1224,-2.549],[43.33,-2.5],[43.33,-2.499],[43.42,-2.45],[43.42,-2.449]],
  [0,1,1,81,0, 2,3,1,81,0, 4,5,1,81,0]));
 for(const [lat,lon,tr] of [[43.1224,-2.5495,0],[43.33,-2.4995,1],[43.42,-2.4495,2]]){
  const anc=red04.enganchaOsm(red,lat,lon);
  assert(anc,'no engancha encima del camino en '+lat);
  assert.equal(anc.tr,tr);
  assert(dist(anc.p,[lat,lon])<1,'se pega lejos en '+lat);
 }
});
test('Un fichero vacío o roto no se cuela',()=>{
 const c=contexto();
 assert.throws(()=>c.descifraCaminos(null));
 assert.throws(()=>c.descifraCaminos({escala:100000,nodos:[],tramos:[]}));
});
test('El toque se pega al punto más cercano del camino, no al cruce',()=>{
 const c=contexto();
 const red=c.descifraCaminos(redDeJuguete());
 // A mitad del primer tramo y 10 m al norte: tiene que engancharse ahi
 // mismo, no en el cruce 0 ni en el 1, que estan a casi 50 m.
 const anc=red04.enganchaOsm(red,43.20009,-2.4994);
 assert(anc,'no ha enganchado');
 assert.equal(anc.tr,0);
 assert(dist(anc.p,[43.2,-2.4994])<3,'se ha pegado a '+anc.p);
 // Y lejos de todo, nada.
 assert.equal(red04.enganchaOsm(red,43.3,-2.3),null);
});
test('El camino entre dos puntos pasa por el cruce que toca',()=>{
 const c=contexto();
 const red=c.descifraCaminos(redDeJuguete());
 const A=red04.enganchaOsm(red,43.2,-2.4994);     // en el tramo 0
 const B=red04.enganchaOsm(red,43.2006,-2.4988);  // en el tramo 2, hacia el norte
 const ruta=red04.rutaOsm(red,A,B);
 assert(ruta&&ruta.length>=3,'sin camino');
 assert(dist(ruta[0],A.p)<1);
 assert(dist(ruta[ruta.length-1],B.p)<1);
 // Tiene que doblar por el cruce 1: el punto de en medio es ese.
 assert(ruta.some(p=>dist(p,[43.2,-2.4988])<1),'no pasa por el cruce');
});
test('En el mismo tramo no se da un rodeo por los cruces',()=>{
 const c=contexto();
 const red=c.descifraCaminos(redDeJuguete());
 const A=red04.enganchaOsm(red,43.2,-2.49965);
 const B=red04.enganchaOsm(red,43.2,-2.49905);
 const ruta=red04.rutaOsm(red,A,B);
 assert(ruta);
 let largo=0;
 for(let i=1;i<ruta.length;i++)largo+=dist(ruta[i-1],ruta[i]);
 assert(largo<80,'ha dado un rodeo de '+Math.round(largo)+' m');
});
test('El plan local devuelve lo mismo que Valhalla: anclas y tramos pegados',()=>{
 const c=contexto();
 c.ponRed(c.descifraCaminos(redDeJuguete()));
 const plan=c.planLocalMapa([[43.2,-2.4994],[43.2006,-2.4988]]);
 assert(plan,'no ha salido plan');
 assert.equal(plan.parts.length,1);
 assert.equal(plan.anchors.length,2);
 assert(dist(plan.anchors[0],plan.parts[0][0])<0.1);
 assert(dist(plan.anchors[1],plan.parts[0][plan.parts[0].length-1])<0.1);
});
test('Un punto lejos del camino no se calcula a lo loco',()=>{
 const c=contexto();
 c.ponRed(c.descifraCaminos(redDeJuguete()));
 // A 100 m del camino: engancha, pero el liston de los 40 m lo tumba, que
 // es el mismo que se le pide a Valhalla.
 assert.equal(c.planLocalMapa([[43.2009,-2.4994],[43.2006,-2.4988]]),null);
 // Y fuera de la zona, ni eso.
 assert.equal(c.planLocalMapa([[43.5,-2.1],[43.2,-2.4988]]),null);
});
test('Los dos cálculos del creador tienen la red de seguridad enchufada',()=>{
 const tramo=source('async function planificaTramoMapa(','async function planificaMapaGps(');
 assert(/planLocalMapa\(\[desde,hasta\]\)/.test(tramo),
  'el tramo suelto tiene que caer a los caminos guardados');
 assert(/Sin conexión · tramo por los caminos guardados/.test(tramo));
 const todo=source('async function planificaMapaGps(','function metros(a, b)');
 assert(/planLocalMapa\(coords\)/.test(todo),
  'el recorrido entero tambien');
 assert(/Sin conexión · recorrido por los caminos guardados/.test(todo));
 // Y la red se pide al entrar en el creador, para que el service worker la
 // guarde antes de salir de casa.
 assert(html.includes("if(m==='create')cargaCaminosOsm();"));
});
test('Los ficheros gordos de la zona se sirven primero de la copia',()=>{
 const sw=fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8');
 // Con «primero la red» se bajaban 1,9 MB cada vez que abres la app con
 // cobertura, y no cambian casi nunca.
 assert(/\/\(caminos\|cruces\)-zona\\\.json\$/.test(sw)||sw.includes('(caminos|cruces)-zona'),
  'los dos ficheros de zona necesitan su propia regla');
 const trozo=sw.slice(sw.indexOf('(caminos|cruces)-zona'));
 const corte=trozo.slice(0,900);
 assert(corte.includes('caches.match'),'primero la copia');
 assert(corte.indexOf('caches.match')<corte.indexOf('fetch(peticion)'),
  'la copia va antes que la red, o no se gana nada');
 assert(corte.includes('e.waitUntil'),'y se refresca por detras');
});
