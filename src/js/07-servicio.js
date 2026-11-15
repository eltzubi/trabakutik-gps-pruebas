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
if(typeof document!=='undefined')pintaVersion();
if(typeof document!=='undefined')$('despeja').onclick=()=>{
 document.body.classList.toggle('despejado');
 pintaDespeja();
 try{map.invalidateSize()}catch(e){}
};
if(typeof document!=='undefined')$('navCreated').onclick=()=>{
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
// LO QUE LLEVAS, EN GRANDE Y ABAJO. Iba en una linea de 11 px arriba, junto
// a la brujula, en letra clara. El autor: «la distancia que llevamos, el
// tiempo y toda esa informacion un poco mas grande, en un recuadro abajo;
// arriba se ve demasiado pequeñito». Ahora es un recuadro oscuro abajo a la
// izquierda, encima de la tarjeta del giro. La linea de arriba se sigue
// rellenando (la leen las pruebas) pero ya no se ve.
// Desde el 15 de noviembre de 2026 son DOS TARJETAS BLANCAS, distancia y
// alturas, sin el tiempo ni el nombre de la ruta: «solo distancias y
// alturas», eligiendo la opcion 3 de las propuestas.
// «HECHOS» ES LO QUE HAS ANDADO, NO DONDE ESTAS EN LA RUTA. El autor salio
// kilometro y medio antes del principio de Trabakua-Mendibil y el recuadro
// contaba desde el principio de la ruta: «la distancia me la esta cogiendo
// desde el punto de inicio de la ruta, pero hemos salido kilometro y medio
// mas abajo». Grabando, se suma el trazado grabado (la linea roja); sin
// grabar, queda lo de antes, el avance sobre la ruta. Se suma solo lo nuevo.
let metrosAndados={lista:null,n:0,m:0};
const puntoValido=q=>Array.isArray(q)&&Number.isFinite(q[0])&&Number.isFinite(q[1]);
// Y SIN SUMAR LOS CORTES. Un corte de la grabacion (sin GPS, un tunel) es un
// trozo que no se sabe por donde fue: antes se sumaba la recta entre sus dos
// extremos. Ahora el null del trazado corta la cuenta (revision con GPT).
// El trazado se da por «solo crece» (el servicio solo añade puntos al final);
// si encoge o cambia de array, se cuenta otra vez entero.
function metrosGrabados(){
 const c=metrosAndados;
 if(typeof recorded==='undefined'||!Array.isArray(recorded)||recorded.length<2){c.lista=null;c.n=0;c.m=0;c.ultimo=null;return 0}
 if(c.lista!==recorded||recorded.length<c.n){c.lista=recorded;c.n=0;c.m=0;c.ultimo=null}
 for(let k=c.n;k<recorded.length;k++){
  const q=recorded[k];
  if(!puntoValido(q)){c.ultimo=null;continue}
  if(c.ultimo)c.m+=dist(c.ultimo,q);
  c.ultimo=q;
 }
 c.n=recorded.length;
 return c.m;
}
// TODO DESDE DONDE EMPIEZAS TU, NO DESDE DONDE EMPIEZA LA RUTA. Lo pidio el
// autor el 15 de noviembre de 2026: salio 1,5 km antes de Trabakua-Mendibil,
// otro dia arranco en la cima, y lo subido y la barra contaban desde el
// principio de la ruta. Revisado con GPT en dos rondas. Ahora:
// - hechos: lo andado grabado, sin los cortes; sin grabar, «—», que restar
//   posiciones sobre la ruta no es lo andado, y tampoco hay barra;
// - antes de llegar a la ruta, y fuera de ella, se dice a cuanto esta;
// - la barra es lo andado frente a lo andado mas lo que queda; la posicion
//   sobre la ruta va aparte y es la que mueve el punto del perfil;
// - lo subido se saca recorriendo TU trazado grabado sobre el perfil de la
//   ruta (abajo, subidaSesion). Si falta un trozo -lejos de la ruta, un
//   corte, un salto, sin alturas- la cifra lleva «~»: es una estimacion
//   parcial, no un minimo garantizado.
// - la altitud y el punto, solo con una posicion buena y en la ruta.
let enRutaUltimo=false;
function pintaAvance(along,info){
 const caja=$('routeProgress');
 if(!caja)return;
 const tb=$('tripBox');
 if(!guiaIniciada()||routeCumulative.length<2){
  caja.classList.add('hidden');faltaSubidaRuta=null;enRutaUltimo=false;
  if(tb&&!tb.classList.contains('hidden')){tb.classList.add('hidden');document.body.classList.remove('con-panel');$('tripGps').textContent='—'}
  return;
 }
 const total=routeCumulative[routeCumulative.length-1];
 const conPos=Number.isFinite(along)&&total>0;
 // Sin «info» (llamadas antiguas y pruebas) se da por bueno que esta en la ruta.
 // Con una posicion mala (enRuta null) no se sabe: ni en la ruta ni fuera.
 const estado=!info?'ruta':info.enRuta===true?'ruta':info.enRuta===false?'fuera':'dudosa';
 if(info&&info.enRuta!=null)enRutaUltimo=info.enRuta;
 const hechoRuta=conPos?Math.max(0,Math.min(total,sentidoRuta>0?along:total-along)):0;
 const queda=conPos?Math.max(0,total-hechoRuta):null;
 if(conPos){caja.innerHTML='Llevas <b>'+fmt(hechoRuta)+'</b> · faltan <b>'+fmt(queda)+'</b>';caja.classList.remove('hidden')}
 else caja.classList.add('hidden');
 if(!tb)return;
 // Con un decimal, que en grande se lee de un vistazo: «12,4 km».
 const km=m=>m>=1000?(m/1000).toFixed(1).replace('.',',')+' km':Math.round(m)+' m';
 const andado=recording?metrosGrabados():null;
 if(andado===null){$('tripHecho').textContent='—';$('tripHechoU').textContent=''}
 else{const [numero,unidad]=km(andado).split(' ');$('tripHecho').textContent=numero;$('tripHechoU').textContent=unidad}
 const aDist=info&&Number.isFinite(info.distRuta)?km(info.distRuta):'—';
 if(!conPos){$('tripQuedaTxt').textContent='ruta a ';$('tripQueda').textContent=aDist}
 else if(estado==='fuera'){$('tripQuedaTxt').textContent='fuera · ruta a ';$('tripQueda').textContent=aDist}
 else{$('tripQuedaTxt').textContent='quedan ';$('tripQueda').textContent=km(queda)}
 // La barra solo con lo andado: sin grabar no hay salida que medir.
 const frac=andado!==null&&queda!==null&&andado+queda>0?andado/(andado+queda):0;
 $('tripBarra').style.width=(frac*100).toFixed(1)+'%';
 $('tripRuta').textContent=$('mapTitle')?.textContent||'';
 $('tripGps').textContent=info&&Number.isFinite(info.precision)?'±'+Math.round(info.precision)+' m':(info?'—':$('tripGps').textContent);
 pintaAlturas(conPos?along/total:null,estado);
 if(tb.classList.contains('hidden')){tb.classList.remove('hidden');document.body.classList.add('con-panel');try{map.invalidateSize()}catch(e){}}
}
// LAS ALTURAS SALEN DEL PERFIL DE LA RUTA, NO DEL GPS. La altura del GPS de
// Android va sobre el elipsoide (unos 50 m de mas aqui), se equivoca 10-20 m
// y el trazado que manda el servicio ni la trae. Umbral de 5 m, como el
// servicio, y un hueco sin altura vuelve a empezar la cuenta.
let perfilTrip={clave:null,datos:null};
const BINS_TRIP=80;
// navigationProfilePoints puede devolver un array NUEVO en cada llamada (una
// ruta de la web con las alturas aparte): la cache va por lo que lo decide,
// no por el array, o se rehacia todo -perfil, rejilla y lo subido- en cada
// posicion (revision con GPT).
function clavePerfil(){
 return [routePoints,typeof chosen==='undefined'?-1:chosen,typeof profileHeights==='undefined'?null:profileHeights,typeof perfilGuardado==='undefined'?null:perfilGuardado,typeof detailedProfilePoints==='undefined'?null:detailedProfilePoints];
}
function mismaClave(a,b){return !!a&&!!b&&a.length===b.length&&a.every((x,i)=>x===b[i])}
function perfilDeAlturas(){
 const clave=clavePerfil();
 if(mismaClave(perfilTrip.clave,clave))return perfilTrip.datos;
 const crudo=typeof navigationProfilePoints==='function'?navigationProfilePoints():routePoints;
 const pts=Array.isArray(crudo)?crudo.filter(puntoValido):[];
 let datos=null;
 if(pts.filter(p=>Number.isFinite(p[2])).length>=2){
  const n=pts.length,d=new Float64Array(n),h=pts.map(p=>Number.isFinite(p[2])?p[2]:null);
  for(let i=1;i<n;i++)d[i]=d[i-1]+dist(pts[i-1],pts[i]);
  const T=d[n-1];
  if(T>0){
   const M=BINS_TRIP,muestras=[];
   for(let s=0;s<=M;s++)muestras.push(alturaEnPerfil({d,h,n},T*s/M));
   const conocidas=muestras.filter(v=>v!==null);
   // Rejilla de tramos: cada tramo en las celdas que de verdad cruza (con
   // un margen de una celda), no en todo su rectangulo. Un tramo de mas de
   // 2 km es un salto del trazado, no un camino: no se indexa.
   const CEL=0.0004,rej=new Map(),mete=(x,y,k)=>{const key=x+'/'+y;let l=rej.get(key);if(!l)rej.set(key,l=[]);if(l[l.length-1]!==k)l.push(k)};
   for(let k=0;k<n-1;k++){
    const A=pts[k],B=pts[k+1],largo=d[k+1]-d[k];
    if(largo>2000)continue;
    const pasos=Math.max(1,Math.ceil(largo/20));
    for(let s=0;s<=pasos;s++){
     const la=A[0]+(B[0]-A[0])*s/pasos,lo=A[1]+(B[1]-A[1])*s/pasos;
     const cx=Math.floor(la/CEL),cy=Math.floor(lo/CEL);
     for(let x=cx-1;x<=cx+1;x++)for(let y=cy-1;y<=cy+1;y++)mete(x,y,k);
    }
   }
   datos={pts,d,h,T,n,muestras,lo:conocidas.length?Math.min(...conocidas):0,hi:conocidas.length?Math.max(...conocidas):0,rej,CEL};
  }
 }
 perfilTrip={clave,datos,dibujo:null};
 return datos;
}
// El primer vertice con distancia >= x (busqueda binaria).
function primeroDesde(P,x){let lo=0,hi=P.n;while(lo<hi){const m=(lo+hi)>>1;if(P.d[m]<x)lo=m+1;else hi=m}return lo}
// La altura en x. Si a uno de los dos extremos del tramo le falta la altura,
// no se inventa: null (antes se cogia la del vecino; revision con GPT).
function alturaEnPerfil(P,x){
 let lo=0,hi=P.n-1;
 while(lo<hi-1){const m=(lo+hi)>>1;if(P.d[m]<=x)lo=m;else hi=m}
 const j=Math.min(lo+1,P.n-1),a=P.h[lo],b=P.h[j];
 const t=P.d[j]>P.d[lo]?Math.max(0,Math.min(1,(x-P.d[lo])/(P.d[j]-P.d[lo]))):0;
 if(t===0)return a;if(t===1)return b;
 return a!==null&&b!==null?a+t*(b-a):null;
}
// El umbral de 5 m con su estado: se le van dando alturas en el orden en que
// se andan. Un null (sin altura) corta: la siguiente vuelve a ser referencia.
function nuevaCuenta(){return {ref:null,sube:0,baja:0,huecos:0}}
function cuenta(c,h){
 if(h===null||!Number.isFinite(h)){c.ref=null;c.huecos++;return}
 if(c.ref===null){c.ref=h;return}
 if(h>=c.ref+5){c.sube+=h-c.ref;c.ref=h}else if(h<=c.ref-5){c.baja+=c.ref-h;c.ref=h}
}
// Las alturas de a a b por el perfil, EN EL ORDEN EN QUE SE ANDAN, con los
// vertices de en medio: comparar solo las dos puntas se come la cima que hay
// entre ellas. Solo se miran los vertices entre a y b (busqueda binaria): ir
// por todos en cada pareja eran cientos de millones de vueltas al despertar
// con un trazado largo (revision con GPT).
function recorrePerfil(P,c,a,b){
 if(b>=a){for(let i=primeroDesde(P,a);i<P.n&&P.d[i]<b;i++)if(P.d[i]>a)cuenta(c,P.h[i])}
 else{for(let i=primeroDesde(P,a)-1;i>=0&&P.d[i]>b;i--)if(P.d[i]<a)cuenta(c,P.h[i])}
 cuenta(c,alturaEnPerfil(P,b));
}
// Lo que se sube de a a b, empezando la cuenta en a: asi se cuenta igual al
// derecho y al reves. Restar acumulados desde el principio no valia: el
// umbral depende de lo de antes, y al reves no es lo mismo que bajar
// (0 -> 4 -> 10 m daba 6 en vez de 10; revision con GPT).
function subidaEntre(P,a,b){
 const c=nuevaCuenta();cuenta(c,alturaEnPerfil(P,a));recorrePerfil(P,c,a,b);return c.sube;
}
// Donde cae un punto en la ruta. Entre los tramos a menos de 30 m, los que se
// pueden haber andado desde el punto anterior (no mas lejos que «alcance»)
// son los candidatos, y de ellos gana el MAS CERCANO al punto. La continuidad
// es una condicion, no una penalizacion: sumarla al coste dejaba al punto 10
// m por detras en una recta (revision con GPT). Si ninguno es alcanzable, el
// mas cercano de todos, y la cuenta se corta (salto).
function casaEnRuta(P,q,previo,alcance){
 const l=P.rej.get(Math.floor(q[0]/P.CEL)+'/'+Math.floor(q[1]/P.CEL));
 if(!l)return null;
 const kx=111195*Math.cos(q[0]*Math.PI/180),ky=111195;
 let cerca=null,dCerca=Infinity,alc=null,dAlc=Infinity;
 for(const k of l){
  const A=P.pts[k],B=P.pts[k+1];
  const ax=(A[1]-q[1])*kx,ay=(A[0]-q[0])*ky,dx=(B[1]-A[1])*kx,dy=(B[0]-A[0])*ky,nn=dx*dx+dy*dy;
  const t=nn?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/nn)):0,ex=ax+t*dx,ey=ay+t*dy,dd2=ex*ex+ey*ey;
  if(dd2>900)continue;
  const dd=Math.sqrt(dd2),along=P.d[k]+t*(P.d[k+1]-P.d[k]);
  if(dd<dCerca){dCerca=dd;cerca=along}
  if(previo!==null&&Math.abs(along-previo)<=alcance&&dd<dAlc){dAlc=dd;alc=along}
 }
 return alc!==null?alc:cerca;
}
// LO SUBIDO DE TU SALIDA. Se recorre el trazado grabado entero -lo da el
// servicio, asi que vale aunque la pagina haya dormido con la pantalla
// apagada- y solo se procesan los puntos nuevos. Cada punto se casa con la
// ruta; entre dos puntos casados y seguidos se recorre el perfil de en medio.
// Un corte, un tramo con alguna punta lejos de la ruta, un salto que no se ha
// podido andar (mas del doble de lo movido mas 30 m) o un hueco sin alturas
// cortan la cuenta y la marcan como PARCIAL: no se inventa por donde fue.
let subSes=null;
// Lo subido y bajado que mide el BAROMETRO del movil, si lo tiene: lo manda el
// servicio con el trazado (AlturaBarometrica.java). Cubre tambien lo andado
// fuera de la ruta, asi que cuando esta manda el, y sin «~».
let baroNativo=null;
const BARO_VIEJO_MS=90000;
function subidaSesion(P){
 if(!recording||!Array.isArray(recorded))return null;
 const clave=q=>puntoValido(q)?q[0].toFixed(6)+','+q[1].toFixed(6):'-';
 const primero=recorded.find(puntoValido);
 const s=subSes;
 if(!s||s.P!==P||recorded.length<s.n||s.primero!==clave(primero)||(s.n>0&&clave(recorded[s.n-1])!==s.ultimo)){
  subSes={P,n:0,primero:clave(primero),ultimo:'-',previo:null,punto:null,c:nuevaCuenta(),fuera:0,parcial:false,bins:new Uint8Array(BINS_TRIP)};
 }
 const S=subSes,marca=(a,b)=>{const i0=Math.floor(Math.min(a,b)/P.T*BINS_TRIP),i1=Math.floor(Math.max(a,b)/P.T*BINS_TRIP);for(let i=Math.max(0,i0);i<=Math.min(BINS_TRIP-1,i1);i++)S.bins[i]=1};
 for(let k=S.n;k<recorded.length;k++){
  const q=recorded[k];
  if(!puntoValido(q)){if(S.punto)S.parcial=true;S.previo=null;S.punto=null;S.c.ref=null;continue}
  const paso=S.punto?dist(S.punto,q):0,alcance=2*paso+30;
  const along=casaEnRuta(P,q,S.previo,alcance);
  if(along===null){if(S.punto)S.fuera+=paso;S.previo=null;S.c.ref=null}
  else if(S.previo!==null&&Math.abs(along-S.previo)<=alcance){recorrePerfil(P,S.c,S.previo,along);marca(S.previo,along)}
  else{
   // Primer punto en la ruta, o se llega desde fuera, o un salto.
   if(S.punto){S.fuera+=paso;if(S.previo!==null)S.parcial=true}
   S.c.ref=null;cuenta(S.c,alturaEnPerfil(P,along));marca(along,along);
  }
  if(along!==null)S.previo=along;
  S.punto=q;
 }
 S.n=recorded.length;S.ultimo=clave(recorded[S.n-1]);
 return {sube:S.c.sube,baja:S.c.baja,parcial:S.parcial||S.fuera>=50||S.c.huecos>0,bins:S.bins};
}
function pintaAlturas(fracRuta,estado){
 const tb=$('tripBox'),P=perfilDeAlturas();
 if(!P){tb.classList.add('sin-alturas');faltaSubidaRuta=null;for(const id of ['tripSubido','tripBajado','tripAltitud'])$(id).textContent='—';$('tripFalta').textContent='—';return}
 tb.classList.remove('sin-alturas');
 const S=subidaSesion(P);
 // Si el barometro lleva mas de BARO_VIEJO_MS sin dar una lectura, lo que
 // enseña no avanza: va con «~» (revision con GPT).
 if(recording&&baroNativo){const al=baroNativo.t&&Date.now()-baroNativo.t>BARO_VIEJO_MS?'~':'';$('tripSubido').textContent=al+Math.round(baroNativo.sube);$('tripBajado').textContent=al+Math.round(baroNativo.baja)}
 else if(!S){$('tripSubido').textContent='—';$('tripBajado').textContent='—'}
 else{const al=S.parcial?'~':'';$('tripSubido').textContent=al+Math.round(S.sube);$('tripBajado').textContent=al+Math.round(S.baja)}
 const pos=fracRuta===null?null:fracRuta*P.T;
 // La altitud y el punto, solo estando en la ruta AHORA y con una posicion
 // buena: la ultima posicion buena no es la altitud de donde estas.
 const altura=pos!==null&&estado==='ruta'?alturaEnPerfil(P,pos):null;
 $('tripAltitud').textContent=altura===null?'—':String(Math.round(altura));
 // Lo que falta, desde la ultima posicion buena en la ruta; fuera de ella se
 // deja lo ultimo dicho, que salirse unos metros no cambia lo que queda.
 if(pos!==null&&estado==='ruta'){
  const falta=subidaEntre(P,pos,sentidoRuta>0?P.T:0);
  $('tripFalta').textContent='▲'+Math.round(falta)+' m';faltaSubidaRuta=falta;
 }else if(pos===null){$('tripFalta').textContent='—';faltaSubidaRuta=null}
 // El perfil, en el sentido de la marcha: lo que viene, a la derecha. Un
 // trozo sin alturas se deja en blanco, no pegado al suelo.
 const W=300,H=48;
 const xDe=v=>(sentidoRuta>0?v/P.T:1-v/P.T)*W;
 const y=v=>(H-3-(v-P.lo)/Math.max(30,P.hi-P.lo)*(H-8)).toFixed(1);
 if(perfilTrip.dibujo!==sentidoRuta){
  const m=sentidoRuta>0?P.muestras:P.muestras.slice().reverse(),M=m.length-1;
  let linea='',area='',tramo=[];
  const cierra=()=>{if(tramo.length>1){const l=tramo.map((q,i)=>(i?'L':'M')+q[0]+' '+q[1]).join(' ');linea+=l+' ';area+=l+' L'+tramo[tramo.length-1][0]+' '+H+' L'+tramo[0][0]+' '+H+' Z '}tramo=[]};
  m.forEach((v,s)=>{if(v===null)cierra();else tramo.push([(s/M*W).toFixed(1),y(v)])});cierra();
  $('tripPerfilLinea').setAttribute('d',linea.trim());
  $('tripPerfilArea').setAttribute('d',area.trim());$('tripPerfilHecho').setAttribute('d',area.trim());
  perfilTrip.dibujo=sentidoRuta;
 }
 // Sombreado lo que de verdad has pisado, a trozos: si entras en el km 5,
 // llegas al 8 y vuelves al 6, lo del 5 al 8 sigue hecho.
 let clip='';const w=W/BINS_TRIP;
 if(S)for(let i=0;i<BINS_TRIP;i++)if(S.bins[i]){const x=sentidoRuta>0?i*w:W-(i+1)*w;clip+='M'+x.toFixed(1)+' 0h'+w.toFixed(1)+'v'+H+'h-'+w.toFixed(1)+'Z'}
 $('tripHechoRect').setAttribute('d',clip);
 const p=$('tripPerfilPunto');
 if(altura===null)p.setAttribute('r','0');
 else{p.setAttribute('r','5');p.setAttribute('cx',xDe(pos).toFixed(1));p.setAttribute('cy',y(altura))}
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
refAvance=null;refAvanceT=0;alongPrevio=null;alongAcum=0;ultimoAlong=null;ultimoPuntoAlong=null;liveProfileAlong=null;liveNativeMetrics=null;if(typeof document!=='undefined')marcaAlReves(false);
 // Y se repinta: borrar el dato sin repintar dejaba en pantalla el ultimo
 // «Quedan 1611 m aprox.» con la salida ya terminada y el GPS apagado.
 if(typeof paintNavigationMetrics==='function')paintNavigationMetrics();
 const pr=$('routeProgress');if(pr)pr.classList.add('hidden');const br=$('compass');if(br)br.classList.add('hidden')}
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
// Para las pruebas: en la pagina «module» no existe y esto no hace nada. Su
// estado va con accesores: se lee y se escribe la variable de verdad.
if(typeof module==='object'&&module&&module.exports){
 module.exports={pintaVersion,versionMayor,miraActualizacion,decideSentido,pintaBrujula,guiaIniciada,metrosGrabados,pintaAvance,clavePerfil,mismaClave,perfilDeAlturas,primeroDesde,alturaEnPerfil,nuevaCuenta,cuenta,recorrePerfil,subidaEntre,casaEnRuta,subidaSesion,pintaAlturas,marcaAlReves,resetOffRoute,updateOffRoute,avisaModoAudioNativo,pintaModoAudio,hablarGiro,hablar,hablaPagina,avisaSinGps,vuelveElGps,conmutaModoAudio,getAudio,flechaGiro};
 Object.defineProperties(module.exports,{rumboSuave:{get:()=>rumboSuave,set:v=>{rumboSuave=v},enumerable:true},sentidoRuta:{get:()=>sentidoRuta,set:v=>{sentidoRuta=v},enumerable:true},refAvance:{get:()=>refAvance,set:v=>{refAvance=v},enumerable:true},refAvanceT:{get:()=>refAvanceT,set:v=>{refAvanceT=v},enumerable:true},alongPrevio:{get:()=>alongPrevio,set:v=>{alongPrevio=v},enumerable:true},alongAcum:{get:()=>alongAcum,set:v=>{alongAcum=v},enumerable:true},ultimoAlong:{get:()=>ultimoAlong,set:v=>{ultimoAlong=v},enumerable:true},ultimoPuntoAlong:{get:()=>ultimoPuntoAlong,set:v=>{ultimoPuntoAlong=v},enumerable:true},cortesGrabacion:{get:()=>cortesGrabacion,set:v=>{cortesGrabacion=v},enumerable:true},nativeTrackComplete:{get:()=>nativeTrackComplete,set:v=>{nativeTrackComplete=v},enumerable:true},anguloBrujula:{get:()=>anguloBrujula,set:v=>{anguloBrujula=v},enumerable:true},anguloFlecha:{get:()=>anguloFlecha,set:v=>{anguloFlecha=v},enumerable:true},metrosAndados:{get:()=>metrosAndados,set:v=>{metrosAndados=v},enumerable:true},enRutaUltimo:{get:()=>enRutaUltimo,set:v=>{enRutaUltimo=v},enumerable:true},perfilTrip:{get:()=>perfilTrip,set:v=>{perfilTrip=v},enumerable:true},subSes:{get:()=>subSes,set:v=>{subSes=v},enumerable:true},baroNativo:{get:()=>baroNativo,set:v=>{baroNativo=v},enumerable:true},sinGpsAvisado:{get:()=>sinGpsAvisado,set:v=>{sinGpsAvisado=v},enumerable:true}});
}
