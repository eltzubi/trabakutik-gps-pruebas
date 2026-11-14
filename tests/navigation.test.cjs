const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../nuevo.html'),'utf8');
function source(start,end){
 const a=html.indexOf(start),b=html.indexOf(end,a);
 assert(a>=0&&b>a,`No se encontró ${start}`);
 return html.slice(a,b);
}
const point=(x,y)=>[43.2+y/111195,-2.5+x/(111195*Math.cos(43.2*Math.PI/180))];
// Punto a `largo` metros del origen en la direccion `deg` (0 = hacia el este,
// positivo = hacia la izquierda de quien viene del oeste).
const tramo=(deg,largo)=>point(largo*Math.cos(deg*Math.PI/180),largo*Math.sin(deg*Math.PI/180));
function meters(a,b){
 const r=Math.PI/180,q=Math.sin((b[0]-a[0])*r/2)**2+Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin((b[1]-a[1])*r/2)**2;
 return 12742000*Math.asin(Math.min(1,Math.sqrt(q)));
}
function detector(){
 const calls=[],c={R:Math.PI/180,dist:meters,routePoints:[],crucesOsm:[],junctions:[],junctionWarned:new Set(),junctionZoomOnce:new Set(),routeCumulative:[],resetJunctionView(){},enviaGirosNativos(){calls.push(c.junctions.map(j=>({...j})))},window:{TrabakutikAndroid:{setJunctions(){calls.push([])}}}};
 vm.createContext(c);
 vm.runInContext(source('function compactRoutePoints(','function loadSaved(item){'),c);
 // decideCruce vive fuera de computeJunctions para poder probarla sola, y
 // necesita bearingBetween: se cargan las tres del fichero de verdad, que
 // una copia en el test no prueba nada.
 vm.runInContext(source('function bearingBetween(a,b){','// EL RUMBO DE LA FLECHA'),c);
 vm.runInContext(source('const CRUCE_RECTO=25;','function computeJunctions(){'),c);
 vm.runInContext(source('function computeJunctions(){','// Punto de avance sobre la ruta'),c);
 c.detect=(points,cruces=[])=>{c.routePoints=c.compactRoutePoints(points);c.crucesOsm=cruces;c.computeJunctions();return c.junctions};
 return c;
}
function corner(deg){
 const points=[];for(let x=-50;x<=0;x+=5)points.push(point(x,0));
 for(let d=5;d<=50;d+=5)points.push(tramo(deg,d));
 return points;
}
// LOS UMBRALES JUSTOS NO VALEN PARA MEDIR. Sin cruce se avisa desde 130°, en un
// cruce desde 45°, y se dice «vuelta» por encima de 145°; pero con esta
// geometria corner(130) mide 129,999999999 y corner(45) mide 44,999999999, asi
// que el umbral exacto cae del lado que NO avisa. Por eso aqui no se usa nunca
// el valor del umbral: hasta 125 no avisa y desde 135 si; en un cruce, 40 no y
// 50 si; «vuelta» se mide con 170, no con 160.
// Y «vuelta» empieza en 160, el mismo numero con el que se detectan las
// horquillas: un cruce de 147 grados es un giro cerrado, no un «da la
// vuelta». Lo vio el autor en el monte con uno de 147.
test('La copia simplificada de tres puntos conserva los giros cerrados en ambos sentidos',()=>{
 for(const [angle,direction] of [[140,'izquierda'],[-140,'derecha']]){
  const c=detector(),turns=c.detect(corner(angle));
  assert.equal(c.routePoints.length,3);assert.equal(turns.length,1);
  assert.equal(turns[0].direction,direction);assert.equal(turns[0].cruce,false);
  assert(Math.abs(turns[0].angle-140)<=1);
 }
});
test('Sin OSM: solo avisa curvas cerradas, no las esquinas corrientes',()=>{
 // Lo pidio asi el autor: «en realidad solo queria que me indicaran los
 // cruces, no las curvas». Una esquina de 90° sin cruce conocido NO avisa.
 for(const angle of [0,15,30,45,60,75,90,110,125])assert.equal(detector().detect(corner(angle)).length,0,`${angle} grados`);
 for(const angle of [135,140,150,170,180]){
  const turns=detector().detect(corner(angle));assert.equal(turns.length,1,`${angle} grados`);
  assert.equal(turns[0].direction,angle>=160?'vuelta':'izquierda',`${angle} grados`);
 }
});
test('En un cruce identificado anuncia un cambio de camino y lo distingue de una curva',()=>{
 const turns=detector().detect(corner(60),[point(0,0)]);
 assert.equal(turns.length,1);assert.equal(turns[0].cruce,true);
 // En un cruce conocido basta con 45°, que es lo que distingue un cambio de
 // camino de una curva: 50 avisa, 40 y 20 se callan.
 assert.equal(detector().detect(corner(50),[point(0,0)]).length,1);
 assert.equal(detector().detect(corner(40),[point(0,0)]).length,0);
 assert.equal(detector().detect(corner(20),[point(0,0)]).length,0);
 // El cruce cuenta si esta a menos de 25 m del giro, no solo justo encima:
 // el nodo de OSM casi nunca cae en el mismo punto que el vertice del GPX.
 assert.equal(detector().detect(corner(60),[point(0,20)])[0].cruce,true);
 assert.equal(detector().detect(corner(60),[point(0,30)]).length,0);
});
test('Detecta giros cerrados cerca de los extremos de la ruta',()=>{
 // Con menos de 12 m a un lado se mide sobre lo que hay; el giro no se pierde.
 const cercaInicio=[point(-7,0),point(0,0),tramo(140,45)];
 const cercaFinal=[point(-45,0),point(0,0),tramo(140,7)];
 for(const points of [cercaInicio,cercaFinal]){
  const turns=detector().detect(points);
  assert.equal(turns.length,1);
  assert.equal(turns[0].direction,'izquierda');
 }
});
test('No crea giro por un quiebro inferior a seis metros al inicio',()=>{
 // El giro es el mismo que avisa en la prueba anterior: lo unico que lo calla
 // es el margen de 6 m. El segundo caso lo demuestra -con 7 m si avisa-, para
 // que esta prueba no pase por el angulo en vez de por la guarda.
 assert.equal(detector().detect([point(-4,0),point(0,0),tramo(140,50)]).length,0);
 assert.equal(detector().detect([point(-7,0),point(0,0),tramo(140,50)]).length,1);
});
test('Una curva amplia no avisa, por cerrada que acabe siendo',()=>{
 // Media vuelta de radio 100 m: en los 12 m que se miden apenas se dobla, y en
 // 40 m dobla 23 grados, asi que tampoco cuenta como horquilla. Lo mismo hasta
 // radios muy justos: un arco de 15 m de radio sigue callado.
 for(const radio of [100,60,40,25,15]){
  const amplia=[];
  for(let deg=-90;deg<=90;deg+=2)amplia.push(tramo(deg,radio));
  assert.equal(detector().detect(amplia).length,0,`radio ${radio} m`);
 }
});
// LAS HORQUILLAS: LAS REVUELTAS EN ZETA DE UNA PISTA QUE SUBE. Lo pidio el
// autor el 9 de noviembre con los numeros delante: antes, de las 552 que hay
// en sus rutas, 334 avisaban y 218 se callaban, y la diferencia era la suerte
// de tener o no un cruce de OSM encima. Se avisa cuando el rumbo con el que
// llegas y el rumbo con el que sales son opuestos -160 grados- en 40 m de
// camino. Suena «curva de herradura», que es lo que ya decia el servicio.
// Recta larga hacia el este, U de `ancho` metros, y vuelta hacia el oeste.
// `salida` es el rumbo del ramal de vuelta: 180 es justo al reves.
function horquilla(ancho,salida=180){
 const points=[],G=Math.PI/180;
 for(let x=-150;x<=0;x+=10)points.push(point(x,0));
 for(let a=-90;a<=90;a+=15)points.push(point((ancho/2)*Math.cos(a*G),ancho/2+(ancho/2)*Math.sin(a*G)));
 for(let d=10;d<=150;d+=10)points.push(point(d*Math.cos(salida*G),ancho+d*Math.sin(salida*G)));
 return points;
}
// Una pista que sube en zeta: `n` revueltas con ramales de `largo` metros
// separados `ancho`. Es la forma de verdad del monte, no una U suelta.
function zeta(n,largo,ancho){
 const points=[],G=Math.PI/180;
 let y=0,hacia=1;
 for(let k=0;k<n;k++){
  const x0=hacia>0?-largo:0,x1=hacia>0?0:-largo;
  for(let x=x0;hacia>0?x<=x1:x>=x1;x+=hacia*10)points.push(point(x,y));
  const r=ancho/2;
  for(let a=-90;a<=90;a+=15)points.push(point(x1+hacia*r*Math.cos(a*G),y+r+r*Math.sin(a*G)));
  y+=ancho;hacia=-hacia;
 }
 for(let d=0;d<=largo;d+=10)points.push(point(hacia>0?-largo+d:-d,y));
 return points;
}
test('Una horquilla de pista avisa como curva de herradura',()=>{
 for(const ancho of [6,10,16,24]){
  const turns=detector().detect(horquilla(ancho));
  assert.equal(turns.length,1,`U de ${ancho} m`);
  assert.equal(turns[0].direction,'vuelta',`U de ${ancho} m`);
  assert.equal(turns[0].cruce,false,`U de ${ancho} m`);
 }
 // Una U de 40 m de ancho ya no se dobla dentro de los 40 m de la ventana: es
 // un lazo grande, no una horquilla, y se queda callada.
 assert.equal(detector().detect(horquilla(40)).length,0);
 // Un lazo cerradisimo tambien cuenta.
 const lazo=[];
 for(let deg=0;deg<360;deg+=10)lazo.push(tramo(deg,8));
 assert.equal(detector().detect(lazo).length,1);
 // El umbral son 160 grados: con el ramal de vuelta a 162 avisa y a 158 no.
 // Sin estas dos lineas, subir el umbral a 179 no se notaria: todas las
 // horquillas de arriba doblan justo 180.
 assert.equal(detector().detect(horquilla(10,162)).length,1,'162 grados');
 assert.equal(detector().detect(horquilla(10,158)).length,0,'158 grados');
});
test('Quedarse sin satélites se dice en alto, una vez, y la vuelta también',()=>{
 // El autor corto los satelites a proposito y la aplicacion no dijo nada:
 // solo cambiaba el texto de la barra de abajo, que con el movil en el
 // bolsillo no se lee. Esta es la parte de la pagina; el servicio tiene la
 // suya en tests/sin_senal_gps.py, que es la que suena con la pantalla
 // apagada.
 const dicho=[];let tonos=0;
 const c={navegaNativo:false,getAudio(){},pitidos(n){tonos+=n},hablar(s){dicho.push(s)}};
 vm.createContext(c);
 vm.runInContext(source('let sinGpsAvisado=false;','function conmutaModoAudio('),c);
 c.avisaSinGps(false);
 assert.deepEqual(dicho,['Atención, sin señal GPS']);
 assert(tonos>0,'y suena, para cuando los avisos van en solo pitidos');
 c.avisaSinGps(false);c.avisaSinGps(false);
 assert.equal(dicho.length,1,'no se repite cada cinco segundos');
 c.vuelveElGps();
 assert.deepEqual(dicho,['Atención, sin señal GPS','Señal GPS recuperada']);
 c.vuelveElGps();
 assert.equal(dicho.length,2,'la vuelta tampoco se repite');
 // La ubicacion apagada se dice con sus palabras: no es lo mismo que no ver
 // satelites, porque esto lo arregla el con un boton.
 const otro={navegaNativo:false,getAudio(){},pitidos(){},hablar(s){dicho.push(s)}};
 vm.createContext(otro);
 vm.runInContext(source('let sinGpsAvisado=false;','function conmutaModoAudio('),otro);
 otro.avisaSinGps(true);
 assert.match(dicho[2],/ubicación del teléfono está apagada/);
 // Si navega el servicio, los pitidos los pone el: la pagina no los duplica.
 const nativo={navegaNativo:true,getAudio(){throw Error('no debe tocar el audio')},
   pitidos(){throw Error('no debe pitar')},hablar(){}};
 vm.createContext(nativo);
 vm.runInContext(source('let sinGpsAvisado=false;','function conmutaModoAudio('),nativo);
 nativo.avisaSinGps(false);
 // Y el vigilante tiene que llamarlo: sin esto la funcion estaria ahi sin que
 // nadie la use, que es justo lo que pasaba antes.
 const vigilante=source('const GUIA_CADUCA_MS=','function syncNativeRoute()');
 assert.equal((vigilante.match(/avisaSinGps\(/g)||[]).length,3,
   'el vigilante avisa en los tres casos sin posición: apagada, error y caducada');
 assert.match(source('function onFix(pos){','function miraPosicionNativa('),/vuelveElGps\(\)/,
   'y al llegar una posición se dice que ha vuelto');
});
test('Poner silencio calla en el acto: la frase y los pitidos ya lanzados',()=>{
 // Antes el modo se miraba solo al EMPEZAR a hablar o a pitar. Ponias
 // silencio y la frase en curso terminaba de decirse y los pitidos de esa
 // tanda seguian saliendo uno detras de otro.
 const parados=[];let cancelada=0,dicho=0;
 // OJO: cada pitido ya nace con su parada programada -stop(cuando)-. Lo que
 // cuenta aqui es el stop() SIN hora, que es «para ya mismo».
 const osc=()=>({frequency:{},connect(){},start(){},
   stop(cuando){if(cuando===undefined)parados.push(1)},onended:null});
 const c={gpsApagadoPorTi:false,audioModo:'voz',navegaNativo:false,
   audio:{currentTime:0,createOscillator:osc,
     createGain:()=>({gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}}),
     destination:{}},
   window:{speechSynthesis:{cancel(){cancelada++}}},
   localStorage:{setItem(){}},notice(){},pintaModoAudio(){},avisaModoAudioNativo(){},
   hablar(){dicho++}};
 c.window.window=c.window;
 vm.createContext(c);
 // conmutaModoAudio esta ANTES que los pitidos en el fichero, asi que son
 // dos trozos distintos y en este orden.
 vm.runInContext(source('function conmutaModoAudio(){','function getAudio('),c);
 vm.runInContext(source('let pitidosEnCurso=[];','function closestMeters('),c);

 // Suenan tres pitidos y, con «voz», se habla.
 c.pitidos(3,.3);
 assert.equal(vm.runInContext('pitidosEnCurso.length',c),3);

 // De «voz» a «pitidos»: se corta la voz, los pitidos siguen su camino.
 c.conmutaModoAudio();
 assert.equal(c.audioModo,'pitidos');
 assert.equal(cancelada,1,'la frase en curso se corta');
 assert.equal(parados.length,0,'pero los pitidos no, que ese modo los quiere');

 // De «pitidos» a «silencio»: se corta todo, incluidos los ya lanzados.
 c.conmutaModoAudio();
 assert.equal(c.audioModo,'silencio');
 assert.equal(parados.length,3,'los tres pitidos pendientes se paran');
 assert.equal(vm.runInContext('pitidosEnCurso.length',c),0);

 // Y en silencio ya no se programa ninguno nuevo.
 c.pitidos(2,.3);
 assert.equal(vm.runInContext('pitidosEnCurso.length',c),0);

 // De vuelta a «voz» se avisa hablando, que para eso se ha encendido.
 c.conmutaModoAudio();
 assert.equal(c.audioModo,'voz');
 assert.equal(dicho,1);
});
// Reflejada norte-sur: lo que giraba a la izquierda gira a la derecha.
const espejo=pts=>pts.map(([la,lo])=>[2*43.2-la,lo]);
test('La herradura guarda el lado y la flecha se dibuja hacia ese lado',()=>{
 // Lo vio el autor en una herradura de 173 grados: la curva iba a la
 // izquierda y la flecha se dibujaba girando a la derecha. Pasados los 145
 // grados el giro se quedaba en «vuelta» y el lado se perdia por el camino.
 const izq=detector().detect(horquilla(10));
 assert.equal(izq.length,1);
 assert.equal(izq[0].direction,'vuelta');
 assert.equal(izq[0].hacia,'izquierda');
 const der=detector().detect(espejo(horquilla(10)));
 assert.equal(der.length,1);
 assert.equal(der[0].direction,'vuelta');
 assert.equal(der[0].hacia,'derecha');
 // En un giro normal las dos palabras dicen lo mismo.
 for(const [angle,lado] of [[140,'izquierda'],[-140,'derecha']]){
  const g=detector().detect(corner(angle))[0];
  assert.equal(g.direction,lado);assert.equal(g.hacia,lado);
 }
 // Y lo que llega al dibujo es ese lado, no «derecha» por defecto.
 const c={};vm.createContext(c);
 vm.runInContext(source('function ladoFlecha(turn,alReves){','// Velocidad suavizada'),c);
 vm.runInContext(source('function flechaGiro(','// Velocidad suavizada'),c);
 assert.equal(c.ladoFlecha(izq[0],false),'izquierda');
 assert.equal(c.ladoFlecha(der[0],false),'derecha');
 // Al reves por la ruta, el lado se cambia, tambien en la herradura.
 assert.equal(c.ladoFlecha(izq[0],true),'derecha');
 assert.equal(c.ladoFlecha(der[0],true),'izquierda');
 // Un giro guardado por una version vieja no trae «hacia»: no se rompe.
 assert.equal(c.ladoFlecha({direction:'izquierda'},false),'izquierda');
 assert.equal(c.ladoFlecha({direction:'vuelta'},false),'derecha');
 // Y las dos flechas son una el espejo de la otra, no la misma.
 const a=c.flechaGiro(173,-1,62,11),b=c.flechaGiro(173,1,62,11);
 assert.notEqual(a,b,'la flecha de la izquierda no puede ser la de la derecha');
 assert.match(a,/A17 17 0 0 0 /,'a la izquierda el arco va en un sentido');
 assert.match(b,/A17 17 0 0 1 /,'y a la derecha en el otro');
 // Y que la ficha de giro use ese lado y no «lado», que es el del TEXTO y
 // vale «vuelta» en las herraduras: ahi estaba el fallo. Se mira en el
 // fuente porque pintar la ficha necesita el mapa entero montado.
 const ficha=source("const lado=turn.direction==='vuelta'","$('turnDirection')");
 assert.match(ficha,/const sentido=ladoFlecha\(turn,alReves\)/,
   'la flecha tiene que salir de ladoFlecha, no de la palabra del texto');
});
test('Una pista en zeta da un aviso por revuelta, no varios',()=>{
 // Cuatro revueltas seguidas subiendo: cuatro avisos, uno en cada una.
 for(const ancho of [10,24,30]){
  assert.equal(detector().detect(zeta(4,60,ancho)).length,4,`ramales a ${ancho} m`);
 }
 assert.equal(detector().detect(zeta(3,80,16)).length,3);
});
test('Una S no es una horquilla: entra y sale con el mismo rumbo',()=>{
 // Dos curvas de 10 m de radio seguidas, una a cada lado. Es la forma que mas
 // se parece a una horquilla sin serlo; si se midiera el giro acumulado en vez
 // del rumbo de entrada contra el de salida, esto avisaria por las dos.
 const points=[];
 for(let x=-100;x<=0;x+=10)points.push(point(x,0));
 for(let a=-90;a<=0;a+=10)points.push(point(10*Math.cos(a*Math.PI/180),10+10*Math.sin(a*Math.PI/180)));
 for(let a=180;a>=90;a-=10)points.push(point(20+10*Math.cos(a*Math.PI/180),10+10*Math.sin(a*Math.PI/180)));
 for(let x=20;x<=120;x+=10)points.push(point(x,20));
 assert.equal(detector().detect(points).length,0);
});
test('Una desviación aislada del GPS y los puntos repetidos no crean giros falsos',()=>{
 const points=[];for(let x=-60;x<=60;x+=5)points.push(point(x,x===0?10:0));
 assert.equal(detector().detect(points).length,0);
 // Un salto del GPS de 12 m de lado, con los vecinos a 4 m, mide 143° sobre
 // 12 m, asi que pasaria de largo el umbral de curva cerrada. Lo descarta la
 // confirmacion a 20 m, que para entonces ya ha vuelto a la recta. Es el unico
 // caso medido en el que esa confirmacion decide algo: si se toca, se nota aqui.
 const salto=[point(-120,0),point(-4,0),point(0,12),point(4,0),point(120,0)];
 assert.equal(detector().detect(salto).length,0);
 const repeats=[point(-50,0),point(-50,0),point(0,0),point(0,0),tramo(140,50)];
 assert.equal(detector().detect(repeats).length,1);
});
// Zigzag: recta larga, giro cerrado a la izquierda, tramo de `separacion`
// metros y vuelta al rumbo de antes, que es otro giro cerrado a la derecha.
// El segundo vertice del zigzag, a `separacion` metros del primero.
const vertice=separacion=>[separacion*Math.cos(140*Math.PI/180),separacion*Math.sin(140*Math.PI/180)];
function zigzag(separacion){
 const points=[];
 for(let x=-120;x<0;x+=10)points.push(point(x,0));
 points.push(point(0,0));
 const q=vertice(separacion);
 points.push(point(q[0],q[1]));
 for(let d=10;d<=120;d+=10)points.push(point(q[0]+d,q[1]));
 return points;
}
test('Dos giros cerrados seguidos se avisan por separado; pegados, uno solo',()=>{
 const lejos=detector().detect(zigzag(40));
 assert.equal(lejos.length,2);
 // Comparado como texto: el array lo crea el vm y deepStrictEqual mira el prototipo.
 assert.equal(lejos.map(j=>j.direction).join(' '),'izquierda derecha');
 // A menos de 35 m no se repite: serian dos «ahora» uno encima del otro.
 assert.equal(detector().detect(zigzag(20)).length,1);
});
test('De dos avisos pegados se queda el cruce, no la curva',()=>{
 // Lo que el autor pidio que no se perdiera nunca son los CRUCES. Antes se
 // quedaba el primero que llegara: con una curva cerrada y un cruce a 30 m,
 // ganaba la curva y el cruce no se decia. Medido en sus 72 rutas, esto
 // recupera 7 avisos de cruce que se estaban perdiendo.
 const puntos=zigzag(30),q=vertice(30);
 const turns=detector().detect(puntos,[point(q[0],q[1])]);
 assert.equal(turns.length,1);
 assert.equal(turns[0].cruce,true,'el que se queda es el cruce');
 // Sin el cruce marcado, se queda la curva: el aviso no se duplica.
 const solas=detector().detect(puntos);
 assert.equal(solas.length,1);assert.equal(solas[0].cruce,false);
});
test('Rutas vacías, de dos puntos y demasiado cortas no inventan indicaciones',()=>{
 for(const points of [[],[point(0,0)],[point(0,0),point(0,50)],[point(-2,0),point(0,0),tramo(140,2)]])assert.equal(detector().detect(points).length,0);
});
test('Los índices enviados a Android corresponden a la ruta simplificada',()=>{
 const c=detector(),sent=[];c.window.TrabakutikAndroid.setJunctions=json=>sent.push(JSON.parse(json));
 vm.runInContext(source('function enviaGirosNativos(){','// EL AVISO DE UN CRUCE SALE DE LAS RAMAS'),c);
 c.detect(corner(-140));assert.equal(sent.length,1);
 assert.equal(sent[0][0].i,1);assert.equal(sent[0][0].dir,1);assert.equal(sent[0][0].t,0);
 assert(sent[0][0].i<c.routePoints.length);
 // Un giro en un cruce conocido viaja marcado con t:1; el servicio lo dice de
 // otra manera -«toma el camino de la derecha» y no «gira a la derecha»-.
 const d=detector(),cruces=[];d.window.TrabakutikAndroid.setJunctions=json=>cruces.push(JSON.parse(json));
 vm.runInContext(source('function enviaGirosNativos(){','// EL AVISO DE UN CRUCE SALE DE LAS RAMAS'),d);
 d.detect(corner(60),[point(0,0)]);
 assert.deepEqual(cruces.at(-1),[{i:1,dir:-1,t:1}]);
});
function savedFlow(){
 const c=detector(),nodes=new Map(),calls=[];
 c.$=id=>{if(!nodes.has(id)){
  const hidden=new Set(['hidden']);
  nodes.set(id,{textContent:'',disabled:false,classList:{add:k=>hidden.add(k),remove:k=>hidden.delete(k),contains:k=>hidden.has(k),toggle(k,on){if(on)hidden.add(k);else hidden.delete(k)}}});
 }return nodes.get(id)};
 Object.assign(c,{console,selectedRouteRequest:0,activeSavedId:null,drawPoints:[],drawLayer:null,createdSavedItem:null,savedFromDialog:null,chosen:-1,savedLine:null,pendingSave:null,watch:1,fuenteNativa:false,recordLayer:null,recorded:[],recording:false,guiaIniciada:()=>c.recording,stored:[],L:{polyline(){return {addTo(){return this},bringToFront(){return this},getBounds(){return []}}}},map:{removeLayer(){},fitBounds(){}},confirm:()=>true,elevationText:()=>'',savedList:()=>c.stored,putSaved:list=>(c.stored=list,true),setRouteTitle:name=>c.$('mapTitle').textContent=name,changeMode:mode=>c.mode=mode,clearDraft(){c.drawPoints=[];c.createdSavedItem=null},notice:text=>c.status=text,startGPS(...args){calls.push(['gps',args])},syncNativeRoute(){calls.push(['route',c.routePoints.length])},enciendeNavegacionNativa(){calls.push(['navigate',c.routePoints.length,c.junctions.length])}});
 c.window.TrabakutikAndroid.startRecording=()=>calls.push(['record',c.routePoints.length,c.junctions.length]);
 for(const k of ['showSaved','finishRecording','resetOffRoute','updateNativeLaunchLink','pintaBotonNavegar','pintaBotonMapa','updateDirectionArrows','aplicaCruces','recordingControls'])c[k]=()=>{};
 vm.runInContext(source('function closeSaveDialog(){','function openSaveDialog('),c);
 vm.runInContext(source('function savePendingToMine(){',"$('closeSave').onclick="),c);
 vm.runInContext(source('function loadSaved(item){','let savedLine=null;'),c);
 vm.runInContext(source('function sameTrack(a,b){','function clearDraft(){'),c);
 vm.runInContext(source("$('recordStart').onclick=",'// En un circuito te cruzas'),c);
 c.calls=calls;
 c.save=(points=corner(140))=>{c.drawPoints=points;c.pendingSave={points,name:'Mi ruta',kind:'created'};c.savePendingToMine()};
 return c;
}
test('Abrir una ruta guardada prepara puntos y giros sin iniciar GPS ni navegación',()=>{
 const c=savedFlow();c.save();assert.equal(c.stored.length,1);assert.equal(c.routePoints.length,0);
 assert.equal(c.$('navigateSavedFromDialog').classList.contains('hidden'),false);
 assert.equal(c.$('saveToMine').disabled,true);
 c.$('navigateSavedFromDialog').onclick();
 assert.equal(c.mode,'nav');assert.equal(c.routePoints.length,3);assert.equal(c.junctions.length,1);
 assert.equal(c.$('mapTitle').textContent,'Mi ruta');assert.equal(c.savedFromDialog,null);
 assert.equal(c.$('saveDialog').classList.contains('hidden'),true);
 assert.deepEqual(c.calls[0],['route',3]);assert(!c.calls.some(call=>['gps','navigate','record'].includes(call[0])));
});
test('Abrir una ruta guardada no manda al servicio los giros de la ruta anterior',()=>{
 // syncNativeRoute manda los puntos y los giros que tenga la pagina. Aqui aun
 // eran los de la ruta de antes: si los nuevos no llegaban, el servicio avisaba
 // cruces de otra ruta con la pantalla apagada.
 const c=savedFlow();c.save();
 c.junctions=[{i:7,direction:'derecha'},{i:9,direction:'izquierda'}];
 const giros=[];c.syncNativeRoute=()=>giros.push(c.junctions.length);
 c.$('navigateSavedFromDialog').onclick();
 assert.deepEqual(giros,[0],'con los puntos nuevos no viaja ningun giro viejo');
 assert.equal(c.junctions.length,1,'y despues entran los de la ruta nueva');
});
test('Guardar, cerrar, volver a Ruta y grabar activa primero la ruta recién guardada',()=>{
 const c=savedFlow();c.save();c.closeSaveDialog();c.mode='nav';c.$('recordStart').onclick();
 assert.equal(c.recording,true);assert.equal(c.routePoints.length,3);assert.equal(c.junctions.length,1);
 const navigate=c.calls.findIndex(call=>call[0]==='navigate'),record=c.calls.findIndex(call=>call[0]==='record');
 assert(navigate>=0&&record>navigate);assert.deepEqual(c.calls[navigate],['navigate',3,1]);
 assert.match(c.status,/Grabando y siguiendo · Mi ruta/);
});
test('Grabar sin una ruta conserva la grabación libre y lo dice con claridad',()=>{
 const c=savedFlow();c.$('recordStart').onclick();assert.equal(c.recording,true);assert.equal(c.routePoints.length,0);
 assert.equal(c.status,'Grabando · sin ruta activa para navegar');
});
test('Un borrador modificado después de guardar no activa silenciosamente la copia antigua',()=>{
 const c=savedFlow();c.save();c.drawPoints=corner(-140);c.$('recordStart').onclick();
 assert.equal(c.routePoints.length,0);assert.equal(c.recording,true);
});
test('Una ruta que ya estaba activa tiene prioridad al iniciar la grabación',()=>{
 const c=savedFlow();c.save();c.routePoints=c.compactRoutePoints(corner(-140));c.computeJunctions();
 c.$('mapTitle').textContent='Otra ruta';c.$('recordStart').onclick();
 assert.equal(c.junctions[0].direction,'derecha');assert.equal(c.$('mapTitle').textContent,'Otra ruta');
 assert.match(c.status,/Grabando y siguiendo · Otra ruta/);
});

function endSessionFlow(){
 const nodes=new Map(),calls=[];
 const c={console,Date,JSON,Number,Math,Set,Promise,
  $:id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',dataset:{},classList:{add(){},remove(){},toggle(){}}});return nodes.get(id)},
  window:{speechSynthesis:{cancel(){calls.push('cancel-voice')}},TrabakutikAndroid:{
   stopRecording(){calls.push('stop-record')},stopNavigation(){calls.push('stop-navigation')},clearLiveTrack(){calls.push('clear-track')},
   getPosition(){throw Error('No debe consultar el servicio después de terminar')},
   getTrackingSnapshot(){calls.push('snapshot');return JSON.stringify({recording:true})}
  }},navigator:{geolocation:{clearWatch(w){calls.push(['clear-watch',w])},watchPosition(){calls.push('watch');return 2}}},
  document:{hidden:false},audio:{close(){calls.push('close-audio');return Promise.resolve()}},
  gpsSolicitado:true,ultimoErrorGps:null,fixVisualGps:null,ubicacionVisualGps:null,errorVisualGps:null,
  watch:1,gpsApagadoPorTi:false,navegaNativo:true,giraNativo:true,junctionActive:1,
  recording:true,recordingPendingSave:false,recorded:[point(0,0),point(10,0)],recordLayer:{},
  lastBrowserRecordTime:1,lastBrowserRecordPoint:point(10,0),pausado:false,
  fuenteNativa:true,ultimoTiempoNativo:1,apagadoHasta:0,position:point(10,0),me:{},
  routePoints:corner(140),lastCourse:1,courseFix:point(0,0),ultimoFix:1,refParado:point(0,0),refParadoT:1,
  rumboSuave:82,rumboMapa:82,anguloFlecha:82,pintaBrujula:h=>calls.push(['compass',h]),aplicaGiroMapa:b=>calls.push(['map-orientation',b]),
  followGps:false,manualMapUntil:1,routeCumulative:[],ultimoAlong:null,lastNativeSync:0,lastNativeTrackVersion:'',cortesGrabacion:0,reconciliaBotonera(){},
  map:{removeLayer(){calls.push('remove-layer')}},resetJunctionView(){calls.push('reset-turn');c.junctionActive=-1},resetOffRoute(){calls.push('reset-off-route')},
  pintaBotonNavegar(){calls.push('nav-button')},recordingControls:state=>c.controls=state,
  notice:text=>c.status=text,confirmaParar:()=>true,avisoDeCortes:()=>'',
  getAudio(){},mode:'nav',syncNativeRoute(){},enciendeNavegacionNativa(){calls.push('start-navigation')}
 };
 vm.createContext(c);
 vm.runInContext(source('function estadoGpsVisual(', 'function bearingBetween('),c);
 vm.runInContext(source('function apagaGps(){',"$('discardRecording').onclick="),c);
 vm.runInContext(source('function finishRecording(){','function savePendingToMine(){'),c);
 vm.runInContext(source('function pideGasto(',"$('saveRecording').onclick="),c);
 vm.runInContext(source('window.trabakutikNativeGpxSaved=()=>{',"window.addEventListener('beforeunload'"),c);
 vm.runInContext(source('window.trabakutikSyncNative=()=>{',"document.addEventListener('visibilitychange'"),c);
 vm.runInContext(source('function miraPosicionNativa(){','setInterval(()=>{miraPosicionNativa();'),c);
 vm.runInContext(source('function onFix(pos){','// Recupera los puntos capturados'),c);
 vm.runInContext(source('function startGPS(',"if(!enLaApp)"),c);
 c.calls=calls;return c;
}
test('Parar finaliza la grabación y la navegación; conserva los puntos pendientes de guardar',()=>{
 const c=endSessionFlow(),route=c.routePoints;
 c.$('recordStop').onclick();
 assert.equal(c.recording,false);assert.equal(c.recordingPendingSave,true);assert.equal(c.recorded.length,2);
 assert.equal(c.controls,'stopped');assert.equal(c.gpsApagadoPorTi,true);
 assert.equal(c.rumboSuave,null);assert.equal(c.rumboMapa,null);assert.equal(c.anguloFlecha,null);
 assert(c.calls.some(x=>Array.isArray(x)&&x[0]==='compass'&&x[1]===null));
 assert.equal(c.watch,null);assert.equal(c.position,null);assert.equal(c.me,null);
 assert.equal(c.navegaNativo,false);assert.equal(c.giraNativo,false);assert.equal(c.audio,null);
 assert.equal(c.routePoints,route);assert(c.calls.includes('stop-record'));assert(c.calls.includes('stop-navigation'));
 assert(c.calls.includes('cancel-voice'));assert(c.calls.includes('close-audio'));
});
test('Después de terminar, los sondeos y las posiciones pendientes no reactivan los avisos',()=>{
 const c=endSessionFlow();c.$('recordStop').onclick();c.apagadoHasta=0;
 const calls=c.calls.length,status=c.status;
 c.miraPosicionNativa();c.onFix({});
 assert.equal(c.calls.length,calls);
 c.window.trabakutikSyncNative();assert.equal(c.recording,false);assert.equal(c.controls,'stopped');assert.equal(c.status,status);assert.equal(c.ultimoFix,0);
});
test('Guardar en Mis rutas o exportar limpia el track y deja el GPS y la voz apagados',()=>{
 for(const nativeExport of [false,true]){
  const c=endSessionFlow();c.recording=false;
  if(nativeExport)c.window.trabakutikNativeGpxSaved();else c.finishRecording();
  assert.equal(c.recordingPendingSave,false);assert.equal(c.recorded.length,0);assert.equal(c.recordLayer,null);
  assert.equal(c.controls,'ready');assert.equal(c.gpsApagadoPorTi,true);assert(c.calls.includes('clear-track'));
  assert(c.calls.includes('stop-navigation'));assert(c.calls.includes('cancel-voice'));
 }
});
test('Mi posición permite consultar el GPS después de guardar sin reactivar la guía',()=>{
 const c=endSessionFlow();c.recording=false;c.finishRecording();
 c.startGPS();
 assert.equal(c.gpsApagadoPorTi,false);assert.equal(c.apagadoHasta,0);assert.equal(c.watch,2);
 assert(!c.calls.includes('start-navigation'));assert(c.calls.includes('watch'));
});

test('Guardar una grabación en Mis rutas ejecuta el cierre completo y conserva la copia guardada',()=>{
 const c=endSessionFlow();c.recording=false;c.recordingPendingSave=true;
 Object.assign(c,{pendingSave:{kind:'recording',name:'Salida terminada',points:c.recorded},savedList:()=>[],putSaved:list=>(c.saved=list,true),showSaved(){},closeSaveDialog(){c.pendingSave=null}});
 vm.runInContext(source('function savePendingToMine(){',"$('navigateSavedFromDialog').onclick="),c);
 c.savePendingToMine();
 assert.equal(c.saved.length,1);assert.equal(c.saved[0].points.length,2);
 assert.equal(c.recorded.length,0);assert.equal(c.gpsApagadoPorTi,true);assert.equal(c.pendingSave,null);
 assert(c.calls.includes('stop-navigation'));assert(c.calls.includes('cancel-voice'));
});
test('Cancelar Parar y usar Pausa mantienen la navegación activa',()=>{
 const c=endSessionFlow();c.confirmaParar=()=>false;c.$('recordStop').onclick();
 assert.equal(c.recording,true);assert.equal(c.gpsApagadoPorTi,false);assert.equal(c.calls.length,0);
 c.window.TrabakutikAndroid.pauseRecording=()=>c.calls.push('pause');
 vm.runInContext(source('function pausaGrabacion(si){','function avisoDeCortes(){'),c);
 c.pausaGrabacion(true);assert.equal(c.pausado,true);assert.equal(c.gpsApagadoPorTi,false);
 assert.deepEqual(c.calls,['pause']);assert.equal(c.navegaNativo,true);
});


test('La botonera no recupera un segundo inicio de Navegar, y el pie sigue a la guía',()=>{
 // Cada id lleva sus propias clases: con un unico juego compartido, esconder
 // el pie de mandos tapaba que el boton de Navegar hubiera reaparecido.
 const clases=new Map(),g=id=>{if(!clases.has(id))clases.set(id,new Set());return clases.get(id)},cuerpo=new Set();
 const c={$:id=>({textContent:'',classList:{add:k=>g(id).add(k),remove:k=>g(id).delete(k),contains:k=>g(id).has(k),toggle(k,on){if(on)g(id).add(k);else g(id).delete(k)}}}),
  document:{body:{classList:{contains:k=>cuerpo.has(k),toggle(k,on){if(on)cuerpo.add(k);else cuerpo.delete(k)}}}},
  map:{invalidateSize(){}}};
 c.guiaIniciada=()=>c.navegaNativo;
 vm.createContext(c);
 vm.runInContext(source('let guiandoAntes=false;','function reconciliaBotonera(){'),c);
 for(const active of [false,true,false]){
  c.navegaNativo=active;c.enLaApp=true;c.mode='nav';c.routePoints=corner(140);
  c.pintaBotonNavegar();
  assert(g('navGo').has('hidden'),`Navegar visible con la guia ${active?'activa':'parada'}`);
  assert.equal(g('despeja').has('hidden'),!active,`pie de mandos con la guia ${active?'activa':'parada'}`);
  assert.equal(cuerpo.has('despejado'),active,`pantalla despejada con la guia ${active?'activa':'parada'}`);
 }
});

test('Una ruta cargada y Mi posición no activan voz, desvíos, giros ni progreso antes de grabar',()=>{
 const calls=[],classes=new Set();
 const c={mode:'nav',routePoints:corner(140),recording:false,navegaNativo:false,gpsApagadoPorTi:false,
  $:()=>({classList:{add:k=>classes.add(k)},innerHTML:''}),routeCumulative:[0,100],
  sigueMoviendose:()=>true,alerted:false,junctions:[{}],junctionActive:1,
  resetJunctionView:()=>calls.push('reset-turn'),Number,
  getAudio(){throw Error('No debe activar audio')},hablar(){throw Error('No debe hablar')},pitidos(){throw Error('No debe pitar')}
 };
 vm.createContext(c);
 vm.runInContext(source('function guiaIniciada(){','function marcaAlReves('),c);
 vm.runInContext(source('function updateOffRoute(','try{const modoGuardado='),c);
 // La guarda debe cerrar una indicación antigua antes de medir el siguiente cruce.
 vm.runInContext(source('function junctionGuidance(','function rumboDeLaRuta(progreso){'),c);
 assert.equal(c.guiaIniciada(),false);
 c.updateOffRoute(100,5);c.junctionGuidance(point(0,0),5);c.pintaAvance(20);
 assert.equal(c.alerted,false);assert(classes.has('hidden'));assert.deepEqual(calls,['reset-turn']);
 c.recording=true;assert.equal(c.guiaIniciada(),true);
 c.pausado=true;assert.equal(c.guiaIniciada(),true);
 c.recording=false;c.navegaNativo=true;assert.equal(c.guiaIniciada(),true);
 c.gpsApagadoPorTi=true;assert.equal(c.guiaIniciada(),false);
 c.gpsApagadoPorTi=false;c.mode='create';assert.equal(c.guiaIniciada(),false);
});


test('El vigilante no anuncia pérdida de GPS si solo se ha cargado una ruta',()=>{
 const notices=[],c={pintaEstadoGps(){},gpsApagadoPorTi:false,watch:null,fuenteNativa:false,recording:false,navegaNativo:false,
  window:{TrabakutikAndroid:{getPosition(){throw Error('No debe vigilar sin GPS iniciado')}}},
  setInterval:fn=>c.tick=fn,notice:t=>notices.push(t)};
 vm.createContext(c);vm.runInContext(source('const GUIA_CADUCA_MS=', 'function syncNativeRoute()'),c);
 c.tick();assert.deepEqual(notices,[]);
});

test('Avanzar por la ruta al revés mantiene la guía; estar quieto la caduca',()=>{
 const c={refAvance:null,refAvanceT:0,sentidoRuta:-1};vm.createContext(c);
 vm.runInContext(source('const AVANCE_MS=','const PARADO_MS='),c);
 assert.equal(c.avanzaPorLaRuta(100,0),true);
 assert.equal(c.avanzaPorLaRuta(85,15000),true);
 assert.equal(c.avanzaPorLaRuta(70,30000),true);
 assert.equal(c.avanzaPorLaRuta(70,51000),false);
});

test('El número de versión sale solo en la app, y una APK vieja se nota',()=>{
 // Lo pidio el autor para no tener que ir a los Ajustes de Android. En un
 // navegador no se pone nada, que ahi no hay APK; y una APK anterior a la
 // 4.9.3 no sabe decir su version, asi que se dice eso, que tambien contesta.
 const casos=[
  [{},'',true,'en un navegador no se pone nada'],
  [{TrabakutikAndroid:{}},'Trabakutik GPS · versión anterior a la 4.9.3',false,'APK vieja'],
  [{TrabakutikAndroid:{getAppVersion:()=>''}},'Trabakutik GPS · versión anterior a la 4.9.3',false,'APK que devuelve vacio'],
  [{TrabakutikAndroid:{getAppVersion(){throw Error('no existe')}}},'Trabakutik GPS · versión anterior a la 4.9.3',false,'APK que revienta'],
  [{TrabakutikAndroid:{getAppVersion:()=>'4.9.3'}},'Trabakutik GPS 4.9.3',false,'APK al dia'],
 ];
 for(const [ventana,texto,oculto,quien] of casos){
  const clases=new Set(['hidden']);
  const nodo={textContent:'',classList:{add:k=>clases.add(k),remove:k=>clases.delete(k),contains:k=>clases.has(k)}};
  const c={$:id=>(id==='appVersion'?nodo:null),window:ventana};
  vm.createContext(c);
  vm.runInContext(source('function pintaVersion(){',"$('despeja').onclick="),c);
  assert.equal(nodo.textContent,texto,quien);
  assert.equal(clases.has('hidden'),oculto,quien);
 }
 // Y si el hueco no existe en la pagina, no revienta.
 const c={$:()=>null,window:{TrabakutikAndroid:{getAppVersion:()=>'4.9.3'}}};
 vm.createContext(c);
 vm.runInContext(source('function pintaVersion(){',"$('despeja').onclick="),c);
});

test('Avisa de una APK nueva comparando con la versión publicada en instalar.html',async()=>{
 // Lo pregunto el autor: «cuando entre en el navegador, ¿le avisara?». Antes
 // no avisaba nadie y los arreglos del servicio no llegaban a quien no
 // reinstalara.
 const caso=async(instalada,publicada,{cerrada=null,ok=true,falla=false}={})=>{
  const clases=new Set(['hidden']),nodo=()=>({textContent:'',onclick:null,classList:{add:k=>clases.add(k),remove:k=>clases.delete(k)}});
  const nodos={appVersion:{textContent:'',classList:{add(){},remove(){}}},appUpdate:{classList:{add:k=>clases.add(k),remove:k=>clases.delete(k)}},appUpdateTexto:nodo(),appUpdateCerrar:nodo()};
  const guardado=new Map(cerrada?[['actualizacionCerrada',cerrada]]:[]);
  let pedido=null;
  const c={$:id=>nodos[id]||null,window:{TrabakutikAndroid:{getAppVersion:()=>instalada}},
   localStorage:{getItem:k=>guardado.get(k)??null,setItem:(k,v)=>guardado.set(k,v)},
   fetch:(url,op)=>{pedido={url,op};return falla?Promise.reject(Error('sin red')):Promise.resolve({ok,text:()=>Promise.resolve('<small>versión <!--VER-->'+publicada+'<!--/VER--></small>')})}};
  vm.createContext(c);
  vm.runInContext(source('function pintaVersion(){',"$('despeja').onclick="),c);
  await new Promise(r=>setTimeout(r,0));await new Promise(r=>setTimeout(r,0));
  return {visible:!clases.has('hidden'),texto:nodos.appUpdateTexto.textContent,pedido,cerrar:nodos.appUpdateCerrar.onclick,guardado,c};
 };
 let r=await caso('4.9.21','4.9.22');
 assert.equal(r.visible,true,'4.9.21 frente a 4.9.22: avisa');
 assert.match(r.texto,/4\.9\.22/);assert.match(r.texto,/tienes la 4\.9\.21/);
 assert.equal(r.pedido.url,'instalar.html');assert.equal(r.pedido.op.cache,'no-store');
 assert.equal((await caso('4.9.22','4.9.22')).visible,false,'al dia: callado');
 assert.equal((await caso('4.9.23','4.9.22')).visible,false,'mas nueva que la web: callado');
 assert.equal((await caso('4.9.9','4.9.10')).visible,true,'se compara por numeros, no por texto');
 assert.equal((await caso('','4.9.22')).visible,true,'una APK que no sabe su version es la mas vieja');
 assert.equal((await caso('4.9.21','4.9.22',{falla:true})).visible,false,'sin red: nada');
 assert.equal((await caso('4.9.21','4.9.22',{ok:false})).visible,false,'si la web falla: nada');
 assert.equal((await caso('4.9.21','4.9.22',{cerrada:'4.9.22'})).visible,false,'cerrado para esa version: no vuelve');
 assert.equal((await caso('4.9.21','4.9.23',{cerrada:'4.9.22'})).visible,true,'pero si sale otra, si');
 // Desinstalar solo se aconseja a quien viene de una APK con la llave vieja.
 assert.match((await caso('4.9.21','4.9.22')).texto,/desinstala antes la que tienes/,'4.9.21: llave vieja, hay que desinstalar');
 assert.match((await caso('','4.9.22')).texto,/desinstala antes/,'una APK muy vieja tambien');
 assert.doesNotMatch((await caso('4.9.22','4.9.23')).texto,/desinstala/,'desde la 4.9.22 se instala encima: no se aconseja borrar nada');
 r=await caso('4.9.21','4.9.22');
 r.cerrar();
 assert.equal(r.guardado.get('actualizacionCerrada'),'4.9.22','cerrar se recuerda por version');
});

// ---------------------------------------------------------------------------
// LOS CRUCES CON SUS RAMAS. Desde noviembre de 2026 cruces-zona.json trae, de
// cada cruce, los rumbos de sus ramas agrupados por camino, y el aviso sale de
// ahi y no del angulo del track. La regla la dicto el autor: «si se continua
// por el mismo camino no hay perdida, solo si hay que dejarlo para tomar
// otro; o una curva cerrada tambien se avisa».
// En estas pruebas los rumbos van en GRADOS de brujula: 90 es hacia el este,
// que es hacia donde va corner(0), y 270 es por donde se llega.
function ramas(...grupos){return grupos}
const linea5=(a,b)=>{const n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/5)),o=[];for(let k=1;k<=n;k++)o.push(point(a[0]+(b[0]-a[0])*k/n,a[1]+(b[1]-a[1])*k/n));return o};
test('Un pico del creador -ir y volver unos metros por el mismo sitio- no da aviso',()=>{
 // Visto en una ruta del autor: al unir tramos, el planificador se pasaba 6
 // o 30 m y volvia por encima. Fabricaba una «curva de herradura» o un giro
 // con el lado cambiado.
 const recta=[point(-100,0),...linea5([-100,0],[0,0])];
 const conPico=[...recta,point(0,15),point(0,0.5),...linea5([0,0],[100,0])];
 assert.equal(detector().detect(conPico).length,0,'el pico se quita: es una recta');
});
test('Una ida y vuelta por el mismo camino es «da la vuelta», sin lado; una herradura no',()=>{
 const ida=[point(-100,0),...linea5([-100,0],[0,0]),...linea5([0,0],[0,120])];
 const ruta=[...ida,...linea5([0,120],[0,0.5]),...linea5([0,0],[-100,0.5])];
 const v=detector().detect(ruta).find(t=>t.direction==='vuelta');
 assert(v&&v.retorno===true,'la cima de ida y vuelta se marca como retorno');
 const h=detector().detect(tortuga([[150,0],[10,35],[24,-215],[120,0]])).find(t=>t.direction==='vuelta');
 assert(h&&!h.retorno,'una revuelta de carretera no es un retorno');
 let enviado=null;
 const c={junctions:[{i:5,direction:'vuelta',hacia:'derecha',cruce:false,mantente:false,retorno:true}],
  window:{TrabakutikAndroid:{setJunctions:j=>{enviado=JSON.parse(j)}}},console};
 vm.createContext(c);vm.runInContext(source('function enviaGirosNativos(){','// EL AVISO DE UN CRUCE SALE'),c);
 c.enviaGirosNativos();
 assert.equal(JSON.stringify(enviado),JSON.stringify([{i:5,dir:0,t:0}]),'sin lado ni h: el servicio dice «da la vuelta»');
});
test('Puntos muy juntos (cada 30 cm) no se borran, y el pico sigue desde donde vuelve a la ida',()=>{
 const c={R:Math.PI/180};vm.createContext(c);
 vm.runInContext(source('function compactRoutePoints(points,maxPoints=2200){','\nfunction ')+'',c);
 const densa=[];for(let x=0;x<=300;x+=0.3)densa.push(point(x,0));
 const out=c.compactRoutePoints(densa);
 const fin=out[out.length-1];
 assert(Math.abs(fin[1]-densa[densa.length-1][1])<1e-9,'el final se queda');
 // A=(0,0) B=(100,0) C=(80,0) D=(80,20): la punta B sobra, se sigue por C.
 const r=c.compactRoutePoints([point(0,0),point(100,0),point(80,0),point(80,20),point(80,200)]);
 const xs=r.map(p=>Math.round((p[1]-point(0,0)[1])*111195*Math.cos(p[0]*Math.PI/180)));
 assert(!xs.includes(100),'la punta B no se queda: '+xs.join(','));
});
test('Una ida y vuelta de verdad por el mismo camino no se toca',()=>{
 // Subir a una cima y bajar por donde se ha subido tambien vuelve por encima
 // de la ida, pero mucho mas de 40 m: eso es la ruta, no un pico.
 const ida=[point(-100,0),...linea5([-100,0],[0,0]),...linea5([0,0],[0,120])];
 const ruta=[...ida,...linea5([0,120],[0,0.5]),...linea5([0,0],[-100,0.5])];
 const turns=detector().detect(ruta);
 assert(turns.some(t=>t.direction==='vuelta'),'la media vuelta de la cima se sigue avisando');
});
// Dibuja una ruta como una tortuga: pasos de `paso` metros girando `giro`
// grados por paso (positivo = a la izquierda). Empieza en (-150,0) hacia el este.
function tortuga(tramos,paso=2){
 let x=-150,y=0,rumbo=0;const pts=[point(x,y)];
 for(const [metros,giroTotal] of tramos){
  const n=Math.max(1,Math.round(metros/paso));
  for(let k=0;k<n;k++){rumbo+=giroTotal/n*Math.PI/180;x+=paso*Math.cos(rumbo);y+=paso*Math.sin(rumbo);pts.push(point(x,y))}
 }
 return pts;
}
test('Un giro redondeado en un cruce de ramas ajenas se avisa, medido en 30 m',()=>{
 // Giro real de 110 grados a la derecha repartido en 70 m: en 12 m parece
 // casi recto. Las ramas del cruce no son las suyas (como en una ruta del
 // autor: 114 grados reales, 44 en 12 m, sin aviso).
 const pts=tortuga([[150,0],[70,-110],[120,0]]);
 const turns=detector().detect(pts,[[...point(30,-12),[[300],[60],[20]]]]);
 assert.equal(turns.length,1,'el giro se avisa');assert.equal(turns[0].direction,'derecha');
});
test('El lado de una herradura sale de la revuelta entera, no de sus primeros metros',()=>{
 // Revuelta grande a la derecha que empieza torciendo a la izquierda: con los
 // 12 m del punto se cantaba «a la izquierda» (Garmin del autor: a la derecha).
 const pts=tortuga([[150,0],[10,35],[24,-215],[120,0]]);
 const h=detector().detect(pts).find(t=>t.direction==='vuelta');
 assert(h,'se avisa la herradura');assert.equal(h.hacia,'derecha');
});
test('Si las ramas del cruce no son las de la ruta, el lado sale del trazado',()=>{
 // Lo vio el autor el 14 de noviembre de 2026: llegaba a 101 grados y salia a
 // 161 -derecha-, pero el cruce encontrado era uno de al lado, con ramas a 6,
 // 60 y 216, y se le dijo «cruce a la izquierda». Aqui, girado 11 grados:
 // llega a 90, sale a 150, y las ramas (355, 205, 49) no son las suyas.
 const turns=detector().detect(corner(-60),[cruceCon([355,205],[49])]);
 assert.equal(turns.length,1,'el giro se avisa');
 assert.equal(turns[0].direction,'derecha','por el lado del trazado, no por el de un cruce ajeno');
});
test('Si las ramas si son las de la ruta, mandan las ramas',()=>{
 // El mismo giro con su cruce de verdad: llega por la de 270, sale por la de 150.
 const turns=detector().detect(corner(-60),[cruceCon([90,270],[150])]);
 assert.equal(turns.length,1);assert.equal(turns[0].direction,'derecha');assert(turns[0].cruce);
});
test('Un cruce por el que la ruta pasa dos veces se avisa las dos veces',()=>{
 // Era un Set de toda la ruta: el segundo paso, aunque alli hubiera que
 // cambiar de camino, se quedaba mudo -tambien en el servicio-. Medido en las
 // 72 rutas: 114 avisos perdidos en 42 rutas.
 const linea=(a,b)=>{const n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/5),o=[];for(let k=1;k<=n;k++)o.push(point(a[0]+(b[0]-a[0])*k/n,a[1]+(b[1]-a[1])*k/n));return o};
 const fin=[50*Math.cos(Math.PI/3),50*Math.sin(Math.PI/3)];
 const ruta=[...corner(60),...linea(fin,[300,300]),...linea([300,300],[-300,300]),
  ...linea([-300,300],[-300,0]),...linea([-300,0],[-55,0]),...corner(60)];
 const turns=detector().detect(ruta,[[...point(0,0),[[90,270],[30]]]]);
 const enElCruce=turns.filter(t=>meters(t.point,point(0,0))<2);
 assert.equal(enElCruce.length,2,'los dos pasos por el cruce');
 assert(enElCruce.every(t=>t.cruce&&t.direction==='izquierda'));
});
test('Una herradura alrededor del propio cruce no lo avisa dos veces',()=>{
 // Con la regla de «60 m de recorrido» si: una vuelta dentro de los 25 m del
 // nodo recorre mas de eso sin salir. Lo que cuenta es salir y volver.
 // Vuelta de 22 m de radio: todos sus puntos caen dentro de los 25 m del
 // nodo, pero los de lados opuestos estan a 44 m, mas que el filtro de 35 m
 // que junta avisos pegados, y la vuelta recorre ~138 m.
 const pts=[];for(let x=-80;x<=-22;x+=4)pts.push(point(x,0));
 for(let a=180;a>=-180;a-=6)pts.push(point(22*Math.cos(a*Math.PI/180),22*Math.sin(a*Math.PI/180)));
 for(let x=-26;x>=-80;x-=4)pts.push(point(x,-8));
 const turns=detector().detect(pts,[[...point(0,0),[[90,270],[0,180]]]]);
 const enElCruce=turns.filter(t=>t.cruce);
 assert(enElCruce.length<=1,'como mucho un aviso de cruce: '+enElCruce.length);
});
test('Varios puntos de un mismo paso por el cruce siguen dando un solo aviso',()=>{
 const turns=detector().detect(corner(60),[cruceCon([90,270],[30])]);
 assert.equal(turns.length,1);
});
const cruceCon=(...grupos)=>[...point(0,0),grupos];

test('Un cruce donde sigues por el mismo camino no se avisa, aunque el camino doble',()=>{
 // La carretera entra por el 270 y se va por el 30: dobla 60 grados pero es
 // LA MISMA. Ahi no hay perdida posible y el navegador se calla.
 const turns=detector().detect(corner(60),[cruceCon([30,270],[90])]);
 assert.equal(turns.length,0);
});
test('Avisa cuando hay que dejar el camino para coger otro',()=>{
 // El mismo cruce de antes, pero ahora el que sigue recto -al 90- es el
 // camino por el que llegas, y la ruta coge el otro.
 const turns=detector().detect(corner(60),[cruceCon([90,270],[30])]);
 assert.equal(turns.length,1);
 assert.equal(turns[0].cruce,true);
 assert.equal(turns[0].direction,'izquierda');
 assert.equal(turns[0].mantente,false);
 assert(Math.abs(turns[0].angle-60)<=2,`angulo ${turns[0].angle}`);
});
test('«Sigue por la derecha»: te desvias poco pero otra rama va mas recta',()=>{
 // Es lo que le paso en Osma: el ramal arranca casi recto -20 grados- y la
 // via que sigue de frente es otra. Por el angulo del track no se distingue
 // de ir recto, y por eso el navegador se callaba.
 const turns=detector().detect(corner(-20),[cruceCon([270,92],[110])]);
 assert.equal(turns.length,1);
 assert.equal(turns[0].mantente,true);
 assert.equal(turns[0].direction,'derecha');
 assert(Math.abs(turns[0].angle-20)<=2,`angulo ${turns[0].angle}`);
});
test('Yendo recto por el camino mas recto no se avisa aunque cambie de camino',()=>{
 // Dos caminos distintos pero la ruta coge el que mejor sigue: no hay nada
 // que elegir. Es lo que pidio: «si hay que ir recto, no se avisa».
 const turns=detector().detect(corner(-5),[cruceCon([270,180],[95])]);
 assert.equal(turns.length,0);
});
test('Una curva cerrada se avisa aunque sea el mismo camino',()=>{
 // «o una curva cerrada tambien se avisa». Con 170 grados manda la curva.
 const turns=detector().detect(corner(170),[cruceCon([280,270],[90])]);
 assert.equal(turns.length,1);
 assert.equal(turns[0].direction,'vuelta');
});
test('Un cruce sin ramas se decide como siempre, por el angulo del track',()=>{
 // Un movil con el cruces-zona.json viejo guardado no se queda sin avisos.
 assert.equal(detector().detect(corner(60),[point(0,0)]).length,1);
 assert.equal(detector().detect(corner(40),[point(0,0)]).length,0);
});
test('Un cruce solo se avisa una vez aunque la ruta deje varios puntos dentro',()=>{
 const puntos=[];
 for(let x=-60;x<=60;x+=4)puntos.push(point(x,x>0?x*0.9:0));
 const turns=detector().detect(puntos,[cruceCon([90,270],[42])]);
 assert.equal(turns.filter(t=>t.cruce).length,1);
});
test('Las ramas se leen del fichero y se agrupan por camino',()=>{
 const c={atob:(s)=>Buffer.from(s,'base64').toString('binary')};
 vm.createContext(c);
 vm.runInContext(source('function descifraRamas(','function descifraZona(j){'),c);
 // Bytes 1, 94 y 143: rumbo 1 (nueva rama), rumbo 30 con el bit 64 -mismo
 // camino que la anterior- y rumbo 15 con el bit 128 -ultima del cruce-.
 // Entre realidades distintas de vm, deepEqual compara prototipos: JSON.
 assert.equal(JSON.stringify(c.descifraRamas('AV6P',6,1)),JSON.stringify([[[6,180],[90]]]));
 // Sin el bit de «ultima rama» el fichero esta a medias: mejor sin ramas.
 assert.equal(c.descifraRamas('AV4P',6,2),null);
 assert.equal(c.descifraRamas('',6,1),null);
 assert.equal(c.descifraRamas(undefined,6,1),null);
});
test('Un brinco del GPS hacia atras no se canta como horquilla',()=>{
 // El caso de galdaramiño en el km 2,457: la via va recta y el trazado tiene
 // un tramo de seis metros hacia atras. Con el cruce al lado -y siguiendo
 // por el mismo camino- el punto llega al prepaso de horquillas, que leia
 // 180 grados y soltaba un «da la vuelta» donde no hay ninguno.
 const recta=[];for(let x=-60;x<=60;x+=6)recta.push(point(x,0));
 assert.equal(detector().detect(recta,[cruceCon([90,270],[180])]).length,0,
  'una recta no tiene nada que avisar');
 const brinco=[];
 for(let k=0;k<recta.length;k++){
  brinco.push(recta[k]);
  if(k===9)brinco.push(point(-60+9*6-6,0));   // seis metros hacia atras
 }
 const turns=detector().detect(brinco,[cruceCon([90,270],[180])]);
 assert.equal(turns.filter(t=>t.direction==='vuelta').length,0,
  'un pico de seis metros no es una media vuelta');
});
test('Una curva de herradura viaja al servicio con su lado, y la ficha ya no dice «da la vuelta»',()=>{
 // En plena revuelta de carretera, «cruce, da la vuelta» sonaba a volver
 // atras. Lo conto el autor: «me decia una vuelta en plena curva».
 let enviado=null;
 const c={junctions:[{i:5,direction:'vuelta',hacia:'derecha',cruce:true,mantente:false},
                     {i:9,direction:'vuelta',hacia:'izquierda',cruce:false,mantente:false},
                     {i:14,direction:'izquierda',hacia:'izquierda',cruce:true,mantente:false}],
  window:{TrabakutikAndroid:{setJunctions:j=>{enviado=JSON.parse(j)}}},console};
 vm.createContext(c);vm.runInContext(source('function enviaGirosNativos(){','// EL AVISO DE UN CRUCE SALE'),c);
 c.enviaGirosNativos();
 assert.equal(JSON.stringify(enviado),JSON.stringify([{i:5,dir:1,t:1,h:1},{i:9,dir:-1,t:0,h:1},{i:14,dir:-1,t:1}]));
 const ficha=source("const ladoHerradura=ladoFlecha(turn,alReves);","$('turnAngle')");
 assert(/turn\.retorno\?/.test(ficha)&&/curva de herradura a la/.test(ficha),'la ficha dice «curva de herradura a la …» salvo en una ida y vuelta');
 const voz=source("const giroTxt=lado==='vuelta'","// Si la primera lectura entra en fase 1");
 assert(/turn\.retorno\?/.test(voz)&&/curva de herradura a la/.test(voz),'y la voz de la pagina tambien');
});
test('Al parar o cambiar de ruta se repinta el desnivel: no se queda el último «Quedan … m»',()=>{
 // El autor termino la salida y el perfil siguio diciendo «Quedan 1611 m
 // aprox.» con el GPS apagado: se borraba el dato sin repintar.
 let pintado=0;
 const c={window:{},$:()=>null,marcaAlReves(){},paintNavigationMetrics:()=>{pintado++},liveNativeMetrics:{gain:1611},liveProfileAlong:500};
 vm.createContext(c);vm.runInContext(source('function resetOffRoute(){','function updateOffRoute('),c);
 c.resetOffRoute();
 assert.equal(vm.runInContext('liveNativeMetrics',c),null);
 assert.equal(pintado,1,'y se vuelve a pintar el texto');
});
