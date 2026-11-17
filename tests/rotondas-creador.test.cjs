// LAS ROTONDAS DEL CREADOR, SIEMPRE POR LA DERECHA (17 nov 2026). El
// planificador calcula a pie y a pie una rotonda se rodea por el lado mas
// corto; el autor: «crear la rotonda por el lado que toca, vamos siempre por
// la derecha». El trozo que la recorre al reves se cambia por el arco bueno.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const R=Math.PI/180;
const dist=(a,b)=>{const y=(a[0]-b[0])*R,x=(a[1]-b[1])*R;return 6371000*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(y/2)**2+Math.cos(a[0]*R)*Math.cos(b[0]*R)*Math.sin(x/2)**2)))};
globalThis.R=R;globalThis.dist=dist;
const {pieza}=require('./pieza.cjs');
const C=[43.2,-2.5];
// Punto a m metros del centro con rumbo b (0 norte, 90 este).
const en=(b,m)=>[C[0]+m*Math.cos(b*R)/111195,C[1]+m*Math.sin(b*R)/(111195*Math.cos(C[0]*R))];
const rumbo=p=>(Math.atan2((p[1]-C[1])*Math.cos(C[0]*R),p[0]-C[0])/R+360)%360;
const rot=[C[0],C[1],15,{sentido:1,salidas:[]}];
// Entra por el sur, sale por el oeste. Por la derecha (al reves que el reloj)
// es sur -> este -> norte -> oeste, tres cuartos de vuelta.
const camino=b=>{const p=[];for(let m=60;m>15;m-=5)p.push(en(180,m));for(const x of b)p.push(en(x,15));for(let m=20;m<=60;m+=5)p.push(en(270,m));return p};
test('Una rotonda recorrida al reves se cambia por el arco que va por la derecha',()=>{
 const c=pieza('05-creador-tramos.js');
 const malo=camino([180,200,225,250,270]);           // por el lado corto: a contramano
 const bien=c.rotondasPorLaDerecha(malo,[rot]);
 const dentro=bien.filter(p=>dist(p,C)<=21).map(rumbo);
 assert(dentro.some(b=>Math.abs(b-90)<12),'pasa por el este: '+dentro.map(Math.round));
 assert(dentro.some(b=>b<12||b>348),'y por el norte');
 assert(!dentro.some(b=>b>200&&b<250),'y ya no por el suroeste');
 // La entrada y la salida, y lo de fuera, no se mueven.
 assert.deepEqual(bien[0],malo[0]);assert.deepEqual(bien[bien.length-1],malo[malo.length-1]);
 for(let k=1;k<bien.length;k++)assert(dist(bien[k-1],bien[k])<8,'sin saltos');
});
test('Si ya va por la derecha, o la rotonda no se toca, el camino queda igual',()=>{
 const c=pieza('05-creador-tramos.js');
 const bueno=camino([180,135,90,45,0,315,270]);
 assert.deepEqual(c.rotondasPorLaDerecha(bueno,[rot]),bueno);
 const lejos=[[43.3,-2.4],[43.301,-2.4],[43.302,-2.4]];
 assert.deepEqual(c.rotondasPorLaDerecha(lejos,[rot]),lejos);
 // Un punto marcado DENTRO de la rotonda (el tramo acaba ahi): se respeta.
 const hastaDentro=camino([180,200,225]).slice(0,12);
 assert.deepEqual(c.rotondasPorLaDerecha(hastaDentro,[rot]),hastaDentro);
});
