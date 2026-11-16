'use strict';
// El resumen del creador: letras de los puntos, tiempo andando (MIDE) y
// esfuerzo andando, sacados de la pieza 05 con require().
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {pieza}=require('./pieza.cjs');
const c=()=>pieza('05-creador-tramos.js');

test('los puntos van con letras: A…Z, y luego AA, AB…',()=>{
  const {letraPunto}=c();
  assert.equal(letraPunto(0),'A');
  assert.equal(letraPunto(2),'C');
  assert.equal(letraPunto(25),'Z');
  assert.equal(letraPunto(26),'AA');
  assert.equal(letraPunto(27),'AB');
  assert.equal(letraPunto(51),'AZ');
  assert.equal(letraPunto(52),'BA');
});

test('MIDE con subida a 550 m/h: el mayor de horizontal y vertical mas la mitad del menor',()=>{
  const {tiempoMIDE,textoHoras}=c();
  // El cartel de la subida a Zengotitagane: 1,26 km, +380 m, «50 min».
  assert.equal(textoHoras(tiempoMIDE(1260,380,0)),'51 min');
  // 17,27 km, +596, -532: 4,32 h en horizontal, 1,97 en vertical -> 5 h 18.
  assert.equal(textoHoras(tiempoMIDE(17270,596,532)),'5 h 18');
  // Llano: 4 km/h.
  assert.equal(textoHoras(tiempoMIDE(4000,0,0)),'1 h 00');
  assert.equal(textoHoras(tiempoMIDE(600,0,0)),'9 min');
  // Cuando manda el desnivel: 2 km con 800 m de subida -> 1,45 h + 0,25 h.
  assert.equal(textoHoras(tiempoMIDE(2000,800,0)),'1 h 42');
});

test('esfuerzo andando: km + desnivel/50, cortes en 23,5 y 43,2',()=>{
  const {esfuerzoAndando}=c();
  assert.equal(esfuerzoAndando(10000,500),'Fácil');      // 20
  assert.equal(esfuerzoAndando(13500,500),'Media');      // 23,5
  assert.equal(esfuerzoAndando(20000,1100),'Media');     // 42
  assert.equal(esfuerzoAndando(20000,1160),'Difícil');   // 43,2
});

test('rehacer: la firma compara los tramos por identidad',()=>{
  const {pieza:pz}=require('./pieza.cjs');
  const c=pz('06-creador-formas.js',{anclasGps:[],tramosGps:[]},require('./pieza.cjs').arranque10());
  const t1=[1,2],t2=[2,3];
  const f=x=>({a:x.a,t:x.t});
  assert.equal(c.mismaFirma(f({a:[1,2],t:[t1,t2]}),f({a:[1,2],t:[t1,t2]})),true);
  // Mismos nodos y misma longitud, pero otro tramo (recalculado): distinta.
  assert.equal(c.mismaFirma(f({a:[1,2],t:[t1,[2,3]]}),f({a:[1,2],t:[t1,t2]})),false);
  assert.equal(c.mismaFirma(null,f({a:[],t:[]})),false);
});

test('un tramo muy empinado no sale «Fácil»',()=>{
  const {textoEsfuerzo,pendienteBloque}=c();
  // El tramo del autor: 1,26 km, +380 m, con un bloque al 38 %.
  assert.equal(textoEsfuerzo(1260,380,38),'Muy empinado · hasta 38 %');
  assert.equal(textoEsfuerzo(1260,380,12),'Esfuerzo andando: Fácil');
  assert.equal(textoEsfuerzo(20000,1100,25),'Esfuerzo andando: Media · hasta 25 %');
  assert.equal(pendienteBloque(250,10,60),24);
  assert.equal(pendienteBloque(0,0,0),0);
});
