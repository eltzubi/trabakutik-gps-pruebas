// MAPA ORIENTADO AL RUMBO (rumbo arriba / course-up)
// ---------------------------------------------------------------------
// Lo pidio el autor: «quiero que el mapa siga el rumbo del gps siempre.
// Que no navege con mapa al reves», «que los caminos, carreteras y track
// vayan en la direccion que voy, porque si no no hay quien entienda el
// mapa». Komoot y Wikiloc hacen esto mismo y las dos dejan un boton de
// brujula para volver al norte fijo, asi que aqui tambien (boton de la
// flecha, arriba a la derecha).
//
// «Creo que el mapa no se vuelva loco»: ese es el peligro de verdad. El
// rumbo del GPS parado es ruido y giraria como una peonza. Dos defensas:
//   1. Sobre la ruta el rumbo NO sale del GPS, sale de la geometria del
//      camino corregida por el sentido en que lo haces (la misma h que
//      mueve la flecha azul). Eso no puede dar vueltas.
//   2. Fuera de la ruta solo se hace caso al rumbo del GPS por encima de
//      7 km/h, el mismo umbral que usa Komoot. Por debajo se MANTIENE el
//      ultimo rumbo bueno, asi que parado el mapa se queda quieto.
// Komoot por debajo de 7 km/h gira con el magnetometro; desde la pagina
// eso no es fiable, asi que ahi se mantiene el rumbo en vez de girar.
//
// Leaflet 1.9 no sabe girar el mapa, asi que gira el contenedor por CSS.
// Dos consecuencias que hay que atender a mano:
//   - El contenedor se hace un 42% mas grande que lo que se ve (el
//     cuadrado circunscrito) para que al girar no salgan esquinas vacias.
//     getSize() mira offsetWidth, que el transform no cambia, asi que
//     Leaflet pide las teselas del area grande y todo cuadra.
//   - Los toques llegan en coordenadas de pantalla y Leaflet las cree
//     coordenadas del contenedor. Con el mapa girado eso significa tocar
//     una linea y marcar otra, asi que se deshace el giro en
//     getMousePosition (lo usan los toques, el zoom y el pellizco).
// Arrastrar es lo unico que Leaflet calcula con restas de pantalla
// directas, sin pasar por ahi: por eso al empezar a arrastrar el mapa
// vuelve de golpe al norte y se comporta como siempre.
const GIRO_MINIMO=4;
let cursoArriba=true,rumboMapa=null,anguloMapa=0,ladoMapa=0;
try{cursoArriba=localStorage.getItem('trabakutik-curso-arriba')!=='no'}catch(e){}
const rotEl=document.getElementById('mapRot');
// OJO: NO vale parchear L.DomEvent.getMousePosition. Leaflet viene empaquetado
// de modulos ES y por dentro llama a la funcion local, no a la del objeto que
// exporta, asi que el parche ahi no lo ve nadie. Se comprobo midiendolo: 465 m
// de error al tocar con el mapa girado. El metodo del mapa SI se llama como
// metodo (this.mouseEventToContainerPoint) y por el pasan el clic, el toque,
// el pellizco y la deteccion de lineas sobre el canvas.
const puntoOriginal=L.Map.prototype.mouseEventToContainerPoint;
L.Map.prototype.mouseEventToContainerPoint=function(e){
 if(this._container!==rotEl||!anguloMapa||!Number.isFinite(e.clientX))
  return puntoOriginal.call(this,e);
 // El centro no se mueve al girar sobre el centro, asi que sirve de ancla.
 const r=rotEl.getBoundingClientRect(),a=-anguloMapa*R;
 const dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2);
 return new L.Point(dx*Math.cos(a)-dy*Math.sin(a)+rotEl.offsetWidth/2,
                    dx*Math.sin(a)+dy*Math.cos(a)+rotEl.offsetHeight/2);
};
function aplicaGiroMapa(deGolpe){
 const manual=Date.now()<manualMapUntil;
 const objetivo=(cursoArriba&&!manual&&mode!=='create'&&rumboMapa!==null)?-rumboMapa:0;
 const d=diferenciaRumbo(anguloMapa,objetivo);
 // Zona muerta: sin esto el mapa tiembla con cada correccion de un grado.
 if(Math.abs(d)<GIRO_MINIMO&&!deGolpe)return;
 anguloMapa+=d;
 if(deGolpe)rotEl.classList.add('sin-giro');
 rotEl.style.transform='rotate('+anguloMapa.toFixed(1)+'deg)';
 if(deGolpe){void rotEl.offsetWidth;rotEl.classList.remove('sin-giro')}
}
const map=L.map('mapRot',{zoomControl:false,preferCanvas:true,attributionControl:false}).setView([43.19,-2.55],12);
function dimensionaMapa(){
 const m=document.getElementById('map'),w=m.clientWidth,h=m.clientHeight;
 if(!w||!h)return;
 // Girado cualquier angulo, lo que se ve ocupa W|cos|+H|sin| de ancho, y en
 // el peor angulo eso es la DIAGONAL. Asi que el contenedor tiene que ser un
 // cuadrado de lado la diagonal o asoman esquinas vacias. Con 142% del ancho
 // no llegaba: 554 px para una diagonal de 711, y el autor vio los triangulos
 // negros en el movil yendo al noreste.
 const lado=Math.ceil(Math.hypot(w,h))+4;
 if(lado===ladoMapa)return;
 ladoMapa=lado;m.style.setProperty('--lado',lado+'px');
 try{map.invalidateSize({animate:false})}catch(e){}
}
function pintaMandos(){
 pintaBotonMapa();
 // Azul mientras el mapa te sigue de verdad; apagado si lo has arrastrado y
 // se ha quedado donde tu lo dejaste.
 // Dentro de la app NO hay watch: cuando el servicio toma el mando, la
 // pagina lo borra a proposito (fuenteNativa) para no pedir la posicion
 // dos veces. Mirar solo watch dejaba este boton apagado para siempre en
 // la app, con el mapa siguiendote delante. Lo vio el autor en su captura.
 // Lo que cuenta es que llegue posicion, venga de donde venga.
 $('locate').classList.toggle('siguiendo',(watch!==null||fuenteNativa)&&followGps&&Date.now()>=manualMapUntil);
}
function pintaOrient(){
 const on=cursoArriba;
 $('orient').setAttribute('aria-pressed',on?'true':'false');
 $('orient').setAttribute('aria-label',on?'Mapa orientado al rumbo: pasar a norte arriba':'Norte arriba: pasar a mapa orientado al rumbo');
 $('orient').title=on?'Orientado al rumbo':'Norte arriba';
 // El dibujo cambia tambien, no solo el color: flecha = rumbo, N = norte.
 $('orient').innerHTML=on
  ?'<svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 L16 20 L12 17 L8 20 Z"/></svg>'
  :'<svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 18V6l8 12V6"/></svg>';
}
map.on('dragstart',()=>{manualMapUntil=Date.now()+8000;aplicaGiroMapa(true);pintaMandos()});
dimensionaMapa();
if(window.ResizeObserver)new ResizeObserver(dimensionaMapa).observe(document.getElementById('map'));
else window.addEventListener('resize',dimensionaMapa);
const baseMaps={
 osm:L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}),
 ign:L.tileLayer('https://www.ign.es/wmts/mapa-raster?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=MTN&STYLE=default&FORMAT=image/jpeg&TILEMATRIXSET=GoogleMapsCompatible&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',{maxZoom:19,maxNativeZoom:17,attribution:'© Instituto Geográfico Nacional'}),
 pnoa:L.tileLayer('https://www.ign.es/wmts/pnoa-ma?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=OI.OrthoimageCoverage&STYLE=default&FORMAT=image/jpeg&TILEMATRIXSET=GoogleMapsCompatible&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',{maxZoom:19,attribution:'© IGN · PNOA'})
};
// Se declara aqui, con el mapa de fondo y no con el resto del mapa guardado,
// porque changeBase la lee y se llama unas lineas mas abajo: con un «let»
// mas tarde esa primera llamada reventaria por la zona muerta temporal.
let hayMapaGuardado=false;
let currentBase=null;
function changeBase(key){if(!baseMaps[key])key='osm';$('basemap').value=key;if(currentBase)map.removeLayer(currentBase);currentBase=baseMaps[key];currentBase.addTo(map);currentBase.bringToBack();$('mapCredit').textContent=(currentBase.options.attribution||'')+(hayMapaGuardado&&(key==='ign'||key==='pnoa')?' · guardado en el teléfono':(key==='ign'||key==='pnoa'?' · necesita conexión':''));try{localStorage.setItem('trabakutik-mapa-fondo',key)}catch(e){}}
// FUERA TOPO, EN EL NAVEGADOR. Era el unico fondo que juntaba las tres
// cosas: lo sirve un servidor de voluntarios, tarda el triple que los demas
// y -lo que de verdad lo descarta- NO SE PUEDE GUARDAR para andar sin
// cobertura, porque sus condiciones no lo permiten. Habia que llevarle hasta
// un apaño que se cambiaba solo a IGN cuando se caia. En el monte, un fondo
// que no puedes guardar no es un fondo. En la web sigue estando.
let initialBase='osm';try{initialBase=localStorage.getItem('trabakutik-mapa-fondo')||'osm'}catch(e){}
changeBase(initialBase);
pintaOrient();
$('orient').onclick=()=>{cursoArriba=!cursoArriba;pintaOrient();notice(!cursoArriba?'Mapa con el norte arriba':rumboMapa===null?'Mapa orientado al rumbo · girará en cuanto sepa hacia dónde vas':'Mapa orientado al rumbo');try{localStorage.setItem('trabakutik-curso-arriba',cursoArriba?'si':'no')}catch(e){}manualMapUntil=0;aplicaGiroMapa(true);pintaMandos()};
$('basemap').value=baseMaps[initialBase]?initialBase:'osm';$('basemap').onchange=e=>changeBase(e.target.value);
let nearbyOnly=false,nearbyOrigin=null,nearbyLast=null,nearbyCount=0,activeSavedId=null,tracks=[],layers=[],chosen=-1,mode='nav',watch=null,position=null,me=null,routePoints=[],drawPoints=[],drawSteps=[],drawMarks=[],drawLayer=null,recorded=[],recording=false,recordingPendingSave=false,recordLayer=null,audioModo="voz",junctionMarks=[],otherTracksVisible=false,alerted=false,farCount=0,onRouteSeen=false,farSince=0,audio=null,junctions=[],junctionWarned=new Set(),junctionZoom=null,junctionActive=-1,junctionBlocked=-1,junctionZoomOnce=new Set(),autoZooming=false,routeCumulative=[],turnMarker=null,crucesOsm=[];
const dist=(a,b)=>{const y=(a[0]-b[0])*R,x=(a[1]-b[1])*R;return 6371000*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(y/2)**2+Math.cos(a[0]*R)*Math.cos(b[0]*R)*Math.sin(x/2)**2)))};
const notice=t=>{$('status').textContent=t};

let avisadoPermiso=false,ultimoErrorGps=null,ultimoErrorGpsText='';
function warnGps(err){
 const denegado=err&&err.code===1;
 const ubicacionNoDisponible=err&&err.code===2;
 const text=denegado
  ?'Permiso de ubicación denegado. Activa la ubicación y concede permiso a Trabakutik GPS.'
  :ubicacionNoDisponible
   ?'No se recibe la ubicación. Comprueba que la ubicación del teléfono esté activada.'
   :'Sin señal GPS ahora mismo · seguimos intentándolo';
 ultimoErrorGps=err&&Number.isFinite(err.code)?err.code:null;
 ultimoErrorGpsText=err?text:'';
 errorVisualGps=ultimoErrorGps;pintaEstadoGps();
 notice(text);
 // Un alert() bloquea la pantalla y hay que tocarla para seguir. Saltaba
 // cada seis segundos, y bajo arbolado el GPS falla a ratos: ibas pedaleando
 // y el movil te pedia un toque cada seis segundos. Ahora solo si el permiso
 // esta denegado, que eso si hay que arreglarlo a mano, y una sola vez.
 if(denegado&&!avisadoPermiso){avisadoPermiso=true;alert(text)}
}

// Flecha de avance: usar rumbo GPS o calcularlo con dos posiciones fiables.
let navegaNativo=false;
let gpsApagadoPorTi=false;
let gpsSolicitado=false;
let ultimoFix=0,fuenteNativa=false,ultimoTiempoNativo=0,apagadoHasta=0,lastCourse=null,courseFix=null,followGps=true,manualMapUntil=0,lastNativeSync=0,lastNativeTrackVersion='',lastBrowserRecordTime=0,lastBrowserRecordPoint=null;
// Solo presentación: reutiliza las lecturas y los relojes existentes.
// No pide posiciones, no arranca servicios y no cambia los avisos.
let fixVisualGps=null,ubicacionVisualGps=null,errorVisualGps=null;
function estadoGpsVisual({solicitado,apagado,error,fix,ubicacion,ahora}){
 if(apagado||!solicitado)return {estado:'inactivo',texto:apagado?'GPS detenido':'GPS sin iniciar'};
 if(ubicacion===false)return {estado:'apagada',texto:'Ubicación apagada'};
 if(error===1)return {estado:'permiso',texto:'Sin permiso de ubicación'};
 if(error!==null)return {estado:'sin-senal',texto:'Sin señal GPS'};
 if(!fix)return {estado:'buscando',texto:'Buscando posición GPS'};
 // La edad sale de restar la hora que trae el GPS a la del telefono, y son
 // dos relojes distintos. Si el del movil va unas decimas por detras del
 // satelite, la resta sale NEGATIVA: eso no es falta de señal, es que los
 // relojes no coinciden, asi que una posicion «del futuro» cuenta como
 // recien llegada. Lo que si es un dato roto -y se trata como falta de
 // señal- es una edad que no sea un numero.
 const edad=ahora-fix.time;
 if(!Number.isFinite(edad)||edad>=25000)return {estado:'sin-senal',texto:'Sin señal GPS reciente'};
 if(edad>=12000)return {estado:'buscando',texto:'Buscando señal GPS'};
 const acc=fix.accuracy;
 if(!Number.isFinite(acc)||acc<0)return {estado:'impreciso',texto:'Posición · precisión desconocida'};
 return {estado:acc<=35?'recibiendo':'impreciso',texto:'Posición · ±'+Math.ceil(acc)+' m'};
}
function pintaEstadoGps(){
 const el=$('gpsState');if(!el)return;
 const estado=estadoGpsVisual({solicitado:gpsSolicitado||fuenteNativa||watch!==null,
  apagado:gpsApagadoPorTi,error:errorVisualGps,fix:fixVisualGps,
  ubicacion:ubicacionVisualGps,ahora:Date.now()});
 el.dataset.estado=estado.estado;
 if(el.textContent!==estado.texto)el.textContent=estado.texto;
 if(estado.estado==='sin-senal'||estado.estado==='apagada'||estado.estado==='permiso'){
  pintaBrujula(null);
  if(me)me.getElement()?.querySelector('.gps-course path')?.style.setProperty('visibility','hidden');
  rumboSuave=null;lastCourse=null;courseFix=null;rumboMapa=null;
 }
}
function bearingBetween(a,b){const lat1=a[0]*R,lat2=b[0]*R,dlon=(b[1]-a[1])*R;const y=Math.sin(dlon)*Math.cos(lat2),x=Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(dlon);return (Math.atan2(y,x)*180/Math.PI+360)%360;}
// EL RUMBO DE LA FLECHA cuando no lo marca la ruta, y el suavizado que le
// quita los saltos. Estan aparte de onFix para poder probarlos: hasta ahora
// las pruebas de orientacion miraban nuevo-qa.html, una copia congelada de
// la pagina, y la funcion que probaban ya ni existe aqui.
//
// - El rumbo que da el GPS solo vale si viene y si te mueves: parado se
//   queda viejo y la flecha llega a apuntar al reves del camino.
// - Si no viene, se deduce de por donde has pasado, pero con 8 m andados y
//   menos de 35 m de error. Con menos, el baile del GPS parado daria un
//   rumbo inventado.
// - La referencia se mueve cada 8 m, tambien cuando el rumbo lo da el GPS:
//   asi nunca se mide contra un punto de hace media hora.
function rumboAndando(coords,p,ref,ultimo){
 const avanza=!Number.isFinite(coords.speed)||coords.speed>0.5;
 const gps=avanza&&Number.isFinite(coords.heading)&&coords.heading>=0&&coords.heading<360?coords.heading:null;
 const lejos=!!ref&&dist(ref,p)>=8;
 const nuevo=gps??(avanza&&lejos&&coords.accuracy<=35?bearingBetween(ref,p):null);
 return {rumbo:nuevo??ultimo,nuevo,ref:(!ref||lejos)?p.slice():ref};
}
// La flecha giraba de golpe porque el rumbo salta de un segmento a otro.
// Suavizado circular: cada lectura la acerca al rumbo nuevo, no la planta
// encima. Medido sobre la ruta de Berriz, el salto mayor baja de 179 a 80
// grados y los bruscos se reducen a menos de la mitad. Los que quedan son
// curvas de verdad del circuito. Cruza el norte por el lado corto.
function diferenciaRumbo(anterior,nuevo){
 let d=(nuevo-anterior)%360;
 if(d>180)d-=360;
 if(d<-180)d+=360;
 return d;
}
function suavizaRumbo(anterior,nuevo){
 if(anterior===null)return nuevo;
 return (anterior+diferenciaRumbo(anterior,nuevo)*0.45+360)%360;
}
