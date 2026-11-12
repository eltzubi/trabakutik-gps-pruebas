// EN IPHONE NO HAY APLICACION, Y MANDAR A BAJARSELA ES UN CALLEJON SIN SALIDA:
// lo que hay en instalar.html es un APK de Android, y un iPhone no lo puede
// instalar -Apple solo deja instalar desde su tienda, y esto no esta ahi-.
// Asi que a un iPhone se le dice lo que SI puede hacer. Un iPad moderno se
// declara «Macintosh», y por eso se mira tambien si la pantalla es tactil.
const esApple=/iP(hone|od|ad)/.test(navigator.userAgent)||
  (/Mac/i.test(navigator.userAgent)&&navigator.maxTouchPoints>1);
if(!enLaApp){
 $('navActions').classList.add('hidden');$('recordActions').classList.add('hidden');
 $('soloApp').classList.remove('hidden');
 if(esApple){
  $('soloAppTitulo').textContent='En iPhone no hay aplicación';
  $('soloAppTexto').textContent='Los avisos con el móvil en el bolsillo los tiene que dar una aplicación, '+
   'y en iPhone solo se instalan desde el App Store: esta no está ahí. Aquí puedes ver el mapa y las rutas, '+
   'crear la tuya, bajarte el GPX y navegar con la pantalla encendida. Si añades esta página a la pantalla '+
   'de inicio —Compartir, «Añadir a pantalla de inicio»— se abre como una aplicación.';
  $('soloAppBaja').classList.add('hidden');
 }
}
$('audioMode').onclick=conmutaModoAudio;pintaModoAudio();pintaEstadoGps();$('locate').onclick=()=>{followGps=true;manualMapUntil=0;if(position){map.setView(position,Math.max(16,map.getZoom()),{animate:false});if(watch===null)startGPS()}else startGPS();window.trabakutikSyncNative?.();pintaMandos()};$('plus').onclick=()=>map.zoomIn();$('minus').onclick=()=>map.zoomOut();
// Esto solo sabia manejar TRANSICIONES: si el servicio no grababa y la pagina
// tampoco creia grabar, no entraba en ninguna rama y la botonera se quedaba
// como estuviera. El autor se encontro con «Pausar» y «Parar» puestos sin
// estar grabando y sin que apareciera «Iniciar»: sin salida. Esto reconcilia
// con la verdad en vez de confiar en haber visto todos los pasos.
// Un único inicio en la botonera: grabar activa también la navegación.
// Mantener oculto el antiguo acceso para que los sondeos no lo hagan reaparecer.
// El pie se esconde solo al arrancar la guia y vuelve al parar. En medio
// manda el boton: si lo abres a mano, se queda abierto hasta que lo cierres.
let guiandoAntes=false;
function pintaDespeja(){
 const b=$('despeja');if(!b)return;
 b.classList.toggle('hidden',!guiaIniciada());
 b.textContent=document.body.classList.contains('despejado')?'⌃ Mandos':'⌄ Ocultar';
}
function actualizaDespeje(){
 const ahora=guiaIniciada();
 if(ahora!==guiandoAntes){
  guiandoAntes=ahora;
  document.body.classList.toggle('despejado',ahora);
  try{map.invalidateSize()}catch(e){}
 }
 pintaDespeja();
}
function pintaBotonNavegar(){
 const b=$('navGo');if(b)b.classList.add('hidden');
 actualizaDespeje();
}
function reconciliaBotonera(){
 if(recording)return;
 const debe=recordingPendingSave?'stopped':'ready';
 if(estadoBotonera!==debe)recordingControls(debe);
}
function recordingControls(state){estadoBotonera=state;setTimeout(actualizaDespeje,0);document.body.classList.toggle('is-recording',state==='recording'||state==='paused');
 $('recordStart').classList.toggle('hidden',state!=='ready');
 $('recordPause').classList.toggle('hidden',state!=='recording');
 $('recordResume').classList.toggle('hidden',state!=='paused');
 $('recordStop').classList.toggle('hidden',state!=='recording'&&state!=='paused');
 $('saveRecording').classList.toggle('hidden',state!=='stopped');
 $('discardRecording').classList.toggle('hidden',state!=='stopped');
 $('saveRecording').disabled=state==='stopped'&&!window.TrabakutikAndroid&&recorded.length<2;
}
$('recordStart').onclick=()=>{
 // Una ruta recién guardada sigue dibujada como borrador. Si se pulsa
 // Grabar desde Ruta, activar esa copia guardada antes del servicio.
 if(routePoints.length<2&&createdSavedItem&&sameTrack(drawPoints,createdSavedItem.points))loadSaved(createdSavedItem);
 apagadoHasta=0;pausado=false;recordingPendingSave=false;enciendeNavegacionNativa();if(watch===null&&!fuenteNativa)startGPS(true);if(window.TrabakutikAndroid)window.TrabakutikAndroid.startRecording();recorded=[];lastBrowserRecordTime=0;lastBrowserRecordPoint=null;recording=true;if(recordLayer){map.removeLayer(recordLayer);recordLayer=null}recordingControls('recording');notice(routePoints.length>1?'Grabando y siguiendo · '+$('mapTitle').textContent:'Grabando · sin ruta activa para navegar')};
// En un circuito te cruzas con la salida varias veces, y parar por error
// deja la grabacion a medias. Si queda ruta por delante, se dice cuanta.
// La pausa detiene SOLO la grabacion. La ubicacion, los avisos de giro y el
// de fuera de ruta siguen: lo que se para es anotar puntos, no orientarte.
// Al reanudar se corta el trazo, para que el descanso no salga como una
// linea recta de un sitio a otro.
let pausado=false;
function pausaGrabacion(si){
 pausado=si;
 recordingControls(si?'paused':'recording');
 if(window.TrabakutikAndroid){
  try{
   if(si&&window.TrabakutikAndroid.pauseRecording)window.TrabakutikAndroid.pauseRecording();
   if(!si&&window.TrabakutikAndroid.resumeRecording)window.TrabakutikAndroid.resumeRecording();
  }catch(e){console.warn('Pausa nativa no disponible',e)}
 }else if(!si&&recorded.length&&recorded[recorded.length-1]!==null){
  recorded.push(null);lastBrowserRecordPoint=null;lastBrowserRecordTime=0;
 }
 notice(si?'Grabaci\u00f3n EN PAUSA \u00b7 la ubicaci\u00f3n y los avisos de giro siguen'
          :'Grabaci\u00f3n reanudada');
}
function avisoDeCortes(){
 if(cortesGrabacion<1)return '';
 return ' \u00b7 ATENCI\u00d3N: el track tiene '+cortesGrabacion+
  (cortesGrabacion===1?' corte':' cortes')+' por p\u00e9rdida de se\u00f1al';
}
function confirmaParar(){
 let falta='';
 if(routeCumulative.length>1&&Number.isFinite(ultimoAlong)){
  const total=routeCumulative[routeCumulative.length-1];
  const hecho=Math.max(0,Math.min(total,sentidoRuta>0?ultimoAlong:total-ultimoAlong));
  const queda=total-hecho;
  if(queda>300)falta='\n\nTe faltan '+fmt(queda)+' de la ruta.';
 }
 return confirm('\u00bfFinalizar la grabaci\u00f3n y la navegaci\u00f3n?'+falta);
}
$('recordPause').onclick=()=>pausaGrabacion(true);
$('recordResume').onclick=()=>pausaGrabacion(false);
// LO QUE HA GASTADO LA SALIDA. El servicio lo apunta mientras graba y escribe
// el resumen al cerrar el GPX, asi que aqui solo se pregunta; el cierre tarda
// un instante y por eso se insiste unos segundos. Sin aplicacion no hay nada
// que preguntar: en un navegador no se puede leer la bateria del telefono.
function pideGasto(texto,intentos){
 const puente=window.TrabakutikAndroid;
 if(!puente||!puente.gastoBateria)return;
 let gasto='';try{gasto=puente.gastoBateria()||''}catch(e){gasto=''}
 if(gasto){notice(texto+' · '+gasto);return}
 if(intentos>0)setTimeout(()=>pideGasto(texto,intentos-1),700);
}
$('recordStop').onclick=()=>{if(!confirmaParar())return;pausado=false;if(window.TrabakutikAndroid)window.TrabakutikAndroid.stopRecording();apagaGps();recording=false;recordingPendingSave=true;recordingControls('stopped');const fin=(window.TrabakutikAndroid?'Salida finalizada · Guardar GPX o Descartar':recorded.length<2?'Salida finalizada · faltan 2 posiciones para guardar GPX':'Salida finalizada · Guardar GPX o Descartar')+avisoDeCortes();notice(fin);pideGasto(fin,9)};
$('saveRecording').onclick=()=>{
 if(!nativeTrackComplete&&window.TrabakutikAndroid?.saveRecording){
  window.TrabakutikAndroid.saveRecording();
  notice('Elige dónde guardar el GPX completo; la pantalla solo muestra el tramo final.');
  return;
 }
 if(recorded.filter(p=>p!==null).length<2){notice('No hay suficientes posiciones para guardar. Puedes descartar la grabación.');return}
 const def='Grabación '+new Date().toLocaleDateString('es-ES')+' '+new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
 const name=prompt('Nombre para la grabación',def);
 if(name===null)return;
 openSaveDialog(recorded,name.trim()||def,'recording');
};
// Al terminar o descartar se apaga el GPS del todo. Antes nadie llamaba a clearWatch,
// asi que el telefono seguia pidiendo posicion con la salida terminada y
// la aplicacion se comportaba como si siguieras navegando. Se van la
// flecha azul, las indicaciones de giro y el aviso de fuera de ruta, y se
// para tambien el servicio de Android. La ruta elegida se queda dibujada
// en el mapa, que para eso la elegiste; con el boton de centrar vuelve a
// encenderse el GPS cuando quieras.
function apagaGps(){
 // Bloquear primero las posiciones y sondeos que ya estaban pendientes.
 gpsApagadoPorTi=true;navegaNativo=false;giraNativo=false;
 try{window.speechSynthesis?.cancel()}catch(e){}
 if(audio){try{audio.close().catch(()=>{})}catch(e){}audio=null}
 if(watch!==null){navigator.geolocation.clearWatch(watch);watch=null}
 try{if(window.TrabakutikAndroid?.stopNavigation)window.TrabakutikAndroid.stopNavigation()}
 catch(e){console.warn('No se pudo parar la navegación nativa',e)}
 if(junctionActive>=0)resetJunctionView();
 resetOffRoute();
 if(me){map.removeLayer(me);me=null}
 position=null;lastCourse=null;courseFix=null;ultimoFix=0;refParado=null;refParadoT=0;sinGpsAvisado=false;
 // El servicio tarda un momento en pararse de verdad. Sin esta tregua el
 // sondeo lo vería aún activo y volvería a encender la flecha recién apagada.
 fuenteNativa=false;ultimoTiempoNativo=0;apagadoHasta=Date.now()+8000;
 followGps=true;manualMapUntil=0;
 rumboSuave=null;rumboMapa=null;anguloFlecha=null;
 pintaBrujula(null);aplicaGiroMapa(true);
 // Lo has apagado TU. El vigilante de abajo no debe ponerse a anunciar que
 // busca señal: no la busca nadie. Antes lo hacia, y a los cinco segundos
 // «GPS apagado» se convertia en «Sin posicion reciente del GPS · buscando
 // señal», que es mentira y ademas asusta.
 gpsApagadoPorTi=true;
 gpsSolicitado=false;
 fixVisualGps=null;ubicacionVisualGps=null;pintaEstadoGps();
 $('distance').textContent='GPS apagado';
 pintaBotonNavegar();
}
$('discardRecording').onclick=()=>{
 if(!confirm('¿Descartar esta grabación? Se borrará el recorrido sin guardarlo y se apagará el GPS.'))return;
 if(window.TrabakutikAndroid)window.TrabakutikAndroid.discardRecording();
 recording=false;recordingPendingSave=false;recorded=[];
 if(recordLayer){map.removeLayer(recordLayer);recordLayer=null}
 recordingControls('ready');
 apagaGps();
 notice('Grabación descartada · GPS apagado');
};
window.trabakutikNativeGpxSaved=()=>{
 if(!recording){
  finishRecording();notice('GPX guardado en el móvil · navegación detenida');
 }
};
window.addEventListener('beforeunload',e=>{if(recording||recordingPendingSave||(drawPoints.length>1&&!createdSavedItem)){e.preventDefault();e.returnValue=''}});
// 'no-cache' no quiere decir que no se guarde: quiere decir que antes de
// usar lo guardado se le pregunta al servidor. GitHub Pages manda
// max-age=600, asi que durante diez minutos el WebView daba por buena la
// copia vieja sin preguntar, y la lista seguia enseñando rutas de antes
// aunque la pagina ya fuera la nueva. Con esto, si no ha cambiado nada el
// servidor contesta 304 y no se descarga ni un byte; si ha cambiado, llega
// lo nuevo. Importa sobre todo en trailhead.json, que son 500 kB.
fetch('data/rutas.json',{cache:'no-cache'}).then(r=>r.json()).then(d=>{
 const es=d.es||{};
 for(const k in es) if(es[k]&&es[k].h){ if(es[k].n)nombresDeRuta[es[k].h]=es[k].n; if(es[k].s)datosDeRuta[es[k].h]=es[k].s; }
 // Puede llegar despues de que se haya pintado algo: se repinta.
 if(chosen>=0&&tracks[chosen]){$('title').textContent=toName(tracks[chosen]);setRouteTitle(toName(tracks[chosen]),tracks[chosen].href)}
 updateElevation();
 if(!$('routeDialog').classList.contains('hidden'))showRoutes();
}).catch(e=>console.warn('No se han podido cargar los nombres de las rutas',e));
fetchRouteJson('data/trailhead.json',{cache:'no-cache'}).then(data=>{tracks=data.tracks.filter(t=>t.points?.length>1);const slug=new URLSearchParams(location.search).get('ruta');const n=slug?tracks.findIndex(t=>t.href.replace(/\.html$/,'')===slug.replace(/\.html$/,'')):-1;if(n>=0)selectRoute(n);else{drawAll();map.setView([43.19,-2.55],12);notice('Elige una ruta, o pulsa Empezar para solo grabar por donde vas')} rutasListas=true; }).catch(e=>notice('No se han podido cargar las rutas: '+e.message));
// Guardar la pagina en el movil para poder abrirla SIN COBERTURA. Ver sw.js.
// La aplicacion de Android no lleva la pagina dentro: la carga de GitHub
// Pages y ademas con la cache del WebView desactivada, asi que sin esto, en
// el monte y sin red, abrir la app de cero no daba nada.
// Tocar el panel no cierra; tocar su fondo equivale a la X.
for(const [id,close] of [['routeDialog',()=>$('closeDialog').click()],['savedDialog',()=>$('closeSaved').click()],['saveDialog',closeSaveDialog]]){
 $(id).addEventListener('click',e=>{if(e.target===$(id))close()});
}
document.addEventListener('keydown',e=>{
 if(e.key!=='Escape')return;
 for(const id of ['closeSave','closeSaved','closeDialog']){
  const button=$(id);if(!button.closest('.popup').classList.contains('hidden')){button.click();break}
 }
});

if('serviceWorker' in navigator){
 addEventListener('load',()=>{
  navigator.serviceWorker.register('sw.js')
   .catch(e=>console.warn('Sin copia guardada para usar sin cobertura',e));
 });
}
// ====================== EL MAPA, GUARDADO PARA EL MONTE =====================
// El service worker ya guardaba las teselas QUE MIRAS, hasta 900. Eso sirve si
// antes de salir te acuerdas de repasar la ruta entera a mano, zoom a zoom; si
// no, en el km 12 el track va sobre fondo blanco. Esto baja de una vez el
// pasillo de teselas de toda la ruta.
//
// SOLO DEL IGN. No es pereza: la politica de teselas de OpenStreetMap dice
// literalmente «Offline use is not permitted on tile.openstreetmap.org» y
// prohibe «pre-emptive fetching of tiles other than those a user is actively
// viewing»; OpenTopoMap no dice nada del asunto y pide no cargarles el
// servidor. El IGN, en cambio, publica sus productos Y SUS SERVICIOS con
// licencia CC-BY 4.0 -Orden FOM/2807/2015-, que permite reproducirlos citando
// el origen, y ese credito ya sale al pie del mapa.
//
// Hasta el zoom 17 y no mas: el mapa-raster del IGN no tiene teselas propias
// por encima (maxNativeZoom 17), asi que el 18 seria la del 17 ampliada y
// costaria el doble que todo lo demas junto. Medido en galdaramiño, 36,6 km:
// z13 26 teselas, z14 43, z15 96, z16 225, z17 488; 878 en total, unos 13 MB.
const MAPA_Z_MIN=13,MAPA_Z_MAX=17,MAPA_MARGEN=1,MAPA_A_LA_VEZ=4;
const MAPA_CACHE='mapas-gps-1';
const CAPAS_GUARDABLES={ign:'IGN',pnoa:'satélite'};
let bajadaMapa=null;

// El pasillo de teselas de una ruta: las que pisa el track y MAPA_MARGEN
// alrededor, en cada zoom.
function teselasDeRuta(puntos,zMin,zMax,margen){
 const out=[];
 if(!Array.isArray(puntos)||puntos.length<2)return out;
 for(let z=zMin;z<=zMax;z++){
  const n=Math.pow(2,z),vistas=new Set();
  const mete=(x,y)=>{
   for(let a=-margen;a<=margen;a++)for(let b=-margen;b<=margen;b++){
    const X=x+a,Y=y+b;
    if(X<0||Y<0||X>=n||Y>=n)continue;
    const k=X+'/'+Y;
    if(!vistas.has(k)){vistas.add(k);out.push({z,x:X,y:Y})}
   }
  };
  let prev=null;
  for(const p of puntos){
   const lat=p[0]*Math.PI/180;
   const x=Math.floor((p[1]+180)/360*n);
   const y=Math.floor((1-Math.log(Math.tan(lat)+1/Math.cos(lat))/Math.PI)/2*n);
   // Dos puntos seguidos del track pueden caer a varias teselas de distancia
   // -una recta larga de la copia simplificada-: sin rellenar el hueco, el
   // pasillo saldria con agujeros justo en los zooms altos.
   if(prev&&(Math.abs(x-prev[0])>1||Math.abs(y-prev[1])>1)){
    const pasos=Math.max(Math.abs(x-prev[0]),Math.abs(y-prev[1]));
    for(let k=1;k<pasos;k++)mete(Math.round(prev[0]+(x-prev[0])*k/pasos),
                                 Math.round(prev[1]+(y-prev[1])*k/pasos));
   }
   mete(x,y);prev=[x,y];
  }
 }
 return out;
}
// La URL de una tesela sale de la propia capa de Leaflet: repetir aqui las
// direcciones del IGN seria tener dos sitios donde equivocarse.
function urlTesela(clave,t){
 const capa=baseMaps[clave];
 if(!capa||!capa._url)return null;
 return L.Util.template(capa._url,{z:t.z,x:t.x,y:t.y,s:'a',r:''});
}
function cacheDeMapas(){
 return caches.keys().then(ks=>caches.open(ks.find(k=>k.indexOf('mapas-')===0)||MAPA_CACHE));
}
function mapaGuardadoInfo(){
 if(!('caches' in window))return Promise.resolve({teselas:0,bytes:0});
 return cacheDeMapas().then(c=>c.keys().then(ks=>{
  // El tamaño se estima: pedir cada respuesta para leer su content-length son
  // casi mil lecturas y esto se pinta al abrir el dialogo. Las del IGN pesan
  // entre 10 y 23 KB segun el zoom; 16 es la media medida.
  return {teselas:ks.length,bytes:ks.length*16000};
 })).catch(()=>({teselas:0,bytes:0}));
}
function borraMapaGuardado(){
 return caches.keys().then(ks=>Promise.all(
  ks.filter(k=>k.indexOf('mapas-')===0).map(k=>caches.delete(k))));
}
function guardaMapaRuta(clave,puntos,alPaso){
 const lista=teselasDeRuta(puntos,MAPA_Z_MIN,MAPA_Z_MAX,MAPA_MARGEN);
 const estado={total:lista.length,hechas:0,fallos:0,cancelada:false};
 bajadaMapa=estado;
 return cacheDeMapas().then(c=>{
  let i=0;
  // Cuatro a la vez y no mas: es lo que piden los servidores de teselas que
  // publican un limite, y al IGN no hay por que tratarlo peor.
  const obrero=()=>{
   if(i>=lista.length||estado.cancelada)return Promise.resolve();
   const t=lista[i++],url=urlTesela(clave,t);
   if(!url){estado.fallos++;return obrero()}
   return c.match(url).then(ya=>{
    if(ya){estado.hechas++;return}
    return fetch(url,{cache:'no-store'}).then(r=>{
     if(r&&r.ok)return c.put(url,r.clone()).then(()=>{estado.hechas++});
     estado.fallos++;
    });
   }).catch(e=>{
    // Sin sitio en el telefono no es lo mismo que sin cobertura, y el aviso
    // tiene que decir cual de las dos es: lo que se hace es distinto.
    if(e&&(e.name==='QuotaExceededError'||/quota/i.test(e.message||'')))estado.sinSitio=true;
    estado.fallos++;
   }).then(()=>{alPaso(estado);return obrero()});
  };
  const equipo=[];
  for(let k=0;k<MAPA_A_LA_VEZ;k++)equipo.push(obrero());
  return Promise.all(equipo);
 }).then(()=>{bajadaMapa=null;return estado})
   .catch(e=>{bajadaMapa=null;estado.error=e;return estado});
}
function puntosDelMapa(){
 if(routePoints.length>1)return routePoints;
 if(drawPoints.length>1)return drawPoints;
 return null;
}
function pintaBotonMapa(){
 const b=$('guardaMapa');if(!b)return;
 b.disabled=!puntosDelMapa();
 b.classList.toggle('tiene',hayMapaGuardado);
 b.title=b.disabled?'Carga una ruta para poder guardar su mapa'
   :'Guardar el mapa de esta ruta para andar sin cobertura';
}
function pintaDialogoMapa(){
 const puntos=puntosDelMapa(),clave=$('basemap').value;
 const guardable=!!CAPAS_GUARDABLES[clave];
 const lista=puntos?teselasDeRuta(puntos,MAPA_Z_MIN,MAPA_Z_MAX,MAPA_MARGEN):[];
 $('mapaTexto').innerHTML=!puntos
  ?'Primero elige una ruta: lo que se guarda es el pasillo de mapa por donde pasa.'
  :!guardable
  ?'El mapa <b>'+(($('basemap').selectedOptions[0]||{}).text||'')+'</b> no se puede guardar. '
   +'Cambia a <b>IGN</b> o a <b>Sat.</b> en el selector de al lado y vuelve a entrar aquí.'
  :'Se guardarán <b>'+lista.length+'</b> trozos de mapa <b>'+CAPAS_GUARDABLES[clave]
   +'</b> a lo largo de la ruta, hasta el zoom '+MAPA_Z_MAX+'. '
   +'Ocupan unos <b>'+Math.max(1,Math.round(lista.length*16/1024))+' MB</b> y se bajan una vez.';
 $('mapaBajar').disabled=!puntos||!guardable;
 mapaGuardadoInfo().then(info=>{
  hayMapaGuardado=info.teselas>0;
  pintaBotonMapa();
  $('mapaGuardadoYa').textContent=info.teselas
   ?'Ya tienes guardados '+info.teselas+' trozos de mapa, unos '
     +Math.max(1,Math.round(info.bytes/1048576))+' MB.'
   :'Ahora mismo no hay ningún mapa guardado.';
  $('mapaBorrar').disabled=!info.teselas;
 });
}
function abreDialogoMapa(){pintaDialogoMapa();$('mapaDialog').classList.remove('hidden')}
if($('guardaMapa'))$('guardaMapa').onclick=abreDialogoMapa;
if($('closeMapa'))$('closeMapa').onclick=()=>$('mapaDialog').classList.add('hidden');
if($('mapaBorrar'))$('mapaBorrar').onclick=()=>{
 if(!confirm('¿Borrar los mapas guardados en el teléfono?'))return;
 borraMapaGuardado().then(()=>{hayMapaGuardado=false;pintaDialogoMapa();
  changeBase($('basemap').value);notice('Mapas guardados borrados')});
};
if($('mapaParar'))$('mapaParar').onclick=()=>{if(bajadaMapa)bajadaMapa.cancelada=true};
if($('mapaBajar'))$('mapaBajar').onclick=()=>{
 const puntos=puntosDelMapa(),clave=$('basemap').value;
 if(!puntos||!CAPAS_GUARDABLES[clave])return;
 const barra=$('mapaBarra'),relleno=barra.querySelector('i');
 barra.classList.remove('hidden');
 $('mapaBajar').classList.add('hidden');$('mapaParar').classList.remove('hidden');
 $('mapaBorrar').disabled=true;
 const pinta=e=>{
  const hechas=e.hechas+e.fallos;
  relleno.style.width=Math.round(hechas*100/Math.max(1,e.total))+'%';
  $('mapaTexto').innerHTML='Guardando… <b>'+hechas+'</b> de '+e.total;
 };
 guardaMapaRuta(clave,puntos,pinta).then(e=>{
  $('mapaBajar').classList.remove('hidden');$('mapaParar').classList.add('hidden');
  barra.classList.add('hidden');relleno.style.width='0';
  hayMapaGuardado=e.hechas>0;
  if(e.cancelada)notice('Descarga del mapa parada · lo bajado se queda guardado');
  else if(e.sinSitio)notice('No cabe el mapa entero · libera espacio en el teléfono o borra lo guardado');
  else if(e.fallos)notice('Mapa guardado con '+e.fallos+' trozos sin bajar · repítelo con mejor cobertura');
  else notice('Mapa de la ruta guardado · ya funciona sin cobertura');
  changeBase(clave);
  pintaDialogoMapa();
 });
};
mapaGuardadoInfo().then(info=>{
 hayMapaGuardado=info.teselas>0;pintaBotonMapa();
 if(hayMapaGuardado)changeBase($('basemap').value);
});
pintaBotonMapa();
})();

