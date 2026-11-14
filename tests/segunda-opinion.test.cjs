// LA SEGUNDA OPINION DEL PLANIFICADOR (eligeTramosCortos, pieza 04, cerrada).
// Valhalla «a pie» metia una ruta del autor por el acceso de una casa: 317 m
// donde por la carretera son 296. Se pide tambien el camino mas corto y, tramo
// a tramo, se queda el corto solo si ahorra al menos un 5 % y 15 m.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const R=Math.PI/180;
global.R=R;
global.dist=(a,b)=>{const y=(a[0]-b[0])*R,x=(a[1]-b[1])*R;return 6371000*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(y/2)**2+Math.cos(a[0]*R)*Math.cos(b[0]*R)*Math.sin(x/2)**2)))};
const {eligeTramosCortos,AHORRO_PCT,AHORRO_M}=require('../src/js/04-creador-red.js');
// Puntos en metros alrededor de (43,-2): x al este, y al norte.
const P=(x,y)=>[43+y/111195,-2+x/(111195*Math.cos(43*R))];
const recta=[P(0,0),P(296,0)];
const porLaCasa=[P(0,0),P(100,0),P(110,15),P(180,15),P(190,0),P(296,0)];
test('El rodeo por el acceso de la casa se cambia por la carretera',()=>{
 const r=eligeTramosCortos({anchors:[recta[0],recta[1]],parts:[porLaCasa]},{anchors:[],parts:[recta]});
 assert.equal(r.parts[0],recta,'se queda la recta: ahorra '+Math.round(dist(P(100,0),P(110,15))*2+80-90)+' m');
});
test('Si ahorra poco (menos de 15 m o menos de un 5 %) manda el normal',()=>{
 assert.equal(AHORRO_PCT,.05);assert.equal(AHORRO_M,15);
 // 10 m en 300: ni 15 m.
 const n1=[P(0,0),P(150,9),P(300,0)],c1=[P(0,0),P(300,0)];
 assert.equal(eligeTramosCortos({parts:[n1]},{parts:[c1]}).parts[0],n1);
 // 40 m en 1.000: 4 %, menos del 5 %.
 const n2=[P(0,0),P(500,100),P(1000,0)],c2=[P(0,0),P(500,0),P(1000,0)];
 const ahorro=dist(n2[0],n2[1])*2-1000;assert(ahorro>15&&ahorro/(1000+ahorro)<.05,'el caso es el que dice: '+ahorro);
 assert.equal(eligeTramosCortos({parts:[n2]},{parts:[c2]}).parts[0],n2);
});
test('Tramo a tramo: se cambia solo el que tiene rodeo',()=>{
 const tramo2=[P(296,0),P(296,200)];
 const r=eligeTramosCortos({anchors:[],parts:[porLaCasa,tramo2]},{anchors:[],parts:[recta,[P(296,0),P(296,200)]]});
 assert.equal(r.parts[0],recta);assert.equal(r.parts[1],tramo2,'el segundo, igual de largo, sigue siendo el normal');
});
test('Si el corto no cuadra, se queda el normal entero',()=>{
 const normal={anchors:[],parts:[porLaCasa]};
 assert.equal(eligeTramosCortos(normal,null),normal,'sin respuesta');
 assert.equal(eligeTramosCortos(normal,{parts:[recta,recta]}),normal,'otro numero de tramos');
 assert.equal(eligeTramosCortos(normal,{parts:[[P(0,5),P(296,0)]]}),normal,'empieza en otro sitio: el trazado se cortaria');
 assert.equal(eligeTramosCortos(normal,{parts:[[P(0,0),P(296,5)]]}),normal,'acaba en otro sitio');
});
