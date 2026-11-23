// CRUCES DIFICILES (17 nov 2026). Casos construidos para ROMPER la regla de
// los avisos de cruce, no para confirmarla. Nacio de la revision de ChatGPT:
// un camino que sale a la izquierda y curva luego a la derecha se avisaba
// «derecha», y ni los controles del autor ni el juez del trazado lo veian,
// porque median con la misma vara que la regla. Cada caso dice lo que una
// persona en el sitio esperaria oir.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../nuevo.html'),'utf8');
const {pieza,arranque10}=require('./pieza.cjs');
const R=Math.PI/180;
function meters(a,b){
 const q=Math.sin((b[0]-a[0])*R/2)**2+Math.cos(a[0]*R)*Math.cos(b[0]*R)*Math.sin((b[1]-a[1])*R/2)**2;
 return 12742000*Math.asin(Math.min(1,Math.sqrt(q)));
}
const ayudas={R,dist:meters};vm.createContext(ayudas);
{const a=html.indexOf('function bearingBetween(a,b){'),b=html.indexOf('// EL RUMBO DE LA FLECHA',a);vm.runInContext(html.slice(a,b),ayudas)}
const nodoMudo=()=>({classList:{add(){},remove(){},toggle(){},contains(){return false}},style:{setProperty(){},removeProperty(){}},textContent:''});
function detector(){
 const c=pieza('08-cruces.js',{R,dist:meters,bearingBetween:ayudas.bearingBetween,
  routePoints:[],crucesOsm:[],junctions:[],junctionsReves:null,junctionWarned:new Set(),junctionZoomOnce:new Set(),routeCumulative:[],
  turnMarker:null,junctionActive:-1,junctionBlocked:-1,junctionZoom:null,autoZooming:false,$:()=>nodoMudo(),
  window:{TrabakutikAndroid:{setJunctions(){},setJunctionsReves(){}}}});
 return (pts,cruces)=>{c.routePoints=pts;c.crucesOsm=cruces;c.computeJunctions();return c.junctions.slice()};
}
// Coordenadas locales en metros (x al este, y al norte) alrededor de un origen.
const O=[43.2,-2.5],KX=111195*Math.cos(O[0]*R);
const P=(x,y)=>[O[0]+y/111195,O[1]+x/KX];
// Una pierna: una lista de [rumbo, metros] encadenados desde un punto.
function pierna(desde,tramos,paso=5){
 const out=[];let [x,y]=desde;
 for(const [rumbo,largo] of tramos){
  for(let m=paso;m<=largo+1e-9;m+=paso){out.push([x+m*Math.sin(rumbo*R),y+m*Math.cos(rumbo*R)])}
  x+=largo*Math.sin(rumbo*R);y+=largo*Math.cos(rumbo*R);
 }
 return out;
}
const rumboXY=(a,b)=>((Math.atan2(b[0]-a[0],b[1]-a[1])/R)+360)%360;
const aLosM=(lista,m)=>{let acc=0;for(let k=1;k<lista.length;k++){const d=Math.hypot(lista[k][0]-lista[k-1][0],lista[k][1]-lista[k-1][1]);if(acc+d>=m){const t=(m-acc)/d;return [lista[k-1][0]+t*(lista[k][0]-lista[k-1][0]),lista[k-1][1]+t*(lista[k][1]-lista[k-1][1])]}acc+=d}return lista[lista.length-1]};
// Un cruce en el origen con sus ramas: {tramos, calle, clase}. Devuelve el
// cruce como lo da descifraZona: [lat,lon,grupos] con .lejos y .clases.
function cruce(ramas){
 const calles=[...new Set(ramas.map(r=>r.calle))];
 const grupos=calles.map(()=>[]),lejos=[],clases=[];
 const geo=ramas.map(r=>{const l=[[0,0],...pierna([0,0],r.tramos)];return {r,l,rumbo:rumboXY(l[0],l[1]),lej:aLosM(l,25)}});
 for(const cl of calles)for(const g of geo)if(g.r.calle===cl){grupos[calles.indexOf(cl)].push(g.rumbo)}
 for(const cl of calles)for(const g of geo)if(g.r.calle===cl){lejos.push(P(...g.lej));clases.push(g.r.clase??1)}
 const c=[O[0],O[1],grupos];c.lejos=lejos;c.clases=clases;return c;
}
// La ruta: llega por la rama «entra» (recorrida hacia el cruce) y sale por «sale».
function ruta(entra,sale,paso=5){
 const ida=[[0,0],...pierna([0,0],entra.tramos,paso)].reverse();
 const vuelta=pierna([0,0],sale.tramos,paso);
 return [...ida,...vuelta].map(q=>P(...q));
}
const enCruce=j=>j.filter(x=>x.cruce!==false);
const dice=j=>j.map(x=>(x.cruce===false?'curva ':x.mantente?'recto por ':'gira ')+x.direction);
// Lo que protegen los casos 1, 2 y 11 es el LADO: con 35 grados frente a una
// calle recta vale «gira» o «recto por», pero nunca el lado contrario.
const lados=j=>j.map(x=>x.direction);

// Las piernas tipicas. «sur» llega desde el sur (la recorres hacia el norte).
const sur={tramos:[[180,150]],calle:'A'};

test('1. Sale 35 a la izquierda y a los 25 m revuelve a la derecha, de frente otra calle: «izquierda»',()=>{
 const mia={tramos:[[325,25],[100,125]],calle:'A'},frente={tramos:[[0,150]],calle:'B'};
 const j=detector()(ruta(sur,mia),[cruce([sur,mia,frente])]);
 assert.deepEqual(lados(enCruce(j)),['izquierda'],dice(j).join(' | '));
});
test('2. El espejo: sale 35 a la derecha y a los 25 m revuelve a la izquierda: «derecha»',()=>{
 const mia={tramos:[[35,25],[260,125]],calle:'A'},frente={tramos:[[0,150]],calle:'B'};
 const j=detector()(ruta(sur,mia),[cruce([sur,mia,frente])]);
 assert.deepEqual(lados(enCruce(j)),['derecha'],dice(j).join(' | '));
});
test('3. Horquilla en Y de dos calles, 15 a cada lado: «recto por la izquierda» o «por la derecha» segun la que cojas',()=>{
 const izq={tramos:[[345,150]],calle:'B'},der={tramos:[[15,150]],calle:'C'};
 const d=detector();
 assert.deepEqual(dice(enCruce(d(ruta(sur,izq),[cruce([sur,izq,der])]))),['recto por izquierda']);
 assert.deepEqual(dice(enCruce(d(ruta(sur,der),[cruce([sur,izq,der])]))),['recto por derecha']);
});
test('4. Tu carretera revuelve 140 a la derecha y de frente sigue otra: «derecha», nunca «izquierda»',()=>{
 const mia={tramos:[[140,150]],calle:'A'},frente={tramos:[[0,150]],calle:'B'};
 const j=detector()(ruta(sur,mia),[cruce([sur,mia,frente])]);
 const c=enCruce(j).concat(j.filter(x=>x.cruce===false));
 assert(c.length>=1&&c.every(x=>x.direction==='derecha'||x.hacia==='derecha'),dice(j).join(' | '));
});
test('5. Lo mismo a la izquierda (220): «izquierda»',()=>{
 const mia={tramos:[[220,150]],calle:'A'},frente={tramos:[[0,150]],calle:'B'};
 const j=detector()(ruta(sur,mia),[cruce([sur,mia,frente])]);
 assert(j.length>=1&&j.every(x=>x.direction==='izquierda'||x.hacia==='izquierda'),dice(j).join(' | '));
});
test('6. Cruce en T: dejas la carretera y giras 90 a la izquierda: «gira izquierda»',()=>{
 const main={tramos:[[0,150]],calle:'A'},mia={tramos:[[270,150]],calle:'B'};
 const j=detector()(ruta(sur,mia),[cruce([sur,main,mia])]);
 assert.deepEqual(dice(enCruce(j)),['gira izquierda'],dice(j).join(' | '));
});
test('7. Cruce de cuatro y sigues recto por tu calle: nada',()=>{
 const recta={tramos:[[0,150]],calle:'A'},e={tramos:[[90,150]],calle:'B'},o={tramos:[[270,150]],calle:'B'};
 const j=detector()(ruta(sur,recta),[cruce([sur,recta,e,o])]);
 assert.deepEqual(dice(j),[],dice(j).join(' | '));
});
test('8. Curva de 60 en tu carretera con una ENTRADA SIN SALIDA de frente: nada (el fronton)',()=>{
 const mia={tramos:[[60,150]],calle:'A'},entrada={tramos:[[0,60]],calle:'B',clase:3};
 const j=detector()(ruta(sur,mia),[cruce([sur,mia,entrada])]);
 assert.deepEqual(dice(j),[],dice(j).join(' | '));
});
test('9. La misma curva con una CALLE de verdad de frente: «gira derecha» (recyde 4,49)',()=>{
 const mia={tramos:[[60,150]],calle:'A'},calle={tramos:[[0,150]],calle:'B'};
 const j=detector()(ruta(sur,mia),[cruce([sur,mia,calle])]);
 assert.deepEqual(dice(enCruce(j)),['gira derecha'],dice(j).join(' | '));
});
test('10. Llegas ya torciendo a la izquierda y en el cruce sales a la DERECHA: «derecha» (Areitio)',()=>{
 // La llegada curva: viene del suroeste y entra al cruce yendo al norte.
 const llegaCurva={tramos:[[180,40],[225,110]],calle:'A'};
 const mia={tramos:[[60,150]],calle:'B'},sigue={tramos:[[350,150]],calle:'A'};
 const j=detector()(ruta(llegaCurva,mia),[cruce([llegaCurva,mia,sigue])]);
 assert.deepEqual(enCruce(j).map(x=>x.direction),['derecha'],dice(j).join(' | '));
});
test('11. Con puntos muy separados (cada 30 m), una salida a la izquierda que el trazado recoge: «izquierda»',()=>{
 const mia={tramos:[[325,40],[60,110]],calle:'A'},frente={tramos:[[0,150]],calle:'B'};
 const j=detector()(ruta(sur,mia,30),[cruce([sur,mia,frente])]);
 assert.deepEqual(lados(enCruce(j)),['izquierda'],dice(j).join(' | '));
});
test('12. El aviso queda en el cruce, no antes, en los casos 1, 6 y 9',()=>{
 for(const [mia,otra] of [[{tramos:[[325,30],[60,120]],calle:'A'},{tramos:[[0,150]],calle:'B'}],
                          [{tramos:[[270,150]],calle:'B'},{tramos:[[0,150]],calle:'A'}],
                          [{tramos:[[60,150]],calle:'A'},{tramos:[[0,150]],calle:'B'}]]){
  const j=enCruce(detector()(ruta(sur,mia),[cruce([sur,mia,otra])]));
  assert.equal(j.length,1);
  assert(meters(j[0].point,O)<3,'a '+meters(j[0].point,O).toFixed(1)+' m del cruce');
 }
});
test('13. Dos cruces de verdad a 40 m, los dos a la izquierda: dos avisos',()=>{
 // Del sur al cruce 1 (0,0), giras al oeste; a 40 m, cruce 2, giras al sur.
 const pts=[...pierna([0,0],[[180,150]]).reverse(),[0,0],...pierna([0,0],[[270,40],[180,150]])].map(q=>P(...q));
 const c1=cruce([sur,{tramos:[[270,150]],calle:'B'},{tramos:[[0,150]],calle:'A'}]);
 const O2=P(-40,0),c2=[O2[0],O2[1],[[90,270],[180],[0]]];
 c2.lejos=[P(-15,0),P(-65,0),P(-40,-25),P(-40,25)];c2.clases=[1,1,1,1];
 const j=enCruce(detector()(pts,[c1,c2]));
 assert.deepEqual(j.map(x=>x.direction),['izquierda','izquierda'],dice(j).join(' | '));
});
test('14. Dos caminos casi juntos hacia el mismo lado (el tuyo 30 a la izquierda, otra calle 10): «recto por la izquierda», no «gira»',()=>{
 const mia={tramos:[[330,150]],calle:'A'},otra={tramos:[[350,150]],calle:'B'};
 const j=detector()(ruta(sur,mia),[cruce([sur,mia,otra])]);
 assert.deepEqual(dice(enCruce(j)),['recto por izquierda'],dice(j).join(' | '));
});
test('15. Y si coges la de 10 (la de la derecha de las dos): «recto por la derecha»',()=>{
 const mia={tramos:[[350,150]],calle:'B'},otra={tramos:[[330,150]],calle:'A'};
 const j=detector()(ruta(sur,mia),[cruce([sur,mia,otra])]);
 assert.deepEqual(dice(enCruce(j)),['recto por derecha'],dice(j).join(' | '));
});
test('17. Cambiando de calle: dejas la carretera por una que sale 40 a la izquierda y revuelve a la derecha: «izquierda»',()=>{
 const main={tramos:[[0,150]],calle:'A'},mia={tramos:[[320,25],[80,125]],calle:'B'};
 const j=detector()(ruta(sur,mia),[cruce([sur,main,mia])]);
 assert.deepEqual(lados(enCruce(j)),['izquierda'],dice(j).join(' | '));
});
test('18. Salida a la derecha con la llegada en curva y puntos cada 20 m: «derecha»',()=>{
 const llegaCurva={tramos:[[180,40],[225,110]],calle:'A'};
 const mia={tramos:[[70,150]],calle:'B'},sigue={tramos:[[350,150]],calle:'A'};
 const j=detector()(ruta(llegaCurva,mia,20),[cruce([llegaCurva,mia,sigue])]);
 assert.deepEqual(lados(enCruce(j)),['derecha'],dice(j).join(' | '));
});
test('20. Doble carril: las dos calzadas se separan a 16 y la otra es de sentido prohibido: nada',()=>{
 const mia={tramos:[[8,150]],calle:'A'},contraria={tramos:[[352,150]],calle:'A',prohibida:true};
 const c=cruce([sur,mia,contraria]);c.prohibidas=[false,false,true];
 const j=detector()(ruta(sur,mia),[c]);
 assert.deepEqual(dice(j),[],dice(j).join(' | '));
});
test('21. Dejas la carretera por una entrada que sale 40 a la izquierda (la carretera sigue recta): «gira izquierda», no «recto por»',()=>{
 const main={tramos:[[0,150]],calle:'A'},entrada={tramos:[[320,150]],calle:'B'};
 const j=detector()(ruta(sur,entrada),[cruce([sur,main,entrada])]);
 assert.deepEqual(dice(enCruce(j)),['gira izquierda'],dice(j).join(' | '));
});
test('22. Horquilla de tu misma via en la que lo recto es la OTRA: «por la izquierda» sin «recto»',()=>{
 const mia={tramos:[[340,150]],calle:'A'},otra={tramos:[[5,150]],calle:'B'};
 const j=enCruce(detector()(ruta(sur,mia),[cruce([sur,mia,otra])]));
 assert.equal(j.length,1,dice(j).join(' | '));
 assert(j[0].mantente&&j[0].noRecto&&j[0].direction==='izquierda',JSON.stringify(j[0]));
});

test('Un enlace de la calzada de al lado no anuncia un giro en la recta',()=>{
 const lateral=[...P(17,0),[[210,174],[330]]];
 lateral.lejos=[P(5,-22),P(20,-25),P(5,22)];
 lateral.clases=[1,1,1];lateral.prohibidas=[false,true,false];
 const recta={tramos:[[0,150]],calle:'A'};
 assert.deepEqual(dice(detector()(ruta(sur,recta),[lateral])),[]);
});

test('Una entrada sin salida no genera un aviso ambiguo si el track continúa por la pista',()=>{
 const pista={tramos:[[25,150]],calle:'B'};
 const entrada={tramos:[[0,60]],calle:'C',clase:3};
 const mapa=cruce([sur,pista,entrada]);
 assert.deepEqual(dice(enCruce(detector()(ruta(sur,pista),[mapa]))),[]);
 assert.deepEqual(dice(enCruce(detector()(ruta(sur,entrada),[mapa]))),['recto por izquierda']);
});

test('Una carretera que continúa entre enlaces de sentido único se mantiene en silencio en ambos sentidos',()=>{
 const centro=[...O,[[42,240],[90,270],[120,324]]];
 centro.lejos=[P(23,7),P(-5,-22),P(25,0),P(-24,1),P(15,-19),P(-23,7)];
 centro.clases=[1,1,1,1,1,1];
 centro.prohibidas=[true,false,false,true,true,false];
 const carretera=[P(-90,10),P(-67,8),P(-41,6),P(-24,7),P(-12,6),P(-7,5),
  P(-3,3),O,P(4,0),P(14,0),P(32,1),P(48,4),P(70,9),P(95,15)];
 const calcular=detector();
 assert.deepEqual(dice(calcular(carretera,[centro])),[]);
 assert.deepEqual(dice(calcular(carretera.slice().reverse(),[centro])),[]);
 const ramal=[...carretera.slice(0,8),P(-1,-5),P(-3,-15),P(-6,-25),P(-10,-40),P(-16,-65)];
 assert.deepEqual(lados(enCruce(calcular(ramal,[centro]))),['derecha']);
});

// CUATRO AVISOS EN NOVENTA METROS NO SON CUATRO AVISOS (23 nov 2026). En el
// enlace de Osma, bajando a Miravalles, cada nodo de OSM soltaba el suyo y
// salian cuatro «gira a la izquierda» seguidos. El autor: «ese aviso se ha
// amontonado cuatro, cinco veces». Se queda uno: el del giro mas grande.
test('los avisos pegados del mismo lado se juntan en uno',()=>{
 const {pieza}=require('./pieza.cjs');
 const c=pieza('08-cruces.js',{R:Math.PI/180,notice(){},$:()=>null});
 const j=(along,direction,angle,mas={})=>Object.assign({along,direction,angle,cruce:true},mas);
 // El caso del autor: 59, 113, 38 y 84 grados en 90 m.
 const osma=c.juntaAvisosPegados([j(4750,'izquierda',59),j(4790,'izquierda',113),
   j(4790,'izquierda',38),j(4840,'izquierda',84)]);
 assert.equal(osma.length,1,'queda uno solo: '+JSON.stringify(osma.map(x=>x.angle)));
 assert.equal(osma[0].angle,113,'y es el giro mas grande');
 assert.equal(osma[0].along,4790);
 // Dos lados distintos pegados son dos decisiones: no se tocan.
 assert.equal(c.juntaAvisosPegados([j(100,'izquierda',40),j(130,'derecha',40)]).length,2);
 // Separados de verdad, tampoco.
 assert.equal(c.juntaAvisosPegados([j(100,'izquierda',40),j(165,'izquierda',40)]).length,2);
 // Una rotonda no se come a nadie ni se la comen: lleva el numero de salida.
 assert.equal(c.juntaAvisosPegados([j(100,'derecha',40),j(120,'derecha',165,{rotonda:true,salida:3})]).length,2);
 assert.equal(c.juntaAvisosPegados([j(100,'derecha',165,{rotonda:true,salida:3}),j(120,'derecha',40)]).length,2);
 // Y dos herraduras de MANO CONTRARIA no se juntan, aunque por dentro las dos
 // sean «vuelta»: se mira el lado que se oye.
 const herraduras=c.juntaAvisosPegados([j(100,'vuelta',170,{hacia:'izquierda'}),j(150,'vuelta',160,{hacia:'derecha'})]);
 assert.equal(herraduras.length,2,'una herradura a la izquierda no se come otra a la derecha');
});
test('dos avisos en el mismo metro son uno: se queda el giro más grande',()=>{
 // Medido en las 75 rutas publicadas: 24 parejas de avisos a menos de 5 m,
 // y algunas contradiciéndose -«curva derecha 153°» y «curva izquierda 179°»
 // en el mismo metro de baldaburuakarregi-. Ni andando caben dos frases en
 // cinco metros: a 4,5 km/h son cuatro segundos y una frase tarda tres.
 const {juntaAvisosDelMismoSitio}=pieza('08-cruces.js');
 const j=(along,direction,angle,extra)=>({along,direction,angle,hacia:direction,...extra});
 // La pareja contradictoria: se queda la de 179°.
 const a=juntaAvisosDelMismoSitio([j(100,'derecha',153),j(100.4,'izquierda',179)]);
 assert.equal(a.length,1);
 assert.equal(a[0].angle,179);
 // Del mismo lado, también: 63 y 119 son el mismo cruce.
 const b=juntaAvisosDelMismoSitio([j(100,'izquierda',63),j(101,'izquierda',119)]);
 assert.equal(b.length,1);assert.equal(b[0].angle,119);
 // A 40 m son dos decisiones y se dicen las dos (caso 13).
 const c=juntaAvisosDelMismoSitio([j(100,'izquierda',63),j(140,'izquierda',119)]);
 assert.equal(c.length,2);
 // Justo en el límite: 5 m ya no se juntan, 4,9 sí.
 assert.equal(juntaAvisosDelMismoSitio([j(100,'izquierda',63),j(105,'izquierda',119)]).length,2);
 assert.equal(juntaAvisosDelMismoSitio([j(100,'izquierda',63),j(104.9,'izquierda',119)]).length,1);
 // Una rotonda no se junta nunca: lleva su número de salida.
 const d=juntaAvisosDelMismoSitio([j(100,'derecha',40,{rotonda:true,salida:2}),j(101,'derecha',90)]);
 assert.equal(d.length,2,'la rotonda se queda aparte');
 // Y una cadena de tres pegados se queda en uno.
 const e=juntaAvisosDelMismoSitio([j(100,'derecha',40),j(102,'izquierda',150),j(104,'derecha',60)]);
 assert.equal(e.length,1);assert.equal(e[0].angle,150);
 // Listas cortas o vacías, tal cual.
 assert.equal(juntaAvisosDelMismoSitio([]).length,0);
 assert.equal(juntaAvisosDelMismoSitio([j(1,'derecha',10)]).length,1);
});
