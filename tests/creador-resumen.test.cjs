'use strict';
// El resumen del creador: letras de los puntos, tiempo andando (MIDE) y
// esfuerzo andando, sacados de la pieza 05 con require().
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
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

test('un tramo muy empinado no sale «Fácil» y dice cuánto mide',()=>{
  const {textoEsfuerzo,pendienteBloque,textoMetros}=c();
  // El tramo del autor: 3,64 km, +453 m, 400 m de rampa con un bloque al 44 %.
  assert.equal(textoEsfuerzo(3640,453,44,400),'Rampa dura: 400 m al 44 %');
  assert.equal(textoEsfuerzo(1260,380,12,0),'Esfuerzo andando: Fácil');
  assert.equal(textoEsfuerzo(20000,1100,25,1250),'Media · rampa de 1,3 km al 25 %');
  assert.equal(textoMetros(260),'300 m');
  assert.equal(textoMetros(40),'100 m');
  assert.equal(pendienteBloque(250,60),24);
  assert.equal(pendienteBloque(0,0,0),0);
});

test('la rampa es la del último tramo, y solo de subida',()=>{
  const {rampaUltimoTramo}=c();
  // Puntos cada ~111 m hacia el norte (coordenadas ficticias).
  const tramo=(h0,dh,n,la0)=>Array.from({length:n},(_,i)=>[la0+i*0.001,-2,h0+i*dh]);
  const subida=tramo(100,40,5,43);           // ~444 m subiendo 160 m: 36 %
  const llano=tramo(260,0,5,43.004).slice(1);  // sigue llano
  const pts=subida.concat(llano);
  // Ultimo tramo = la subida entera: rampa.
  const r1=rampaUltimoTramo(subida,0);
  assert(r1.pend>30&&r1.metros>300,JSON.stringify(r1));
  // Ultimo tramo = el llano (empieza en el punto 4): sin rampa.
  assert.deepEqual(JSON.stringify(rampaUltimoTramo(pts,4)),JSON.stringify({pend:0,metros:0}));
  // Bajada fuerte: tampoco es rampa.
  const baja=tramo(400,-40,5,43);
  assert.equal(rampaUltimoTramo(baja,0).pend,0);
});
test('Dos calzadas juntas en la misma dirección son una sola (23 nov 2026)',()=>{
 // Lo pidió el autor: «da igual que haya dos calzadas, si son en la misma
 // dirección para mí los dos son uno», porque el creador le decía «el punto
 // anterior está en otra calzada» y le obligaba a dar puntos cortísimos.
 const {mismaCalzada}=c();
 // Un punto en el norte de Bizkaia, con la marcha hacia el este (rumbo 90).
 const p=[43.2,-2.5],m=g=>111195*Math.cos(43.2*Math.PI/180),norte=d=>d/111195;
 const mueve=(dn,de)=>[p[0]+norte(dn),p[1]+de/m()];
 // DE LADO: la calzada gemela, a 12 m al norte de la mía. Es la misma vía.
 assert.equal(mismaCalzada(p,mueve(12,0),90),true,'12 m de lado, misma carretera');
 assert.equal(mismaCalzada(p,mueve(-25,0),90),true,'25 m al otro lado, también');
 assert.equal(mismaCalzada(p,mueve(31,0),90),false,'a 31 m ya no es la calzada de al lado');
 // HACIA DELANTE: eso cambia el recorrido, te saltas un trozo. No vale.
 assert.equal(mismaCalzada(p,mueve(0,40),90),false,'40 m hacia delante, no');
 assert.equal(mismaCalzada(p,mueve(0,-40),90),false,'40 m hacia atrás, tampoco');
 // El error de pegado normal sí pasa.
 assert.equal(mismaCalzada(p,mueve(0,6),90),true,'6 m de pegado');
 // Con el rumbo girado, lo de lado y lo de delante cambian de sitio.
 assert.equal(mismaCalzada(p,mueve(20,0),0),false,'yendo al norte, 20 m al norte es avanzar');
 assert.equal(mismaCalzada(p,mueve(0,20),0),true,'y 20 m al este es la calzada de al lado');
 // Sin rumbo no se decide nada: se mantiene el «no» de siempre.
 assert.equal(mismaCalzada(p,mueve(12,0),null),false);
 assert.equal(mismaCalzada(null,mueve(12,0),90),false);
 // Y está enchufado donde saltaba el aviso.
 const n05=fs.readFileSync(path.join(__dirname,'../src/js/05-creador-tramos.js'),'utf8');
 assert(/dist\(result\.anchors\[0\],coords\[0\]\)>3\s*\n?\s*&&!mismaCalzada\(coords\[0\],result\.anchors\[0\],rumbo\)/.test(n05),
   'el «otra calzada» tiene que consultar mismaCalzada antes de saltar');
});
