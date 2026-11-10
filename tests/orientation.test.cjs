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
 for(const h of [null,undefined,NaN,-1]){
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
