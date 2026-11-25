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
let anclaRumbo={p:null,ruta:null,rumbo:null,t:0};
// «✋ Sobraba» (ver mas abajo): arriba, porque junctionGuidance lo usa y puede
// correr antes de llegar a esas lineas.
let avisoMarcable=null,avisoMarcadoJ=-1,avisoMarcadoLista=null;
// Como estaba el guiado en la ultima posicion: para «✋ Falto aqui».
let estadoGuia=null;
const AVISOS_MAL='avisos-mal',AVISO_MAL_M=250,AVISOS_ACTIVO='avisos-mal-activo';
function progressOnRoute(p,reliable=true){
 let best=Infinity,along=0,cerca=Infinity,alongCerca=0,bestScore=Infinity,retenido=false;
 const ref=Number.isFinite(ultimoAlong)?ultimoAlong:null;
 const step=ref!==null&&ultimoPuntoAlong?dist(ultimoPuntoAlong,p):0;
 const window=Math.max(25,Math.min(200,step*2+15));
 const predicted=(ref??0)+Math.min(step,window)*sentidoRuta;
 const latScale=111195,lonScale=latScale*Math.cos(p[0]*R);
 // EN UNA RUTA DE IDA Y VUELTA, EL TRAMO QUE VA HACIA DONDE TE MUEVES. La ida
 // y la vuelta pasan a pocos metros, en sentidos contrarios, y la mas
 // cercana podia ser la de vuelta: avanzando, «retrocedias» sobre ella y se
 // decidia que ibas al reves. Lo vio el autor el 15 de noviembre de 2026 en
 // Trabakua-Mendibil, que es ida y vuelta casi entera: entro en la ruta un
 // poco mas adelante y le salto «la estas haciendo AL REVES» sin ir al
 // reves. Ahora, si te has movido lo bastante para saber hacia donde
 // (RUMBO_MIN_M), un tramo que va en contra de tu marcha pesa SENTIDO_PEN
 // metros mas. Con un solo tramo cerca no cambia nada: si de verdad vas al
 // reves en una ruta sin tramos repetidos, se sigue viendo.
 // El rumbo se mide desde un ANCLA que solo avanza cada RUMBO_MIN_M, no
 // desde la posicion anterior: andando, entre dos posiciones hay metro y
 // poco y el rumbo no salia nunca (lo vio la revision con GPT: las pruebas
 // usaban pasos de 10 m). Si el ancla es de una ruta anterior, no vale.
 const RUMBO_MIN_M=8,SENTIDO_PEN=20;
 // Solo lo mueven las posiciones FIABLES (una mala lo desplazaba y el rumbo
 // falso decidia en la siguiente buena), y caduca a RUMBO_VIDA_MS: tras una
 // parada o un corte, no vale un rumbo de antes. Revision con GPT.
 const RUMBO_VIDA_MS=60000,ahoraR=Date.now();
 if(reliable){
  if(!anclaRumbo.p||anclaRumbo.ruta!==routePoints||ahoraR-anclaRumbo.t>RUMBO_VIDA_MS){anclaRumbo={p,ruta:routePoints,rumbo:null,t:ahoraR}}
  else if(dist(anclaRumbo.p,p)>=RUMBO_MIN_M){
   anclaRumbo.rumbo=Math.atan2((p[1]-anclaRumbo.p[1])*lonScale,(p[0]-anclaRumbo.p[0])*latScale)*180/Math.PI;
   anclaRumbo.p=p;anclaRumbo.t=ahoraR;
  }
 }
 const rumboMarcha=reliable&&anclaRumbo.ruta===routePoints?anclaRumbo.rumbo:null;
 let bestEf=Infinity,cercaEf=Infinity;
 const candidatos=[];
 for(let i=1;i<routePoints.length;i++){
  const a=routePoints[i-1],b=routePoints[i];
  const ax=(a[1]-p[1])*lonScale,ay=(a[0]-p[0])*latScale;
  const dx=(b[1]-a[1])*lonScale,dy=(b[0]-a[0])*latScale;
  const t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy||1)));
  const meters=Math.hypot(ax+t*dx,ay+t*dy);
  const candidate=routeCumulative[i-1]+t*(routeCumulative[i]-routeCumulative[i-1]);
  let pen=0;
  if(rumboMarcha!==null&&(dx||dy)){
   const tramo=Math.atan2(dx,dy)*180/Math.PI+(sentidoRuta<0?180:0);
   if(Math.abs(((rumboMarcha-tramo)%360+540)%360-180)>100)pen=SENTIDO_PEN;
  }
  const ef=meters+pen;
  if(ef<20)candidatos.push({along:candidate,error:ef});
  if(ef<bestEf-1e-6||(Math.abs(ef-bestEf)<=1e-6&&ref===null&&sentidoRuta<0)){bestEf=ef;best=meters;along=candidate}
  if(ref===null||Math.abs(candidate-ref)>window)continue;
  const score=ef+.20*Math.abs(candidate-predicted);
  if(score<bestScore){bestScore=score;cerca=meters;cercaEf=ef;alongCerca=candidate}
 }
 // Como en el navegador Android nuevo: 5 m de margen lateral y una
 // ventana corta de continuidad desempatan los pasos que comparten sitio.
 const hayContinuidad=ref!==null&&candidatos.some(c=>
  (c.along-ref)*sentidoRuta>=-12&&(c.along-ref)*sentidoRuta<=40&&c.error<=bestEf+5);
 const ambiguous=!hayContinuidad&&bestEf<15&&candidatos.some(c=>
  Math.abs(c.along-along)>25&&c.error-bestEf<5);
 if(Number.isFinite(cerca)&&cercaEf<=bestEf+12){best=cerca;along=alongCerca}
 // EL FINAL DE UN CIRCUITO NO ES SU PRINCIPIO. Si la ruta acaba donde empezo
 // y ya ibas por los ultimos CIERRE_M, volver a la salida es TERMINAR: sin
 // esto el tramo mas cercano era el del km 0 y todo se ponia a empezar otra
 // vez -«faltan 38 km», «quedan 1611 m de subida»-. Lo vio el autor al
 // llegar al coche el 14 de noviembre de 2026. Igual al reves, hacia el 0.
 const totalRuta=routeCumulative[routeCumulative.length-1]||0,CIERRE_M=300;
 if(ref!==null&&totalRuta>2*CIERRE_M&&routePoints.length>2
    &&dist(routePoints[0],routePoints[routePoints.length-1])<150){
  // Solo es llegar si lo que faltaba cabe en lo que has andado (mas 30 m):
  // con 250 m por delante, una lectura que caiga en el km 0,2 no
  // te da por llegado; se queda donde ibas.
  // Retenida, lo que andas se SUMA lectura a lectura (no la recta desde un
  // punto fijo, que en una curva no llega nunca), y para darte por llegado
  // hace falta ademas estar a menos de 60 m de la meta: alejandote por la
  // salida no se llega. Lo vio GPT al revisarlo, en dos vueltas.
  const falta=sentidoRuta>0?totalRuta-ref:ref,meta=sentidoRuta>0?routePoints[routePoints.length-1]:routePoints[0];
  const andado=(progressOnRoute.andado||0)+step;
  if((sentidoRuta>0&&ref>totalRuta-CIERRE_M&&along<CIERRE_M)||(sentidoRuta<0&&ref<CIERRE_M&&along>totalRuta-CIERRE_M)){
   // (Con 30 m o menos por delante ya estabas en la meta: ahi no se pide
   // cercania, que la salida puede quedar a 90 m de ella, como en la del autor.)
   if(falta<=andado+30&&(falta<=30||dist(p,meta)<=60)){along=sentidoRuta>0?totalRuta:0}
   else{along=ref;retenido=true}
  }
 }
 if(reliable&&!ambiguous&&best<=30)progressOnRoute.andado=retenido?(progressOnRoute.andado||0)+step:0;
 if(reliable&&!ambiguous&&best<=30){ultimoAlong=along;ultimoPuntoAlong=p}
 return {along,distance:best,ambiguous};
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
let listaCrucesActiva=null;
let confirmacionCurva=null;
function confirmaMarchaCurva(ruta,sentido,along,fiable,ahora){
 if(!fiable){confirmacionCurva=null;return false}
 const avance=along*sentido;
 const c=confirmacionCurva;
 if(!c||c.ruta!==ruta||c.sentido!==sentido||ahora-c.t>5000||avance<c.maximo-12||avance>c.maximo+40){
  confirmacionCurva={ruta,sentido,inicio:avance,maximo:avance,t:ahora};
  return false;
 }
 c.maximo=Math.max(c.maximo,avance);c.t=ahora;
 return c.maximo-c.inicio>=12;
}
function colocaGiro(){
 if(typeof document==='undefined'||!document.querySelector)return;
 const t=$('turnHint'),m=$('map'),col=document.querySelector('#map .tools');
 if(!t||!m)return;
 m.classList.remove('giro-al-lado');
 if(!col||t.classList.contains('hidden'))return;
 // Que se toquen de verdad: las cuatro condiciones, no dos (revision con GPT).
 const toca=(a,b)=>a.top<b.bottom&&b.top<a.bottom&&a.left<b.right&&b.left<a.right;
 if(toca(t.getBoundingClientRect(),col.getBoundingClientRect())){
  m.classList.add('giro-al-lado');
  // Lo que se corre es lo que de verdad ocupa la columna, no un numero fijo.
  m.style.setProperty('--giro-derecha',Math.ceil(m.getBoundingClientRect().right-col.getBoundingClientRect().left+8)+'px');
 }
 m.style.setProperty('--turn-alto',Math.round(t.getBoundingClientRect().height+16)+'px');
}
if(typeof window!=='undefined'&&window.addEventListener)window.addEventListener('resize',()=>{try{colocaGiro()}catch(e){}});
function siguienteManiobra(lista,actual,along,sentido){
 let distancia=Infinity,siguiente;
 for(const giro of lista){
  if((giro.along-actual.along)*sentido<=0.5)continue;
  const quedan=(giro.along-along)*sentido;
  if(quedan>0.5&&quedan<distancia){distancia=quedan;siguiente=giro}
 }
 if(!siguiente||distancia<=30)return '';
 const maniobra=siguiente.rotonda?'Siguiente rotonda':siguiente.cruce===false?'Siguiente curva':'Siguiente cruce';
 const metros=Math.max(1,Math.round(distancia/10)*10);
 if(metros<1000)return maniobra+' a '+metros+(metros===1?' metro':' metros');
 const km=Math.round(metros/100)/10;
 return maniobra+' a '+String(km).replace('.',',')+(km===1?' kilómetro':' kilómetros');
}
function junctionGuidance(p,accuracy,progress){
 const moviendose=sigueMoviendose(p,Date.now());
 // Los giros y el zoom de cruces esperan al inicio de la salida.
 // Yendo al reves, la lista calculada al reves (ver computeJunctions). Si
 // cambia la lista, lo que se estaba enseñando o ya se habia avisado era de
 // la otra: se empieza de cero.
 // Calculada aunque este vacia: al reves puede no hacer falta ningun aviso,
 // y entonces no se usan los de la ida dados la vuelta.
 const lista=sentidoRuta<0&&Array.isArray(junctionsReves)?junctionsReves:junctions;
 if(listaCrucesActiva&&lista!==listaCrucesActiva){if(junctionActive>=0)resetJunctionView();junctionWarned.clear();confirmacionCurva=null}
 listaCrucesActiva=lista;
 // Para «✋ Falto aqui»: si se calla un giro, por que se callaba.
 estadoGuia={p,lista,fuera:!!alerted,parado:!moviendose,precision:Math.round(accuracy),along:null,distancia:null};
 // (con typeof: las pruebas que recortan esta funcion no traen el «✋ Sobraba»)
 if(typeof avisoMarcable!=='undefined'&&avisoMarcable&&!guiaIniciada()){avisoMarcable=null;pintaAvisoMal()}
 if(!guiaIniciada()||alerted||!moviendose||routePoints.length<2||!lista.length||accuracy>60){
  confirmacionCurva=null;
  if(junctionActive>=0)resetJunctionView();return;
 }
 progress=progress??progressOnRoute(p,false);
 estadoGuia.along=progress.along;estadoGuia.distancia=Math.round(progress.distance);
 const curvaConfirmada=confirmaMarchaCurva(routePoints,sentidoRuta,progress.along,accuracy>0&&accuracy<=35&&progress.distance<=25&&!progress.ambiguous,Date.now());
 const [d1,d2,dv,dYa,dCurva]=distanciasDeAviso();
 if(progress.ambiguous||progress.distance>25||!avanzaPorLaRuta(progress.along,Date.now())){
  if(junctionActive>=0)resetJunctionView();return;
 }
 if(typeof buscaAvisoMarcable==='function')buscaAvisoMarcable(lista,progress);
 const coste=distance=>distance>=0?distance:-distance*4;
 let best=null;
 for(let j=0;j<lista.length;j++){
  // Por el sentido en que VAS, no por el que se grabo. Yendo al reves
  // «along» decrece, asi que sin esto «ahead» salia negativo para los cruces
  // que tienes delante y positivo para los que ya pasaste: el navegador
  // avisaba de giros a tu espalda, o de ninguno. Y en esta web hay rutas que
  // el propio autor recomienda hacer al reves.
  const turn=lista[j],ahead=(turn.along-progress.along)*sentidoRuta;
  // La ventana sigue al primer aviso: a 40 km/h se avisa a 90 m, asi que
  // con los 58 de antes el cruce ni se miraba hasta estar encima.
  // Y el suelo tambien va con la velocidad. El GPS del servicio da una
  // posicion cada 1,5 s, o sea 17 m de salto a 40 km/h: con el suelo fijo de
  // -12 m, el pitido del propio cruce se perdia 2 de cada 10 veces a 40 km/h
  // y 5 de cada 10 a 50. Con -(d2+8) salen 10 de 10 de 4 a 50 km/h.
  if(turn.curvaNueva&&(!curvaConfirmada||ahead< -dYa))continue;
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
 // Al reves con la lista calculada al reves, el lado ya es el bueno. Solo si
 // no la hay (no deberia pasar) se le da la vuelta al de la ida, como antes.
 const alReves=sentidoRuta<0&&lista===junctions;
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
 // Tambien si cambia la lista (ida o vuelta) con el mismo indice: la flecha
 // va girada con el sentido de llegada (revision con GPT).
 if(!turnMarker||turnMarker.options.turnIndex!==j||turnMarker.options.lista!==lista){
  if(turnMarker)map.removeLayer(turnMarker);
  // UNA MINIATURA DE LA GRANDE (17 nov 2026): «las flechas pequeñas no se
  // distinguen bien, son feas; las grandes bien». La pequeña tenia el trazo
  // casi el doble de grueso en proporcion (10 de 30 px; la grande, 11 de 62)
  // y se emborronaba. Ahora 38 px y 7,5 de trazo en un cuadro de 44, como la
  // grande en pequeño.
  const sign=L.divIcon({className:'',iconSize:[44,44],iconAnchor:[22,22],
   // LA FLECHA DEL MAPA ERA UN BORRON. Media 24 px dentro de un circulo de 38
  // y con un trazo de 13: a 147 grados no se distinguia la forma del giro. Lo
  // dijo el autor: «no sé qué sea un giro, por muy cerrado que sea». La de
  // abajo, la grande, le parece perfecta, y la diferencia es justo esa: alli
  // la flecha tiene sitio. Ahora ocupa 30 px con un trazo de 10, que llena el
  // circulo sin salirse. El circulo no crece: taparia mas mapa.
  // LA FLECHA DEL MAPA, EN EL SENTIDO EN QUE SE LLEGA AL CRUCE. Se dibuja
  // «hacia arriba» y el marcador gira con el mapa: con el mapa orientado a la
  // marcha y yendo hacia el sur salia dada la vuelta (lo vio el autor el 17
  // nov 2026, km 6,37 de recyde). Se gira el rumbo con el que se llega -de un
  // punto unos 15 m antes, en el sentido de la marcha-, asi apunta bien con el
  // norte arriba y con el mapa girado.
  html:signoDelGiro(turn,gradosFlecha,sentido)});
  turnMarker=L.marker(turn.point,{icon:sign,zIndexOffset:1800,interactive:false,keyboard:false,turnIndex:j,lista}).addTo(map);
 }
 // Un cruce y una curva de herradura no son lo mismo y no se dicen igual:
 // «cambio de sentido» en un sendero suena a «date la vuelta», y lo que pidio
 // el autor fue que le avisaran de los CRUCES.
 const esCruce=turn.cruce!==false;
 // «CURVA CERRADA», COMO LA VOZ DEL SERVICIO. La pantalla decia «Giro cerrado»
 // y la voz, con la pantalla apagada, «curva cerrada»: lo mismo con dos
 // nombres. Ahora los dos lo llaman igual.
 // «DA LA VUELTA» NO: CURVA DE HERRADURA, CON SU LADO. Una herradura encima
 // de un cruce se decia «Cruce · da la vuelta», y en plena revuelta de una
 // carretera eso suena a volver por donde has venido. Lo conto el autor: «me
 // decia una vuelta en plena curva». Ahora es una curva de herradura a la
 // derecha o a la izquierda, haya cruce o no.
 const ladoHerradura=ladoFlecha(turn,alReves);
 $('turnDirection').textContent=turn.deFrente?'Sigue de frente':turn.rotonda
   ?'Rotonda · '+queRotonda(turn,lado,alReves)
   :lado==='vuelta'
   ?(turn.retorno?'Da la vuelta'
    :'Curva de herradura a la '+ladoHerradura)
   :turn.mantente?(turn.noRecto?'Sigue por la ':'Sigue recto por la ')+lado
   :(esCruce?'Gira a la '+lado:(turn.curvaNueva?'Curva a la ':'Curva cerrada a la ')+lado);
 $('turnAngle').textContent=turn.deFrente?'':turn.mantente?(turn.noRecto?'Lo de frente no es tu camino':'Dejas el camino que llevas')
   :'Giro de '+Math.round(grados)+'\u00b0';
 if(turn.hito)$('turnAngle').textContent=turn.hito;
 $('turnDistance').textContent=ahead>0?Math.max(0,Math.round(ahead/5)*5):0;
 // La ficha muestra las dos fases que se anuncian.
 $('turnRot1').textContent=Math.round(d1/5)*5+' m';
 for(const [id,enc] of [['1',ahead<=d1],['3',ahead<=dYa]]){
  $('turnFase'+id).classList.toggle('on',enc);
  $('turnRot'+id).classList.toggle('on',enc);
 }
 $('turnHint').classList.remove('hidden');
 // Se mide DESPUES de quitar «hidden», que escondido no mide nada, y con
 // getBoundingClientRect, no con offsetHeight: el recuadro lleva relleno y
 // el borde, y los creditos se quedarian unos pixeles bajos.
 $('map').classList.add('con-giro');
 $('map').style.setProperty('--turn-alto',Math.round($('turnHint').getBoundingClientRect().height+16)+'px');
 // SI NO CABE, AL LADO DE LOS BOTONES Y NO ENCIMA. Con el panel de abajo el
 // mapa es mas bajo, y en un movil pequeño (320x640) o un portatil (1280x800)
 // la tarjeta subia hasta tapar el + y el - (medido el 15 de noviembre de
 // 2026). Entonces se estrecha y deja libre la columna de la derecha.
 colocaGiro();
 // Solo se amplía UNA vez por cruce. Si se toca el zoom, se respeta.
 if(ahead>=0&&ahead<=45&&junctionBlocked!==j&&!junctionZoomOnce.has(j)){
  junctionZoomOnce.add(j);
  if(map.getZoom()<17){
   junctionZoom=map.getZoom();
   autoZooming=true;map.setZoom(17,{animate:false});
   setTimeout(()=>{autoZooming=false},300);
  }
 }
 // Solo suena el cruce que está mostrando la ficha.
 if(turn.curvaNueva){
  if(ahead<=dCurva&&!junctionWarned.has(j+':curva')){
   junctionWarned.add(j+':curva');
   hablarGiro('Sigue por este camino, que curva a la '+lado,siguienteManiobra(lista,turn,progress.along,sentidoRuta));
  }
  return;
 }
 let fase=null;
 if(ahead<=d1&&ahead>d2)fase='1';
 else if(ahead<=dYa)fase='3';
 else if(ahead>d1&&ahead<=dv)fase='v';   // solo voz, y la primera de todas
 if(fase&&!junctionWarned.has(j+':'+fase)){
  junctionWarned.add(j+':'+fase);
  // La página solo pita si Android no está dando los avisos nativos.
   if(fase!=='v'&&!giraNativo){getAudio();pitidos(Number(fase),.30)}
  const giroTxt=turn.deFrente?'sigue de frente':turn.rotonda
    ?'en la rotonda, '+queRotonda(turn,lado,alReves)
    :lado==='vuelta'
    ?(turn.retorno?'da la vuelta'
     :'curva de herradura a la '+ladoHerradura)
    :turn.mantente?(turn.noRecto?'sigue por la ':'sigue recto por la ')+lado
    :turn.sigue?'sigue por este camino, que curva a la '+lado
    :(esCruce?'gira a la '+lado+' en el cruce':'curva cerrada a la '+lado);
  // Si la primera lectura entra en fase 1, aún queda margen para la voz.
  if(fase==='v'||fase==='3'||(fase==='1'&&!junctionWarned.has(j+':v'))){
   if(fase==='1')junctionWarned.add(j+':v');
   hablarGiro(fase==='3'
     ?(giroTxt.charAt(0).toUpperCase()+giroTxt.slice(1)+(turn.sigue||turn.deFrente?'':' ahora'))
     :'En '+Math.max(5,Math.round(ahead/10)*10)+' metros, '+(turn.hito?turn.hito+'. ':'')+giroTxt,
     fase==='3'?siguienteManiobra(lista,turn,progress.along,sentidoRuta):'');
  }
  if(fase!=='v')notice(fase==='3'
        ?(esCruce?'En el cruce · sigue la línea azul':'En el giro · sigue la línea cian')
        :(turn.deFrente?'Sigue de frente':turn.rotonda?'Rotonda':turn.mantente?(turn.noRecto?'Sigue por la ':'Sigue recto por la ')+lado:esCruce?'Gira a la '+lado:'Curva cerrada')
         +' a '+Math.round(d1/5)*5+' m · sigue la línea azul');
 }
 if(ahead< -(d2+5))resetJunctionView();
}
// «✋ SOBRABA»: APUNTAR UN AVISO QUE ESTABA DE MAS. Lo pidio el autor el 15
// de noviembre de 2026 despues de una tarde intentando saber, de memoria y
// con los kilometros de Wikiloc, que avisos de Asuntza bira por Aginaga
// sobraban: los numeros de otra aplicacion no cuadraban con los nuestros y
// se acabo ajustando una regla con casos que no eran. Este boton guarda el
// sitio exacto, la ruta, el kilometro y lo que se dijo, al momento. Sale
// despues de pasar un aviso, mientras no te alejes AVISO_MAL_M, y se guarda
// solo en el movil (localStorage); la lista se copia desde «Avisos marcados».
// QUE DECIR EN UNA ROTONDA. Con el numero de la salida, «toma la segunda
// salida» (lo pidio el autor el 16 nov 2026); sin el, como antes. El numero
// vale en el sentido en que se calculo: yendo al reves con la lista de ida
// (la de vuelta no siempre esta) no vale, y no se dice.
// La flecha pequeña del mapa, girada con el rumbo de llegada (ver el
// comentario de junctionGuidance). Aparte para poder probar en Chromium que,
// con el mapa girado, apunta hacia arriba en la pantalla.
function signoDelGiro(turn,gradosFlecha,sentido){
 const llegada=rumboDeLlegada(turn.i,typeof sentidoRuta!=='undefined'&&sentidoRuta<0?-1:1);
 return '<div class="map-turn-sign"'+(Number.isFinite(llegada)?' style="transform:rotate('+llegada.toFixed(0)+'deg)"':'')+'>'+flechaGiro(gradosFlecha,sentido,38,7.5)+'</div>';
}
// El rumbo con el que se llega al punto i de la ruta, yendo en el sentido
// «paso» (1 de ida, -1 al reves): desde el punto que queda unos 15 m antes.
function rumboDeLlegada(i,paso){
 if(typeof bearingBetween!=='function'||typeof dist!=='function'||!Array.isArray(routePoints)||!routePoints[i])return NaN;
 let k=i,d=0;
 while(d<15){const j=k-paso;if(j<0||j>=routePoints.length)break;d+=dist(routePoints[j],routePoints[k]);k=j}
 return k===i?NaN:bearingBetween(routePoints[k],routePoints[i]);
}
function queRotonda(turn,lado,alReves){
 const n=!alReves&&turn.salida&&typeof textoSalida==='function'?textoSalida(turn.salida):'';
 if(n)return n;
 if(turn.recto)return 'sigue recto';
 return lado==='vuelta'?'da la vuelta':'sal a la '+lado;
}
// LAS FRASES DICEN QUE HACER, NO QUE HAY (17 nov 2026, lo pidio el autor):
// «gira a la izquierda», «sigue recto por la izquierda», «curva cerrada»; la
// palabra «cruce» ya no se dice, que en una curva con una entrada al lado
// confundia. Cuando hablar lo siguen decidiendo los cruces de OSM.
function textoDeGiro(turn,alReves){
 if(turn.deFrente)return 'Sigue de frente';
 const cambia=l=>alReves?(l==='izquierda'?'derecha':l==='derecha'?'izquierda':l):l;
 const lado=cambia(turn.direction),hacia=cambia(turn.hacia||turn.direction);
 if(turn.rotonda)return 'Rotonda · '+queRotonda(turn,lado,alReves);
 if(turn.direction==='vuelta')return turn.retorno?'Da la vuelta':'Curva de herradura a la '+hacia;
 if(turn.mantente)return (turn.noRecto?'Sigue por la ':'Sigue recto por la ')+lado;
 return (turn.cruce!==false?'Gira a la ':turn.curvaNueva?'Curva a la ':'Curva cerrada a la ')+lado;
}
// SOLO PARA EL AUTOR. Lo que marque otra persona se queda en su movil y no
// nos llega a nadie, asi que a los demas el boton solo les estorbaria. Se
// activa en cada movil: dentro de la app, tocando 5 veces la version de
// abajo; en la web, abriendo con ?avisos=1 (?avisos=0 lo quita). Lo decidio
// el autor el 16 de noviembre de 2026: «dejalo solo para mi».
function botonAvisosActivo(){try{return localStorage.getItem(AVISOS_ACTIVO)==='1'}catch(e){return false}}
function activaBotonAvisos(si){
 try{if(si)localStorage.setItem(AVISOS_ACTIVO,'1');else localStorage.removeItem(AVISOS_ACTIVO)}catch(e){}
 pintaAvisoMal();pintaBotonAvisos();
}
function avisosMarcados(){
 try{const l=JSON.parse(localStorage.getItem(AVISOS_MAL)||'[]');return Array.isArray(l)?l:[]}catch(e){return []}
}
function buscaAvisoMarcable(lista,progress){
 let mejor=null;
 for(let j=0;j<lista.length;j++){
  const atras=(progress.along-lista[j].along)*sentidoRuta;
  if(atras>=5&&atras<=AVISO_MAL_M&&(!mejor||atras<mejor.atras))mejor={j,atras};
 }
 if(!mejor)avisoMarcable=null;
 else if(!avisoMarcable||avisoMarcable.j!==mejor.j||avisoMarcable.lista!==lista){
  const turn=lista[mejor.j];
  avisoMarcable={j:mejor.j,lista,turn,texto:textoDeGiro(turn,sentidoRuta<0&&lista===junctions)};
 }
 pintaAvisoMal();
}
function pintaAvisoMal(){
 if(typeof $!=='function')return;const b=$('avisoMal');if(!b)return;
 // LOS BOTONES NO SE QUITAN CON LA FICHA DEL GIRO DELANTE. Se escondian
 // mientras hubiera ficha (junctionActive>=0) para no taparla, y eso dejaba
 // sin marcar justo el momento en que hace falta: el autor, el 23 de
 // noviembre de 2026, con un aviso que le salio tarde y repetido cinco
 // veces, «no me ha dado la opcion de sobra aqui o falta aqui». Ahora salen
 // tambien con la ficha puesta, y el CSS los sube por encima de ella con
 // la altura que ya publica el mapa (--turn-alto).
 const ver=botonAvisosActivo()&&!!avisoMarcable&&!(avisoMarcadoJ===avisoMarcable.j&&avisoMarcadoLista===avisoMarcable.lista);
 b.classList.toggle('hidden',!ver);
 if(ver)b.textContent='✋ Sobraba: «'+avisoMarcable.texto+'»';
 // «✋ FALTO AQUI» (18 nov 2026): el autor oia pocos avisos y el ✋ solo
 // apuntaba los que sobran. Siempre a mano mientras se sigue una ruta (solo
 // con el ✋ activado).
 // Y SIEMPRE QUIERE DECIR TAMBIEN CUANDO ESTA EL DE «SOBRABA». Se apartaba
 // mientras hubiera un aviso marcable, y eso son los AVISO_MAL_M metros de
 // despues de cada aviso: 250 m, que a 18 km/h son 50 segundos sin poder
 // apuntar que falto uno, justo despues de un aviso, que es cuando mas falta
 // hace. El autor, el 24 de noviembre de 2026: «tarda en salir "falto aqui";
 // para cuando sale, despues de un aviso, me he alejado de la zona que me
 // hizo falta». Ahora salen los dos a la vez, apilados (el CSS pone el de
 // «Sobraba» encima, que es el que crece con el texto).
 const f=$('avisoFalta');
 if(f)f.classList.toggle('hidden',!(botonAvisosActivo()&&typeof guiaIniciada==='function'&&guiaIniciada()));
}
// Apunta tu posicion como un aviso que FALTO, con lo necesario para saber
// por que: el aviso calculado mas cercano (si lo habia, el problema no es la
// regla) y si el guiado estaba callando (fuera de ruta, parado, GPS malo).
// EL TRAZADO VIAJA CON LA MARCA. Una marca de una ruta tuya no se puede
// reproducir en el ordenador: la ruta solo esta en el movil, y entonces un
// aviso que falla se adivina en vez de repetirse. Paso el 23 de noviembre de
// 2026 con una rotonda: hubo que deducir el fallo midiendo las 75 rutas
// publicadas porque la suya no estaba. Asi que al apuntar la PRIMERA marca
// de una ruta propia se guarda su GPX con el mismo nombre que lleva la
// marca, y con el se vuelve a calcular el aviso igual que lo calculo el
// movil. En una ruta publicada no hace falta: esa ya esta en el repositorio.
// Una vez por ruta, no en cada marca.
let trazadoDeMarca='';
function guardaTrazadoDeMarca(nombre){
 if(typeof chosen==='undefined'||chosen>=0)return false;
 if(typeof routePoints==='undefined'||!Array.isArray(routePoints)||routePoints.length<2)return false;
 if(typeof download!=='function')return false;
 const clave=nombre||'Ruta propia';
 if(trazadoDeMarca===clave)return false;
 try{download(routePoints,clave);trazadoDeMarca=clave;return true}catch(e){return false}
}
// EL TERRENO VIAJA CON LA MARCA, dentro del texto que se copia. Una marca de
// una ruta propia no se puede reproducir en el ordenador sin el trazado, y
// buscar el GPX en Descargas y adjuntarlo es un baile que el autor no tiene
// por que hacer cada vez. Asi que cada marca se lleva el trozo de ruta de su
// alrededor -TRAMO_M a cada lado-, y con copiar el texto de siempre llegan la
// marca y el terreno juntos. Lo pidio el autor el 24 de noviembre de 2026.
//
// Van en micrograados (la millonesima de grado son 11 cm) y por diferencias
// con el punto anterior, que a ocho metros de paso son numeros de dos o tres
// cifras: medio kilometro de ruta cabe en unos cientos de caracteres.
const TRAMO_M=250;
// UNA MARCA NO SE PIERDE POR NO CABER. El trozo de trazado abulta, y si el
// almacen se llena setItem revienta y antes se perdia la marca ENTERA sin
// decir nada. Se vuelve a intentar sin los trazados, que son el adorno; la
// marca es lo que no se puede perder.
function guardaAvisos(l){
 try{localStorage.setItem(AVISOS_MAL,JSON.stringify(l));return true}catch(e){}
 try{localStorage.setItem(AVISOS_MAL,JSON.stringify(l.map(a=>{const b=Object.assign({},a);delete b.tramo;return b})));return false}
 catch(e){return false}
}
function tramoDeMarca(along){
 if(typeof routePoints==='undefined'||!Array.isArray(routePoints))return null;
 if(typeof routeCumulative==='undefined'||!Array.isArray(routeCumulative))return null;
 const cum=routeCumulative,n=Math.min(routePoints.length,cum.length);
 if(n<3||!Number.isFinite(along))return null;
 let a=0,b=n-1;
 while(a<n-1&&cum[a]<along-TRAMO_M)a++;
 while(b>0&&cum[b]>along+TRAMO_M)b--;
 if(b-a<2)return null;
 const u=v=>Math.round(v*1e6),p=routePoints;
 const out=[u(p[a][0]),u(p[a][1])];
 for(let k=a+1;k<=b;k++)out.push(u(p[k][0])-u(p[k-1][0]),u(p[k][1])-u(p[k-1][1]));
 return {m0:Math.round(cum[a]),p:out};
}
function marcaAvisoFalta(){
 const e=estadoGuia;if(!e||!e.p)return;
 const l=avisosMarcados();
 const ruta=(($('tripRuta')&&$('tripRuta').textContent)||($('mapTitle')&&$('mapTitle').textContent)||'').trim();
 let cerca=null;
 if(Number.isFinite(e.along))for(const t of e.lista||[]){const d=(t.along-e.along)*sentidoRuta;if(Math.abs(d)<=120&&(!cerca||Math.abs(d)<Math.abs(cerca.d)))cerca={d:Math.round(d),texto:textoDeGiro(t,sentidoRuta<0&&e.lista===junctions)}}
 const tramo=tramoDeMarca(e.along);
 // UNA MARCA HECHA SIMULANDO NO ES DEL TERRENO y se marca como tal: sirve
 // igual para perseguir el aviso, pero no es una prueba de lo que paso en la
 // bici, que es lo que valen las marcas ✋.
 l.push({tipo:'falta',ruta,km:Number.isFinite(e.along)?Math.round(e.along)/1000:null,sentido:sentidoRuta,tramo,
  ...(simulandoNativo?{sim:true}:{}),
  cerca,fuera:e.fuera,parado:e.parado,precision:e.precision,distancia:e.distancia,
  lat:+(+e.p[0]).toFixed(5),lon:+(+e.p[1]).toFixed(5),fecha:new Date().toISOString()});
 while(l.length>300)l.shift();
 guardaAvisos(l);
 pintaBotonAvisos();
 const trazado=guardaTrazadoDeMarca(ruta);
 try{notice('Apuntado: aquí faltó un aviso · '+l.length+' en la lista'+(trazado?' · trazado guardado':''))}catch(err){}
}
function marcaAvisoMal(){
 if(!avisoMarcable)return;
 const t=avisoMarcable.turn,l=avisosMarcados();
 const ruta=(($('tripRuta')&&$('tripRuta').textContent)||($('mapTitle')&&$('mapTitle').textContent)||'').trim();
 l.push({ruta,km:Math.round(t.along)/1000,sentido:sentidoRuta,dicho:avisoMarcable.texto,grados:t.angle,tramo:tramoDeMarca(t.along),
  ...(simulandoNativo?{sim:true}:{}),
  lat:+(+t.point[0]).toFixed(5),lon:+(+t.point[1]).toFixed(5),fecha:new Date().toISOString()});
 while(l.length>300)l.shift();
 guardaAvisos(l);
 avisoMarcadoJ=avisoMarcable.j;avisoMarcadoLista=avisoMarcable.lista;
 pintaAvisoMal();pintaBotonAvisos();
 const trazado=guardaTrazadoDeMarca(ruta);
 try{notice('Apuntado: «'+avisoMarcable.texto+'» sobraba · '+l.length+' en la lista'+(trazado?' · trazado guardado':''))}catch(e){}
}
function pintaBotonAvisos(){
 if(typeof $!=='function')return;const b=$('avisosMarcados');if(!b)return;
 const n=avisosMarcados().length;
 b.classList.toggle('hidden',!n||!botonAvisosActivo());b.textContent='✋ Avisos marcados ('+n+')';
 // Y una manita al final de la version mientras este activado: se ve de un
 // vistazo sin ningun aviso (lo pidio el autor). Va por clase y no por texto
 // porque pintaVersion reescribe el texto de la version.
 const v=$('appVersion');if(v&&v.classList)v.classList.toggle('con-mano',botonAvisosActivo());
}
function textoAvisos(){
 const km=a=>Number.isFinite(+a.km)&&a.km!==null?' · km '+(+a.km).toFixed(2).replace('.',','):'';
 return avisosMarcados().map(a=>(a.ruta||'Ruta')+km(a)+(a.sentido<0?' (al revés)':'')+(a.sim?' (SIMULADO, no es del terreno)':'')
  +(a.tipo==='falta'
   ?' · faltó un aviso · '+(a.cerca?'había «'+a.cerca.texto+'» a '+a.cerca.d+' m':'no había ninguno a menos de 120 m')
    +(a.fuera?' · fuera de ruta':'')+(a.parado?' · parado':'')+(a.precision>60?' · GPS ±'+a.precision+' m':'')+(a.distancia>25?' · a '+a.distancia+' m del track':'')
   :' · «'+a.dicho+'» sobraba')
  +' · '+a.lat+','+a.lon+' · '+String(a.fecha||'').slice(0,16).replace('T',' ')).join('\n')+textoTramos();
}
// Los trozos de trazado van al FINAL y en su propio bloque: lo de arriba se
// lee, esto solo se pega. Cada linea se identifica sola con su ruta y su km.
function textoTramos(){
 const con=avisosMarcados().filter(a=>a.tramo&&Array.isArray(a.tramo.p)&&a.tramo.p.length>5);
 if(!con.length)return '';
 return '\n\n--- trazados de las marcas (pégalo entero, son los metros de alrededor) ---\n'
  +con.map(a=>'T|'+(a.ruta||'')+'|'+(Number.isFinite(+a.km)?+a.km:'')+'|'+a.tramo.m0+'|'+a.tramo.p.join(',')).join('\n');
}
// LOS GIROS DE LA RUTA, EN UNA LISTA (25 de noviembre de 2026). Hasta hoy los
// avisos de una ruta solo se podian ver en el ordenador, corriendo
// scripts/avisos-referencia.cjs: en el movil no habia forma de saber que va a
// decir una ruta sin hacerla, asi que una ruta recien creada se estrenaba en
// el monte. La idea es de otro navegador que miro el autor (su pestaña
// «Pasos»); aqui, ademas, cada giro se toca y se ve en el mapa.
//
// LA VUELTA SE MUESTRA COMO LA DICE EL NAVEGADOR DE VERDAD: con la lista de
// vuelta si esta calculada y, si no, la de ida del reves y con los lados
// cambiados, que es exactamente lo que hace el guiado (buscaAvisoMarcable le
// pasa a textoDeGiro ese mismo «alReves»). Si no fuera igual, la lista
// mentiria justo en el sentido en el que el autor encuentra mas fallos.
function finDeLaRuta(){
 return Array.isArray(routeCumulative)&&routeCumulative.length?routeCumulative[routeCumulative.length-1]:0;
}
function girosDeLaRuta(reves){
 const fin=finDeLaRuta();
 let lista,cambia=false;
 if(!reves)lista=Array.isArray(junctions)?junctions:[];
 else if(Array.isArray(junctionsReves))lista=junctionsReves;
 else {lista=(Array.isArray(junctions)?junctions:[]).slice().reverse();cambia=true}
 return lista.map(j=>({
  km:Math.max(0,(reves?fin-j.along:j.along))/1000,
  // Los metros CONTADOS DESDE EL PRINCIPIO DE LA RUTA, que es como los cuenta
  // el servicio, vaya uno en el sentido que vaya: son los que recibe el
  // simulador. El kilometro de arriba es el que se lee, y a la vuelta va al
  // reves; estos no.
  m:j.along,
  texto:textoDeGiro(j,cambia),
  clase:j.rotonda?'rotonda':j.cruce?'cruce':'curva',
  // Los grados de una rotonda son el barrido del anillo, que no dice nada
  // de lo que vas a hacer: ahi manda el numero de salida.
  grados:j.rotonda||!(j.angle>0)?0:Math.round(j.angle),
  point:j.point,
 }));
}
function textoResumenGiros(filas){
 const fin=finDeLaRuta();
 if(!filas.length)return 'Esta ruta no da ningún aviso de giro'+(fin>0?' en sus '+(fin/1000).toFixed(1).replace('.',',')+' km':'')+'.';
 const cuenta=c=>filas.filter(f=>f.clase===c).length;
 const trozo=(c,uno,varios)=>{const n=cuenta(c);return n?n+' '+(n===1?uno:varios):''};
 const partes=[trozo('cruce','cruce','cruces'),trozo('curva','curva','curvas'),trozo('rotonda','rotonda','rotondas')].filter(Boolean);
 return filas.length+(filas.length===1?' aviso':' avisos')
  +(fin>0?' en '+(fin/1000).toFixed(1).replace('.',',')+' km':'')
  +(partes.length>1?': '+partes.join(', '):'')+'.';
}
let girosAlReves=false,simulandoNativo=false;
// EL SIMULADOR (25 de noviembre de 2026). Se le pide al SERVICIO, que es quien
// habla: el mete posiciones de mentira sobre la ruta, una por segundo, y suena
// exactamente lo que sonaria en la bici. Desde la pagina solo se arranca y se
// para. Va en tiempo real a proposito -acelerarlo dejaria las distancias bien
// y las frases mal, que es lo que mas falla-, y por eso cada giro de la lista
// tiene su ▶: empieza ANTES_DE_SIMULAR metros antes de ese giro, que a 50 km/h
// son 18 segundos, de sobra para el primer aviso de todos.
const ANTES_DE_SIMULAR=280;
function puedeSimular(){return typeof window!=='undefined'&&!!window.TrabakutikAndroid&&typeof window.TrabakutikAndroid.simulaRuta==='function'}
function velocidadDeSimulacion(){
 const v=typeof $==='function'&&$('girosVel')?parseFloat($('girosVel').value):NaN;
 return Number.isFinite(v)&&v>0?v:18;
}
function simulaDesde(metros,reves,exacto){
 if(!puedeSimular())return false;
 // Los metros van SIEMPRE contados desde el principio de la ruta, que es como
 // los cuenta el servicio. Con «exacto» se empieza justo ahi (el principio o
 // el final de la ruta); si no, ANTES_DE_SIMULAR metros antes del giro, y al
 // reves eso es al otro lado, que es por donde se llega.
 const desde=Math.max(0,(Number(metros)||0)+(exacto?0:reves?ANTES_DE_SIMULAR:-ANTES_DE_SIMULAR));
 if($('girosDialogo')&&$('girosDialogo').classList)$('girosDialogo').classList.add('hidden');
 // Simular necesita el servicio navegando, pero NO grabando: lo que se simula
 // no es un recorrido tuyo y no puede acabar en un GPX.
 const guiando=typeof navegaNativo!=='undefined'&&navegaNativo;
 if(!guiando&&typeof enciendeNavegacionNativa==='function')enciendeNavegacionNativa();
 const lanza=()=>{try{window.TrabakutikAndroid.simulaRuta(velocidadDeSimulacion(),desde,!!reves)}catch(e){console.warn('No se pudo simular',e)}};
 if(guiando)lanza();else setTimeout(lanza,1500);
 try{notice('Simulando'+(reves?' la vuelta':'')+' a '+velocidadDeSimulacion()+' km/h · lo que oirías en la bici')}catch(e){}
 return true;
}
function paraLaSimulacion(){
 if(typeof window==='undefined'||!window.TrabakutikAndroid)return;
 try{window.TrabakutikAndroid.paraSimulacion&&window.TrabakutikAndroid.paraSimulacion()}catch(e){}
}
function pintaSimulacion(){
 if(typeof $!=='function')return;
 const b=$('simBanda');
 if(b&&b.classList)b.classList.toggle('hidden',!simulandoNativo);
}

function pintaGirosRuta(){
 if(typeof $!=='function')return;
 const b=$('girosRuta');if(!b||!b.classList)return;
 const hay=Array.isArray(junctions)&&junctions.length>0;
 b.classList.toggle('hidden',!hay);
 // Si la ruta se quita con la lista abierta, la lista se va con ella.
 if(!hay&&$('girosDialogo')&&$('girosDialogo').classList)$('girosDialogo').classList.add('hidden');
}
function abreGirosRuta(reves){
 if(typeof $!=='function')return[];
 girosAlReves=!!reves;
 const filas=girosDeLaRuta(girosAlReves);
 if($('girosResumen'))$('girosResumen').textContent=textoResumenGiros(filas);
 [['girosIda',!girosAlReves],['girosVuelta',girosAlReves]].forEach(([id,on])=>{
  const t=$(id);if(!t||!t.classList)return;
  t.classList.toggle('activo',on);
  if(typeof t.setAttribute==='function')t.setAttribute('aria-pressed',on?'true':'false');
 });
 const lista=$('girosLista');
 if($('girosSimula')&&$('girosSimula').classList)$('girosSimula').classList.toggle('hidden',!puedeSimular());
 if(lista&&typeof document!=='undefined'&&typeof document.createElement==='function'){
  lista.innerHTML='';
  if(!filas.length){
   const v=document.createElement('div');v.className='giro-vacio';
   v.textContent='Sin avisos en este sentido.';lista.appendChild(v);
  }
  filas.forEach(f=>{
   const fila=document.createElement('div');
   fila.className='giro-fila';fila.setAttribute('role','listitem');
   const ver=document.createElement('button');ver.type='button';ver.className='giro-ver';
   const km=document.createElement('b');km.className='giro-km';km.textContent='km '+f.km.toFixed(2).replace('.',',');
   const que=document.createElement('span');que.className='giro-que';que.textContent=f.texto;
   ver.appendChild(km);ver.appendChild(que);
   if(f.grados){const g=document.createElement('i');g.className='giro-grados';g.textContent=f.grados+'°';ver.appendChild(g)}
   if(Array.isArray(f.point))ver.addEventListener('click',()=>{
    try{if(typeof map!=='undefined'&&map&&typeof map.setView==='function')map.setView(f.point,17)}catch(e){}
    if($('girosDialogo')&&$('girosDialogo').classList)$('girosDialogo').classList.add('hidden');
   });
   fila.appendChild(ver);
   if(puedeSimular()){
    const play=document.createElement('button');
    play.type='button';play.className='giro-play';play.textContent='▶';
    play.setAttribute('aria-label','Simular el aviso del km '+f.km.toFixed(2).replace('.',','));
    play.addEventListener('click',()=>simulaDesde(f.m,girosAlReves));
    fila.appendChild(play);
   }
   lista.appendChild(fila);
  });
 }
 if($('girosDialogo')&&$('girosDialogo').classList)$('girosDialogo').classList.remove('hidden');
 return filas;
}
if(typeof document!=='undefined'&&typeof $==='function'&&$('avisoMal')&&typeof $('avisoMal').addEventListener==='function'){
 $('avisoMal').addEventListener('click',marcaAvisoMal);
 if($('avisoFalta'))$('avisoFalta').addEventListener('click',marcaAvisoFalta);
 $('avisosMarcados').addEventListener('click',()=>{$('avisosTexto').value=textoAvisos();$('avisosEstado').textContent='';$('avisosDialogo').classList.remove('hidden')});
 $('avisosCerrar').addEventListener('click',()=>$('avisosDialogo').classList.add('hidden'));
 $('avisosCopiar').addEventListener('click',()=>{
  const t=$('avisosTexto'),ok=()=>{$('avisosEstado').textContent='Copiada: pégala en el chat'};
  const aMano=()=>{try{t.focus();t.select();if(document.execCommand('copy'))ok();else $('avisosEstado').textContent='Selecciónala y cópiala a mano'}catch(e){$('avisosEstado').textContent='Selecciónala y cópiala a mano'}};
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t.value).then(ok,aMano);else aMano();
 });
 $('avisosBorrar').addEventListener('click',()=>{
  if(!confirm('¿Borrar la lista de avisos marcados?'))return;
  try{localStorage.removeItem(AVISOS_MAL)}catch(e){}
  $('avisosTexto').value='';pintaBotonAvisos();$('avisosEstado').textContent='Lista borrada';
 });
 // Activarlo: ?avisos=1 en la web; 5 toques seguidos en la version, en la app.
 try{const q=new URLSearchParams(location.search).get('avisos');if(q==='1')activaBotonAvisos(true);else if(q==='0')activaBotonAvisos(false)}catch(e){}
 let toques=[];
 if($('appVersion'))$('appVersion').addEventListener('click',()=>{
  const ahora=Date.now();toques=toques.filter(t=>ahora-t<4000);toques.push(ahora);
  // Avisa SOLO al dar los 5 toques, para saber como ha quedado; nunca en otro
  // momento. Lo pidio asi el autor el 16 de noviembre de 2026.
  if(toques.length>=5){toques=[];const si=!botonAvisosActivo();activaBotonAvisos(si);
   try{notice(si?'Botón ✋ Sobraba activado en este móvil':'Botón ✋ Sobraba desactivado')}catch(e){}}
 });
 pintaBotonAvisos();
 if($('girosRuta')){
  $('girosRuta').addEventListener('click',()=>abreGirosRuta(girosAlReves));
  if($('girosCerrar'))$('girosCerrar').addEventListener('click',()=>$('girosDialogo').classList.add('hidden'));
  if($('girosIda'))$('girosIda').addEventListener('click',()=>abreGirosRuta(false));
  if($('girosVuelta'))$('girosVuelta').addEventListener('click',()=>abreGirosRuta(true));
  if($('girosDesdeElPrincipio'))$('girosDesdeElPrincipio').addEventListener('click',()=>{
   // El principio de la VUELTA es el final de la ida. Cinco metros antes del
   // final de verdad: justo en el ultimo metro no hay tramo donde ponerse y
   // la simulacion se acabaria en el primer paso.
   const fin=finDeLaRuta();
   simulaDesde(girosAlReves?Math.max(0,fin-5):0,girosAlReves,true);
  });
  if($('girosVel'))$('girosVel').addEventListener('change',()=>{
   try{localStorage.setItem('sim-kmh',$('girosVel').value)}catch(e){}
  });
  try{const v=localStorage.getItem('sim-kmh');if(v&&$('girosVel'))$('girosVel').value=v}catch(e){}
  if($('simBanda'))$('simBanda').addEventListener('click',paraLaSimulacion);
  pintaGirosRuta();
 }
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

// LA DISTANCIA AL PROXIMO CRUCE, ARRIBA (23 nov 2026, lo pidio el autor:
// «que me marcara la distancia hasta el proximo cruce que me iba a
// indicar»). Las coordenadas se probaron el mismo dia y las quito el: «no me
// hacen falta, el SOS me las da».
//
// NO es la distancia del aviso. El aviso solo existe dentro de su ventana -90
// m a 40 km/h- y hasta entonces en pantalla no habia nada: esto es el primer
// cruce de la lista que tienes delante, se avise ya o no, para saber si el
// siguiente esta a 80 m o a cuatro kilometros.
//
// Va por «along» y no por distancia en linea recta: en una ruta que se dobla,
// un cruce del kilometro 9 puede estar a 50 m a vuelo de pajaro y a tres
// kilometros de pedales. Y el sentido manda, como en junctionGuidance:
// yendo al reves «along» decrece.
function proximoCruceAviso(lista,along,sentido){
 if(!Array.isArray(lista)||!Number.isFinite(along))return null;
 const signo=sentido<0?-1:1;
 let mejor=null;
 for(const t of lista){
  if(!t||!Number.isFinite(t.along))continue;
  // -5 m y no 0: el cruce que tienes justo debajo sigue siendo el proximo.
  const falta=(t.along-along)*signo;
  if(falta< -5)continue;
  if(!mejor||falta<mejor.falta)mejor={falta:Math.max(0,falta),turn:t};
 }
 return mejor;
}
function pintaProximoCruce(progreso){
 const b=$('ffProx');if(!b)return;
 const lista=sentidoRuta<0&&Array.isArray(junctionsReves)?junctionsReves:junctions;
 // Sin guia, fuera de la ruta o con la posicion dudosa no hay «proximo»: un
 // numero viejo ahi engaña mas que un guion.
 const vale=guiaIniciada()&&progreso&&!progreso.ambiguous&&progreso.distance<=30;
 const n=vale?proximoCruceAviso(lista,progreso.along,sentidoRuta):null;
 b.textContent=n?fmt(n.falta):'—';
}
function pintaPosicionGps(p,h){
 const valido=Number.isFinite(h);
 if(!me){
  anguloFlecha=valido?h:null;
  // El símbolo apunta al norte sin rotación. El centro del círculo
  // coincide con el anclaje GPS y la punta gira con el rumbo.
  const icon=L.divIcon({className:'',iconSize:[40,40],iconAnchor:[20,20],html:
   '<div class="gps-course" style="transform:rotate('+(anguloFlecha??0)+'deg)">'+
   '<svg width="40" height="40" viewBox="0 0 40 40" overflow="visible" aria-hidden="true">'+
   '<circle cx="20" cy="20" r="16" fill="#caff52" fill-opacity=".35"/>'+
   '<circle cx="20" cy="20" r="11" fill="#0c1d24"/>'+
   '<circle class="gps-punto" cx="20" cy="20" r="4.5" fill="#caff52" stroke="#0c1d24" stroke-width="2" style="visibility:hidden"/>'+
   '<path d="M20 1 L33 35 L20 29 L7 35 Z" fill="#caff52" stroke="#0c1d24" stroke-width="3.2" stroke-linejoin="miter"/>'+
   '</svg></div>'});
  me=L.marker(p,{icon,zIndexOffset:1000}).addTo(map);
 }else me.setLatLng(p);
 const giro=me.getElement().firstElementChild;
 giro.querySelector('path').style.visibility=valido?'':'hidden';
 const punto=giro.querySelector('.gps-punto');if(punto)punto.style.visibility=valido?'hidden':'';
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
 if(progreso&&guiaIniciada()&&!progreso.ambiguous&&progreso.distance<=30){
  if(fiable)decideSentido(progreso.along);
  h=(fiable?course.nuevo:null)??rumboDeLaRuta(progreso)??h;
 }
 if(h!==null)h=rumboSuave=suavizaRumbo(rumboSuave,h);
 pintaBrujula(h);
 if(h!==null)rumboMapa=h;
 aplicaGiroMapa(false);
 pintaMandos();
 pintaPosicionGps(p,h);
 pintaProximoCruce(progreso);
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
  if($('ffTrack'))$('ffTrack').textContent=fmt(d);
  // En la ruta solo con posicion fiable; con una mala se queda lo ultimo dicho.
  pintaAvance(fiable&&!progreso.ambiguous&&progreso.distance<=30?progreso.along:ultimoAlong,{enRuta:fiable?progreso.distance<=30:null,distRuta:d,precision:pos.coords.accuracy});
  liveProfileAlong=guiaIniciada()&&fiable&&!progreso.ambiguous&&progreso.distance<=30?progreso.along:null;
  if(guiaIniciada()){
   const ramal=compruebaRamalWeb(p,pos.coords.accuracy,progreso,Number.isFinite(pos.timestamp)?pos.timestamp:Date.now());
   updateOffRoute(d,pos.coords.accuracy,p,ramal<0);
   junctionGuidance(p,pos.coords.accuracy,progreso);
   if(alerted){liveProfileAlong=null;liveNativeMetrics=null;}
  }
  paintNavigationMetrics();
  // El que decidio updateOffRoute, no uno fijo: si no, el aviso bueno de
  // salida -«a 320 metros hacia el noreste esta la salida»- duraba un segundo.
  if(alerted)notice(textoFuera||'Fuera del recorrido · vuelve a la línea cian')
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
  // El tiempo en movimiento lo cuenta el servicio (TiempoEnMarcha): una APK
 // anterior no lo manda y la casilla dice «—».
 tiempoMovNativo=data.recording&&Number.isFinite(data.tiempoMov)?data.tiempoMov:null;
 baroNativo=data.recording&&data.baro===true&&Number.isFinite(data.baroSube)&&Number.isFinite(data.baroBaja)?{sube:data.baroSube,baja:data.baroBaja,t:Number(data.baroT)||0}:null;
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
   // Los cortes se guardan tambien en «recorded» (como null, igual que la
   // grabacion del navegador): lo andado y lo subido no cruzan un corte.
   const segments=[[]],valid=[],conCortes=[];
   for(const p of data.points){
    if(Array.isArray(p)&&p.length===2&&Number.isFinite(p[0])&&Number.isFinite(p[1])){
     segments[segments.length-1].push(p);valid.push(p);conCortes.push(p);
    }else if(segments[segments.length-1].length){segments.push([]);if(conCortes.length&&conCortes[conCortes.length-1]!==null)conCortes.push(null)}
   }
   const connected=segments.filter(segment=>segment.length);
   cortesGrabacion=Math.max(0,connected.length-1);
   if(valid.length>1){
    recorded=conCortes;
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
 // La altitud del GPS sobre el mar (APK 4.9.50 en adelante; las anteriores no la mandan).
 if(typeof altGpsNativa!=='undefined')altGpsNativa=Number.isFinite(d.alt)&&d.alt>-9000?{v:d.alt,error:Number(d.altError),t:Number(d.altTiempo)}:null;
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
 // Un APK viejo no manda «simulando»: queda en false y no cambia nada.
 if(!!d.simulando!==simulandoNativo){simulandoNativo=!!d.simulando;pintaSimulacion()}
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
  if(routePoints.length>1){$('distance').textContent='Sin posición reciente del GPS';if($('ffTrack'))$('ffTrack').textContent='—';if($('ffProx'))$('ffProx').textContent='—'}
  const mensaje='Ubicación del teléfono apagada · actívala para recibir posición GPS';
  if($('status').textContent!==mensaje)notice(mensaje);
  avisaSinGps(true);
  return;
 }
 if(ultimoErrorGps!==null){
  if(junctionActive>=0)resetJunctionView();
  if(routePoints.length>1){$('distance').textContent='Sin posición reciente del GPS';if($('ffTrack'))$('ffTrack').textContent='—';if($('ffProx'))$('ffProx').textContent='—'}
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
  if(window.TrabakutikAndroid.setNamedRouteWithApproach){
   const nombre=chosen>=0&&tracks[chosen]?toName(tracks[chosen]):($('title')?.textContent||'');
   window.TrabakutikAndroid.setNamedRouteWithApproach(json,acercarAlTrack,nombre);
  }else if(window.TrabakutikAndroid.setRouteWithApproach)window.TrabakutikAndroid.setRouteWithApproach(json,acercarAlTrack);
  else window.TrabakutikAndroid.setRoute(json);
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
// El boton abre la hoja del SOS (abreSos, pieza 10): pedir ayuda y el aviso de caida.
if(window.TrabakutikAndroid?.shareSos){$('sos').hidden=false;$('sos').onclick=()=>abreSos()}
// Para las pruebas: en la pagina «module» no existe y esto no hace nada. Su
// estado va con accesores: se lee y se escribe la variable de verdad.
if(typeof module==='object'&&module&&module.exports){
 module.exports={girosDeLaRuta,textoResumenGiros,pintaGirosRuta,abreGirosRuta,simulaDesde,paraLaSimulacion,pintaSimulacion,puedeSimular,velocidadDeSimulacion,siguienteManiobra,proximoCruceAviso,marcaAvisoFalta,guardaTrazadoDeMarca,tramoDeMarca,textoTramos,guardaAvisos,signoDelGiro,rumboDeLlegada,queRotonda,progressOnRoute,avanzaPorLaRuta,sigueMoviendose,colocaGiro,junctionGuidance,rumboDeLaRuta,pintaPosicionGps,onFix,miraPosicionNativa,syncNativeRoute,enciendeNavegacionNativa,startGPS,textoDeGiro,avisosMarcados,botonAvisosActivo,activaBotonAvisos,buscaAvisoMarcable,pintaAvisoMal,marcaAvisoMal,textoAvisos};
 Object.defineProperty(module.exports,'avisoMarcable',{get:()=>avisoMarcable,set:v=>{avisoMarcable=v}});
 Object.defineProperty(module.exports,'estadoGuia',{get:()=>estadoGuia,set:v=>{estadoGuia=v}});
 Object.defineProperties(module.exports,{anclaRumbo:{get:()=>anclaRumbo,set:v=>{anclaRumbo=v},enumerable:true},refParado:{get:()=>refParado,set:v=>{refParado=v},enumerable:true},refParadoT:{get:()=>refParadoT,set:v=>{refParadoT=v},enumerable:true},listaCrucesActiva:{get:()=>listaCrucesActiva,set:v=>{listaCrucesActiva=v},enumerable:true}});
}
