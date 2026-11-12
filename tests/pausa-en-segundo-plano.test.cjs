// LA PAGINA SE DUERME CON LA PANTALLA APAGADA. Con una salida en marcha no se
// dormia nunca, asi que el mapa seguia moviendose y bajando teselas para
// nadie: en coche, 10 %/h medidos por el autor. Ahora MainActivity pregunta a
// la pagina en que anda antes de suspenderla, y esto ejecuta ESA pregunta
// -sacada del propio Java, no una copia- con los casos que importan.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const java=fs.readFileSync(path.join(__dirname,
  '../android/app/src/main/java/com/trabakutik/gps/MainActivity.java'),'utf8');
function sonda(){
 const a=java.indexOf('"(function(){if(typeof mode');
 const b=java.indexOf('estado->{',a);
 assert(a>=0&&b>a,'no encuentro la pregunta de onStop');
 // Es un literal partido en varios trozos con «+»: se vuelven a juntar.
 const trozos=java.slice(a,b).match(/"((?:[^"\\]|\\.)*)"/g).map(t=>t.slice(1,-1));
 const texto=trozos.join('');
 assert(!texto.includes('\\'),'el literal lleva escapes: habria que deshacerlos');
 return texto;
}
const PREGUNTA=sonda();
function responde(estado){
 const c={...estado};
 vm.createContext(c);
 // Un «const» dentro de un vm no es propiedad del contexto: se lee evaluando.
 vm.runInContext('const r='+PREGUNTA+';',c);
 return vm.runInContext('r',c);
}
test('0 · creando una ruta no se toca', ()=>{
 assert.equal(responde({mode:'create',recording:false,navegaNativo:false,fuenteNativa:false}),0);
 assert.equal(responde({mode:'create',recording:true,navegaNativo:true,fuenteNativa:true}),0);
});
test('1 · la pagina parada se duerme, como siempre', ()=>{
 assert.equal(responde({mode:'nav',recording:false,navegaNativo:false,fuenteNativa:false}),1);
});
test('2 · la salida que lleva el servicio tambien se duerme', ()=>{
 assert.equal(responde({mode:'nav',recording:true,navegaNativo:false,fuenteNativa:true}),2,'grabando');
 assert.equal(responde({mode:'nav',recording:false,navegaNativo:true,fuenteNativa:true}),2,'guiando');
 assert.equal(responde({mode:'nav',recording:true,navegaNativo:true,fuenteNativa:true}),2,'las dos cosas');
});
test('0 · si la salida la lleva la propia pagina, no se la toca', ()=>{
 assert.equal(responde({mode:'nav',recording:true,navegaNativo:false,fuenteNativa:false}),0);
 assert.equal(responde({mode:'nav',recording:false,navegaNativo:true,fuenteNativa:false}),0);
});
test('0 · una pagina a medio cargar no se suspende a ciegas', ()=>{
 assert.equal(responde({mode:'nav',recording:false,navegaNativo:false}),0,'sin fuenteNativa');
 assert.equal(responde({recording:false,navegaNativo:false,fuenteNativa:false}),0,'sin mode');
 assert.equal(responde({mode:'nav',navegaNativo:false,fuenteNativa:false}),0,'sin recording');
 assert.equal(responde({mode:'nav',recording:false,fuenteNativa:false}),0,'sin navegaNativo');
});
