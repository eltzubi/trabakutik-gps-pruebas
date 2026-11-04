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
 for(let d=5;d<=50;d+=5)points.push(point(d*Math.cos(deg*Math.PI/180),d*Math.sin(deg*Math.PI/180)));
 return points;
}
test('La copia simplificada de tres puntos conserva los giros de 90° en ambos sentidos',()=>{
 for(const [angle,direction] of [[90,'izquierda'],[-90,'derecha']]){
  const c=detector(),turns=c.detect(corner(angle));
  assert.equal(c.routePoints.length,3);assert.equal(turns.length,1);
  assert.equal(turns[0].direction,direction);assert.equal(turns[0].cruce,false);
  assert(Math.abs(turns[0].angle-90)<=1);
 }
});
test('Sin OSM: no avisa giros pequeños; sí giros cerrados y cambios de sentido',()=>{
 for(const angle of [0,15,30,45,60,75])assert.equal(detector().detect(corner(angle)).length,0,`${angle} grados`);
 for(const angle of [90,110,140,160,180]){
  const turns=detector().detect(corner(angle));assert.equal(turns.length,1,`${angle} grados`);
  if(angle>=160)assert.equal(turns[0].direction,'vuelta');
 }
});
test('En un cruce identificado anuncia un cambio de camino y lo distingue de una curva',()=>{
 const turns=detector().detect(corner(60),[point(0,0)]);
 assert.equal(turns.length,1);assert.equal(turns[0].cruce,true);
 assert.equal(detector().detect(corner(20),[point(0,0)]).length,0);
});
test('Una curva amplia de 90° no produce un aviso de giro cerrado',()=>{
 const points=[];
 for(let deg=-90;deg<=0;deg+=2)points.push(point(100*Math.cos(deg*Math.PI/180),100*Math.sin(deg*Math.PI/180)));
 assert.equal(detector().detect(points).length,0);
});
test('Una desviación aislada del GPS y los puntos repetidos no crean giros falsos',()=>{
 const points=[];for(let x=-60;x<=60;x+=5)points.push(point(x,x===0?10:0));
 assert.equal(detector().detect(points).length,0);
 const repeats=[point(-50,0),point(-50,0),point(0,0),point(0,0),point(0,50)];
 assert.equal(detector().detect(repeats).length,1);
});
test('Rutas vacías, de dos puntos y demasiado cortas no inventan indicaciones',()=>{
 for(const points of [[],[point(0,0)],[point(0,0),point(0,50)],[point(-2,0),point(0,0),point(0,2)]])assert.equal(detector().detect(points).length,0);
});
test('Los índices enviados a Android corresponden a la ruta simplificada',()=>{
 const c=detector(),sent=[];c.window.TrabakutikAndroid.setJunctions=json=>sent.push(JSON.parse(json));
 vm.runInContext(source('function enviaGirosNativos(){','function computeJunctions(){'),c);
 c.detect(corner(-90));assert.equal(sent.length,1);
 assert.equal(sent[0][0].i,1);assert.equal(sent[0][0].dir,1);assert.equal(sent[0][0].t,0);
 assert(sent[0][0].i<c.routePoints.length);
});
function savedFlow(){
 const c=detector(),nodes=new Map(),calls=[];
 c.$=id=>{if(!nodes.has(id)){
  const hidden=new Set(['hidden']);
  nodes.set(id,{textContent:'',disabled:false,classList:{add:k=>hidden.add(k),remove:k=>hidden.delete(k),contains:k=>hidden.has(k),toggle(k,on){if(on)hidden.add(k);else hidden.delete(k)}}});
 }return nodes.get(id)};
 Object.assign(c,{console,selectedRouteRequest:0,activeSavedId:null,drawPoints:[],drawLayer:null,createdSavedItem:null,savedFromDialog:null,chosen:-1,savedLine:null,pendingSave:null,watch:1,fuenteNativa:false,recordLayer:null,recorded:[],recording:false,stored:[],L:{polyline(){return {addTo(){return this},bringToFront(){return this},getBounds(){return []}}}},map:{removeLayer(){},fitBounds(){}},confirm:()=>true,elevationText:()=>'',savedList:()=>c.stored,putSaved:list=>(c.stored=list,true),setRouteTitle:name=>c.$('mapTitle').textContent=name,changeMode:mode=>c.mode=mode,clearDraft(){c.drawPoints=[];c.createdSavedItem=null},notice:text=>c.status=text,startGPS(...args){calls.push(['gps',args])},syncNativeRoute(){calls.push(['route',c.routePoints.length])},enciendeNavegacionNativa(){calls.push(['navigate',c.routePoints.length,c.junctions.length])}});
 c.window.TrabakutikAndroid.startRecording=()=>calls.push(['record',c.routePoints.length,c.junctions.length]);
 for(const k of ['showSaved','finishRecording','resetOffRoute','updateNativeLaunchLink','pintaBotonNavegar','updateDirectionArrows','aplicaCruces','recordingControls'])c[k]=()=>{};
 vm.runInContext(source('function closeSaveDialog(){','function openSaveDialog('),c);
 vm.runInContext(source('function savePendingToMine(){',"$('closeSave').onclick="),c);
 vm.runInContext(source('function loadSaved(item){','let savedLine=null;'),c);
 vm.runInContext(source('function sameTrack(a,b){','function clearDraft(){'),c);
 vm.runInContext(source("$('recordStart').onclick=",'// En un circuito te cruzas'),c);
 c.calls=calls;
 c.save=(points=corner(90))=>{c.drawPoints=points;c.pendingSave={points,name:'Mi ruta',kind:'created'};c.savePendingToMine()};
 return c;
}
test('Guardar ofrece Navegar esta ruta; al abrir envía puntos antes de preparar los giros',()=>{
 const c=savedFlow();c.save();assert.equal(c.stored.length,1);assert.equal(c.routePoints.length,0);
 assert.equal(c.$('navigateSavedFromDialog').classList.contains('hidden'),false);
 assert.equal(c.$('saveToMine').disabled,true);
 c.$('navigateSavedFromDialog').onclick();
 assert.equal(c.mode,'nav');assert.equal(c.routePoints.length,3);assert.equal(c.junctions.length,1);
 assert.equal(c.$('mapTitle').textContent,'Mi ruta');assert.equal(c.savedFromDialog,null);
 assert.equal(c.$('saveDialog').classList.contains('hidden'),true);
 assert.deepEqual(c.calls[0],['route',3]);assert.deepEqual(c.calls.at(-1),['gps',[false,true]]);
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
 const c=savedFlow();c.save();c.drawPoints=corner(-90);c.$('recordStart').onclick();
 assert.equal(c.routePoints.length,0);assert.equal(c.recording,true);
});
test('Una ruta que ya estaba activa tiene prioridad al iniciar la grabación',()=>{
 const c=savedFlow();c.save();c.routePoints=c.compactRoutePoints(corner(-90));c.computeJunctions();
 c.$('mapTitle').textContent='Otra ruta';c.$('recordStart').onclick();
 assert.equal(c.junctions[0].direction,'derecha');assert.equal(c.$('mapTitle').textContent,'Otra ruta');
 assert.match(c.status,/Grabando y siguiendo · Otra ruta/);
});
