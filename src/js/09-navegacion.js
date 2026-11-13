// DONDE ESTAS EN LA RUTA, SIN PERDER EL HILO. Esto cogia el tramo mas cercano
// de TODA la ruta, sin mirar por donde ibas hace un segundo. En una ruta que
// pasa dos veces por el mismo sitio -ida y vuelta, un circuito que repite un
// trozo, o una ruta creada que se junta con una guardada y comparten camino-
// los dos pasos estan encima el uno del otro y la eleccion la decidia un metro
// de diferencia: se enganchaba al paso equivocado, el avance pasaba a
// retroceso y decideSentido te daba la vuelta a los giros. Lo conto el autor:
// «cuando creo una ruta y la junto con una ruta ya guardada va fatal, las
// indicaciones gira ahora a la derecha, gira a la izquierda, seria totalmente
// [al reves]».
// Ahora se mira primero CERCA de donde ibas (VENTANA_SEGUIR metros de ruta a
// cada lado) y solo se salta a otro tramo si el de lejos esta mejor por mas de
// MARGEN_SALTO metros. Con eso, dos pasos superpuestos ya no se pelean: hay
// que irse de verdad para cambiar de rama. La primera posicion y las de fuera
// de ruta siguen buscando en toda la ruta, que ahi no hay hilo que seguir.
// La ventana es ASIMETRICA, y esto es lo que de verdad arregla la ida y
// vuelta: 200 m hacia delante y solo 40 hacia atras. En el punto de retorno
// las dos pasadas estan pegadas -la ida acaba y la vuelta empieza en el mismo
// metro- y mirando a los dos lados por igual la eleccion la decide el ruido
// del GPS: medido andando una ida y vuelta de 3 km, el sentido se daba la
// vuelta tres veces con la ventana simetrica y dos con una de 150 a cada lado.
// Prefiriendo seguir hacia delante no hay empate que valga.
// Y NO rompe el aviso de «vas al reves» cuando te das la vuelta de verdad:
// ahi te alejas de la ventana, el tramo correcto queda a 0 m y el de la
// ventana a 60, asi que gana el de fuera por mas de MARGEN_SALTO y el sentido
// cambia como debe.
// En ramas superpuestas se compara el avance con el desplazamiento real.
function progressOnRoute(p,reliable=true){
 let best=Infinity,along=0,cerca=Infinity,alongCerca=0,bestScore=Infinity;
 const ref=Number.isFinite(ultimoAlong)?ultimoAlong:null;
 const step=ref!==null&&ultimoPuntoAlong?dist(ultimoPuntoAlong,p):0;
 const window=Math.max(25,Math.min(200,step*2+15));
 const predicted=(ref??0)+Math.min(step,window)*sentidoRuta;
 const latScale=111195,lonScale=latScale*Math.cos(p[0]*R);
 for(let i=1;i<routePoints.length;i++){
  const a=routePoints[i-1],b=routePoints[i];
  const ax=(a[1]-p[1])*lonScale,ay=(a[0]-p[0])*latScale;
  const dx=(b[1]-a[1])*lonScale,dy=(b[0]-a[0])*latScale;
  const t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy||1)));
  const meters=Math.hypot(ax+t*dx,ay+t*dy);
  const candidate=routeCumulative[i-1]+t*(routeCumulative[i]-routeCumulative[i-1]);
  if(meters<best-1e-6||(Math.abs(meters-best)<=1e-6&&ref===null&&sentidoRuta<0)){best=meters;along=candidate}
  if(ref===null||Math.abs(candidate-ref)>window)continue;
  const score=meters+.20*Math.abs(candidate-predicted);
  if(score<bestScore){bestScore=score;cerca=meters;alongCerca=candidate}
 }
 if(Number.isFinite(cerca)&&cerca<=best+12){best=cerca;along=alongCerca}
 if(reliable&&best<=30){ultimoAlong=along;ultimoPuntoAlong=p}
 return {along,distance:best};
}
// Parado no hay giro que anunciar. «Gira a la derecha · En 50 m» solo
// significa algo si uno avanza, y al autor se le quedo esa ficha en la
// pantalla con la salida terminada: la ruta seguia abierta y el estaba a
// 22 m del track —menos de los 25 que pide la guia—, asi que para la app
// seguia navegando. Se guarda una referencia y solo cuenta como avanzar
// salir de 15 m de ella, para que el baile del GPS quieto no cuele; 15 m
// en un minuto son 0,9 km/h, por debajo de cualquiera que ande de verdad,
// asi que esto no apaga la guia a medio camino.
// Y avanzar es avanzar POR LA RUTA, no moverse a secas. Saliendote del camino
// sigues moviendote, pero «along» se queda clavado: el autor se salio junto a
// un cruce y la ficha se quedo en «En el cruce · 0 m» para siempre. Doce
// metros en veinte segundos son 2,2 km/h, por debajo de andar.
const AVANCE_MS=20000,AVANCE_M=12;
function avanzaPorLaRuta(along,ahora){
 if(refAvance===null||(along-refAvance)*sentidoRuta>AVANCE_M){refAvance=along;refAvanceT=ahora;return true}
 return ahora-refAvanceT<AVANCE_MS;
}
const PARADO_MS=60000,PARADO_M=15;
let refParado=null,refParadoT=0;
function sigueMoviendose(p,ahora){
 if(!refParado||dist(p,refParado)>PARADO_M){refParado=p;refParadoT=ahora;return true}
 return ahora-refParadoT<PARADO_MS;
}
function junctionGuidance(p,accuracy,progress){
 const moviendose=sigueMoviendose(p,Date.now());
 // Los giros y el zoom de cruces esperan al inicio de la salida.
 if(!guiaIniciada()||alerted||!moviendose||routePoints.length<2||!junctions.length||accuracy>60){
  if(junctionActive>=0)resetJunctionView();return;
 }
 progress=progress??progressOnRoute(p,false);
 const [d1,d2,dv]=distanciasDeAviso();
 if(progress.distance>25||!avanzaPorLaRuta(progress.along,Date.now())){
  if(junctionActive>=0)resetJunctionView();return;
 }
 const coste=distance=>distance>=0?distance:-distance*4;
 let best=null;
 for(let j=0;j<junctions.length;j++){
  // Por el sentido en que VAS, no por el que se grabo. Yendo al reves
  // «along» decrece, asi que sin esto «ahead» salia negativo para los cruces
  // que tienes delante y positivo para los que ya pasaste: el navegador
  // avisaba de giros a tu espalda, o de ninguno. Y en esta web hay rutas que
  // el propio autor recomienda hacer al reves.
  const turn=junctions[j],ahead=(turn.along-progress.along)*sentidoRuta;
  // La ventana sigue al primer aviso: a 40 km/h se avisa a 90 m, asi que
  // con los 58 de antes el cruce ni se miraba hasta estar encima.
  // Y el suelo tambien va con la velocidad. El GPS del servicio da una
  // posicion cada 1,5 s, o sea 17 m de salto a 40 km/h: con el suelo fijo de
  // -12 m, el pitido del propio cruce se perdia 2 de cada 10 veces a 40 km/h
  // y 5 de cada 10 a 50. Con -(d2+8) salen 10 de 10 de 4 a 50 km/h.
  if(ahead< -(d2+8)||ahead>Math.max(d1,dv)+8||dist(p,turn.point)>Math.max(d1,dv)+25)continue;
  if(!best||coste(ahead)<coste(best.ahead))best={j,ahead,turn};
 }
 if(!best){
  if(junctionActive>=0)resetJunctionView();
  return;
 }
 if(junctionActive!==best.j){
  if(junctionActive>=0)resetJunctionView();
  junctionActive=best.j;
 }
 const {j,ahead,turn}=best;
 // Al reves, lo que se grabo como derecha es izquierda. La forma del giro
 // (los grados) no cambia; el lado, si.
 const alReves=sentidoRuta<0;
 const lado=turn.direction==='vuelta'?'vuelta'
   :alReves?(turn.direction==='izquierda'?'derecha':'izquierda')
   :turn.direction;
 const sentido=ladoFlecha(turn,alReves)==='izquierda'?-1:1;
 const grados=Number.isFinite(turn.angle)?turn.angle:(turn.direction==='vuelta'?160:85);
 // En un «sigue por la derecha» el desvio son pocos grados y la flecha
 // saldria recta, que es justo lo contrario de lo que hay que entender. Se
 // dibuja con un codo minimo para que se vea de que lado es; el numero de
 // grados sigue siendo el de verdad, abajo.
 const gradosFlecha=turn.mantente?Math.max(grados,22):grados;
 $('turnArrow').innerHTML=flechaGiro(gradosFlecha,sentido,62,11);
 if(!turnMarker||turnMarker.options.turnIndex!==j){
  if(turnMarker)map.removeLayer(turnMarker);
  const sign=L.divIcon({className:'',iconSize:[34,34],iconAnchor:[17,17],
   // LA FLECHA DEL MAPA ERA UN BORRON. Media 24 px dentro de un circulo de 38
  // y con un trazo de 13: a 147 grados no se distinguia la forma del giro. Lo
  // dijo el autor: «no sé qué sea un giro, por muy cerrado que sea». La de
  // abajo, la grande, le parece perfecta, y la diferencia es justo esa: alli
  // la flecha tiene sitio. Ahora ocupa 30 px con un trazo de 10, que llena el
  // circulo sin salirse. El circulo no crece: taparia mas mapa.
  html:'<div class="map-turn-sign">'+flechaGiro(gradosFlecha,sentido,30,10)+'</div>'});
  turnMarker=L.marker(turn.point,{icon:sign,zIndexOffset:1800,interactive:false,keyboard:false,turnIndex:j}).addTo(map);
 }
 // Un cruce y una curva de herradura no son lo mismo y no se dicen igual:
 // «cambio de sentido» en un sendero suena a «date la vuelta», y lo que pidio
 // el autor fue que le avisaran de los CRUCES.
 const esCruce=turn.cruce!==false;
 // «CURVA CERRADA», COMO LA VOZ DEL SERVICIO. La pantalla decia «Giro cerrado»
 // y la voz, con la pantalla apagada, «curva cerrada»: lo mismo con dos
 // nombres. Ahora los dos lo llaman igual.
 $('turnDirection').textContent=lado==='vuelta'
   ?(esCruce?'Cruce · da la vuelta':'Curva de herradura')
   :turn.mantente?'Cruce · sigue por la '+lado
   :(esCruce?'Cruce a la '+lado:'Curva cerrada a la '+lado);
 $('turnAngle').textContent=turn.mantente?'Dejas el camino que llevas'
   :'Giro de '+grados+'\u00b0';
 $('turnDistance').textContent=ahead>0?Math.max(0,Math.round(ahead/5)*5):0;
 // Las tres luces se encienden segun te acercas, con los mismos cortes que
 // los pitidos: son lo mismo dicho de otra manera, para cuando no se oiga.
 const r1=Math.round(d1/5)*5,r2=Math.round(d2/5)*5;
 $('turnRot1').textContent=r1+' m';
 $('turnRot2').textContent=r2+' m';
 for(const [id,enc] of [['1',ahead<=d1],['2',ahead<=d2],['3',ahead<=0]]){
  $('turnFase'+id).classList.toggle('on',enc);
  $('turnRot'+id).classList.toggle('on',enc);
 }
 $('turnHint').classList.remove('hidden');
 // Se mide DESPUES de quitar «hidden», que escondido no mide nada, y con
 // getBoundingClientRect, no con offsetHeight: el recuadro lleva relleno y
 // el borde, y los creditos se quedarian unos pixeles bajos.
 $('map').classList.add('con-giro');
 $('map').style.setProperty('--turn-alto',Math.round($('turnHint').getBoundingClientRect().height+16)+'px');
 // Solo se amplía UNA vez por cruce. Si se toca el zoom, se respeta.
 if(ahead>=0&&ahead<=45&&junctionBlocked!==j&&!junctionZoomOnce.has(j)){
  junctionZoomOnce.add(j);
  if(map.getZoom()<17){
   junctionZoom=map.getZoom();
   autoZooming=true;map.setZoom(17,{animate:false});
   setTimeout(()=>{autoZooming=false},300);
  }
 }
 // Tres avisos por cruce y cada fase suena una sola vez: 1 pitido a 50 m,
 // 2 a 10 m y 3 en el propio cruce. Los avisos siguen al cruce que esta
 // mostrando la ficha, no a todos los que caen en rango: con 20 parejas de
 // cruces a menos de 110 m, sonar por todos solaparia dos grupos de pitidos
 // y no sabrias de cual te hablan.
 // Los cortes salen de la velocidad (ver distanciasDeAviso). El tercero no
 // lleva suelo por abajo a proposito: con «ahead>=-3» el pitido del propio
 // cruce se perdia, porque el GPS da una lectura por segundo y a 20 km/h
 // esos 3 m duran medio segundo. Simulado de 4 a 50 km/h, con suelo fallaba
 // a 20, 25, 40, 45 y 50; sin el suena siempre. Queda acotado solo: arriba
 // se descarta el cruce pasados -12 m y la ficha se cierra a -9.
 let fase=null;
 if(ahead<=d1&&ahead>d2)fase='1';
 else if(ahead<=d2&&ahead>0)fase='2';
 else if(ahead<=0)fase='3';
 else if(ahead<=dv)fase='v';   // solo voz, y la primera de todas
 if(fase&&!junctionWarned.has(j+':'+fase)){
  junctionWarned.add(j+':'+fase);
  // La página solo pita si Android no está dando los avisos nativos.
   if(fase!=='v'&&!giraNativo){getAudio();pitidos(Number(fase),.30)}
  const giroTxt=lado==='vuelta'
    ?(esCruce?'cruce, da la vuelta':'curva de herradura')
    :turn.mantente?'en el cruce, sigue por la '+lado
    :(esCruce?'cruce a la '+lado:'curva cerrada a la '+lado);
  // Si la primera lectura entra en fase 1, aún queda margen para la voz.
  if(fase==='v'||fase==='3'||(fase==='1'&&!junctionWarned.has(j+':v'))){
   if(fase==='1')junctionWarned.add(j+':v');
   hablarGiro(fase==='3'
     ?(giroTxt.charAt(0).toUpperCase()+giroTxt.slice(1)+' ahora')
     :'En '+Math.max(5,Math.round(ahead/10)*10)+' metros, '+giroTxt);
  }
  if(fase!=='v')notice(fase==='3'
        ?(esCruce?'En el cruce · sigue la línea azul':'En el giro · sigue la línea cian')
        :(turn.mantente?'Cruce · sigue por la '+lado:esCruce?'Cruce':'Curva cerrada')
         +' a '+Math.round((fase==='1'?d1:d2)/5)*5+' m · sigue la línea azul');
 }
 if(ahead< -(d2+5))resetJunctionView();
}
// Rumbo del mismo tramo que usa el progreso. En un cruce o en una ida y
// vuelta, buscar otra vez el más cercano podría escoger la otra rama.
function rumboDeLaRuta(progreso){
 if(progreso.distance>30||routeCumulative.length!==routePoints.length)return null;
 const fin=routeCumulative.at(-1);
 if(!(fin>0))return null;
 const objetivo=Math.max(0,Math.min(fin-.001,progreso.along+sentidoRuta*.5));
 let i=1,j=routeCumulative.length-1;
 while(i<j){
  const mitad=(i+j)>>1;
  if(routeCumulative[mitad]<=objetivo)i=mitad+1;
  else j=mitad;
 }
 const h=bearingBetween(routePoints[i-1],routePoints[i]);
 return (h+(sentidoRuta<0?180:0))%360;
}

function pintaPosicionGps(p,h){
 const valido=Number.isFinite(h);
 if(!me){
  anguloFlecha=valido?h:null;
  const icon=L.divIcon({className:'',iconSize:[54,54],iconAnchor:[27,27],html:
   '<div class="gps-course" style="transform:rotate('+(anguloFlecha??0)+'deg)">'+
   '<svg width="54" height="54" viewBox="0 0 54 54" overflow="visible">'+
   '<path d="M27 0 L39.5 19 L27 14 L14.5 19 Z" fill="#187cff" stroke="#fff" stroke-width="2.6" stroke-linejoin="round"/>'+
   '<circle cx="27" cy="27" r="10.5" fill="#187cff" stroke="#fff" stroke-width="3.2"/>'+
   '<circle cx="27" cy="27" r="3.5" fill="#fff"/></svg></div>'});
  me=L.marker(p,{icon,zIndexOffset:1000}).addTo(map);
 }else me.setLatLng(p);
 const giro=me.getElement().firstElementChild;
 giro.querySelector('path').style.visibility=valido?'':'hidden';
 if(!valido){anguloFlecha=null;return}
 anguloFlecha=anguloFlecha===null?h:anguloFlecha+diferenciaRumbo(anguloFlecha,h);
 giro.style.transform='rotate('+anguloFlecha.toFixed(1)+'deg)';
}

function onFix(pos){
 if(gpsApagadoPorTi)return; // Ignorar una posición pendiente después de finalizar.
 ultimoFix=Date.now();
 vuelveElGps();
 const estadoGps=$('status').textContent;
 if(estadoGps==='Localizando…'||estadoGps.startsWith('Sin posición reciente')||estadoGps.startsWith('Sin posición GPS reciente')||estadoGps.startsWith('Ubicación del teléfono apagada')||estadoGps.startsWith('No se recibe la ubicación')||estadoGps.startsWith('Permiso de ubicación denegado')||estadoGps===ultimoErrorGpsText)
  notice(guiaIniciada()?'Posición recibida · siguiendo ruta':'Posición recibida');
 ultimoErrorGps=null;ultimoErrorGpsText='';
 errorVisualGps=null;
 fixVisualGps={time:Number.isFinite(pos.timestamp)?pos.timestamp:Date.now(),accuracy:pos.coords.accuracy};
 pintaEstadoGps();
 const p=[pos.coords.latitude,pos.coords.longitude],prior=position;position=p;
 actualizaVelocidad(pos.coords,prior,ultimoFix);
 const course=rumboAndando(pos.coords,p,courseFix,lastCourse);
 lastCourse=course.rumbo;courseFix=course.ref;
 const fiable=pos.coords.accuracy<=35;
 const progreso=mode!=='create'&&routePoints.length>1?progressOnRoute(p,fiable):null;
 let h=lastCourse;
 if(progreso&&guiaIniciada()&&progreso.distance<=30){
  if(fiable)decideSentido(progreso.along);
  h=(fiable?course.nuevo:null)??rumboDeLaRuta(progreso)??h;
 }
 if(h!==null)h=rumboSuave=suavizaRumbo(rumboSuave,h);
 pintaBrujula(h);
 if(h!==null)rumboMapa=h;
 aplicaGiroMapa(false);
 pintaMandos();
 pintaPosicionGps(p,h);
 if(followGps&&Date.now()>=manualMapUntil){
  const center=map.getCenter();
  if(dist([center.lat,center.lng],p)>2)map.panTo(p,{animate:false});
 }
 if(nearbyOnly&&pos.coords.accuracy<=150&&(!nearbyLast||dist(nearbyLast,p)>50))applyNearbyPosition(p);
 if(recording&&!pausado&&!window.TrabakutikAndroid){
  const ts=Number.isFinite(pos.timestamp)?pos.timestamp:Date.now(),acc=pos.coords.accuracy;
  // El navegador puede suspender el GPS al bloquear la pantalla.
  // Nunca unir extremos tras una pausa o un salto improbable.
  if(Number.isFinite(acc)&&acc<=35){
   const gap=lastBrowserRecordTime>0?ts-lastBrowserRecordTime:0;
   const step=lastBrowserRecordPoint?dist(lastBrowserRecordPoint,p):0;
   const cut=lastBrowserRecordPoint&&(gap>15000||gap<0||step>80||(gap>0&&step/(gap/1000)>12));
   if(cut&&recorded.length&&recorded[recorded.length-1]!==null)recorded.push(null);
   if(!lastBrowserRecordPoint||cut||step>2){
    recorded.push(p);
    const segments=[[]];
    for(const q of recorded){if(q===null){if(segments[segments.length-1].length)segments.push([])}else segments[segments.length-1].push(q)}
    const lines=segments.filter(seg=>seg.length>0);
    cortesGrabacion=Math.max(0,lines.length-1);
    if(recordLayer){recordLayer.setLatLngs(lines);recordLayer.bringToFront()}
    else recordLayer=L.polyline(lines,{color:'#ff354c',weight:6.5,opacity:1,interactive:false,lineCap:'round',lineJoin:'round',className:'recorded-red'}).addTo(map).bringToFront();
    lastBrowserRecordPoint=p.slice();
   }
   lastBrowserRecordTime=ts;
  }
 }
 if(mode!=='create'&&routePoints.length>1){
  // El fuera de ruta se calcula SIEMPRE, tambien dentro de la app. Estaba
  // gateado con «if(!window.TrabakutikAndroid)», dejandoselo al servicio, y el
  // servicio solo lo escribe en la notificacion: en la pantalla no salia nada.
  // El autor se salio de la ruta a proposito y no se lo marco. El pitido si
  // sigue gateado, dentro de updateOffRoute, por navegaNativo.
  // Y va ANTES de junctionGuidance, que esta mira «alerted» para cerrar la
  // ficha del cruce: asi no va un fix por detras.
  const d=closestMeters(p,routePoints);
  $('distance').textContent='A '+fmt(d)+' del track';
  pintaAvance(fiable&&progreso.distance<=30?progreso.along:ultimoAlong);
  liveProfileAlong=guiaIniciada()&&fiable&&progreso.distance<=30?progreso.along:null;
  if(guiaIniciada()){
   updateOffRoute(d,pos.coords.accuracy);
   junctionGuidance(p,pos.coords.accuracy,progreso);
   if(alerted){liveProfileAlong=null;liveNativeMetrics=null;}
  }
  paintNavigationMetrics();
  if(alerted)notice('Fuera del recorrido · vuelve a la línea cian')
 }else if(mode==='nav')notice(recording?'Grabando · sin ruta activa para navegar':'Ubicación encontrada · selecciona una ruta')}
// Recupera los puntos capturados por Android mientras la pantalla estuvo apagada.
window.trabakutikSyncNative=()=>{
 // Recuperar los últimos puntos para guardar, sin reactivar el GPS ni la guía.
 if(gpsApagadoPorTi&&!recordingPendingSave)return;
 if(!window.TrabakutikAndroid?.getTrackingSnapshot)return;
 if(Date.now()-lastNativeSync<1200)return;
 lastNativeSync=Date.now();
 try{
  const raw=window.TrabakutikAndroid.getTrackingSnapshotIfChanged?.(lastNativeTrackVersion)||window.TrabakutikAndroid.getTrackingSnapshot();
  if(!raw)return;
  const data=JSON.parse(raw);
  if(typeof data.pointsComplete==='boolean')nativeTrackComplete=data.pointsComplete;
  // Compatibilidad con APK anteriores: en el límite no sabemos si hay más.
  else if(Array.isArray(data.points))nativeTrackComplete=data.points.length<25000;
  if(typeof data.trackVersion==='string')lastNativeTrackVersion=data.trackVersion;
  if(data.recording&&!recordingPendingSave){
   recording=true;
   // Sin esto, el sondeo del servicio pisaba la pausa un segundo despues de
   // pulsarla: el servicio sigue marcando «recording» porque lo que se para
   // es anotar puntos, no la grabacion entera.
   recordingControls(pausado?'paused':'recording');
  }else if(recording){
   apagaGps(); // También cuando se termina desde la notificación de Android.
   recording=false;
   // OJO con «data.points»: getTrackingSnapshotIfChanged devuelve SOLO los
   // metadatos cuando el fichero del trazado no ha cambiado, y al parar desde
   // la notificacion no cambia -la version es fecha+tamaño-. Asi que aqui
   // llegaba recording:false SIN puntos, y la botonera se iba a «ready»:
   // desaparecia Guardar con el trazado entero todavia en memoria. Si no
   // vienen puntos, valen los que ya tenemos.
   const puntos=Array.isArray(data.points)?data.points.length:recorded.length;
   recordingPendingSave=puntos>1;
   recordingControls(puntos>1?'stopped':'ready');
   // Y decirlo. Entre que el servicio se para y llega este sondeo, el de
   // posicion ya ha visto el servicio parado y ha puesto «Localizando…»; sin
   // esto ese texto se quedaba con el GPS apagado y la salida terminada.
   notice((puntos>1?'Salida finalizada · Guardar GPX o Descartar':'Salida finalizada')+avisoDeCortes());
  }else reconciliaBotonera();
  if(Array.isArray(data.points)){
   const segments=[[]],valid=[];
   for(const p of data.points){
    if(Array.isArray(p)&&p.length===2&&Number.isFinite(p[0])&&Number.isFinite(p[1])){
     segments[segments.length-1].push(p);valid.push(p);
    }else if(segments[segments.length-1].length)segments.push([]);
   }
   const connected=segments.filter(segment=>segment.length);
   cortesGrabacion=Math.max(0,connected.length-1);
   if(valid.length>1){
    recorded=valid;
    if(!recordLayer)recordLayer=L.polyline(connected,{color:'#ff354c',weight:6.5,opacity:1,interactive:false,className:'recorded-red'}).addTo(map);
    else recordLayer.setLatLngs(connected);
    recordLayer.bringToFront();
   }
  }
  // La grabacion Android puede continuar aunque el servicio no marque
  // navegacion activa. El mapa debe seguir el ultimo punto recibido.
  // Con getPosition manda el sondeo de abajo; esto queda para un APK viejo.
  const liveFix=!window.TrabakutikAndroid.getPosition&&(data.active||data.recording)&&Number.isFinite(data.lat)&&Number.isFinite(data.lon)&&Number.isFinite(data.accuracy)&&data.accuracy<=100&&Number.isFinite(data.time)&&Date.now()-data.time<30000;
  if(liveFix){
   onFix({coords:{latitude:data.lat,longitude:data.lon,accuracy:data.accuracy,heading:null,speed:0}});
  }else if(!window.TrabakutikAndroid.getPosition&&data.recording&&Array.isArray(data.points)&&data.points.length){
   // Si el servicio entrega el trazado antes que la posicion instantanea,
   // usar el ultimo punto nuevo para no dejar que la linea salga de pantalla.
   const last=[...data.points].reverse().find(p=>Array.isArray(p)&&p.length===2&&Number.isFinite(p[0])&&Number.isFinite(p[1]));
   if(last&&(!position||dist(position,last)>3))onFix({coords:{latitude:last[0],longitude:last[1],accuracy:35,heading:null,speed:0}});
  }
 }catch(e){console.warn('Seguimiento Android no recuperado',e)}
};
document.addEventListener('visibilitychange',()=>{if(!document.hidden){followGps=true;manualMapUntil=0;setTimeout(()=>window.trabakutikSyncNative(),250)}});
setInterval(()=>{if(!document.hidden&&window.TrabakutikAndroid)window.trabakutikSyncNative()},4500);
// La guia caduca si deja de llegar posicion. Antes se quedaba clavada: la
// ficha del giro y el «A X del track» solo se recalculan dentro de onFix,
// asi que al pararse el GPS —pantalla apagada, app al fondo, bajo cubierta—
// se quedaba lo ultimo que dijo. El autor se encontro «Gira a la derecha ·
// En 50 m» con el movil parado y la salida terminada. Una indicacion vieja
// es peor que ninguna.
// Mientras el GPS esta activo llega una posicion cada uno o dos segundos,
// asi que 25 s sin ninguna quiere decir que ha dejado de llegar; se mira
// cada 5 para no apurar.
// Una sola fuente de posicion. Dentro de la aplicacion habia dos GPS a la
// vez: el watchPosition de la pagina y el servicio de Android, y los dos
// metian posiciones en onFix. Aparte de gastar el doble, se pisaban: las del
// servicio llegaban sin rumbo y con velocidad 0, asi que cada vez que colaba
// una entre dos del navegador la flecha perdia el norte. De ahi venia buena
// parte de los lios que hemos ido persiguiendo.
// Ahora, en cuanto el servicio arranca, la pagina apaga su reloj y bebe solo
// de el; cuando el servicio para, vuelve el del navegador. Nunca los dos.
function miraPosicionNativa(){
 if(!window.TrabakutikAndroid?.getPosition||document.hidden)return;
 if(gpsApagadoPorTi||Date.now()<apagadoHasta)return;
 let d;
 try{d=JSON.parse(window.TrabakutikAndroid.getPosition()||'{}')}catch(e){return}
 ubicacionVisualGps=typeof d.locationEnabled==='boolean'?d.locationEnabled:null;
 pintaEstadoGps();
 if(!d.active){
  navegaNativo=false;

  if(fuenteNativa){fuenteNativa=false;ultimoTiempoNativo=0;if(mode!=='create')startGPS()}
  reconciliaBotonera();
  return;
 }
 // Si el servicio navega, pita el; la pagina se calla. Un APK viejo no manda
 // este dato, asi que queda false y sigue pitando la pagina, como hasta ahora.
 // La pagina solo debe callarse si el servicio PUEDE avisar, no solo si
 // dice que navega: sin la ruta cargada no comprueba ni giros ni desvio,
 // y callandose los dos no avisaba nadie. Un APK viejo no manda «guiando»,
 // y entonces vale lo de antes.
 navegaNativo=d.guiando===undefined?!!d.navigating:!!d.guiando;
 // Callarse en los giros SOLO si el servicio tiene giros que avisar.
 // «guiando» mira la ruta, no los giros, asi que el servicio podia estar
 // guiando con cero giros cargados y la pagina callada: no avisaba nadie.
 // Un APK viejo manda -1 y entonces vale lo de siempre.
 giraNativo=navegaNativo&&(d.giros==null||d.giros<0||d.giros>0);

 // El servicio se queda con SU copia de la ruta. Si la pagina se recarga
 // -cambiar de pestaña la recarga- o se quita la ruta y algo falla al
 // avisarle, el servicio sigue guiando una ruta que ya no esta en
 // pantalla: pita en cruces que no ves. Lo dijo el autor: «me esta
 // pitando... sin ruta cargada». Si aqui no hay ruta, ahi tampoco.
 // La condicion NO puede ser el reloj. Lo era -12 s desde que abrio- y es
 // una carrera perdida: la ruta se restaura cuando llega trailhead.json,
 // que son 481 kB y se piden con revalidacion. Si tarda o no llega -en el
 // monte, sin cobertura- a los 12 s esto paraba el servicio, y pararlo sin
 // grabacion lo MATA entero: adios navegacion con la pantalla apagada, que
 // no necesitaba red para nada. Ahora se espera a que las rutas esten de
 // verdad, y si la carga falla no se arma nunca.
 if(d.guiando&&chosen<0&&routePoints.length<2&&mode!=='create'
    &&rutasListas&&Date.now()-ultimoParoNativo>15000){
  ultimoParoNativo=Date.now();
  try{window.TrabakutikAndroid.stopNavigation?.()}catch(e){}
 }
 // Si el motor de voz no esta listo, decirlo en vez de callar: el autor se
 // encontro con que los pitidos sonaban y la voz no, sin ninguna pista de
 // por que. El motivo lo manda el servicio.
 if(audioModo==='voz'&&typeof d.vozEstado==='string'&&d.vozEstado!=='ok'
    &&d.vozEstado!=='iniciando'&&d.vozEstado!==ultimoVozEstado){
  ultimoVozEstado=d.vozEstado;notice('Voz: '+d.vozEstado);
 }
 if(!fuenteNativa){
  fuenteNativa=true;
  if(watch!==null){navigator.geolocation.clearWatch(watch);watch=null}
 }
 if(!(d.time>ultimoTiempoNativo))return;
 if(!Number.isFinite(d.lat)||!Number.isFinite(d.lon)||!Number.isFinite(d.accuracy))return;
 if(d.accuracy>100||Date.now()-d.time>30000)return;
 ultimoTiempoNativo=d.time;
 liveNativeMetrics=d.guiando&&d.metrics?.key===nativeRouteKey?{...d.metrics,time:d.time}:null;
 onFix({timestamp:d.time,coords:{latitude:d.lat,longitude:d.lon,accuracy:d.accuracy,
  heading:Number.isFinite(d.bearing)&&d.bearing>=0?d.bearing:null,
  speed:Number.isFinite(d.speed)&&d.speed>=0?d.speed:null}});
}
setInterval(()=>{miraPosicionNativa();expireNavigationMetrics()},1000);
const GUIA_CADUCA_MS=25000;
setInterval(()=>{
 pintaEstadoGps();
 if(gpsApagadoPorTi)return;   // lo has apagado tu: no hay nada que vigilar
 if(watch===null&&!fuenteNativa&&!recording&&!navegaNativo)return; // Ruta cargada, GPS aún sin iniciar.
 let ubicacionApagada=false;
 if(window.TrabakutikAndroid?.getPosition){
  try{ubicacionApagada=JSON.parse(window.TrabakutikAndroid.getPosition()||'{}').locationEnabled===false}catch(e){}
 }
 if(ubicacionApagada){
  if(junctionActive>=0)resetJunctionView();
  if(routePoints.length>1)$('distance').textContent='Sin posición reciente del GPS';
  const mensaje='Ubicación del teléfono apagada · actívala para recibir posición GPS';
  if($('status').textContent!==mensaje)notice(mensaje);
  avisaSinGps(true);
  return;
 }
 if(ultimoErrorGps!==null){
  if(junctionActive>=0)resetJunctionView();
  if(routePoints.length>1)$('distance').textContent='Sin posición reciente del GPS';
  if($('status').textContent!==ultimoErrorGpsText)notice(ultimoErrorGpsText);
  avisaSinGps(false);
  return;
 }
 if(ultimoFix){
  const sinMs=Date.now()-ultimoFix;
  if(sinMs>=12000&&sinMs<GUIA_CADUCA_MS){
   const seg=Math.round(sinMs/1000),mensajeGps='Sin posición GPS reciente · '+seg+' s';
   if(routePoints.length>1&&$('distance').textContent!=='GPS apagado')$('distance').textContent='Buscando señal GPS · '+seg+' s';
   if($('status').textContent!==mensajeGps)notice(mensajeGps);
   return;
  }
  if(sinMs<GUIA_CADUCA_MS)return;
 }
 if(junctionActive>=0)resetJunctionView();
 if(routePoints.length>1)$('distance').textContent='Sin posición reciente del GPS';
 const mensaje='Sin posición reciente del GPS · buscando señal';
 if($('status').textContent!==mensaje)notice(mensaje);
 avisaSinGps(false);
},5000);
function syncNativeRoute(){
 if(!window.TrabakutikAndroid||routePoints.length<2)return null;
 const json=JSON.stringify(routePoints.map(p=>[p[0],p[1],Number.isFinite(p[2])?p[2]:null]));
 nativeRouteKey=0;
 for(let i=0;i<json.length;i++)nativeRouteKey=(Math.imul(nativeRouteKey,31)+json.charCodeAt(i))|0;
 try{
  window.TrabakutikAndroid.setRoute(json);
  enviaGirosNativos();
  window.TrabakutikAndroid.setSentido?.(sentidoRuta);
 }catch(e){console.warn('Ruta nativa no enviada',e)}
 return json;
}
// Elegir una ruta prepara puntos y giros sin arrancar el GPS ni la guía.
// Empezar activa también el servicio que avisa con pantalla apagada.
function enciendeNavegacionNativa(){
 if(!window.TrabakutikAndroid||mode!=='nav'||routePoints.length<2)return;
 try{
  const routeJson=syncNativeRoute();
  if(window.TrabakutikAndroid.startNavigationWithRoute)
   window.TrabakutikAndroid.startNavigationWithRoute(routeJson);
  else window.TrabakutikAndroid.startNavigation();
 }catch(e){console.warn('No se pudo encender la navegacion nativa',e)}
}
function startGPS(forRecording=false){
 // La POSICION anterior se conserva al volver a encender -si habia una
 // buena, sigue valiendo-, pero el ERROR no: arrancar el GPS es pedir un
 // intento nuevo. Sin esto, al denegar el permiso y concederlo despues, el
 // chivato se quedaba en rojo con «Sin permiso de ubicación» hasta que
 // entrara la primera posicion, diciendo lo contrario que el texto de abajo.
 // Lo de la ubicacion no hace falta tocarlo: el vigilante lo refresca cada
 // cinco segundos, asi que nunca se queda viejo.
 if(!gpsSolicitado){fixVisualGps=null;ubicacionVisualGps=null;}
 errorVisualGps=null;
 gpsApagadoPorTi=false;apagadoHasta=0;gpsSolicitado=true;sinGpsAvisado=false;
 pintaEstadoGps();
 if(!forRecording&&mode==='nav'&&routePoints.length>1&&window.TrabakutikAndroid){
  try{syncNativeRoute()}catch(e){console.warn(e)}
 }
 if(fuenteNativa)return;
 if(watch!==null)return;if(!navigator.geolocation){warnGps();return}ultimoErrorGps=null;ultimoErrorGpsText='';getAudio();notice('Localizando…');watch=navigator.geolocation.watchPosition(onFix,e=>{
 if(gpsApagadoPorTi)return;
 warnGps(e);
 // Solo se abandona con el permiso denegado: ahi no va a llegar nada nunca.
 // Antes CUALQUIER error cerraba el watch, y con timeout de 20 s bastaba un
 // tramo de bosque sin ver satelites para que el GPS se quedara muerto el
 // resto de la salida, sin volver solo. Una espera agotada o una posicion no
 // disponible son normales en el monte: el watch sigue y se recupera cuando
 // entra el siguiente punto.
 if(e&&e.code===1){if(watch!==null)navigator.geolocation.clearWatch(watch);watch=null}
},{enableHighAccuracy:true,maximumAge:1000,timeout:20000})}
if(window.TrabakutikAndroid?.shareSos){$('sos').hidden=false;$('sos').onclick=()=>window.TrabakutikAndroid.shareSos()}
