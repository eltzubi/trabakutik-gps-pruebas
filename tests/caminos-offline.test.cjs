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
function contexto(){
 const c={Math,Number,Array,Set,Map,Float64Array,Float32Array,Int32Array,Uint8Array,
  JSON,console,R:Math.PI/180,RODEO_MAXIMO:4};
 vm.createContext(c);
 vm.runInContext(source('const dist=(a,b)=>','const notice=t=>'),c);
 vm.runInContext(source('const URL_CAMINOS=','function respuestaMapaGps('),c);
 // Un «const» o un «let» dentro de un vm NO son propiedades del contexto:
 // hay que sacarlos -y meterlos- evaluando dentro.
 vm.runInContext('globalThis.dist=dist',c);
 c.ponRed=red=>{c.__red=red;vm.runInContext('redOsm=__red',c)};
 return c;
}
// Una red de juguete en forma de T, con las coordenadas en centesimas de
// milesima de grado y en diferencias, igual que el fichero de verdad.
//   0 --tramo0-- 1 --tramo1-- 2        y de 1 cuelga el 3 (tramo2)
function redDeJuguete(){
 const esc=100000;
 const pts=[[43.2,-2.5],[43.2,-2.4988],[43.2,-2.4976],[43.2012,-2.4988]];
 const dif=[];let px=0,py=0;
 for(const p of pts){
  const ex=Math.round(p[0]*esc),ey=Math.round(p[1]*esc);
  dif.push(ex-px,ey-py);px=ex;py=ey;
 }
 // a, b, clase, largo, cuantos puntos de forma (ninguno)
 const tramos=[0,1,1,98,0, 1,2,1,98,0, 1,3,1,133,0];
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
 const anc=c.enganchaOsm(red,43.20009,-2.4994);
 assert(anc,'no ha enganchado');
 assert.equal(anc.tr,0);
 assert(c.dist(anc.p,[43.2,-2.4994])<3,'se ha pegado a '+anc.p);
 // Y lejos de todo, nada.
 assert.equal(c.enganchaOsm(red,43.3,-2.3),null);
});
test('El camino entre dos puntos pasa por el cruce que toca',()=>{
 const c=contexto();
 const red=c.descifraCaminos(redDeJuguete());
 const A=c.enganchaOsm(red,43.2,-2.4994);     // en el tramo 0
 const B=c.enganchaOsm(red,43.2006,-2.4988);  // en el tramo 2, hacia el norte
 const ruta=c.rutaOsm(red,A,B);
 assert(ruta&&ruta.length>=3,'sin camino');
 assert(c.dist(ruta[0],A.p)<1);
 assert(c.dist(ruta[ruta.length-1],B.p)<1);
 // Tiene que doblar por el cruce 1: el punto de en medio es ese.
 assert(ruta.some(p=>c.dist(p,[43.2,-2.4988])<1),'no pasa por el cruce');
});
test('En el mismo tramo no se da un rodeo por los cruces',()=>{
 const c=contexto();
 const red=c.descifraCaminos(redDeJuguete());
 const A=c.enganchaOsm(red,43.2,-2.49965);
 const B=c.enganchaOsm(red,43.2,-2.49905);
 const ruta=c.rutaOsm(red,A,B);
 assert(ruta);
 let largo=0;
 for(let i=1;i<ruta.length;i++)largo+=c.dist(ruta[i-1],ruta[i]);
 assert(largo<80,'ha dado un rodeo de '+Math.round(largo)+' m');
});
test('El plan local devuelve lo mismo que Valhalla: anclas y tramos pegados',()=>{
 const c=contexto();
 c.ponRed(c.descifraCaminos(redDeJuguete()));
 const plan=c.planLocalMapa([[43.2,-2.4994],[43.2006,-2.4988]]);
 assert(plan,'no ha salido plan');
 assert.equal(plan.parts.length,1);
 assert.equal(plan.anchors.length,2);
 assert(c.dist(plan.anchors[0],plan.parts[0][0])<0.1);
 assert(c.dist(plan.anchors[1],plan.parts[0][plan.parts[0].length-1])<0.1);
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
