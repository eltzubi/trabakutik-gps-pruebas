// CERCA DE MI: salida a 4 km o trazado a 1,5 km, y como mucho las 20 mas
// cercanas.
//
// Antes habia ademas un tope de 15 km de largo, y por eso el autor, parado en
// Intxorta, veia UNA ruta cuando por delante le pasaban nueve: 47 de sus 72
// rutas pasan de 15 km. Una ruta larga que te pasa a doscientos metros esta
// cerca de ti; lo larga que sea es otra cosa. El tope de largo se ha quitado.
//
// En su sitio hay un tope de CUANTAS, no de cuan largas, porque sin ninguno
// el boton no servia de nada en el sitio donde mas falta hace: 55 de sus
// rutas arrancan en 500 m de Trabakua, asi que ahi «cerca de mi» serian 62
// de 72 y la pantalla quedaria igual que con «Todas».
//
// Orden: por lo cerca que te pasa. A igualdad -en Trabakua todas salen del
// mismo punto- la mas corta primero, que es la que se puede hacer desde ahi.
const nearbyRadius=4000,nearbyPaso=1500,nearbyMaximo=20;
let nearbyCercanas=new Set();
function routeLength(i){
 const t=tracks[i];if(!t?.points?.length)return Infinity;
 if(t._nearLength===undefined){let sum=0;for(let j=1;j<t.points.length;j++)sum+=dist(t.points[j-1],t.points[j]);t._nearLength=sum}
 return t._nearLength;
}
// Lo cerca que te pilla esa ruta: por su salida o por donde pasa, lo que mande.
function distanciaCerca(i){
 const t=tracks[i];
 if(!nearbyOrigin||!(t?.points?.length>1))return Infinity;
 // La salida es un punto del propio trazado, asi que esto ya la incluye: no
 // hace falta mirarla aparte.
 return closestMeters(nearbyOrigin,t.points);
}
function dentroDeCerca(i){
 const t=tracks[i];
 return !!nearbyOrigin&&t?.points?.length>1&&
  (dist(nearbyOrigin,t.points[0])<=nearbyRadius||closestMeters(nearbyOrigin,t.points)<=nearbyPaso);
}
function recalculaCerca(){
 nearbyCercanas=new Set();
 if(!nearbyOnly||!nearbyOrigin||!tracks.length)return;
 const dentro=tracks.map((t,i)=>i).filter(dentroDeCerca);
 dentro.sort((a,b)=>distanciaCerca(a)-distanciaCerca(b)||routeLength(a)-routeLength(b));
 for(const i of dentro.slice(0,nearbyMaximo))nearbyCercanas.add(i);
 nearbyCount=nearbyCercanas.size;
}
function nearTrack(i){return !nearbyOnly||nearbyCercanas.has(i)}
function updateNearbyLayers(){
 if(!nearbyOnly||!tracks.length)return;
 recalculaCerca();
 refreshRouteLayers();
}
function applyNearbyPosition(p){
 if(!nearbyOnly)return;
 nearbyOrigin=p.slice();nearbyLast=p.slice();
 updateNearbyLayers();
 showRoutesIfOpen();
 notice(nearbyCount?nearbyCount+' rutas cerca de ti · de la que más cerca te pasa a la que menos':'No hay ninguna ruta con salida a 4 km ni que te pase a 1,5 km');
}
function showRoutesIfOpen(){if(!$('routeDialog').classList.contains('hidden'))showRoutes()}
function nearbyError(err){
 if(!nearbyOnly)return;
 nearbyOrigin=null;nearbyLast=null;
 updateNearbyLayers();
 warnGps(err);
}
function quickNativePosition(){
 try{
  if(!window.TrabakutikAndroid?.getLastLocation)return null;
  const raw=window.TrabakutikAndroid.getLastLocation();
  if(!raw)return null;
  const info=JSON.parse(raw);
  if(!Number.isFinite(info.lat)||!Number.isFinite(info.lon)||info.age>120000||info.accuracy>150)return null;
  return [info.lat,info.lon];
 }catch(e){return null}
}
function locateNearby(){
 const cached=position||quickNativePosition();
 if(cached){applyNearbyPosition(cached);map.panTo(cached,{animate:false})}
 // Empezar a buscar ubicación inmediatamente, sin iniciar una grabación.
 if(!navigator.geolocation){if(!cached)nearbyError();return}
 navigator.geolocation.getCurrentPosition(pos=>{
  if(!nearbyOnly||pos.coords.accuracy>150)return;
  const p=[pos.coords.latitude,pos.coords.longitude];
  position=p;applyNearbyPosition(p);map.panTo(p,{animate:false});
 },err=>{if(!cached)nearbyError(err)},{
  enableHighAccuracy:false,maximumAge:15000,timeout:4500
 });
 // Afinar en segundo plano; no bloquear la pantalla esperando satélites.
 navigator.geolocation.getCurrentPosition(pos=>{
  if(!nearbyOnly||pos.coords.accuracy>150)return;
  const p=[pos.coords.latitude,pos.coords.longitude];
  position=p;applyNearbyPosition(p);map.panTo(p,{animate:false});
 },err=>{if(!nearbyOrigin)nearbyError(err)},{
  enableHighAccuracy:true,maximumAge:10000,timeout:12000
 });
}
// Flechas pequeñas sobre el recorrido azul, siguiendo el orden real del GPX.
let directionArrows=L.layerGroup().addTo(map);
function updateDirectionArrows(){
 directionArrows.clearLayers();
 if(routePoints.length<2||map.getZoom()<13)return;
 let totalMeters=0;
 for(let i=1;i<routePoints.length;i++)totalMeters+=dist(routePoints[i-1],routePoints[i]);
 const spacing=Math.max(220,totalMeters/40);
 let next=spacing/2,covered=0;
 for(let i=1;i<routePoints.length;i++){
  const a=routePoints[i-1],b=routePoints[i],len=dist(a,b);
  if(len<1)continue;
  while(covered+len>=next){
   const t=(next-covered)/len,point=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
   const angle=bearingBetween(a,b);
   const icon=L.divIcon({className:'',iconSize:[20,20],iconAnchor:[10,10],html:'<div style="width:20px;height:20px;display:grid;place-items:center;transform:rotate('+angle+'deg);pointer-events:none"><svg width="15" height="17" viewBox="0 0 15 17" aria-hidden="true"><path d="M7.5 1L14 15L7.5 11.5L1 15Z" fill="#07314b" stroke="#f0ffff" stroke-width="1.8" stroke-linejoin="round"/></svg></div>'});
   L.marker(point,{icon,interactive:false,keyboard:false,zIndexOffset:450}).addTo(directionArrows);
   next+=spacing;
  }
  covered+=len;
 }
}
map.on('zoomend',updateDirectionArrows);
function setRouteTitle(name,href){
 const title=$('mapTitle');
 title.textContent=name;
 const valid=typeof href==='string'&&/^[a-z0-9_-]+\.html$/i.test(href);
 title.disabled=!valid;
 title.dataset.href=valid?href:'';
 title.title=valid?'Abrir ficha de '+name:'Esta ruta no tiene ficha publicada';
 title.setAttribute('aria-label',valid?'Ver ficha de '+name:name);
}
$('mapTitle').onclick=()=>{
 const href=$('mapTitle').dataset.href;
 if(!href||!/^[a-z0-9_-]+\.html$/i.test(href))return;
 // La app Android intercepta el enlace y conserva el navegador GPS abierto.
 window.location.href='https://trabakutik.com/'+href;
};
function getTrackLayer(i){
 if(!layers[i]&&tracks[i])layers[i]=L.polyline(tracks[i].points.map(p=>[p[0],p[1]]),{
  color:i===chosen?'#5bebff':'#ff8a16',weight:i===chosen?7:4.5,
  opacity:i===chosen?1:.97,interactive:false
 });
 return layers[i];
}
function refreshRouteLayers(){
 tracks.forEach((t,i)=>{
  const show=i===chosen||(otherTracksVisible&&routeListScope!=='current'&&(!nearbyOnly||nearTrack(i)));
  if(show){const layer=getTrackLayer(i);if(layer&&!map.hasLayer(layer))layer.addTo(map);}
  else if(layers[i]){map.removeLayer(layers[i]);layers[i]=null;}
 });
 if(chosen>=0&&layers[chosen])layers[chosen].bringToFront();
 if(savedLine)savedLine.bringToFront();
}
function drawAll(){
 layers.forEach(l=>{if(l)map.removeLayer(l)});layers=[];
 refreshRouteLayers();
 if(chosen>=0){
  map.fitBounds(layers[chosen].getBounds(),{padding:[35,35]});
  $('title').textContent=toName(tracks[chosen]);
  setRouteTitle(toName(tracks[chosen]),tracks[chosen].href);
  $('distance').textContent='Azul: tu ruta · Naranja: demás rutas';
 }
 if(savedLine) savedLine.bringToFront();
 syncScopeMap();
 updateDirectionArrows();
}
$('eye').onclick=()=>{
 otherTracksVisible=!otherTracksVisible;
 refreshRouteLayers();
 $('eye').setAttribute('aria-pressed',String(otherTracksVisible));
 $('eye').setAttribute('aria-label',otherTracksVisible?'Ocultar rutas de Trabakutik':'Mostrar rutas de Trabakutik');
 $('eye').title=otherTracksVisible?'Ocultar rutas de Trabakutik':'Mostrar rutas de Trabakutik';
 notice(otherTracksVisible?'Rutas de Trabakutik visibles':'Mapa limpio · rutas de Trabakutik ocultas');
};
function updateNativeLaunchLink(){
 // El boton de guardar el mapa depende de que haya ruta, y esta funcion se
 // llama en los cuatro sitios donde la ruta cambia. pintaMandos lo repasa
 // ademas en cada posicion, por si alguna vez se carga una ruta por otro
 // camino -un GPX importado, por ejemplo-.
 pintaBotonMapa();
 const link=$('openNativeGps');
 if(window.TrabakutikAndroid||!/Android/i.test(navigator.userAgent)||chosen<0||!tracks[chosen]?.href){
  link.classList.add('hidden');link.removeAttribute('href');return;
 }
 const slug=tracks[chosen].href.replace(/\.html$/,'');
 if(!/^[a-z0-9_-]+$/i.test(slug)){link.classList.add('hidden');return;}
 link.href=enlaceApp(slug);
 link.classList.remove('hidden');
}
async function fetchRouteJson(url,options={}){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetch(url,{...options,signal:controller.signal});
  if(!response.ok)throw new Error('HTTP '+response.status);
  return await response.json();
 }finally{clearTimeout(timer)}
}
let selectedRouteRequest=0;
async function loadDetailedSelected(i,request){
 const slug=tracks[i]?.href?.replace(/\.html$/,'');
 if(!slug||!/^[a-z0-9_-]+$/i.test(slug))return;
 try{
  // El mapa general tiene una simplificación de 10 m; cada ficha conserva 1 m.
  const url='https://raw.githubusercontent.com/eltzubi/Rutas-Mallabia/main/data/'+slug+'.json';
  const payload=await fetchRouteJson(url,{cache:'no-store'});
  const pts=payload.tracks?.[0]?.points;
  if(!Array.isArray(pts)||pts.length<2||pts.length>15000||!pts.every(p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1])))throw new Error('Trazado detallado no válido');
  if(chosen!==i||selectedRouteRequest!==request)return;
  // Antes esto era SOLO para dibujar, por miedo a «mandar 10.000 puntos al
  // servicio». Ese miedo era a un fantasma: medidos los 70 tracks, el mayor
  // tiene 2.302 puntos y la mediana 1.058, y setRoute admite 15.000.
  // Mientras tanto la línea que se VEÍA era la fina y la que se MEDÍA era la
  // gorda -37 m entre puntos, hasta 7,5 m de separación entre una y otra-.
  // Dos líneas distintas: de ahí que el punto pareciera pegado al track y el
  // aviso dijera «a 15 m», y de ahí que la flecha fuera a saltos.
  const detailedLine=pts.map(p=>[p[0],p[1],Number.isFinite(p[2])?p[2]:null]);
  if(layers[i])map.removeLayer(layers[i]);
  layers[i]=L.polyline(detailedLine,{color:'#5bebff',weight:7,opacity:1,interactive:false}).addTo(map).bringToFront();
  // Y ahora sí: la fina manda también para medir. Se rehacen los cruces -que
  // recalculan routeCumulative- y se le manda al servicio.
  if(detailedLine.length<=12000){
   routePoints=detailedProfilePoints=detailedLine;pintaBotonMapa();
   ultimoAlong=ultimoPuntoAlong=null;alongPrevio=null;alongAcum=0;
   liveProfileAlong=null;liveNativeMetrics=null;
   // LOS PUNTOS PRIMERO, LOS GIROS DESPUES. Aqui estaba al reves:
   // computeJunctions acaba mandando los giros al servicio, asi que durante
   // unos milisegundos el servicio tenia los giros del trazado FINO contra
   // la ruta GENERAL, y los indices que caben en la ruta vieja apuntan a
   // otro sitio. Una posicion que entre justo ahi canta un giro a cientos
   // de metros de donde toca. Lo avisa por escrito el comentario de
   // enviaGirosNativos: «los giros van SIEMPRE detras de los puntos».
   // Se vacia la lista antes de mandar los puntos para que el servicio no
   // se quede ni un instante con los giros viejos sobre la linea nueva;
   // computeJunctions le manda enseguida los buenos.
   junctions=[];
   try{syncNativeRoute()}catch(e){console.warn('Ruta fina no enviada',e)}
   computeJunctions();
   updateElevation();
   aplicaCruces();   // y los cruces de OSM sobre la linea fina, que es la buena
  }
  notice(guiaIniciada()?'Ruta Garmin con detalle · grabando y avisando de los giros':'Ruta Garmin cargada · pulsa Empezar');
 }catch(e){
  if(chosen===i&&selectedRouteRequest===request)notice('Ruta cargada · detalle original no disponible, usando trazado general');
  console.warn('No se pudo cargar el trazado detallado',e);
 }
}
function selectRoute(i){
 const request=++selectedRouteRequest;
 activeSavedId=null;$('clearActiveRoute').classList.remove('hidden');
 resetOffRoute();resetJunctionView();junctionWarned.clear();junctionZoom=null;
 if(savedLine){map.removeLayer(savedLine);savedLine=null}
 chosen=i;
 updateNativeLaunchLink();

 // Los cruces llegan con la ruta fina, no con la gorda: hasta que llegue, sin
 // cruces, y computeJunctions solo avisa de curvas de herradura.
 crucesOsm=[];
 routePoints=tracks[i].points.map(p=>[p[0],p[1]]);pintaBotonMapa();
 updateElevation();
 drawAll();
 $('routeDialog').classList.add('hidden');
 notice('Ruta seleccionada · preparando recorrido');
 // Primero devolver control al navegador y pintar; calcular los giros
 // en el siguiente ciclo, sin bloquear la apertura desde la ficha.
 setTimeout(()=>{
  if(chosen!==i||selectedRouteRequest!==request)return;
  // Los puntos primero, siempre. syncNativeRoute manda tambien los giros que
  // haya, y computeJunctions los recalcula y los vuelve a mandar detras.
  // Vaciados antes, como en loadDetailedSelected: los que hay aqui son los de
  // la ruta anterior y no pueden llegar al servicio ni un instante.
  junctions=[];
  try{syncNativeRoute()}catch(e){console.warn('Ruta no enviada',e)}
  computeJunctions();
  aplicaCruces();
  notice('Ruta seleccionada · cargando detalle del Garmin');
  loadDetailedSelected(i,request);
 },60);
}
let routeListScope='all';
function syncScopeMap(){
 nearbyOnly=routeListScope==='near';
 if(nearbyOnly)recalculaCerca();else{nearbyCercanas=new Set();nearbyCount=0}
 refreshRouteLayers();
 if(routeListScope==='current')notice('Mostrando solo la ruta actual');
 else if(routeListScope==='near')notice(nearbyOrigin?nearbyCount+' rutas cercanas disponibles':'Buscando ubicación GPS…');
 else notice(otherTracksVisible?'Mostrando rutas de Trabakutik':'Mapa limpio · pulsa el icono de capas para ver todas las rutas');
}
function showRoutes(){
 const q=$('search').value.toLowerCase().trim(),list=$('items');list.replaceChildren();
 document.querySelectorAll('#routeListScope button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.scope===routeListScope)));
 if(routeListScope==='near'&&!nearbyOrigin){list.textContent='Buscando tu posición GPS…';return}
 if(routeListScope==='current'&&chosen<0){list.textContent=routePoints.length>1?'Ruta propia activa: '+$('mapTitle').textContent:'No hay una ruta activa';return}
 let n=0;
 // La misma regla y el mismo orden que en el mapa, de un solo sitio: antes
 // el listado llevaba su propia copia y ordenaba solo por la salida, asi que
 // una ruta que te pasa por delante caia al final de la lista.
 tracks.map((t,i)=>({t,i})).sort((a,b)=>routeListScope==='near'&&nearbyOrigin
   ?(distanciaCerca(a.i)-distanciaCerca(b.i)||routeLength(a.i)-routeLength(b.i))
   :a.i-b.i).forEach(({t,i})=>{
  if(routeListScope==='near'&&!nearbyCercanas.has(i))return;
  if(routeListScope==='current'&&i!==chosen)return;
  if(!sinTildes(toName(t)).includes(sinTildes(q)))return;
  n++;const b=document.createElement('button');b.className='routeitem';
  // Titulo arriba y, debajo, los kilometros y el desnivel: eligiendo ruta en
  // el monte es lo primero que uno mira. Salen de rutas.json, el mismo sitio
  // que los titulos; si no estan, la fila se queda solo con el nombre.
  const txt=document.createElement('span');txt.className='ri-txt';
  const nom=document.createElement('span');nom.className='ri-name';nom.textContent=toName(t);txt.append(nom);
  if(datosDeRuta[t.href]){const km=document.createElement('span');km.className='ri-km';km.textContent=datosDeRuta[t.href];txt.append(km)}
  b.append(txt);
  const mark=document.createElement('span');mark.textContent=i===chosen?'Seleccionada':'Ver';b.append(mark);b.onclick=()=>selectRoute(i);list.append(b);
 });
 if(!n)list.textContent=routeListScope==='near'?'No hay ninguna ruta cerca de ti':'Sin coincidencias';
}
document.querySelectorAll('#routeListScope button').forEach(b=>b.onclick=()=>{
 routeListScope=b.dataset.scope;
 syncScopeMap();
 if(routeListScope==='near'){
  const cached=position||quickNativePosition();
  if(cached){applyNearbyPosition(cached)}else if(navigator.geolocation)navigator.geolocation.getCurrentPosition(p=>{if(routeListScope!=='near')return;position=[p.coords.latitude,p.coords.longitude];applyNearbyPosition(position);syncScopeMap();showRoutes()},warnGps,{enableHighAccuracy:true,timeout:12000,maximumAge:5000});else warnGps();
 }
 showRoutes();
});
$('choose').onclick=()=>{$('routeDialog').classList.remove('hidden');showRoutes()};$('closeDialog').onclick=()=>$('routeDialog').classList.add('hidden');$('search').oninput=showRoutes;
function changeMode(m){
 if(m!=='create'){cancelaMapaGps();$('saveCreated').disabled=drawPoints.length<2}

 const creating=m==='create';
 const actions=$('createActions'),profile=$('elevationPanel'),modes=document.querySelector('.modes');
 if(creating){$('map').appendChild(actions);$('map').appendChild(modes)}else{document.querySelector('footer.bottom').prepend(modes);modes.after(actions)}
 if(creating)$('map').appendChild(profile);else document.querySelector('footer.bottom').before(profile);
 document.body.classList.toggle('creating-route',creating);
 if(m==='create'&&junctionActive>=0)resetJunctionView();mode=m;for(const [key,b] of [['nav','modeNav'],['create','modeCreate']])$(b).setAttribute('aria-pressed',String(m===key));
 // Dos pestanas, no tres. «Grabacion» era un modo aparte y no lo es: el
 // servicio navega y graba a la vez desde siempre, y desde que la guia
 // funciona tambien grabando lo unico que separaba a «Navegar» de
 // «Grabacion» era que fila de botones se veia. Lo dijo el autor: «si abro
 // ruta o cargo ruta, con dar grabacion y yo me mueva ya estaria
 // navegando». Asi que en «Ruta» se ven las dos filas y el unico modo de
 // verdad que queda es «Crear», que cambia la pantalla entera.
 $('navActions').classList.toggle('hidden',m!=='nav'||!enLaApp);

 $('recordActions').classList.toggle('hidden',m!=='nav'||!enLaApp);
 $('soloApp').classList.toggle('hidden',enLaApp||m!=='nav');
 if(m==='create'&&!calculandoMapaGps)estadoMapaGps('');$('createActions').classList.toggle('hidden',m!=='create');$('drawTip').hidden=m!=='create';if(m==='create')cargaCaminosOsm();   // para poder calcular sin cobertura
 if(m==='create'&&!redGps){notice('Preparando caminos y alturas…');fetch('data/alturas.json',{cache:'no-cache'}).then(r=>r.ok?r.json():null).catch(()=>null).then(alt=>{alturasGps=alt;if(!anclasGps.length&&!calculandoMapaGps)redGps=construyeRed(tracks,alturasGps);notice(alt?'Red y desniveles disponibles. Marca el inicio.':'Red lista; no se han podido cargar las alturas.');}).catch(()=>notice('No se pudo preparar la red.'))}notice(m==='create'?'Marca puntos sobre las rutas. En un cruce, elige la bolita azul de continuación':routePoints.length>1?(guiaIniciada()?'Siguiendo la ruta seleccionada':'Ruta cargada · pulsa Empezar'):'Elige una ruta para empezar a navegar');map.closePopup();updateElevation();setTimeout(()=>map.invalidateSize(),60)}
$('modeNav').onclick=()=>changeMode('nav');$('modeCreate').onclick=()=>changeMode('create');$('crearDesdeRuta').onclick=()=>changeMode('create');
const CELDA_M=15,PASO_M=5,MAX_ENGANCHE_M=120,MARCA_LARGA=120,LAT0=43.2,KX=111320*Math.cos(LAT0*Math.PI/180);
let redGps=null,anclasGps=[],tramosGps=[],alturasGps=null,createdSavedItem=null;
// Los puntos manuales solo pertenecen al borrador: nunca se añaden a las
// conexiones ni a las cestas de la red pública de caminos.
// Se quedan declaradas -en el valor de «Caminos»- porque las miran el
// manejador del mapa y mueveAnclaGps; ya nadie las cambia.
let trazadoManual=false;
