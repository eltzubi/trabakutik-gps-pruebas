// EL NUMERO DE VERSION, ABAJO. Lo pidio el autor: hasta ahora, para saber si
// tenia la APK al dia, habia que ir a Ajustes de Android. Va dentro del pie,
// asi que en marcha desaparece con el resto.
// En un navegador no se pone nada: ahi no hay APK. Y una APK anterior a la
// 4.9.3 no sabe decir su version, asi que se dice eso mismo, que tambien
// contesta a la pregunta.
function pintaVersion(){
 const b=$('appVersion');if(!b)return;
 if(!window.TrabakutikAndroid)return;
 let v='';
 try{v=window.TrabakutikAndroid.getAppVersion?window.TrabakutikAndroid.getAppVersion():''}catch(e){}
 b.textContent=v?'Trabakutik GPS '+v:'Trabakutik GPS · versión anterior a la 4.9.3';
 b.classList.remove('hidden');
 miraActualizacion(v);
}
// HAY UNA VERSION NUEVA DE LA APP. Lo pregunto el autor: «cuando entre en el
// navegador, ¿le avisara de una actualizacion?». No avisaba nadie: la pagina
// se actualiza sola, pero el APK solo cambia si uno reinstala, y cada arreglo
// del servicio -la voz, los giros, la grabacion con la pantalla apagada- se
// quedaba sin llegar a quien no se enterara por otro lado.
// La version publicada sale de instalar.html, que el flujo del APK pone al
// dia en cada publicacion (la marca <!--VER-->): no hay otro numero que
// mantener. Sin cobertura no sale nada, y una APK anterior a la 4.9.3, que no
// sabe decir su version, cuenta como la mas vieja de todas.
// El enlace es la direccion entera a proposito: dentro de la app solo
// nuevo.html se abre en el WebView, y lo demas va al navegador del movil, que
// es quien sabe bajar e instalar un APK.
// La primera APK firmada con la llave fija (docs/decisiones.md).
const FIRMA_FIJA_DESDE='4.9.22';
function versionMayor(a,b){
 const x=String(a||'0').split('.').map(Number),y=String(b||'0').split('.').map(Number);
 for(let i=0;i<Math.max(x.length,y.length);i++){
  const d=(x[i]||0)-(y[i]||0);
  if(d)return d>0;
 }
 return false;
}
function miraActualizacion(instalada){
 if(typeof fetch!=='function')return;
 fetch('instalar.html',{cache:'no-store'}).then(r=>r.ok?r.text():'').then(t=>{
  const m=/<!--VER-->([\d.]+)<!--\/VER-->/.exec(t||'');
  if(!m||!versionMayor(m[1],instalada))return;
  const caja=$('appUpdate');if(!caja)return;
  // Quien lo cierra no lo vuelve a ver hasta la siguiente version.
  try{if(localStorage.getItem('actualizacionCerrada')===m[1])return}catch(e){}
  // DESINSTALAR, SOLO SI HACE FALTA. Hasta la 4.9.21 cada APK iba firmado
  // con una llave distinta y Android no deja instalar encima: hay que quitar
  // la anterior. Lo pidio el autor: «en caso de que no se instale, que se
  // desinstale la anterior». Desde la 4.9.22 la llave es fija y se instala
  // encima, asi que a esos NO se les dice: desinstalar borra las grabaciones
  // que guarda la app, y un consejo de mas acabaria costandolas.
  const nota=versionMayor(FIRMA_FIJA_DESDE,instalada)
   ?'\nSi el móvil no deja instalarla, desinstala antes la que tienes (solo esta vez, por el cambio de firma). Guarda antes tus grabaciones: al desinstalar se borran.':'';
  $('appUpdateTexto').textContent='Hay una versión nueva de la app: '+m[1]+(instalada?' (tienes la '+instalada+')':'')+' · Toca para instalarla'+nota;
  $('appUpdateCerrar').onclick=()=>{caja.classList.add('hidden');try{localStorage.setItem('actualizacionCerrada',m[1])}catch(e){}};
  caja.classList.remove('hidden');
 }).catch(()=>{});
}
pintaVersion();
$('despeja').onclick=()=>{
 document.body.classList.toggle('despejado');
 pintaDespeja();
 try{map.invalidateSize()}catch(e){}
};
$('navCreated').onclick=()=>{
 if(!createdSavedItem)return;
 loadSaved(createdSavedItem);
};
// El aviso se arma cuando el usuario ya ha llegado al recorrido.
// Se basa en tiempo y precisión, no en un número de lecturas consecutivas.
// sentidoRuta: +1 si vas como la ruta esta grabada, -1 si la haces al reves.
// Se reinicia con cada ruta nueva, que para eso resetOffRoute() se llama en
// selectRoute, loadSaved y clearActiveRoute.
let rumboSuave=null,sentidoRuta=1,refAvance=null,refAvanceT=0,alongPrevio=null,alongAcum=0,ultimoAlong=null,ultimoPuntoAlong=null;
// Cuantas veces se partio el track por quedarse sin senal. Un GPX con
// huecos no es el recorrido completo y hay que decirlo al terminar, no
// dejar que parezca entero.
let cortesGrabacion=0,nativeTrackComplete=true;
// El sentido se decide por el AVANCE SOBRE LA RUTA, no comparando rumbos.
// Comparar el rumbo del GPS con el del tramo mas cercano se equivoca en las
// curvas cerradas —en una lazada, el tramo mas cercano puede ser el de vuelta,
// que apunta justo al reves— y al arrancar, cuando el rumbo todavia no es
// fiable. Medido sobre 3 km siguiendo la ruta bien: ocho cambios falsos.
// Avanzar o retroceder sobre la ruta no tiene esa ambiguedad. Hacen falta
// 30 m netos para cambiar de opinion, asi que el baile del GPS no decide.
const AVANCE_DECIDE_M=30;
function decideSentido(along){
 if(!Number.isFinite(along))return;
 if(alongPrevio===null){alongPrevio=along;return}
 const paso=along-alongPrevio;alongPrevio=along;
 if(Math.abs(paso)>200)return;             // salto raro: no cuenta
 alongAcum=sentidoRuta>0?Math.min(0,alongAcum+paso):Math.max(0,alongAcum+paso);
 if(Math.abs(alongAcum)<AVANCE_DECIDE_M)return;
 const nuevo=alongAcum>0?1:-1;alongAcum=0;
 if(nuevo===sentidoRuta)return;
 sentidoRuta=nuevo;
 junctionWarned.clear();
 // El servicio hace su propia cuenta con la pantalla apagada y tambien lo
 // necesita. Un APK viejo no tiene setSentido: se queda como estaba.
 try{window.TrabakutikAndroid&&window.TrabakutikAndroid.setSentido&&window.TrabakutikAndroid.setSentido(sentidoRuta)}catch(e){}
 marcaAlReves(sentidoRuta<0);
 if(sentidoRuta<0){hablar('Recorrido en sentido inverso, giros corregidos');notice('La est\u00e1s haciendo al rev\u00e9s \u00b7 los giros van corregidos');}
}
// Lo que llevas y lo que te queda DE LA RUTA, no en linea recta. Sale del
// avance sobre el trazado, que es el mismo numero con el que se calculan los
// avisos de giro. Al reves se empieza por el final, asi que lo recorrido es
// lo que queda por detras.
// La rosa indica el rumbo que usa la flecha, medido desde el norte.
const RUMBOS=['N','NE','E','SE','S','SO','O','NO'];
let anguloBrujula=null,anguloFlecha=null;
function pintaBrujula(h){
 const caja=$('compass');
 if(!caja)return;
 if(!Number.isFinite(h)){caja.classList.add('hidden');anguloBrujula=null;return}
 const g=(Math.round(h)%360+360)%360;
 anguloBrujula=anguloBrujula===null?h:anguloBrujula+diferenciaRumbo(anguloBrujula,h);
 $('compassNeedle').style.transform='rotate('+anguloBrujula.toFixed(1)+'deg)';
 $('compassText').textContent=RUMBOS[Math.round(g/45)%8]+' · '+g+'°';
 caja.classList.remove('hidden');
}
// Cargar una ruta o consultar la ubicación no inicia la guía.
function guiaIniciada(){
 return !gpsApagadoPorTi&&mode==='nav'&&routePoints.length>1&&(recording||navegaNativo);
}
function pintaAvance(along){
 const caja=$('routeProgress');
 if(!caja)return;
 if(!guiaIniciada()||!Number.isFinite(along)||routeCumulative.length<2){caja.classList.add('hidden');return}
 const total=routeCumulative[routeCumulative.length-1];
 const hecho=Math.max(0,Math.min(total,sentidoRuta>0?along:total-along));
 const queda=Math.max(0,total-hecho);
 caja.innerHTML='Llevas <b>'+fmt(hecho)+'</b> \u00b7 faltan <b>'+fmt(queda)+'</b>';
 caja.classList.remove('hidden');
}
function marcaAlReves(si){
 const c=$('reverseWarn');
 if(c)c.classList.toggle('hidden',!si);
}
// Y SE LE DICE AL SERVICIO. Esto faltaba y es el fallo de «me dice derecha
// cuando es izquierda» al encadenar rutas. setSentido solo se llamaba cuando
// el sentido CAMBIA (en decideSentido), asi que al cargar otra ruta la pagina
// se ponia en «normal» y el servicio se quedaba con el «al reves» de la ruta
// anterior -si en aquella anduviste un tramo del reves- y seguia invirtiendo
// izquierda y derecha en la nueva. El servicio solo lo reiniciaba al PARAR la
// navegacion, no al cambiar de ruta. Lo conto el autor: con las rutas de la
// web va bien, y al crear una ruta y juntarla con una guardada «va fatal».
// resetOffRoute() se llama en los cinco sitios donde se cambia de ruta y en
// ninguno mas, asi que aqui no se repite por cada posicion.
function resetOffRoute(){alerted=false;farCount=0;farSince=0;onRouteSeen=false;sentidoRuta=1;
 try{window.TrabakutikAndroid&&window.TrabakutikAndroid.setSentido&&window.TrabakutikAndroid.setSentido(1)}catch(e){}
 marcaAlReves(false);
refAvance=null;refAvanceT=0;alongPrevio=null;alongAcum=0;ultimoAlong=null;ultimoPuntoAlong=null;liveProfileAlong=null;liveNativeMetrics=null;marcaAlReves(false);const pr=$('routeProgress');if(pr)pr.classList.add('hidden');const br=$('compass');if(br)br.classList.add('hidden')}
function updateOffRoute(d,accuracy){
 if(!guiaIniciada())return;
 if(!Number.isFinite(d)||!Number.isFinite(accuracy))return;
 // Evitar falsos positivos debidos a posiciones GPS imprecisas.
 // Mismo fallo que en el servicio: cortaba en 22 m y ademas borraba el
 // cronometro, asi que bajo arbolado el aviso no llegaba nunca. Los
 // umbrales de abajo ya crecen con la precision; aqui solo queda el corte
 // de cordura, y salta la lectura sin tocar la cuenta.
 if(accuracy>60)return;
 const near=d<=Math.max(11,accuracy+4);
 if(near){onRouteSeen=true;farSince=0;if(alerted){alerted=false;hablar('De nuevo en la ruta');notice('De nuevo en la ruta')}return}
 if(!onRouteSeen)return; // No avisar mientras nos acercamos al inicio.
 const far=d>Math.max(15,accuracy+7);
 if(!far){farSince=0;return}
 if(!farSince)farSince=Date.now();
 // 800 ms a 1,5 s por lectura significa DOS lecturas: basta un par de
 // saltos del GPS para dar la alarma. En el bolsillo, con el cuerpo
 // tapando el cielo y 20-45 m de precision, eso son 2,2 falsos avisos
 // por hora -el autor lo sufrio-. Con 4 s hacen falta cuatro lecturas
 // seguidas fuera: simulado, 0,0 falsos por hora, y un desvio de
 // verdad se detecta a 104 m en vez de a 86. Barato.
 if(!alerted&&Date.now()-farSince>=4000){alerted=true;if(!navegaNativo){getAudio();pitidos(4,.18)}hablar('Atención, fuera del recorrido');notice('Fuera del recorrido · vuelve a la línea cian')}
}
try{const modoGuardado=localStorage.getItem('trabakutik-audio-modo');if(['voz','pitidos','silencio'].includes(modoGuardado))audioModo=modoGuardado}catch(e){}
try{window.TrabakutikAndroid?.setAudioModo?.(audioModo)}catch(e){}
function avisaModoAudioNativo(){
 try{window.TrabakutikAndroid?.setAudioModo?.(audioModo)}catch(e){}
}
function pintaModoAudio(){
 const b=$('audioMode');if(!b)return;
 b.dataset.modo=audioModo;
 const nombres={voz:'Voz y pitidos',pitidos:'Solo pitidos',silencio:'Silencio'};
 b.title='Avisos sonoros: '+nombres[audioModo];b.setAttribute('aria-label','Avisos sonoros: '+nombres[audioModo]);
 const altavoz='<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>';
 const dibujos={voz:altavoz+'<path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
  pitidos:'<path d="M3 12h3l3-7 6 14 3-7h3"/>',
  silencio:altavoz+'<path d="m16 9 6 6m0-6-6 6"/>'};
 b.innerHTML='<svg id="audioIcon" viewBox="0 0 24 24" width="21" height="21" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+dibujos[audioModo]+'</svg><small class="audio-label" aria-hidden="true">'+({voz:'Voz',pitidos:'Pitidos',silencio:'Silencio'})[audioModo]+'</small>';
}
function hablarGiro(texto){if(!giraNativo)hablaPagina(texto)}
function hablar(texto){
 // Si navega el servicio, habla el: tiene TextToSpeech y sigue sonando con la
 // pantalla apagada, que es cuando hace falta. La pagina se duerme ahi, asi
 // que su voz solo valia mirando el movil. Es la misma regla que los pitidos.
 if(navegaNativo)return;
 hablaPagina(texto);
}
function hablaPagina(texto){
 if(gpsApagadoPorTi)return;
 if(audioModo!=='voz'||!('speechSynthesis' in window))return;
 try{window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(texto);u.lang='es-ES';u.rate=1.05;window.speechSynthesis.speak(u)}catch(e){}
}
// QUEDARSE SIN SATELITES SE DICE EN ALTO, no solo escrito en la barra de
// abajo. Con el movil en el bolsillo no te enterabas de que habias dejado de
// estar guiado y seguias andando esperando el aviso del siguiente cruce. Lo
// pidio el autor despues de cortar los satelites a proposito y no oir nada.
// Si quien navega es el servicio, habla el -la pagina se duerme-: por eso va
// por hablar() y los pitidos solo suenan si no esta el servicio detras.
let sinGpsAvisado=false;
function avisaSinGps(apagada){
 if(sinGpsAvisado)return;
 sinGpsAvisado=true;
 // Dos pitidos lentos: los giros son de uno a tres seguidos, asi que este no
 // se confunde con ninguno.
 if(!navegaNativo){getAudio();pitidos(2,.7)}
 hablar(apagada?'Atención, la ubicación del teléfono está apagada'
               :'Atención, sin señal GPS');
}
function vuelveElGps(){
 if(!sinGpsAvisado)return;
 sinGpsAvisado=false;
 hablar('Señal GPS recuperada');
}
function conmutaModoAudio(){
 audioModo=audioModo==='voz'?'pitidos':audioModo==='pitidos'?'silencio':'voz';
 try{localStorage.setItem('trabakutik-audio-modo',audioModo)}catch(e){}
 pintaModoAudio();avisaModoAudioNativo();notice('Avisos sonoros: '+(audioModo==='voz'?'voz y pitidos':audioModo==='pitidos'?'solo pitidos':'silencio'));
 if(audioModo==='voz')hablar('Voz activada');
 else callaYa(audioModo==='silencio');
}
function getAudio(){try{if(!audio)audio=new (window.AudioContext||window.webkitAudioContext)();audio.resume().catch(()=>{})}catch(e){}}
// Un grupo de n pitidos agudos, y el numero es el dato: 1 pitido = cruce a
// 50 m, 2 = a 10 m, 3 = lo tienes encima, 4 = fuera de ruta. Los cuatro de
// fuera de ruta van mas seguidos (.18 s) que los de giro (.30 s), porque
// tres y cuatro pitidos al mismo ritmo no se distinguen de oido.
// La flecha del giro, dibujada con los grados de verdad: un arco tangente a
// las dos rectas, no un glifo fijo. Las dos ramas se separan solas 2R, asi
// que una vuelta de 160 grados sale legible y no doblada sobre si misma.
// deg = cuanto se desvia de seguir recto; dir: -1 izquierda, +1 derecha.
// El sentido va DENTRO de «a»: multiplicar otra vez por dir dibujaba los
// giros a la izquierda hacia la derecha.
function flechaGiro(deg,dir,tam,grosor){
 const R=17,entra=30,sale=26,cabeza=14,a=deg*Math.PI/180*dir;
 const bx=0,by=0,ox=bx+R*dir,oy=by;
 const gira=(x,y,t)=>[ox+(x-ox)*Math.cos(t)-(y-oy)*Math.sin(t),
                      oy+(x-ox)*Math.sin(t)+(y-oy)*Math.cos(t)];
 const [cx,cy]=gira(bx,by,a);
 const dx=Math.sin(a),dy=-Math.cos(a);
 const px=cx+dx*sale,py=cy+dy*sale,sx=bx,sy=by+entra,nx=-dy,ny=dx;
 const b1x=px-dx*cabeza+nx*cabeza*.55,b1y=py-dy*cabeza+ny*cabeza*.55;
 const b2x=px-dx*cabeza-nx*cabeza*.55,b2y=py-dy*cabeza-ny*cabeza*.55;
 const qx=px-dx*cabeza*.8,qy=py-dy*cabeza*.8,sentido=dir>0?1:0;
 const d='M'+sx.toFixed(1)+' '+sy.toFixed(1)+' L'+bx.toFixed(1)+' '+by.toFixed(1)+
         ' A'+R+' '+R+' 0 0 '+sentido+' '+cx.toFixed(1)+' '+cy.toFixed(1)+
         ' L'+qx.toFixed(1)+' '+qy.toFixed(1);
 const pts=[[sx,sy],[px,py],[b1x,b1y],[b2x,b2y]];
 for(let t=0;t<=1.0001;t+=.05)pts.push(gira(bx,by,a*t));
 const xs=pts.map(q=>q[0]),ys=pts.map(q=>q[1]),m=grosor*.6+2;
 const x0=Math.min(...xs)-m,y0=Math.min(...ys)-m;
 const w=Math.max(...xs)-Math.min(...xs)+m*2,h=Math.max(...ys)-Math.min(...ys)+m*2;
 const lado=Math.max(w,h),vx=x0-(lado-w)/2,vy=y0-(lado-h)/2;
 const id='fg'+Math.round(deg)+(dir>0?'d':'i');
 return '<svg viewBox="'+vx.toFixed(1)+' '+vy.toFixed(1)+' '+lado.toFixed(1)+' '+lado.toFixed(1)+
  '" width="'+tam+'" height="'+tam+'" aria-hidden="true">'+
  '<defs><linearGradient id="'+id+'" x1="0" y1="1" x2="0" y2="0">'+
  '<stop offset="0" stop-color="#2aa6c4"/><stop offset="1" stop-color="#c8fbff"/></linearGradient></defs>'+
  '<path d="'+d+'" fill="none" stroke="url(#'+id+')" stroke-width="'+grosor+'" stroke-linecap="round"/>'+
  '<path d="M'+px.toFixed(1)+' '+py.toFixed(1)+' L'+b1x.toFixed(1)+' '+b1y.toFixed(1)+
  ' L'+b2x.toFixed(1)+' '+b2y.toFixed(1)+' Z" fill="#c8fbff"/></svg>';
}
