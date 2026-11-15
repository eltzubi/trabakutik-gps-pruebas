// CARGAR UNA PIEZA CERRADA DE src/js CON require(). En la pagina las diez
// piezas comparten un mismo ambito, asi que lo que una usa de las otras -dist,
// R, routePoints, $...- aqui se le deja en globalThis antes de cargarla.
// Se carga de nuevo cada vez: el estado de la pieza no pasa de una prueba a la
// siguiente. Lo que devuelve lee primero lo que exporta la pieza y, si no, lo
// global; y lo que se le asigna va a lo global, que es donde la pieza lo lee.
const path=require('node:path');
// «arranque»: lo que la pieza necesita SOLO para cargarse -una pantalla y unos
// relojes de mentira para lo que pone en marcha al arrancar-; se quita
// despues de cargarla, para no dejar relojes cambiados a las demas pruebas.
function pieza(nombre,entorno={},arranque=null){
 // Se carga SIN documento: lo que la pieza hace al arrancar en la pagina
 // -pintar, conectar botones- no corre aqui, aunque una prueba anterior haya
 // dejado uno. Despues se pone el de esta prueba, si lo trae.
 const habia='document' in globalThis,antes=globalThis.document;
 for(const [k,v] of Object.entries(entorno))if(k!=='document')globalThis[k]=v;
 delete globalThis.document;
 const ruta=require.resolve(path.join(__dirname,'../src/js/'+nombre));
 delete require.cache[ruta];
 const previos={};
 if(arranque)for(const [k,v] of Object.entries(arranque)){previos[k]=[k in globalThis,globalThis[k]];globalThis[k]=v}
 let m;
 try{m=require(ruta)}
 finally{
  for(const [k,[estaba,valor]] of Object.entries(previos)){if(estaba)globalThis[k]=valor;else delete globalThis[k]}
  if('document' in entorno)globalThis.document=entorno.document;else if(habia)globalThis.document=antes;else delete globalThis.document;
 }
 return new Proxy(m,{
  get:(t,k)=>k in t?t[k]:globalThis[k],
  set:(t,k,v)=>{const d=Object.getOwnPropertyDescriptor(t,k);if(d&&d.set)d.set(v);else globalThis[k]=v;return true},
  has:(t,k)=>k in t||k in globalThis
 });
}
// La 09 pone en marcha relojes y escucha la pantalla al arrancar: con esto se
// carga sin que nada de eso corra de verdad. «relojes» recoge los setInterval.
function arranque09(relojes=[]){return {document:{addEventListener(){},hidden:true},setInterval:fn=>{relojes.push(fn);return 0}}}
// Un trozo del texto de una funcion ya cargada (para comprobar que la ficha y
// la voz dicen lo mismo): se mira el codigo que corre, no el HTML.
function trozo(fn,desde,hasta){const t=fn.toString(),a=t.indexOf(desde),b=t.indexOf(hasta,a);if(a<0||b<a)throw Error('No esta '+desde);return t.slice(a,b)}
module.exports={pieza,arranque09,trozo};
