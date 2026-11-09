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
// 50 si; «vuelta» se mide con 150, no con 145.
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
  assert.equal(turns[0].direction,angle>145?'vuelta':'izquierda',`${angle} grados`);
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
test('Una curva amplia no avisa, y la ventana de 12 m es la que lo decide',()=>{
 // Media vuelta con radio de 100 m: en los 12 m que se miden apenas se dobla.
 const amplia=[];
 for(let deg=-90;deg<=90;deg+=2)amplia.push(tramo(deg,100));
 assert.equal(detector().detect(amplia).length,0);
 // Un lazo de 8 m de radio tambien calla, y este caso SI depende de los 12 m:
 // midiendo sobre 20 m o mas, el mismo lazo pasa a avisar «media vuelta». Esta
 // es la prueba que sujeta VENTANA. Si algun dia el autor quiere que un lazo
 // tan cerrado como este SI avise, es esta linea la que hay que cambiar.
 const lazo=[];
 for(let deg=0;deg<360;deg+=10)lazo.push(tramo(deg,8));
 assert.equal(detector().detect(lazo).length,0);
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
function zigzag(separacion){
 const points=[];
 for(let x=-120;x<0;x+=10)points.push(point(x,0));
 points.push(point(0,0));
 const q=[separacion*Math.cos(140*Math.PI/180),separacion*Math.sin(140*Math.PI/180)];
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
test('Rutas vacías, de dos puntos y demasiado cortas no inventan indicaciones',()=>{
 for(const points of [[],[point(0,0)],[point(0,0),point(0,50)],[point(-2,0),point(0,0),tramo(140,2)]])assert.equal(detector().detect(points).length,0);
});
test('Los índices enviados a Android corresponden a la ruta simplificada',()=>{
 const c=detector(),sent=[];c.window.TrabakutikAndroid.setJunctions=json=>sent.push(JSON.parse(json));
 vm.runInContext(source('function enviaGirosNativos(){','function computeJunctions(){'),c);
 c.detect(corner(-140));assert.equal(sent.length,1);
 assert.equal(sent[0][0].i,1);assert.equal(sent[0][0].dir,1);assert.equal(sent[0][0].t,0);
 assert(sent[0][0].i<c.routePoints.length);
 // Un giro en un cruce conocido viaja marcado con t:1; el servicio lo dice de
 // otra manera -«toma el camino de la derecha» y no «gira a la derecha»-.
 const d=detector(),cruces=[];d.window.TrabakutikAndroid.setJunctions=json=>cruces.push(JSON.parse(json));
 vm.runInContext(source('function enviaGirosNativos(){','function computeJunctions(){'),d);
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
 for(const k of ['showSaved','finishRecording','resetOffRoute','updateNativeLaunchLink','pintaBotonNavegar','updateDirectionArrows','aplicaCruces','recordingControls'])c[k]=()=>{};
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
  $:id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',classList:{add(){},remove(){},toggle(){}}});return nodes.get(id)},
  window:{speechSynthesis:{cancel(){calls.push('cancel-voice')}},TrabakutikAndroid:{
   stopRecording(){calls.push('stop-record')},stopNavigation(){calls.push('stop-navigation')},clearLiveTrack(){calls.push('clear-track')},
   getPosition(){throw Error('No debe consultar el servicio después de terminar')},
   getTrackingSnapshot(){calls.push('snapshot');return JSON.stringify({recording:true})}
  }},navigator:{geolocation:{clearWatch(w){calls.push(['clear-watch',w])},watchPosition(){calls.push('watch');return 2}}},
  document:{hidden:false},audio:{close(){calls.push('close-audio');return Promise.resolve()}},
  watch:1,gpsApagadoPorTi:false,navegaNativo:true,giraNativo:true,junctionActive:1,
  recording:true,recordingPendingSave:false,recorded:[point(0,0),point(10,0)],recordLayer:{},
  lastBrowserRecordTime:1,lastBrowserRecordPoint:point(10,0),pausado:false,
  fuenteNativa:true,ultimoTiempoNativo:1,apagadoHasta:0,position:point(10,0),me:{},
  routePoints:corner(140),lastCourse:1,courseFix:point(0,0),ultimoFix:1,refParado:point(0,0),refParadoT:1,
  followGps:false,manualMapUntil:1,routeCumulative:[],ultimoAlong:null,lastNativeSync:0,lastNativeTrackVersion:'',cortesGrabacion:0,reconciliaBotonera(){},
  map:{removeLayer(){calls.push('remove-layer')}},resetJunctionView(){calls.push('reset-turn');c.junctionActive=-1},resetOffRoute(){calls.push('reset-off-route')},
  pintaBotonNavegar(){calls.push('nav-button')},recordingControls:state=>c.controls=state,
  notice:text=>c.status=text,confirmaParar:()=>true,avisoDeCortes:()=>'',
  getAudio(){},mode:'nav',syncNativeRoute(){},enciendeNavegacionNativa(){calls.push('start-navigation')}
 };
 vm.createContext(c);
 vm.runInContext(source('function apagaGps(){',"$('discardRecording').onclick="),c);
 vm.runInContext(source('function finishRecording(){','function savePendingToMine(){'),c);
 vm.runInContext(source("$('recordStop').onclick=","$('saveRecording').onclick="),c);
 vm.runInContext(source('window.trabakutikNativeGpxSaved=()=>{',"window.addEventListener('beforeunload'"),c);
 vm.runInContext(source('window.trabakutikSyncNative=()=>{',"document.addEventListener('visibilitychange'"),c);
 vm.runInContext(source('function miraPosicionNativa(){','setInterval(miraPosicionNativa,'),c);
 vm.runInContext(source('function onFix(pos){','// Recupera los puntos capturados'),c);
 vm.runInContext(source('function startGPS(',"if(!enLaApp)"),c);
 c.calls=calls;return c;
}
test('Parar finaliza la grabación y la navegación; conserva los puntos pendientes de guardar',()=>{
 const c=endSessionFlow(),route=c.routePoints;
 c.$('recordStop').onclick();
 assert.equal(c.recording,false);assert.equal(c.recordingPendingSave,true);assert.equal(c.recorded.length,2);
 assert.equal(c.controls,'stopped');assert.equal(c.gpsApagadoPorTi,true);
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
 vm.runInContext(source('function junctionGuidance(','// Devuelve null a mas de 30 m'),c);
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
 const notices=[],c={gpsApagadoPorTi:false,watch:null,fuenteNativa:false,recording:false,navegaNativo:false,
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
