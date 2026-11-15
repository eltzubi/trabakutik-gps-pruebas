// CARGAR UNA PIEZA CERRADA DE src/js CON require(). En la pagina las diez
// piezas comparten un mismo ambito, asi que lo que una usa de las otras -dist,
// R, routePoints, $...- aqui se le deja en globalThis antes de cargarla.
// Se carga de nuevo cada vez: el estado de la pieza no pasa de una prueba a la
// siguiente. Lo que devuelve lee primero lo que exporta la pieza y, si no, lo
// global; y lo que se le asigna va a lo global, que es donde la pieza lo lee.
const path=require('node:path');
function pieza(nombre,entorno={}){
 // Se carga SIN documento: lo que la pieza hace al arrancar en la pagina
 // -pintar, conectar botones- no corre aqui, aunque una prueba anterior haya
 // dejado uno. Despues se pone el de esta prueba, si lo trae.
 const habia='document' in globalThis,antes=globalThis.document;
 for(const [k,v] of Object.entries(entorno))if(k!=='document')globalThis[k]=v;
 delete globalThis.document;
 const ruta=require.resolve(path.join(__dirname,'../src/js/'+nombre));
 delete require.cache[ruta];
 let m;
 try{m=require(ruta)}
 finally{if('document' in entorno)globalThis.document=entorno.document;else if(habia)globalThis.document=antes}
 return new Proxy(m,{
  get:(t,k)=>k in t?t[k]:globalThis[k],
  set:(t,k,v)=>{const d=Object.getOwnPropertyDescriptor(t,k);if(d&&d.set)d.set(v);else globalThis[k]=v;return true},
  has:(t,k)=>k in t||k in globalThis
 });
}
module.exports={pieza};
