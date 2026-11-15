// LA SEGUNDA OPINION DEL PLANIFICADOR (eligeTramosCortos, pieza 04, cerrada).
// Valhalla «a pie» metia una ruta del autor por el acceso de una casa: 317 m
// donde por la carretera son 296. Se pide tambien el camino mas corto y se
// comparan los dos recorridos TROZO A TROZO: un rodeo corto (300 m como mucho,
// a menos de 40 m) que ahorra al menos 15 m y un 10 % se cambia por el corto.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const R=Math.PI/180;
global.R=R;
global.dist=(a,b)=>{const y=(a[0]-b[0])*R,x=(a[1]-b[1])*R;return 6371000*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(y/2)**2+Math.cos(a[0]*R)*Math.cos(b[0]*R)*Math.sin(x/2)**2)))};
const m=require('../src/js/04-creador-red.js');
const {eligeTramosCortos}=m;
// Puntos en metros alrededor de (43,-2): x al este, y al norte. Cada 10 m.
const P=(x,y)=>[43+y/111195,-2+x/(111195*Math.cos(43*R))];
const linea=(x0,x1,y=0)=>{const o=[];for(let x=x0;x<=x1;x+=10)o.push(P(x,y));return o};
const largo=pts=>{let s=0;for(let k=1;k<pts.length;k++)s+=dist(pts[k-1],pts[k]);return s};
const aparta=pts=>Math.max(...pts.map(p=>Math.abs((p[0]-43)*111195)));
// Un tramo de 2 km por la carretera (y=0), con un rodeo por el acceso de una
// casa entre x=1000 y x=1100, a 15 m de la carretera.
const recto=linea(0,2000);
const conRodeo=[...linea(0,990),P(1000,15),...linea(1010,1090,15),P(1100,15),P(1110,0),...linea(1120,2000)];
test('El rodeo por el acceso de la casa se quita aunque el tramo mida 2 km',()=>{
 assert(largo(conRodeo)-largo(recto)<40,'el caso: un rodeo de pocos metros en 2 km');
 const r=eligeTramosCortos({anchors:[],parts:[conRodeo]},{anchors:[],parts:[recto]}).parts[0];
 assert(aparta(r)<1,'va por la carretera: se aparta '+aparta(r).toFixed(1)+' m');
 assert(Math.abs(largo(r)-2000)<2,'y mide lo de la carretera: '+largo(r).toFixed(1));
 assert.equal(r[0],conRodeo[0]);assert.equal(r[r.length-1],conRodeo[conRodeo.length-1]);
});
test('Lo que no es un rodeo corto no se toca: otro camino entero, o muy apartado',()=>{
 // Un camino distinto de 600 m a 30 m: demasiado largo para ser un rodeo.
 const otro=[...linea(0,690),P(700,30),...linea(710,1290,30),P(1300,30),P(1310,0),...linea(1320,2000)];
 assert.equal(eligeTramosCortos({parts:[otro]},{parts:[recto]}).parts[0],otro);
 // Un trozo corto pero a 80 m: es otro camino, no la entrada de una casa.
 const lejos=[...linea(0,990),P(1000,80),P(1050,80),P(1100,80),P(1110,0),...linea(1120,2000)];
 assert.equal(eligeTramosCortos({parts:[lejos]},{parts:[recto]}).parts[0],lejos);
});
test('Si el rodeo ahorra poco, se queda el normal',()=>{
 // A 3 m de la carretera ni siquiera se separa (JUNTOS_M 4).
 const pegado=[...linea(0,990),...linea(1000,1100,3),...linea(1110,2000)];
 assert.equal(eligeTramosCortos({parts:[pegado]},{parts:[recto]}).parts[0],pegado);
 // Un desvio suave a 8 m que solo alarga unos metros: menos de 15.
 const suave=[...linea(0,950),P(1000,8),P(1050,8),P(1100,0),...linea(1110,2000)];
 assert(largo(suave)-largo(recto)<15);
 assert.equal(eligeTramosCortos({parts:[suave]},{parts:[recto]}).parts[0],suave);
});
test('Tramo a tramo, y si el corto no cuadra se queda el normal entero',()=>{
 const tramo2=[P(2000,0),P(2000,200)];
 const r=eligeTramosCortos({anchors:[],parts:[conRodeo,tramo2]},{anchors:[],parts:[recto,[P(2000,0),P(2000,200)]]});
 assert(aparta(r.parts[0])<1);assert.equal(r.parts[1],tramo2,'el segundo, sin rodeo, sigue siendo el normal');
 const normal={anchors:[],parts:[conRodeo]};
 assert.equal(eligeTramosCortos(normal,null),normal,'sin respuesta');
 assert.equal(eligeTramosCortos(normal,{parts:[recto,recto]}),normal,'otro numero de tramos');
 assert.equal(eligeTramosCortos(normal,{parts:[[P(0,5),...recto.slice(1)]]}),normal,'empieza en otro sitio');
});
