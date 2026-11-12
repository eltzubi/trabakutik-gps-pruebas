// CUANTO GASTA LA SALIDA. El autor pregunto cuanta bateria se come la
// aplicacion. El servicio lo mide mientras graba y deja el resumen escrito al
// cerrar el GPX; esto comprueba la parte de la pagina: que lo pide, que
// insiste mientras no esta -el cierre tarda un instante- y que no escribe un
// resumen vacio ni se cae si no hay aplicacion.
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
function contexto(puente){
 const dichos=[],cola=[];
 const c={window:puente?{TrabakutikAndroid:puente}:{},notice:t=>dichos.push(t),
  setTimeout:(f,ms)=>{cola.push([f,ms]);return cola.length}};
 vm.createContext(c);
 vm.runInContext(source('function pideGasto(',"$('recordStop').onclick"),c);
 c.dichos=dichos;
 // Los reintentos van por setTimeout: aqui se corren a mano, que es lo que
 // haria el reloj.
 c.corre=(topes=40)=>{let n=0;while(cola.length&&n++<topes){const [f]=cola.shift();f();}return n};
 c.espera=()=>cola.length;
 return c;
}
test('el resumen del servicio se pega al aviso de fin', ()=>{
 const c=contexto({gastoBateria:()=>'6 h 12 min · 34 % de batería · 5,5 % por hora'});
 vm.runInContext("pideGasto('Salida finalizada',9)",c);
 assert.equal(c.dichos.length,1);
 assert.equal(c.dichos[0],'Salida finalizada · 6 h 12 min · 34 % de batería · 5,5 % por hora');
 assert.equal(c.espera(),0,'con el resumen en la mano no tiene que reintentar');
});
test('insiste mientras el servicio no ha cerrado el GPX', ()=>{
 let veces=0;
 const c=contexto({gastoBateria:()=>(++veces<4?'':'2 h 0 min · 11 % de batería')});
 vm.runInContext("pideGasto('Salida finalizada',9)",c);
 assert.equal(c.dichos.length,0,'todavía no hay nada que decir');
 c.corre();
 assert.equal(veces,4);
 assert.deepEqual(c.dichos,['Salida finalizada · 2 h 0 min · 11 % de batería']);
});
test('si nunca llega, se calla: ni un «· » suelto', ()=>{
 let veces=0;
 const c=contexto({gastoBateria:()=>{veces++;return ''}});
 vm.runInContext("pideGasto('Salida finalizada',9)",c);
 c.corre();
 assert.equal(c.dichos.length,0);
 assert.equal(veces,10,'un intento y nueve reintentos, y para');
 assert.equal(c.espera(),0,'no se queda preguntando para siempre');
});
test('sin aplicación no pregunta nada', ()=>{
 const c=contexto(null);
 vm.runInContext("pideGasto('Salida finalizada',9)",c);
 assert.equal(c.dichos.length,0);
 assert.equal(c.espera(),0);
});
// LA PAGINA SE ACTUALIZA SOLA; LA APLICACION NO. Hasta que no reinstale el
// APK, el puente es el viejo y no tiene gastoBateria: no se le pregunta ni una
// vez, para no estar nueve reintentos pidiendo lo que no existe.
test('con una aplicación anterior no se pregunta ni se insiste', ()=>{
 const c=contexto({stopRecording(){}});
 vm.runInContext("pideGasto('Salida finalizada',9)",c);
 assert.equal(c.dichos.length,0);
 assert.equal(c.espera(),0);
});
test('un puente que falla no rompe el parar', ()=>{
 const c=contexto({gastoBateria:()=>{throw new Error('servicio muerto')}});
 assert.doesNotThrow(()=>vm.runInContext("pideGasto('Salida finalizada',2)",c));
 assert.doesNotThrow(()=>c.corre());
 assert.equal(c.dichos.length,0);
});
test('el botón de guardar el mapa lleva la palabra encima de la flecha', ()=>{
 const boton=source('<button id="guardaMapa"','</button>');
 assert.match(boton,/<small>mapa<\/small><b>⤓<\/b>/,'la flecha sola no decía de qué era');
 assert.match(html,/#guardaMapa\{display:grid/,'sin grid la palabra y la flecha no se apilan');
});
