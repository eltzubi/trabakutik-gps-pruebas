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

test('MIDE: el mayor de horizontal y vertical mas la mitad del menor',()=>{
  const {tiempoMIDE,textoHoras}=c();
  // 17,27 km, +596, -532: 4,32 h en horizontal, 2,38 en vertical -> 5 h 30.
  assert.equal(textoHoras(tiempoMIDE(17270,596,532)),'5 h 30');
  // Llano: 4 km/h.
  assert.equal(textoHoras(tiempoMIDE(4000,0,0)),'1 h 00');
  assert.equal(textoHoras(tiempoMIDE(600,0,0)),'9 min');
  // Cuando manda el desnivel: 2 km con 800 m de subida -> 2 h + 0,25 h.
  assert.equal(textoHoras(tiempoMIDE(2000,800,0)),'2 h 15');
});

test('esfuerzo andando: km + desnivel/50, cortes en 23,5 y 43,2',()=>{
  const {esfuerzoAndando}=c();
  assert.equal(esfuerzoAndando(10000,500),'Fácil');      // 20
  assert.equal(esfuerzoAndando(13500,500),'Media');      // 23,5
  assert.equal(esfuerzoAndando(20000,1100),'Media');     // 42
  assert.equal(esfuerzoAndando(20000,1160),'Difícil');   // 43,2
});
