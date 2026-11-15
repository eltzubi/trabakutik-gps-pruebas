// CARGAR UNA PIEZA CERRADA DE src/js CON require(). En la pagina las diez
// piezas comparten un mismo ambito, asi que lo que una usa de las otras -dist,
// R, routePoints, $...- aqui se le deja en globalThis antes de cargarla.
// Se carga de nuevo cada vez: el estado de la pieza no pasa de una prueba a la
// siguiente. Lo que devuelve lee primero lo que exporta la pieza y, si no, lo
// global; y lo que se le asigna va a lo global, que es donde la pieza lo lee.
const path=require('node:path');
function pieza(nombre,entorno={}){
 for(const [k,v] of Object.entries(entorno))globalThis[k]=v;
 const ruta=require.resolve(path.join(__dirname,'../src/js/'+nombre));
 delete require.cache[ruta];
 const m=require(ruta);
 return new Proxy(m,{
  get:(t,k)=>k in t?t[k]:globalThis[k],
  set:(t,k,v)=>{const d=Object.getOwnPropertyDescriptor(t,k);if(d&&d.set)d.set(v);else globalThis[k]=v;return true},
  has:(t,k)=>k in t||k in globalThis
 });
}
module.exports={pieza};
