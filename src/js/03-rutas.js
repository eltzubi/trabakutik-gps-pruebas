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
// Las fichas de estas rutas figuran en las dos actividades de Trabakutik.
const rutasMixtas=new Set(['muniozguren.html','iruzubieta.html','urregarai.html']);
function coincideActividad(ruta,actividad){
 return actividad==='all'||rutasMixtas.has(ruta.href)||
  ruta.color===(actividad==='bici'?'teal':'violet');
}
function indicesCercanos(actividad='all'){
 if(!nearbyOnly||!nearbyOrigin||!tracks.length)return [];
 const dentro=tracks.map((t,i)=>i).filter(i=>coincideActividad(tracks[i],actividad)&&dentroDeCerca(i));
 dentro.sort((a,b)=>distanciaCerca(a)-distanciaCerca(b)||routeLength(a)-routeLength(b));
 return dentro.slice(0,nearbyMaximo);
}
function recalculaCerca(){
 nearbyCercanas=new Set(indicesCercanos());
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
function calculaFlechasRuta(puntos,proyectados,giros,sentido){
 const metros=[0];
 for(let i=1;i<puntos.length;i++)metros.push(metros[i-1]+dist(puntos[i-1],puntos[i]));
 const total=metros[metros.length-1];
 function puntoEn(m){
  let izq=0,der=metros.length-1;
  while(izq+1<der){
   const mitad=(izq+der)>>1;
   if(metros[mitad]<=m)izq=mitad;else der=mitad;
  }
  const a=puntos[izq],b=puntos[der],largo=metros[der]-metros[izq];
  const t=largo?(m-metros[izq])/largo:0;
  return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
 }
 const zonas=[];
 for(const giro of giros.filter(Number.isFinite).sort((a,b)=>a-b)){
  const zona=zonas[zonas.length-1];
  // Dos cruces a 30 m o menos comparten la misma zona limpia.
  if(zona&&giro-15<=zona[1])zona[1]=giro+15;
  else zonas.push([giro-15,giro+15]);
 }
 const flechas=[],celdas=new Map(),distanciaEntreFlechas=22;
 let siguiente=50,recorrido=0,exclusion=0;
 for(let i=1;i<puntos.length;i++){
  const a=proyectados[i-1],b=proyectados[i],paso=Math.hypot(b.x-a.x,b.y-a.y);
  if(!paso)continue;
  for(;siguiente<=recorrido+paso;siguiente+=100){
   const t=(siguiente-recorrido)/paso,m=metros[i-1]+t*(metros[i]-metros[i-1]);
   while(exclusion<zonas.length&&m>zonas[exclusion][1])exclusion++;
   if(exclusion<zonas.length&&m>=zonas[exclusion][0])continue;
   const antes=puntoEn(Math.max(0,m-8)),despues=puntoEn(Math.min(total,m+8));
   if(dist(antes,despues)<3)continue; // la tangente no es fiable en una vuelta muy cerrada
   const angulo=(bearingBetween(antes,despues)+(sentido<0?180:0))%360;
   const x=a.x+t*(b.x-a.x),y=a.y+t*(b.y-a.y);
   const col=Math.floor(x/distanciaEntreFlechas),fila=Math.floor(y/distanciaEntreFlechas);
   const flecha={punto:puntoEn(m),angulo,x,y,m,oculta:false};
   for(let c=col-1;c<=col+1;c++)for(let f=fila-1;f<=fila+1;f++){
    for(const otra of celdas.get(c+','+f)||[]){
     if(Math.hypot(x-otra.x,y-otra.y)>distanciaEntreFlechas)continue;
     flecha.oculta=true;
     if(Math.abs((angulo-otra.angulo+540)%360-180)>105)otra.oculta=true;
    }
   }
   const clave=col+','+fila;
   if(!celdas.has(clave))celdas.set(clave,[]);
   celdas.get(clave).push(flecha);
   flechas.push(flecha);
  }
  recorrido+=paso;
 }
 return flechas.filter(f=>!f.oculta);
}
let ubicacionesFlechas=null,zonaFlechas=null;
function updateDirectionArrows(reutiliza=false){
 const zoom=map.getZoom();
 if(routePoints.length<2||zoom<13){
  directionArrows.clearLayers();ubicacionesFlechas=null;zonaFlechas=null;return;
 }
 const vista=map.getBounds();
 if(reutiliza&&zonaFlechas?.contains(vista))return;
 directionArrows.clearLayers();
 if(!reutiliza||!ubicacionesFlechas){
  const giros=(sentidoRuta<0?junctionsReves||junctions:junctions).map(g=>g.along);
  ubicacionesFlechas=calculaFlechasRuta(routePoints,routePoints.map(p=>map.project(p,zoom)),giros,sentidoRuta);
 }
 zonaFlechas=vista.pad(.25);
 for(const {punto,angulo} of ubicacionesFlechas){
  if(!zonaFlechas.contains(punto))continue;
  const icon=L.divIcon({className:'',iconSize:[18,22],iconAnchor:[9,11],html:'<div class="flecha-sentido" style="transform:rotate('+angulo+'deg)"><svg width="18" height="22" viewBox="0 0 18 22" aria-hidden="true"><path d="M9 2L16 19L9 15L2 19Z" fill="#ffffff" stroke="#071822" stroke-width="2.4" stroke-linejoin="round"/></svg></div>'});
  L.marker(punto,{icon,interactive:false,keyboard:false,zIndexOffset:450}).addTo(directionArrows);
 }
}
map.on('zoomend',()=>updateDirectionArrows());
map.on('moveend',()=>updateDirectionArrows(true));
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
// EL NOMBRE DEL PANEL DE ABAJO TAMBIEN ABRE LA FICHA (16 nov 2026). El
// autor: «al pulsar en los titulos de las rutas, si estan en la web, deberian
// mandar a la pagina de su ruta». En marcha la ficha de arriba esconde su
// titulo y el unico nombre a la vista es el de abajo. Hace lo mismo que el de
// arriba; sin ficha publicada (ruta propia, GPX), no hace nada.
if($('tripRuta')){
 const abre=()=>{if(!$('mapTitle').disabled)$('mapTitle').click()};
 $('tripRuta').onclick=abre;
 $('tripRuta').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();abre()}};
}
function haloRutaActiva(base){
 return base==='pnoa'?'#ffffff':'#071822';
}
function verdeSenderismo(base){
 return base==='pnoa'?'#76ff03':'#2ecc71';
}
function trazoRutaActiva(puntos){
 const estilo={pane:'rutaActiva',opacity:1,interactive:false,lineCap:'round',lineJoin:'round'};
 return L.featureGroup([
  L.polyline(puntos,{...estilo,color:haloRutaActiva($('basemap')?.value),weight:9}),
  L.polyline(puntos,{...estilo,color:'#00e5ff',weight:6})
 ]);
}
function actividadVisible(t){
 return rutasMixtas.has(t.href)?'Mixta':t.color==='teal'?'E-bike':'Senderismo';
}
function trazoRutaDeFondo(t,puntos){
 const actividad=actividadVisible(t),verde=verdeSenderismo($('basemap')?.value);
 const estilo={pane:'rutasDeFondo',weight:3,interactive:false,lineCap:'round',lineJoin:'round'};
 if(actividad==='Senderismo')return L.featureGroup([L.polyline(puntos,{...estilo,color:verde,dashArray:'6 5'})]);
 const naranja=L.polyline(puntos,{...estilo,color:'#ff8c00'});
 if(actividad==='E-bike')return L.featureGroup([naranja]);
 return L.featureGroup([naranja,L.polyline(puntos,{...estilo,color:verde,dashArray:'6 7'})]);
}
function getTrackLayer(i){
 if(!layers[i]&&tracks[i]){
  const puntos=tracks[i].points.map(p=>[p[0],p[1]]);
  layers[i]=i===chosen?trazoRutaActiva(puntos):trazoRutaDeFondo(tracks[i],puntos);
 }
 return layers[i];
}
function refreshRouteLayers(){
 const muestraFondo=otherTracksVisible&&routeListScope!=='current';
 $('backgroundRouteLegend')?.classList.toggle('hidden',!muestraFondo);
 tracks.forEach((t,i)=>{
  const show=i===chosen||(muestraFondo&&(!nearbyOnly||nearTrack(i)));
  if(show){const layer=getTrackLayer(i);if(layer&&!map.hasLayer(layer))layer.addTo(map);}
  else if(layers[i]){map.removeLayer(layers[i]);layers[i]=null;}
 });
 if(chosen>=0&&layers[chosen])layers[chosen].bringToFront();
 if(savedLine)savedLine.bringToFront();
}
map.on('fondoCambiado',({key})=>{
 const activa=savedLine||layers[chosen];
 activa?.getLayers()[0]?.setStyle({color:haloRutaActiva(key)});
 layers.forEach((layer,i)=>{
  if(!layer||i===chosen)return;
  const actividad=actividadVisible(tracks[i]);
  if(actividad!=='E-bike'){
   const lineas=layer.getLayers();
   lineas[lineas.length-1].setStyle({color:verdeSenderismo(key)});
  }
 });
});
function drawAll(){
 layers.forEach(l=>{if(l)map.removeLayer(l)});layers=[];
 refreshRouteLayers();
 if(chosen>=0){
  map.fitBounds(layers[chosen].getBounds(),{padding:[35,35]});
  $('title').textContent=toName(tracks[chosen]);
  setRouteTitle(toName(tracks[chosen]),tracks[chosen].href);
  $('distance').textContent='Ruta activa en cian';
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
  layers[i]=trazoRutaActiva(detailedLine).addTo(map).bringToFront();
  // Y ahora sí: la fina manda también para medir. Se rehacen los cruces -que
  // recalculan routeCumulative- y se le manda al servicio.
  if(detailedLine.length<=12000){
   routePoints=detailedProfilePoints=detailedLine;pintaBotonMapa();
   ultimoAlong=ultimoPuntoAlong=null;alongPrevio=null;alongAcum=0;
   liveProfileAlong=null;liveNativeMetrics=null;faltaSubidaRuta=null;
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
   junctions=[];junctionsReves=null;
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
 hitosDeAviso=[];
 const request=++selectedRouteRequest;
 activeSavedId=null;$('clearActiveRoute').classList.remove('hidden');
 resetOffRoute(guiaIniciada()&&routePoints.length>1);resetJunctionView();junctionWarned.clear();junctionZoom=null;
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
  junctions=[];junctionsReves=null;
  try{syncNativeRoute()}catch(e){console.warn('Ruta no enviada',e)}
  computeJunctions();
  if(guiaIniciada())enciendeNavegacionNativa();
  aplicaCruces();
  notice('Ruta seleccionada · cargando detalle del Garmin');
  loadDetailedSelected(i,request);
 },60);
}
let routeListScope='all',actividadRutas='all';
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
 $('routeListActivity').classList.toggle('hidden',routeListScope==='current');
 document.querySelectorAll('#routeListActivity button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.activity===actividadRutas)));
 if(routeListScope==='near'&&!nearbyOrigin){list.textContent='Buscando tu posición GPS…';return}
 if(routeListScope==='current'&&chosen<0){list.textContent=routePoints.length>1?'Ruta propia activa: '+$('mapTitle').textContent:'No hay una ruta activa';return}
 let n=0;
 const indices=routeListScope==='near'?indicesCercanos(actividadRutas)
  :routeListScope==='current'?[chosen]:tracks.map((t,i)=>i).filter(i=>coincideActividad(tracks[i],actividadRutas));
 indices.forEach(i=>{
  const t=tracks[i];
  if(!sinTildes(toName(t)).includes(sinTildes(q)))return;
  n++;const b=document.createElement('button');b.className='routeitem';
  // Titulo arriba y, debajo, los kilometros y el desnivel: eligiendo ruta en
  // el monte es lo primero que uno mira. Salen de rutas.json, el mismo sitio
  // que los titulos; si no estan, la fila se queda solo con el nombre.
  const txt=document.createElement('span');txt.className='ri-txt';
  const nom=document.createElement('span');nom.className='ri-name';nom.textContent=toName(t);txt.append(nom);
  if(datosDeRuta[t.href]){const km=document.createElement('span');km.className='ri-km';km.textContent=datosDeRuta[t.href];txt.append(km)}
  const actividad=document.createElement('span');actividad.className='ri-km';actividad.textContent=actividadVisible(t);
  txt.append(actividad);
  if(routeListScope==='near'){
   const cerca=distanciaCerca(i);
   if(Number.isFinite(cerca)){
    const acceso=document.createElement('span');acceso.className='ri-km';
    acceso.textContent=fmt(cerca)+' hasta el trazado';
    txt.append(acceso);
   }
  }
  b.append(txt);
  const mark=document.createElement('span');mark.textContent=i===chosen?'Seleccionada':'Ver';b.append(mark);b.onclick=()=>selectRoute(i);list.append(b);
 });
 if(!n)list.textContent=routeListScope==='near'?'No hay ninguna ruta cerca de ti':'Sin coincidencias';
}
document.querySelectorAll('#routeListScope button').forEach(b=>b.onclick=()=>{
 routeListScope=b.dataset.scope;
 const cached=routeListScope==='near'?
  (fixVisualGps&&Date.now()-fixVisualGps.time<=120000&&fixVisualGps.accuracy<=150?position:quickNativePosition()):null;
 if(routeListScope==='near'&&!cached)nearbyOrigin=null;
 syncScopeMap();
 if(routeListScope==='near'){
  if(cached){applyNearbyPosition(cached)}else if(navigator.geolocation)navigator.geolocation.getCurrentPosition(p=>{if(routeListScope!=='near'||p.coords.accuracy>150)return;position=[p.coords.latitude,p.coords.longitude];applyNearbyPosition(position);syncScopeMap();showRoutes()},warnGps,{enableHighAccuracy:true,timeout:12000,maximumAge:5000});else warnGps();
 }
 showRoutes();
});
document.querySelectorAll('#routeListActivity button').forEach(b=>b.onclick=()=>{
 actividadRutas=b.dataset.activity;
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
