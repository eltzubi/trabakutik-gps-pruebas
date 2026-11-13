 // EN MANUAL, EL TOQUE LARGO BUSCA CAMINO. Lo pidio el autor: «marcaje en
 // corto, recto; marcaje largo que busque el camino o ruta por donde va y que
 // lo marque bien». Por debajo de MARCA_LARGA metros se queda la recta de
 // siempre -que es para lo que se usa: forzar un trozo, cruzar donde no hay
 // camino-; por encima se intenta ir por los trazados de Trabakutik. Se hace
 // con la red local, NO con el planificador de fuera: en Manual no sale del
 // movil ni una coordenada, y eso se mantiene.
 // Si no hay conexion por los trazados, o el rodeo es desproporcionado, se
 // queda la recta y no se dice nada: el toque hace lo que hacia.
 if(trazadoManual&&segment.manual){
  const pa=redGps.nodos[prev],pb=redGps.nodos[node],recto=metros(pa,pb);
  if(recto>=MARCA_LARGA){
   const na=nodoCerca(redGps,pa[0],pa[1]),nb=nodoCerca(redGps,pb[0],pb[1]);
   if(na>=0&&nb>=0&&na!==nb){
    const via=camino(redGps,na,nb);
    if(via&&via.length>1){
     const largo=via.slice(1).reduce((v,id,i)=>v+metros(redGps.nodos[via[i]],redGps.nodos[id]),0);
     if(largo<=Math.max(300,recto*2.5)){
      const tr=[prev];
      for(const id of via)if(id!==tr[tr.length-1])tr.push(id);
      if(node!==tr[tr.length-1])tr.push(node);
      segment=tr;
      notice('Tramo por los caminos de Trabakutik · '+(largo/1000).toFixed(2)+' km');
     }
    }
   }
  }
 }
 if(!segment){notice('No hay conexión por los trazados de Trabakutik. Puedes añadir el enlace en Manual.');return}
 if(segment.length===1)return;
 anclasGps.push(node);tramosGps.push(segment);updateDraw();
 const routeLength=segment.slice(1).reduce((v,id,i)=>v+metros(redGps.nodos[segment[i]],redGps.nodos[id]),0);
 const direct=metros(redGps.nodos[prev],redGps.nodos[node]);
 if(direct>30&&routeLength>direct*2.5&&routeLength-direct>300)
  notice('Este tramo da un rodeo de '+(routeLength/1000).toFixed(2)+' km. Deshacer permite cambiarlo.');
 else notice((segment.manual?'Tramo manual en recta · ':'Punto añadido · ')+(drawPoints.reduce((v,p,i)=>i?v+metros(drawPoints[i-1],p):0,0)/1000).toFixed(2)+' km · Guardar GPX cuando quieras');
});
// CERRAR EL CIRCULO. 52 de las 68 rutas de Trabakutik empiezan y acaban a
// menos de 100 m: el circuito es lo normal, y hasta ahora habia que volver al
// punto de partida a toques. El nodo repetido al final es a proposito: asi se
// sigue cumpliendo que tramosGps[k] va de anclasGps[k-1] a anclasGps[k].
function cierraCirculoGps(){
 if(anclasGps.length<2){notice('Marca al menos dos puntos antes.');return}
 // CON EL PLANIFICADOR SE CALCULA SOLO EL TRAMO DE VUELTA, no la ruta
 // entera. Antes se le volvia a mandar todo y, si en medio habia un tramo
 // unido en recta -porque por ahi no hay camino-, el planificador fallaba en
 // ese tramo y el circulo no se cerraba nunca. Es lo mismo que ya se hizo
 // para añadir tramos: lo de antes no se toca.
 if(seguirMapaGps){
  if(calculandoMapaGps)return;
  const ini=anclasGps[0],fin=anclasGps[anclasGps.length-1];
  const a=redGps.nodos[fin].slice(0,2),b=redGps.nodos[ini].slice(0,2);
  if(ini===fin||dist(a,b)<1){estadoMapaGps('El recorrido ya está cerrado.');return}
  planificaTramoMapa(a,b);return}
 const ini=anclasGps[0],fin=anclasGps[anclasGps.length-1];
 if(ini===fin){notice('El trazado ya vuelve al punto de partida.');return}
 const tr=tramoGps(fin,ini);
 if(!tr){notice('No hay camino de vuelta al principio por los caminos de Trabakutik.');return}
 anclasGps.push(ini);tramosGps.push(tr);updateDraw();
 notice('Círculo cerrado · '+(drawPoints.reduce((v,p,i)=>i?v+metros(drawPoints[i-1],p):0,0)/1000).toFixed(2)+' km');
}
// IDA Y VUELTA. No calcula nada: copia los tramos en orden inverso y cada uno
// del reves, que es exactamente el camino de vuelta.
function idaYVueltaGps(){
 if(calculandoMapaGps){cancelaMapaGps();updateDraw();estadoMapaGps('Cálculo cancelado.');return}
 if(anclasGps.length<2){notice('Marca al menos dos puntos antes.');return}
 const ma=[],mt=[];
 for(let i=tramosGps.length-1;i>=1;i--){mt.push(invierteTramoGps(tramosGps[i]));ma.push(anclasGps[i-1])}
 anclasGps=anclasGps.concat(ma);tramosGps=tramosGps.concat(mt);updateDraw();
 notice('Ida y vuelta · '+(drawPoints.reduce((v,p,i)=>i?v+metros(drawPoints[i-1],p):0,0)/1000).toFixed(2)+' km');
}
// ARRASTRAR UN PUNTO YA PUESTO. Antes, para corregir el segundo toque de ocho
// habia que deshacer los seis de despues. Solo se recalculan los dos tramos
// que tocan al punto movido, y si alguno no sale no se toca nada.
function mueveAnclaGps(i,lat,lon){
 if(seguirMapaGps){updateDraw();mueveAnclaMapa(i,lat,lon);return}
 const n=(trazadoManual||nodosManualesGps.has(anclasGps[i]))?nodoManualGps(lat,lon):nodoCerca(redGps,lat,lon);
 if(n<0){notice('Ahí no pasa ningún camino. Suéltalo más cerca de uno.');updateDraw();return}
 const ult=anclasGps.length-1;
 const cerrado=ult>1&&anclasGps[0]===anclasGps[ult];
 const idx=(cerrado&&i===ult)?0:i;
 const na=anclasGps.slice(),nt=tramosGps.slice(),tocar=[];
 na[idx]=n;
 if(cerrado&&idx===0)na[ult]=n;
 if(idx>0)tocar.push(idx);
 if(idx+1<=ult)tocar.push(idx+1);
 if(cerrado&&idx===0&&tocar.indexOf(ult)<0)tocar.push(ult);
 for(const j of tocar){
  const tr=tramoGps(na[j-1],na[j],!!nt[j].manual);
  if(!tr){notice('No hay camino hasta ahí. El punto se queda donde estaba.');updateDraw();return}
  nt[j]=tr;
 }
 if(idx===0)nt[0]=[n];
 anclasGps=na;tramosGps=nt;updateDraw();
 notice('Punto movido · '+(drawPoints.reduce((v,p,i)=>i?v+metros(drawPoints[i-1],p):0,0)/1000).toFixed(2)+' km');
}
// ARRASTRAR CON EL PLANIFICADOR: SOLO LOS DOS TRAMOS DEL PUNTO. Antes se
// recalculaba la ruta entera, y un tramo unido en recta -donde no hay camino-
// la hacia fallar entera: el punto volvia a su sitio y no habia manera de
// moverlo. Ahora se piden solo los tramos que tocan al punto; los unidos en
// recta se quedan en recta, hasta la posicion nueva. Si alguno no sale no se
// cambia nada, como en el modo antiguo.
async function mueveAnclaMapa(i,lat,lon){
 const ult=anclasGps.length-1,cerrado=ult>1&&anclasGps[0]===anclasGps[ult];
 const idx=(cerrado&&i===ult)?0:i,p=[lat,lon];
 const llegaAlPunto=j=>j===idx||(cerrado&&idx===0&&j===ult);
 const coord=k=>(k===idx||(cerrado&&idx===0&&k===ult))?p:redGps.nodos[anclasGps[k]].slice(0,2);
 const tocar=[];
 if(idx>0)tocar.push(idx);
 if(idx+1<=ult)tocar.push(idx+1);
 if(cerrado&&idx===0&&tocar.indexOf(ult)<0)tocar.push(ult);
 if(!tocar.length){const n=nodoManualGps(lat,lon);anclasGps=[n];tramosGps=[[n]];updateDraw();return}
 if(tocar.some(j=>!tramosGps[j].aMano)&&!permisoMapaGps){
  permisoMapaGps=confirm('Para calcular los caminos y el desnivel se enviarán los puntos del recorrido a los servicios de rutas y alturas de FOSSGIS (OpenStreetMap). ¿Continuar?');
  if(!permisoMapaGps){estadoMapaGps('Cálculo cancelado. No se han enviado los puntos.');return}
 }
 cancelaMapaGps();const version=calculoMapaGps;
 const controller=new AbortController();peticionMapaGps=controller;calculandoMapaGps=true;
 $('saveCreated').disabled=true;estadoMapaGps('Calculando tramo…');
 const timer=setTimeout(()=>controller.abort(),30000);
 try{
  const nuevos=[];let sinRed=false;
  for(const j of tocar){
   const a=coord(j-1),b=coord(j);
   if(tramosGps[j].aMano){nuevos.push({j,recta:true});continue}
   let r;
   try{
    r=await solicitaMapaGps([a,b],controller.signal);
    if(version!==calculoMapaGps)return;
    try{await alturasTerrenoGps(r,controller.signal)}catch(e){}
   }catch(e){
    if(version!==calculoMapaGps)return;
    r=planLocalMapa([a,b]);
    if(!r){estadoMapaGps(controller.signal.aborted?'No se pudo completar el cálculo. Revisa la conexión y vuelve a intentarlo.':porQueNoHayCamino(e));return}
    sinRed=true;
   }
   if(version!==calculoMapaGps)return;
   nuevos.push({j,pts:r.parts[0]});
  }
  // El punto queda donde lo ha pegado el planificador al camino, no donde se
  // solto el dedo; si los dos tramos son rectas, donde se solto.
  let q=p;
  const ref=nuevos.find(x=>!x.recta);
  if(ref)q=llegaAlPunto(ref.j)?ref.pts[ref.pts.length-1]:ref.pts[0];
  const n=nodoManualGps(q[0],q[1],Number.isFinite(q[2])?q[2]:null);
  const na=anclasGps.slice(),nt=tramosGps.slice();
  na[idx]=n;if(cerrado&&idx===0)na[ult]=n;
  for(const x of nuevos){
   const medio=x.recta?[]:x.pts.slice(1,-1).map(r=>nodoManualGps(r[0],r[1],r[2]));
   const tr=[na[x.j-1],...medio,na[x.j]];
   if(x.recta)tr.aMano=true;else tr.mapa=true;
   nt[x.j]=tr;
  }
  if(idx===0)nt[0]=[n];
  anclasGps=na;tramosGps=nt;updateDraw();
  estadoMapaGps(sinRed?'Sin conexión · tramo por los caminos guardados, sin desnivel.':'');
  notice('Punto movido · '+(drawPoints.reduce((v,q,k)=>k?v+metros(drawPoints[k-1],q):0,0)/1000).toFixed(2)+' km');
 }finally{
  clearTimeout(timer);
  if(version===calculoMapaGps){peticionMapaGps=null;calculandoMapaGps=false;$('saveCreated').disabled=drawPoints.length<2}
 }
}
$('cerrarCirculo').onclick=cierraCirculoGps;
$('idaVuelta').onclick=idaYVueltaGps;
$('undo').onclick=()=>{if(calculandoMapaGps){cancelaMapaGps();updateDraw();estadoMapaGps('Cálculo cancelado.');return}cancelaMapaGps();if(!anclasGps.length)return;anclasGps.pop();tramosGps.pop();updateDraw();notice('Último tramo deshecho')};
function xmlEscape(value){return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')}
function gpx(points,name){return '<?xml version="1.0" encoding="utf-8"?><gpx xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd" version="1.1" creator="Trabakutik"><metadata><name>'+xmlEscape(name)+'</name><time>'+new Date().toISOString().replace(/\.\d+Z$/,'Z')+'</time></metadata><trk><name>'+xmlEscape(name)+'</name><trkseg>'+points.map(p=>p===null?'</trkseg><trkseg>':'<trkpt lat="'+p[0]+'" lon="'+p[1]+'">'+(Number.isFinite(p[2])?'<ele>'+p[2]+'</ele>':'')+'</trkpt>').join('')+'</trkseg></trk></gpx>'}
function download(points,name){if(points.length<2)return;if(window.TrabakutikAndroid&&window.TrabakutikAndroid.saveGpx){window.TrabakutikAndroid.saveGpx(gpxFilename(name)+'.gpx',gpx(points,name));return;}const url=URL.createObjectURL(new Blob([gpx(points,name)],{type:'application/gpx+xml'})),a=document.createElement('a');a.href=url;a.download=gpxFilename(name)+'.gpx';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)}
const STORAGE_KEY='trabakutik-gps-creadas-v1';
function savedList(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]')}catch(e){return []}}
function putSaved(list){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(list));return true}catch(e){notice('No hay espacio para guardar en el navegador. Descarga el GPX.');return false}}
let savedFromDialog=null;
let pendingSave=null,estadoBotonera='ready',ultimoVozEstado='',rutasListas=false,ultimoParoNativo=0,giraNativo=false;
function gpxFilename(name){return (name||'ruta').toLowerCase().replace(/[^a-z0-9áéíóúüñ-]+/gi,'-').replace(/^-+|-+$/g,'')||'ruta'}
function canShareGpx(points,name){
 // Dentro de la app NO existe navigator.share -el WebView no lo implementa-,
 // asi que esto daba false y el boton se quedaba en «este navegador no
 // permite compartir». El puente nativo si puede, y es el camino que lleva
 // la ruta a Wikiloc o a OsmAnd.
 if(window.TrabakutikAndroid&&window.TrabakutikAndroid.shareGpx)return true;
 if(typeof navigator.share!=='function'||typeof navigator.canShare!=='function'||typeof File==='undefined')return false;
 try{const file=new File([gpx(points,name)],gpxFilename(name)+'.gpx',{type:'application/gpx+xml'});return navigator.canShare({files:[file]})}catch(e){return false}
}
async function shareGpx(points,name){
 if(window.TrabakutikAndroid&&window.TrabakutikAndroid.shareGpx){
  try{window.TrabakutikAndroid.shareGpx(gpxFilename(name)+'.gpx',gpx(points,name));return true}
  catch(e){notice('No se pudo compartir el GPX.');return false}
 }
 if(!canShareGpx(points,name)){notice('Este navegador no permite compartir archivos GPX. Puedes descargarlo.');return false}
 const file=new File([gpx(points,name)],gpxFilename(name)+'.gpx',{type:'application/gpx+xml'});
 try{await navigator.share({files:[file],title:name,text:'Ruta GPX'});return true}
 catch(e){if(e.name!=='AbortError')notice('No se pudo compartir el GPX.');return false}
}
function closeSaveDialog(){
 $('saveDialog').classList.add('hidden');
 pendingSave=null;savedFromDialog=null;
}
function openSaveDialog(points,name,kind){
 if(!Array.isArray(points)||points.filter(Boolean).length<2){notice('No hay suficientes puntos para generar un GPX.');return}
 savedFromDialog=null;$('navigateSavedFromDialog').classList.add('hidden');
 const complete=kind!=='recording'||nativeTrackComplete;
 pendingSave={points:points.map(p=>p===null?null:p.slice()),name,kind,complete};
 $('saveTitle').textContent=kind==='recording'?'Guardar grabación':'Guardar ruta creada';
 $('saveSummary').textContent=name+' · '+points.filter(Boolean).length+' puntos'+elevationText(points.filter(Boolean));
 $('saveStatus').textContent=kind==='created'?'Mis rutas se guarda en este dispositivo; no se publica en la web.'+(points.some(p=>p&&!Number.isFinite(p[2]))?' Hay tramos sin alturas.':''):'';
 const hasCuts=kind==='recording'&&(points.includes(null)||cortesGrabacion>0);
 $('saveToMine').disabled=hasCuts||!complete;
 if(hasCuts)$('saveStatus').textContent='La grabación tiene cortes. Descarga el GPX para conservar los tramos separados.';
 if(!complete)$('saveStatus').textContent='La vista previa contiene solo el tramo final. Guarda el archivo GPX para conservar la grabación completa.';
 $('downloadFromDialog').textContent=kind==='recording'&&window.TrabakutikAndroid?'Guardar archivo GPX…':'Descargar GPX';
 $('shareFromDialog').classList.toggle('hidden',!complete||!canShareGpx(points,name)||(hasCuts&&window.TrabakutikAndroid));
 $('saveDialog').classList.remove('hidden');
}
function finishRecording(){
 apagaGps();
 if(window.TrabakutikAndroid?.clearLiveTrack)window.TrabakutikAndroid.clearLiveTrack();
 recording=false;recordingPendingSave=false;recorded=[];lastBrowserRecordTime=0;lastBrowserRecordPoint=null;
 nativeTrackComplete=true;
 if(recordLayer){map.removeLayer(recordLayer);recordLayer=null}
 recordingControls('ready');
}
function savePendingToMine(){
 if(!pendingSave)return;
 if(pendingSave.complete===false){notice('Guarda el GPX completo: la vista previa no contiene toda la grabación.');return}
 const pending=pendingSave,points=pending.points.filter(Boolean),list=savedList();
 const match=list.findIndex(item=>String(item.name||'').trim().toLocaleLowerCase()===pending.name.trim().toLocaleLowerCase());
 if(match>=0&&!confirm('Ya existe una ruta guardada con ese nombre. ¿Quieres reemplazarla?'))return;
 if(match<0&&list.length>=30){notice('Mis rutas está lleno (30). Elimina o exporta una ruta antes de guardar otra.');return}
 const item={name:pending.name,points,created:Date.now()};
 if(match>=0)list.splice(match,1);
 list.unshift(item);
 if(!putSaved(list))return;
 if(pending.kind==='created'){
  createdSavedItem=item;$('navCreated').classList.remove('hidden');$('navCreated').disabled=false;
 }else if(pending.kind==='recording'){
  finishRecording();
 }
 if(pending.kind==='created'){
  savedFromDialog=item;
  $('saveToMine').disabled=true;
  $('navigateSavedFromDialog').classList.remove('hidden');
  $('saveStatus').textContent='Guardada en Mis rutas. Pulsa Abrir ruta y después Empezar.';
 }else closeSaveDialog();
 showSaved();
 notice('Guardada en Mis rutas · '+item.name);
}
$('navigateSavedFromDialog').onclick=()=>{
 if(!savedFromDialog)return;
 const item=savedFromDialog;closeSaveDialog();loadSaved(item);
};
$('closeSave').onclick=closeSaveDialog;
$('saveToMine').onclick=savePendingToMine;
$('downloadFromDialog').onclick=()=>{
 if(!pendingSave)return;
 const pending=pendingSave;
 if(pending.kind==='recording'&&window.TrabakutikAndroid?.saveRecording){
  closeSaveDialog();
  window.TrabakutikAndroid.saveRecording();
  notice('Elige dónde guardar el archivo GPX');
  return;
 }
 download(pending.points,pending.name);
 if(pending.kind==='recording')finishRecording();
 closeSaveDialog();
 notice('GPX descargado · comprueba Descargas');
};
$('shareFromDialog').onclick=async()=>{
 if(!pendingSave)return;
 if(pendingSave.complete===false){notice('Guarda el GPX completo para conservar el inicio de la grabación.');return}
 const pending=pendingSave;
 const shared=await shareGpx(pending.points,pending.name);
 if(!shared)return;
 if(pending.kind==='recording')finishRecording();
 closeSaveDialog();
};
// El desnivel se cuenta contra una REFERENCIA que va subiendo contigo, no
// mirando solo de un punto al siguiente. Antes era lo segundo y se comia las
// subidas suaves enteras: una rampa de 100 m ganados de metro en metro daba
// +0, porque ningun par de puntos seguidos llegaba a los 5 m. Medido contra
// las cifras publicadas de ocho rutas, el error medio era del 75%:
// zengotitagarai salia +545 cuando la ficha dice +1.077, y trabakua +146
// contra +712. Con la referencia movil y el mismo umbral de 5 m el error
// medio baja al 9% (zengotitagarai +1.173, trabakua +660). El umbral sigue
// haciendo falta: sin el se suma el temblor del GPS en altura.
// Esto NO toca las cifras de las fichas de la web, que tienen otra fuente.
function elevationText(points){
 let up=0,down=0,ref=null;
 const UMBRAL=5;
 for(const p of points){
  const h=p&&p[2];
  if(!Number.isFinite(h)){ref=null;continue;}
  if(ref===null){ref=h;continue}
  if(h>=ref+UMBRAL){up+=h-ref;ref=h}
  else if(h<=ref-UMBRAL){down+=ref-h;ref=h}
 }
 return points.some(p=>p&&Number.isFinite(p[2]))?' · +'+Math.round(up)+' / -'+Math.round(down)+' m aprox.'+(points.some(p=>!p||!Number.isFinite(p[2]))?' · alturas incompletas':''):' · sin alturas disponibles';
}
// Mantener los puntos GPX originales en Mis rutas. Para dibujar y navegar,
// usar una copia simplificada por desviación (no escoger 1 de cada N).
function compactRoutePoints(points,maxPoints=2200){
 // Se conserva la ALTURA de los puntos que sobreviven. Antes se tiraba, y
 // reabrir una ruta de «Mis rutas» -que usa esta copia- hacia que el resumen
 // dijera «sin alturas disponibles» aunque la ruta las tuviera todas. El GPX
 // guardado nunca se tocaba, era solo la copia para dibujar y navegar.
 if(!Array.isArray(points)||points.length<=2)return points.map(p=>p.slice(0,3));
 const source=points.map(p=>Number.isFinite(p[2])?[p[0],p[1],p[2]]:[p[0],p[1]]);
 const lat0=source[Math.floor(source.length/2)][0]*R;
 const scaleX=111195*Math.cos(lat0),scaleY=111195;
 function simplify(tolerance){
  const keep=new Uint8Array(source.length);
  keep[0]=1;keep[source.length-1]=1;
  const stack=[[0,source.length-1]];
  while(stack.length){
   const [start,end]=stack.pop();
   if(end-start<2)continue;
   const a=source[start],b=source[end];
   const dx=(b[1]-a[1])*scaleX,dy=(b[0]-a[0])*scaleY;
   const lenSq=dx*dx+dy*dy;
   let worst=-1,index=-1;
   for(let i=start+1;i<end;i++){
    const px=(source[i][1]-a[1])*scaleX,py=(source[i][0]-a[0])*scaleY;
    const t=lenSq?Math.max(0,Math.min(1,(px*dx+py*dy)/lenSq)):0;
    const error=Math.hypot(px-t*dx,py-t*dy);
    if(error>worst){worst=error;index=i;}
   }
   if(worst>tolerance){keep[index]=1;stack.push([start,index],[index,end]);}
  }
  return source.filter((_,i)=>keep[i]);
 }
 let compact=source;
 for(const tolerance of [1,2,3,5,8,12,20,30]){
  compact=simplify(tolerance);
  if(compact.length<=maxPoints)break;
 }
 if(compact.length>maxPoints){
  // Si es extremadamente sinuoso, limitar también el número de vértices
  // sin modificar el GPX guardado; mantener siempre inicio y final.
  const reduced=[];
  for(let i=0;i<maxPoints;i++)reduced.push(compact[Math.round(i*(compact.length-1)/(maxPoints-1))]);
  compact=reduced;
 }
 return compact;
}
function loadSaved(item){
 if(drawPoints.length>1&&!createdSavedItem&&!confirm('El trazado que estás creando aún no está guardado. ¿Quieres descartarlo y abrir esta ruta?'))return;
 selectedRouteRequest++;
 activeSavedId=item.created||null;$('clearActiveRoute').classList.remove('hidden');
 resetOffRoute();resetJunctionView();
 junctions=[];
 crucesOsm=[]; // una ruta tuya o un GPX de fuera no trae los cruces de OSM
 routePoints=compactRoutePoints(item.points);pintaBotonMapa();
 chosen=-1;updateNativeLaunchLink();
 if(item.imported){
  otherTracksVisible=false; // cada GPX externo abre el mapa limpio
  refreshRouteLayers();
  $('eye').setAttribute('aria-pressed','false');
  $('eye').setAttribute('aria-label','Mostrar rutas de Trabakutik');
  $('eye').title='Mostrar rutas de Trabakutik';
 }
 $('savedDialog').classList.add('hidden');changeMode('nav');

 if(drawPoints.length||drawLayer)clearDraft();
 if(savedLine)map.removeLayer(savedLine);
 savedLine=L.polyline(routePoints,{color:'#5bebff',weight:8,opacity:1,interactive:false}).addTo(map).bringToFront();
 updateDirectionArrows();
 map.fitBounds(savedLine.getBounds(),{padding:[35,35]});
 $('title').textContent=item.name;setRouteTitle(item.name,null);
 $('distance').textContent='Ruta propia'+elevationText(item.points);
 // Preparar ruta y giros antes de permitir que arranque la grabación.
 // Primero se envían los puntos; los índices de giro pertenecen a esa copia.
 // Y la lista se vacia ANTES: syncNativeRoute manda tambien los giros que
 // tenga la pagina, que aqui todavia son los de la ruta anterior. Si los
 // nuevos no llegaban al servicio, se quedaba con los de otra ruta.
 junctions=[];
 syncNativeRoute();
 computeJunctions();
 aplicaCruces();
 notice(guiaIniciada()?'Siguiendo · '+item.name:'Ruta cargada · '+item.name+' · pulsa Empezar');
}
let savedLine=null;
function sameTrack(a,b){
 return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.length>1&&a.every((p,i)=>Math.abs(p[0]-b[i][0])<0.0000001&&Math.abs(p[1]-b[i][1])<0.0000001);
}
function clearDraft(){
 cancelaMapaGps();estadoMapaGps('');
 createdSavedItem=null;
 $('navCreated').classList.add('hidden');$('navCreated').disabled=true;
 if(redGps&&nodosManualesGps.size){const base=nodosManualesGps.values().next().value;redGps.nodos.length=base;redGps.ady.length=base;nodosManualesGps.clear();}
 anclasGps=[];tramosGps=[];drawPoints=[];drawSteps=[];
 drawMarks.forEach(m=>map.removeLayer(m));drawMarks=[];
 junctionMarks.forEach(m=>map.removeLayer(m));junctionMarks=[];
 if(drawLayer){map.removeLayer(drawLayer);drawLayer=null}
 // Y las rayas amarillas de los tramos trazados a mano («Unir en recta»).
 // Solo las quitaba updateDraw, asi que al borrar el trazado o abrir otra
 // ruta se quedaban pintadas en el mapa, sin trazado debajo.
 manoLayers.forEach(l=>map.removeLayer(l));manoLayers=[];
 $('undo').disabled=true;$('clearCreated').disabled=true;
 $('saveCreated').disabled=true;$('navCreated').disabled=true;
 $('clearActiveRoute').classList.toggle('hidden',routePoints.length<2);
 updateElevation();
}
$('clearCreated').onclick=()=>{
 if(!anclasGps.length)return;
 if(!confirm('¿Borrar el trazado que estás creando?'))return;
 // «Estoy navegando este borrador» se miraba solo comparando geometrias, y
 // eso se rompe en cuanto tocas un punto despues de darle a Navegar: el
 // borrador se borraba y la navegacion seguia viva, pitando giros de una
 // ruta que ya no esta en pantalla. Vale tambien si la ruta activa es la
 // copia guardada que salio de este mismo borrador.
 const wasActive=chosen<0&&routePoints.length>1&&(sameTrack(drawPoints,routePoints)
   ||(createdSavedItem&&activeSavedId&&activeSavedId===createdSavedItem.created));
 clearDraft();
 if(wasActive)clearActiveRoute();
 notice('Trazado creado borrado del mapa');
};
function clearActiveRoute(){
 selectedRouteRequest++;
 resetOffRoute();
 resetJunctionView();
 if(savedLine){map.removeLayer(savedLine);savedLine=null}
 // El dibujo provisional del creador es otra capa distinta de la ruta activa.
 // Al quitar la ruta creada hay que eliminar ambas capas.
 if(drawPoints.length||drawLayer||drawMarks.length)clearDraft();
 routePoints=[];chosen=-1;activeSavedId=null;updateElevation();updateNativeLaunchLink();pintaBotonNavegar();directionArrows.clearLayers();
 junctions=[];junctionWarned.clear();routeCumulative=[];crucesOsm=[];
 $('clearActiveRoute').classList.add('hidden');
 $('title').textContent='Trabakutik GPS';
 setRouteTitle('Mapa de rutas',null);
 $('distance').textContent='Elige una ruta para navegar';
 if(window.TrabakutikAndroid?.stopNavigation){
  try{window.TrabakutikAndroid.stopNavigation()}catch(e){console.warn('No se pudo parar navegación',e)}
 }
 if(window.TrabakutikAndroid&&window.TrabakutikAndroid.clearRoute){
  try{window.TrabakutikAndroid.clearRoute()}catch(e){console.warn('No se pudo desactivar la ruta GPS',e)}
 }
 drawAll();
 notice('Ruta quitada del mapa y de la navegación');
}
$('clearActiveRoute').onclick=clearActiveRoute;
function parseImportedGpx(text,filename){
 const xml=new DOMParser().parseFromString(text,'application/xml');
 if(xml.getElementsByTagName('parsererror').length)throw new Error('El archivo GPX no tiene un XML válido');
 if(xml.documentElement?.localName?.toLowerCase()!=='gpx')throw new Error('El archivo no es un GPX');
 const els=(node,tag)=>Array.from(node.getElementsByTagNameNS('*',tag));
 const segments=els(xml,'trkseg').map(seg=>els(seg,'trkpt')).filter(x=>x.length>1);
 // Los GPX pueden contener varios tramos separados. No enlazar dos tramos
 // distintos con una línea recta: importar el tramo continuo más largo.
 let chosen=segments.sort((a,b)=>b.length-a.length)[0],excluded=Math.max(0,segments.length-1);
 if(!chosen){
  const trk=els(xml,'trkpt'),rte=els(xml,'rtept');
  chosen=trk.length>1?trk:rte;
  excluded=0;
 }
 if(!chosen||chosen.length<2)throw new Error('No hay suficientes puntos de track o ruta');
 if(chosen.length>15000)throw new Error('El GPX supera los 15.000 puntos admitidos; necesita una versión reducida');
 const points=chosen.map(el=>{
  const latText=el.getAttribute('lat')?.trim(),lonText=el.getAttribute('lon')?.trim();
  if(!latText||!lonText)throw new Error('Faltan coordenadas en un punto del GPX');
  const lat=Number(latText),lon=Number(lonText);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)throw new Error('Hay coordenadas inválidas en el GPX');
  const ele=els(el,'ele')[0],value=ele&&ele.textContent?.trim()?Number(ele.textContent):null;
  return Number.isFinite(value)?[lat,lon,value]:[lat,lon];
 });
 const named=els(xml,'trk')[0]||els(xml,'rte')[0];
 const nameEl=named?Array.from(named.children).find(x=>x.localName==='name'):null;
 const name=(nameEl?.textContent||filename.replace(/\.gpx$/i,'')).trim().slice(0,110)||'Ruta importada';
 return {name,points,excluded};
}
$('importGpxBtn').onclick=()=>$('importGpxFile').click();
$('importGpxFile').onchange=async e=>{
 const file=e.target.files?.[0];
 if(!file)return;
 try{
  if(file.size>4*1024*1024)throw new Error('El GPX ocupa más de 4 MB');
  const list=savedList();
  if(list.length>=30)throw new Error('Mis rutas está lleno (30). Exporta o elimina una ruta antes de importar');
  // Ya no se exige que el nombre acabe en «.gpx»: el selector de Android se
  // come la extension si cambias el nombre a mano al guardar, y esos ficheros
  // son GPX perfectos que antes no habia forma de volver a meter aqui. Quien
  // decide es el contenido, que ademas es mas seguro que fiarse del nombre.
  const texto=await file.text();
  if(!/<gpx[\s>]/i.test(texto.slice(0,4000)))throw new Error('Ese archivo no es un GPX');
  const result=parseImportedGpx(texto,file.name);
  if(result.excluded){
   if(!confirm('El GPX contiene '+(result.excluded+1)+' tramos separados. Para no unirlos con líneas rectas se importará únicamente el tramo más largo. ¿Continuar?'))return;
  }
  const item={name:result.name,points:result.points,created:Date.now(),imported:true};
  if(!putSaved([item,...list]))throw new Error('No hay espacio para guardar la ruta. No se ha importado.');
  showSaved();
  notice('GPX importado: '+item.name+' · '+item.points.length+' puntos');
 }catch(err){alert('No se pudo importar: '+err.message);notice('Error al importar GPX')}
 finally{e.target.value=''}
};
function showSaved(){
 const target=$('savedItems');target.replaceChildren();
 const list=savedList();
 if(!list.length){target.textContent='Aún no hay rutas guardadas. Puedes importar un GPX desde tu móvil o crear una ruta en el mapa.';return}
 list.forEach((item,i)=>{
  const row=document.createElement('div');row.className='routeitem';
  const open=document.createElement('button');open.textContent=item.name+(item.imported?' · GPX importado':'')+' · '+item.points.length+' puntos'+elevationText(item.points);open.style.flex='1';open.onclick=()=>loadSaved(item);
  const dl=document.createElement('button');dl.className='btn-sub';dl.textContent='↓ GPX';dl.title='Descargar archivo GPX';dl.onclick=()=>download(item.points,item.name.toLowerCase().replace(/[^a-z0-9áéíóúüñ-]+/gi,'-')||'ruta');
  const share=document.createElement('button');share.className='btn-sub';share.textContent='Compartir';share.title='Compartir archivo GPX';share.hidden=!canShareGpx(item.points,item.name);share.onclick=()=>{void shareGpx(item.points,item.name)};
  const del=document.createElement('button');del.className='btn-sub';del.textContent='Eliminar';del.onclick=()=>{if(!confirm('¿Eliminar esta ruta guardada?'))return;const wasActive=chosen===-1&&savedLine&&(sameTrack(routePoints,item.points)||!!(item.created&&activeSavedId===item.created));const draftMatches=sameTrack(drawPoints,item.points);list.splice(i,1);if(putSaved(list)){if(wasActive)clearActiveRoute();if(draftMatches)clearDraft();showSaved();notice('Ruta eliminada del listado y del mapa')}};
  row.append(open,dl,share,del);target.append(row);
 });
}
$('savedRoutes').onclick=()=>{$('savedDialog').classList.remove('hidden');showSaved()};
$('closeSaved').onclick=()=>$('savedDialog').classList.add('hidden');
$('saveCreated').onclick=()=>{
 if(calculandoMapaGps){estadoMapaGps('Espera a que termine el cálculo antes de guardar.');return}
 if(drawPoints.length<2)return;
 const name=prompt('Nombre para la ruta','Mi ruta '+new Date().toLocaleDateString('es-ES'));
 if(name===null)return;
 openSaveDialog(drawPoints,name.trim()||'Mi ruta','created');
};
