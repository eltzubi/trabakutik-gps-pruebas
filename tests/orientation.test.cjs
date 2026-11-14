// El rumbo de la flecha azul y de la brújula.
//
// OJO CON LO QUE PASÓ AQUÍ. Hasta el 10 de noviembre este fichero leía
// nuevo-qa.html -una copia congelada de la página- y probaba una función,
// rumboDeMovimiento, que en la página de verdad ya no existía. Once pruebas
// en verde vigilando código que no se publicaba. Ahora lee nuevo.html.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../nuevo.html'),'utf8');
function source(start,end){
 const a=html.indexOf(start),b=html.indexOf(end,a);
 assert(a>=0&&b>a,`No se encontró ${start}`);
 return html.slice(a,b);
}
function rumbos(){
 const c={R:Math.PI/180};
 vm.createContext(c);
 vm.runInContext(source('const dist=(a,b)=>','\n'),c);
 vm.runInContext(source('function bearingBetween(','// CERCA DE MI:'),c);
 return c;
}
// Punto a x metros al este e y al norte del origen de las pruebas.
const punto=(x,y)=>[43.2+y/111195,-2.5+x/(111195*Math.cos(43.2*Math.PI/180))];
const vuelta=(a,b)=>Math.abs((a-b+540)%360-180);

test('Andando, el rumbo lo da el GPS',()=>{
 const c=rumbos();
 const r=c.rumboAndando({heading:77,speed:1.4,accuracy:5},punto(0,0),null,null);
 assert.equal(r.rumbo,77);
 assert.deepEqual(r.ref,punto(0,0),'y guarda desde dónde se mide el siguiente');
});

test('Parado no se hace caso al rumbo del GPS: se queda el último bueno',()=>{
 // Es el fallo clásico del GPS: quieto, el rumbo que da es ruido, y la
 // flecha se pondría a dar vueltas encima del mapa.
 const c=rumbos();
 const ref=punto(0,0);
 for(const velocidad of [0,0.2,0.5]){
  const r=c.rumboAndando({heading:300,speed:velocidad,accuracy:5},punto(1,0),ref,90);
  assert.equal(r.rumbo,90,`a ${velocidad} m/s se mantiene el rumbo`);
 }
 // Y en cuanto echas a andar de verdad, sí.
 assert.equal(c.rumboAndando({heading:300,speed:0.6,accuracy:5},punto(1,0),ref,90).rumbo,300);
});

test('Sin rumbo del GPS se deduce andando, pero hacen falta 8 metros',()=>{
 const c=rumbos();
 const ref=punto(0,0);
 // Menos de 8 m: el baile del GPS daría un rumbo inventado.
 const quieto=c.rumboAndando({speed:1.4,accuracy:5},punto(7,0),ref,123);
 assert.equal(quieto.rumbo,123,'con 7 m se mantiene el de antes');
 assert.deepEqual(quieto.ref,ref,'y la referencia no se mueve');
 // Ocho metros al este son rumbo 90.
 const anda=c.rumboAndando({speed:1.4,accuracy:5},punto(9,0),ref,123);
 assert(vuelta(anda.rumbo,90)<1,`rumbo ${anda.rumbo}, debería ser 90`);
 assert.deepEqual(anda.ref,punto(9,0),'y la referencia se adelanta');
 // Al norte, 0 grados.
 assert(vuelta(c.rumboAndando({speed:1.4,accuracy:5},punto(0,9),ref,123).rumbo,0)<1);
});

test('Con mala señal no se deduce el rumbo del desplazamiento',()=>{
 // Con 40 m de error, dos posiciones a 9 m pueden ser el mismo sitio.
 const c=rumbos();
 const ref=punto(0,0);
 assert.equal(c.rumboAndando({speed:1.4,accuracy:40},punto(9,0),ref,123).rumbo,123);
 assert(vuelta(c.rumboAndando({speed:1.4,accuracy:35},punto(9,0),ref,123).rumbo,90)<1,
   'a 35 m justos todavía vale');
 // Pero el rumbo que viene del propio GPS sí se acepta: ese no se deduce de
 // dos posiciones, lo mide el receptor.
 assert.equal(c.rumboAndando({heading:200,speed:1.4,accuracy:40},punto(9,0),ref,123).rumbo,200);
});

test('Un rumbo imposible del GPS no se usa',()=>{
 const c=rumbos();
 const ref=punto(0,0);
 for(const h of [null,undefined,NaN,-1,360,720]){
  assert.equal(c.rumboAndando({heading:h,speed:1.4,accuracy:5},punto(1,0),ref,45).rumbo,45,
    `heading ${h} no vale`);
 }
});

test('Sin velocidad en la lectura se acepta el rumbo del GPS',()=>{
 // Hay teléfonos que dan rumbo y no dan velocidad. Descartarlo ahí dejaría
 // la flecha clavada toda la salida.
 const c=rumbos();
 assert.equal(c.rumboAndando({heading:12,accuracy:5},punto(0,0),null,null).rumbo,12);
});

test('El suavizado acerca el rumbo poco a poco y converge',()=>{
 const c=rumbos();
 // Del primero no hay nada que suavizar.
 assert.equal(c.suavizaRumbo(null,90),90);
 // Un salto de 180 no se planta encima: se recorre en varios pasos.
 let r=c.suavizaRumbo(0,90);
 assert(r>0&&r<90,`un paso lleva a ${r}, ni se queda ni salta`);
 for(let i=0;i<40;i++)r=c.suavizaRumbo(r,90);
 assert(vuelta(r,90)<0.5,`después de 40 lecturas llega a 90, no a ${r}`);
});

test('El suavizado cruza el norte por el lado corto',()=>{
 // De 350 a 10 hay 20 grados por el norte, no 340 por el sur. Sin esto la
 // flecha daba la vuelta entera cada vez que se pasaba por el norte.
 const c=rumbos();
 const r=c.suavizaRumbo(350,10);
 assert(r>350||r<20,`se queda en ${r}, que no está entre 350 y 10`);
 assert(vuelta(r,0)<20);
 const s=c.suavizaRumbo(10,350);
 assert(s>350||s<10,`se queda en ${s}`);
});

test('El suavizado siempre devuelve un rumbo de 0 a 360',()=>{
 const c=rumbos();
 // [358,20] y [2,340] son los que de verdad se salen si falta la vuelta al
 // circulo: uno pasa de 360 y el otro se va a negativo.
 for(const [a,b] of [[350,10],[10,350],[0,180],[180,0],[359.9,0.1],[90,270],[358,20],[2,340]]){
  const r=c.suavizaRumbo(a,b);
  assert(r>=0&&r<360,`de ${a} a ${b} sale ${r}`);
 }
});

test('La página usa estas dos funciones y no una copia suya',()=>{
 // Si alguien vuelve a meter el cálculo dentro de onFix, estas pruebas
 // dejarían de vigilar lo que corre en el móvil. Como pasó con nuevo-qa.
 const fix=source('function onFix(pos){','function miraPosicionNativa(');
 assert.match(fix,/rumboAndando\(pos\.coords,p,courseFix,lastCourse\)/);
 assert.match(fix,/suavizaRumbo\(rumboSuave,h\)/);
});

test('Una posición que salta ocho metros en parado no hace girar el mapa',()=>{
 const c=rumbos();
 assert.equal(c.rumboAndando({speed:0,accuracy:5},punto(12,0),punto(0,0),180).rumbo,180);
});

test('La flecha sigue la rama que lleva el progreso en una ruta creada',()=>{
 const c=rumbos();
 c.routePoints=[punto(0,0),punto(0,20),punto(20,20),punto(20,0),punto(0,0)];
 c.routeCumulative=[0,20,40,60,80];c.sentidoRuta=1;
 vm.runInContext(source('function rumboDeLaRuta(progreso){','function pintaPosicionGps('),c);
 assert(vuelta(c.rumboDeLaRuta({along:19,distance:3}),0)<1);
 assert(vuelta(c.rumboDeLaRuta({along:20,distance:3}),90)<1,'gira a la derecha al entrar al siguiente tramo');
 assert(vuelta(c.rumboDeLaRuta({along:65,distance:2}),270)<1,'respeta la rama posterior cerca de la salida');
 assert.equal(c.rumboDeLaRuta({along:20,distance:31}),null);
 c.sentidoRuta=-1;
 assert(vuelta(c.rumboDeLaRuta({along:20,distance:3}),180)<1);
});

test('La brújula cruza el norte por el lado corto y muestra cero grados',()=>{
 const c=rumbos(),caja={classList:{add(){},remove(){}}},aguja={style:{}},rotulo={};
 c.$=id=>({compass:caja,compassNeedle:aguja,compassText:rotulo})[id];
 vm.runInContext(source('const RUMBOS=','// Cargar una ruta o consultar'),c);
 c.pintaBrujula(359.6);
 assert.equal(rotulo.textContent,'N · 0°');
 c.pintaBrujula(10);
 assert.equal(aguja.style.transform,'rotate(370.0deg)');
});

test('El marcador mantiene la misma flecha al actualizar el rumbo',()=>{
 const c=rumbos(),path={style:{}},root={style:{},querySelector:()=>path};
 let creados=0;
 c.me=null;c.map={};
 c.L={divIcon:o=>o,marker:()=>{creados++;return {addTo(){return this},setLatLng(){},getElement:()=>({firstElementChild:root})}}};
 vm.runInContext('let anguloFlecha=null;',c);
 vm.runInContext(source('function pintaPosicionGps(p,h){','function onFix(pos){'),c);
 c.pintaPosicionGps(punto(0,0),350);
 c.pintaPosicionGps(punto(0,10),10);
 assert.equal(creados,1);
 assert.equal(root.style.transform,'rotate(370.0deg)');
 c.pintaPosicionGps(punto(0,10),null);
 assert.equal(path.style.visibility,'hidden');
});

test('Sin lectura de rumbo nueva se conserva el dato previo solo como referencia',()=>{
 const c=rumbos();
 const result=c.rumboAndando({speed:0,heading:null,accuracy:8},punto(0,0),punto(0,0),270);
 assert.equal(result.rumbo,270);
 assert.equal(result.nuevo,null);
 assert.equal(c.rumboAndando({speed:1,heading:90,accuracy:8},punto(0,0),punto(0,0),270).nuevo,90);
});

test('El progreso no toma la vuelta antes de llegar al extremo del camino compartido',()=>{
 const route=Array.from({length:101},(_,i)=>punto(0,Math.min(i,100-i)*10));
 const c={routePoints:route,routeCumulative:route.map((_,i)=>10*i),ultimoAlong:null,ultimoPuntoAlong:null,sentidoRuta:1,R:Math.PI/180};
 vm.createContext(c);
 vm.runInContext(source('const dist=(a,b)=>','\n'),c);
 vm.runInContext(source('function progressOnRoute(', '// Parado no hay giro'),c);
 c.progressOnRoute(punto(0,440));
 assert(Math.abs(c.progressOnRoute(punto(0,450)).along-450)<.01);
 for(let m=460;m<=500;m+=10)c.progressOnRoute(punto(0,m));
 assert(Math.abs(c.progressOnRoute(punto(0,490)).along-510)<.01);
});

test('Al llegar a la salida de un circuito ya recorrido, se ha terminado: no se vuelve al km 0',()=>{
 // Lo vio el autor al llegar al coche el 14 de noviembre de 2026: su ruta
 // acababa 89 m antes de la salida, el coche estaba en la salida, y el tramo
 // mas cercano era el del km 0: todo se puso a empezar otra vez -«quedan 1611
 // m de subida»-. Aqui: cuadrado de 250 m que acaba 90 m antes de la salida.
 const lado=250,route=[];
 for(let s=0;s<=4*lado-90;s+=10){const t=s%lado,l=Math.floor(s/lado);
  route.push(l===0?punto(t,0):l===1?punto(lado,t):l===2?punto(lado-t,lado):punto(0,lado-t))}
 const cum=route.map((_,i)=>10*i),total=cum[cum.length-1];
 const nuevo=()=>{const c={routePoints:route,routeCumulative:cum,ultimoAlong:null,ultimoPuntoAlong:null,sentidoRuta:1,R:Math.PI/180};
  vm.createContext(c);vm.runInContext(source('const dist=(a,b)=>','\n'),c);
  vm.runInContext(source('function progressOnRoute(', '// Parado no hay giro'),c);return c};
 const c=nuevo();
 for(let k=route.length-20;k<route.length;k++)c.progressOnRoute(route[k]);
 const llegada=c.progressOnRoute(punto(0,0));
 assert(llegada.along>total-5,'en la salida, al final del circuito, es el final: '+Math.round(llegada.along)+' de '+total);
 // Y al empezar, la salida sigue siendo el km 0.
 assert(nuevo().progressOnRoute(punto(0,0)).along<5,'al empezar, la salida es el km 0');
 // Pero con 250 m por delante, una lectura que caiga en el km 0,1 no te da
 // por llegado: te deja donde ibas.
 // (Una lectura que cae sobre el tramo de salida habiendote movido 10 m.)
 const d=nuevo();d.ultimoAlong=total-250;d.ultimoPuntoAlong=punto(100,10);
 const antes=d.ultimoAlong,salto=d.progressOnRoute(punto(100,0));
 assert(salto.along<total-100,'no se da por llegado 250 m antes: '+Math.round(salto.along)+' de '+total+' (iba por '+Math.round(antes)+')');
});
