// LO QUE SE LE DICE AL AUTOR CUANDO EL LAPIZ NO SACA TRAMO. Se encontro con
// «No hay conexión a pie entre esos puntos en OpenStreetMap» sobre un sendero
// que veía dibujado en el mapa del IGN, y eso manda a buscar el fallo donde no
// esta: o los caminos no habian acabado de bajarse, o ese sendero no esta en
// OpenStreetMap aunque el IGN lo pinte.
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
function conRed(red){
 const c={redOsm:red};
 vm.createContext(c);
 vm.runInContext(source('function porQueNoHayCamino(','function planLocalMapa('),c);
 // sinCamino: lo marca el planificador cuando de verdad no hay paso, para
 // distinguirlo de un fallo del servicio.
 return (m,sinCamino)=>vm.runInContext('porQueNoHayCamino('+
   JSON.stringify(m===undefined?null:{message:m,sinCamino:!!sinCamino})+')',c);
}
test('sin los caminos bajados, lo dice y no culpa al mapa', ()=>{
 const di=conRed(null);
 const t=di('No hay conexión a pie entre esos puntos en OpenStreetMap.',true);
 assert.match(t,/todavía se están bajando/);
 assert.doesNotMatch(t,/OpenStreetMap no tiene/,'no toca hablar del IGN si ni siquiera hay red');
});
test('con los caminos bajados, explica que el IGN dibuja sendas que OSM no tiene', ()=>{
 const di=conRed({cestas:new Map()});
 const t=di('No hay conexión a pie entre esos puntos en OpenStreetMap.',true);
 assert.match(t,/No hay conexión a pie/);
 assert.match(t,/IGN/);
 assert.doesNotMatch(t,/bajando/);
});
// Y LA DISTINCION QUE YA EXISTIA NO SE PIERDE: un servicio caido no es «no
// hay camino». Si se lo decimos, el autor mueve el punto en el monte
// buscando un paso que si existe.
test('un fallo del servicio se cuenta como lo que es', ()=>{
 const di=conRed({cestas:new Map()});
 const t=di('No se pudo conectar con el planificador.',false);
 assert.equal(t,'No se pudo conectar con el planificador.');
 assert.doesNotMatch(t,/IGN|OpenStreetMap/,'no se le echa la culpa al mapa');
});
test('sin mensaje no se enseña «undefined»', ()=>{
 const di=conRed({cestas:new Map()});
 assert.doesNotMatch(di(),/undefined|null/);
});
