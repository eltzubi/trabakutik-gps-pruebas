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
