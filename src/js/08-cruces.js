// HACIA DONDE SE CURVA LA FLECHA. Tambien en una herradura: antes, pasados
// los 145 grados, el giro se quedaba en «vuelta» y el lado se perdia, asi que
// una herradura a la izquierda se dibujaba girando a la derecha. Lo vio el
// autor en una de 173 grados. El TEXTO no cambia: sigue diciendo «curva de
// herradura» a secas, que es como lo pidio.
// Esta aparte de la funcion que pinta para poder probarla sin montar el mapa.
function ladoFlecha(turn,alReves){
 const crudo=turn.hacia||(turn.direction==='vuelta'?'derecha':turn.direction);
 return alReves?(crudo==='izquierda'?'derecha':'izquierda'):crudo;
}
// Velocidad suavizada, en m/s. Las indicaciones de giro se calculan con ella
// y la cruda del GPS pega saltos: un pico de 12 m/s estando parado
// adelantaria el primer aviso 90 metros sin motivo. Si el aparato no da
// velocidad se saca del avance entre dos lecturas.
let velocidadSuave=0,ultimaPosT=0;
function actualizaVelocidad(coords,prior,ahora){
 let v=coords&&Number.isFinite(coords.speed)&&coords.speed>=0?coords.speed:null;
 if(v===null&&prior&&ultimaPosT){
  const dt=(ahora-ultimaPosT)/1000;
  if(dt>.4&&dt<12)v=dist([coords.latitude,coords.longitude],prior)/dt;
 }
 ultimaPosT=ahora;
 if(v===null||!Number.isFinite(v))return;
 velocidadSuave=velocidadSuave?velocidadSuave*.7+Math.min(v,20)*.3:Math.min(v,20);
}
// Los avisos van por TIEMPO, no por metros: a 30 km/h cincuenta metros son
// seis segundos y andando son cuarenta y cinco. 9 s para el primer aviso y
// 3 s para el segundo, con suelo (25 y 8 m, para andar) y techo (90 y 30).
function distanciasDeAviso(){
 const v=velocidadSuave||1.2;
 // El tercero es SOLO para la voz, y va mucho antes. Un pitido informa al
 // instante; una frase tarda dos o tres segundos en decirse y para cuando
 // acaba ya estas en el cruce. 25 m a 10 km/h son nueve segundos: no da.
 // 18 segundos de margen, 35 m de suelo y 200 de techo. El suelo estaba en
 // 60 y andando a 4 km/h daba 54 s de antelacion: demasiado. Con 35 son 32 s
 // andando, y de 12 km/h para arriba no cambia nada.
 return [Math.min(90,Math.max(25,v*9)),Math.min(30,Math.max(8,v*3)),
         Math.min(200,Math.max(35,v*18))];
}
// Los pitidos de una tanda se programan todos de golpe para que suenen
// seguidos. Se guardan para poder cortarlos: si no, al poner silencio
// seguian saliendo uno detras de otro aunque ya nadie los quisiera.
let pitidosEnCurso=[];
function pitidos(n,sep){
 if(gpsApagadoPorTi||audioModo==='silencio'||!audio)return;
 const t=audio.currentTime;
 for(let i=0;i<n;i++){
  const o=audio.createOscillator(),g=audio.createGain(),at=t+i*sep;
  o.frequency.value=880;
  g.gain.setValueAtTime(.0001,at);
  g.gain.linearRampToValueAtTime(.13,at+.015);
  g.gain.exponentialRampToValueAtTime(.0001,at+.19);
  o.connect(g);g.connect(audio.destination);o.start(at);o.stop(at+.2);
  pitidosEnCurso.push(o);
  o.onended=()=>{pitidosEnCurso=pitidosEnCurso.filter(x=>x!==o)};
 }
}
// CALLAR AHORA MISMO, no «a partir de ahora». El modo se miraba solo al
// EMPEZAR a hablar o a pitar, asi que al poner silencio la frase que ya
// estaba sonando terminaba de decirse y los pitidos de esa tanda seguian
// saliendo. Con «pitidos» se corta la voz y nada mas; con «silencio», todo.
function callaYa(tambienPitidos){
 try{window.speechSynthesis&&window.speechSynthesis.cancel()}catch(e){}
 if(!tambienPitidos)return;
 for(const o of pitidosEnCurso)try{o.stop()}catch(e){}
 pitidosEnCurso=[];
}
function closestMeters(p,path){let best=Infinity;for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i];const latScale=111195,lonScale=latScale*Math.cos(p[0]*R),ax=(a[1]-p[1])*lonScale,ay=(a[0]-p[0])*latScale,bx=(b[1]-p[1])*lonScale,by=(b[0]-p[0])*latScale,dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy||1)));best=Math.min(best,Math.hypot(ax+t*dx,ay+t*dy))}return best}

// Separar cruces identificados de giros cerrados calculados sobre el trazado.
function resetJunctionView(){
 if(turnMarker){map.removeLayer(turnMarker);turnMarker=null}
 $('turnHint').classList.add('hidden');
 $('map').classList.remove('con-giro');
 $('map').style.removeProperty('--turn-alto');
 junctionActive=-1;junctionBlocked=-1;
 if(junctionZoom!==null){
  const original=junctionZoom;junctionZoom=null;
  autoZooming=true;map.setZoom(original,{animate:false});
  setTimeout(()=>{autoZooming=false},300);
 }
}
map.on('zoomstart',()=>{
 if(!autoZooming&&junctionActive>=0){
  junctionBlocked=junctionActive;
  junctionZoom=null; // Respetar el zoom que el usuario acaba de elegir.
 }
});
// LOS CRUCES DE LA ZONA, de OpenStreetMap. Un fichero para toda Mallabia y no
// uno por ruta, a proposito: asi un GPX que te bajes de Wikiloc y abras en la
// app tiene los mismos avisos de cruce que una ruta de la web. Son 17.515
// cruces, 127 KB -49 KB por el cable-, y se guardan en el movil para cuando no
// haya cobertura, que es cuando mas falta hacen. Lo genera
// scripts/make_cruces.py del repo Rutas-Mallabia.
const URL_CRUCES='https://raw.githubusercontent.com/eltzubi/Rutas-Mallabia/main/data/cruces-zona.json';
let zonaCruces=null,zonaPide=null,crucesPeticion=0,zonaRefrescada=false;
// Se guarda TAL COMO VIENE -en diferencias-, no descifrado: en pares de
// grados sueltos ocupa 338 KB del movil y asi 127, y ahi dentro estan tambien
// tus rutas guardadas, que se quedan sin sitio («No hay espacio para guardar
// la ruta»).
function guardaZona(j){
 try{localStorage.setItem('cruces-zona',JSON.stringify(j))}
 catch(e){/* sin sitio: se vuelve a bajar la proxima vez */}
}
function zonaGuardada(){
 try{
  const t=localStorage.getItem('cruces-zona');if(!t)return null;
  return descifraZona(JSON.parse(t));
 }catch(e){return null}
}
// LAS RAMAS DE CADA CRUCE, que es lo que de verdad decide si hay que avisar.
// Un byte por rama: bits 0-5 el rumbo en pasos de «paso_rama» grados, bit 6
// «esta rama es del mismo camino que la anterior» y bit 7 «ultima rama de
// este cruce». Asi no hay que guardar ni cuentas ni identificadores. Lo
// escribe scripts/make_cruces.py del repo Rutas-Mallabia.
// Devuelve, por cruce, una lista de CAMINOS, y cada camino la lista de
// rumbos con los que sale del cruce: [[84,264],[120,300]] es un cruce donde
// se cruzan dos caminos, cada uno con sus dos sentidos.
function descifraRamas(texto,paso,cuantos){
 if(typeof texto!=='string'||!texto)return null;
 let crudo;
 try{crudo=atob(texto)}catch(e){return null}
 const out=[];let grupos=[];
 for(let i=0;i<crudo.length;i++){
  const b=crudo.charCodeAt(i),rumbo=(b&63)*paso;
  if((b&64)&&grupos.length)grupos[grupos.length-1].push(rumbo);
  else grupos.push([rumbo]);
  if(b&128){out.push(grupos);grupos=[]}
 }
 if(grupos.length)out.push(grupos);
 // Un fichero a medias desplazaria las ramas de sitio y haria decir
 // «izquierda» en el cruce de al lado: mejor sin ramas que con las de otro.
 return out.length===cuantos?out:null;
}
function descifraZona(j){
 const esc=j.escala||100000,d=j.dif;
 if(!Array.isArray(d)||d.length<2||d.length%2)throw new Error('cruces-zona.json no valido');
 // Van en DIFERENCIAS sobre el cruce anterior: en pares de grados sueltos el
 // fichero pesa 338 KB, asi pesa 127 KB.
 const puntos=[];let x=0,y=0;
 for(let i=0;i<d.length;i+=2){
  x+=d[i];y+=d[i+1];
  const lat=x/esc,lon=y/esc;
  if(Number.isFinite(lat)&&Number.isFinite(lon))puntos.push([lat,lon]);
 }
 if(puntos.length<2)throw new Error('cruces-zona.json vacio');
 const ramas=descifraRamas(j.ramas,j.paso_rama||6,puntos.length);
 if(ramas)for(let i=0;i<puntos.length;i++)puntos[i].push(ramas[i]);
 return {bbox:Array.isArray(j.bbox)?j.bbox:null,fecha:j.fecha_osm||'',puntos,ramas:!!ramas};
}
function bajaZona(){
 return fetch(URL_CRUCES,{cache:'default'})
  .then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json()})
  .then(j=>{const z=descifraZona(j);guardaZona(j);return z});
}
function cargaZonaCruces(){
 if(zonaCruces){
  // Los guardados valen desde el primer segundo y sin cobertura. Se refrescan
  // una vez por sesion, de fondo, por si se han vuelto a bajar de OSM.
  if(!zonaRefrescada){
   zonaRefrescada=true;
   bajaZona().then(z=>{
    // Tambien por la FECHA y por las ramas: el dia que el fichero paso a
    // llevar los rumbos de las ramas, un movil con la copia vieja guardada
    // se habria quedado sin ellas para siempre si solo se mirara cuantos
    // cruces hay, porque pueden coincidir.
    const cambia=zonaCruces&&(z.puntos.length!==zonaCruces.puntos.length
      ||z.fecha!==zonaCruces.fecha||!!z.ramas!==!!zonaCruces.ramas);
    if(cambia){zonaCruces=z;aplicaCruces()}
   }).catch(()=>{});
  }
  return Promise.resolve(zonaCruces);
 }
 if(zonaPide)return zonaPide;
 const g=zonaGuardada();
 if(g){zonaCruces=g;return cargaZonaCruces()}
 zonaPide=bajaZona().then(z=>{zonaCruces=z;zonaRefrescada=true;return z})
  .catch(e=>{console.warn('Cruces de la zona no disponibles',e);zonaPide=null;return null});
 return zonaPide;
}
// Se queda con los cruces pegados al track que lleves cargado y rehace los
// avisos. Si el track esta fuera de Mallabia no hay cruces y se dice: mejor
// eso que avisar de curvas haciendolas pasar por cruces.
function aplicaCruces(){
 const pet=++crucesPeticion;
 if(routePoints.length<3){crucesOsm=[];return}
 cargaZonaCruces().then(z=>{
  if(!z||pet!==crucesPeticion||routePoints.length<3)return;
  const CEL=0.0006,celdas=new Set();
  for(const p of routePoints)celdas.add(Math.floor(p[0]/CEL)+'/'+Math.floor(p[1]/CEL));
  // Filtro por celda -unos 50 m-, no por distancia: aqui solo hay que
  // descartar los 17.000 que estan lejos. La distancia exacta la mira
  // computeJunctions, que es quien decide.
  const cerca=[];
  for(const c of z.puntos){
   const k0=Math.floor(c[0]/CEL),k1=Math.floor(c[1]/CEL);
   let toca=false;
   for(let a=-1;a<=1&&!toca;a++)for(let b=-1;b<=1;b++)
    if(celdas.has((k0+a)+'/'+(k1+b))){toca=true;break}
   if(toca)cerca.push(c);
  }
  crucesOsm=cerca;
  try{syncNativeRoute()}catch(e){console.warn('Ruta no enviada',e)}
  computeJunctions();
  if(!cerca.length){
   const p=routePoints[Math.floor(routePoints.length/2)],b=z.bbox;
   if(b&&(p[0]<b[0]||p[0]>b[2]||p[1]<b[1]||p[1]>b[3]))
    notice('Ruta fuera de la zona de Mallabia · solo avisos de giros cerrados del trazado');
   return;
  }
 });
}
// Los giros van SIEMPRE detras de los puntos, nunca antes. Los indices de un
// giro son posiciones dentro de la ruta que tenga el servicio: si se mandan
// giros del trazado fino cuando el servicio aun tiene el general, apuntan a
// otro sitio. Por eso esto esta aparte y lo llama tambien syncNativeRoute,
// justo despues de escribir los puntos.
function enviaGirosNativos(){
 if(!window.TrabakutikAndroid?.setJunctions)return;
 try{
  // «t»: 0 curva de herradura, 1 cruce, 2 cruce en el que hay que seguir por
  // un lado sin apenas girar -«sigue por la derecha»-. Un APK viejo no
  // conoce el 2 y lo trata como cruce, que es lo que era antes: se pierde el
  // matiz, no el aviso.
  // Una herradura lleva ahora su LADO en «dir» y «h»:1 para que el servicio
  // diga «curva de herradura a la derecha» en vez de «da la vuelta». Un APK
  // que no conozca «h» la cantara como «cruce a la derecha» o «curva cerrada
  // a la derecha»: el lado bueno, que es lo que importa.
  window.TrabakutikAndroid.setJunctions(JSON.stringify(junctions.map(j=>{
   const herradura=j.direction==='vuelta'&&!j.retorno,lado=herradura?j.hacia:j.direction;
   const o={i:j.i,dir:lado==='izquierda'?-1:lado==='derecha'?1:0,t:j.cruce?(j.mantente?2:1):0};
   if(herradura)o.h=1;
   return o;
  })));
 }catch(e){console.warn('Avisos de giro nativos no disponibles',e)}
}
// EL AVISO DE UN CRUCE SALE DE LAS RAMAS DEL CRUCE, NO DE LA FORMA DEL TRACK.
// Lo pidio el autor con estas palabras: «si se continua por el mismo camino
// no hay perdida, solo si hay que dejarlo para tomar otro; o una curva
// cerrada tambien se avisa».
//
// Por que hizo falta. Se salio de galdaramiño en el km 2,45, en la salida de
// la BI-633 encima de Osma: el ramal arranca casi recto y la que se va hacia
// un lado es la CARRETERA, asi que el track se dobla 8, 14 y 19 grados
// -medido en ventanas de 12, 20, 40 y 60 m- y el navegador, que decidia por
// el angulo del track, se callaba. No hay umbral que arregle eso: bajarlo a
// 25 grados sube los avisos un 76% y ESE cruce sigue mudo. Lo que falta no
// es sensibilidad, es saber que ahi se cambia de camino.
//
// Con las ramas la cuenta sale sola. En ese nodo hay dos caminos: la BI-633
// (84 y 264 grados) y el ramal (120 y 300). Llegas con rumbo 263, o sea por
// la rama de 84; la ruta coge la de 300, que es del OTRO camino -> aviso, y
// a la derecha, que es por donde se va respecto a la BI-633.
//
// Cuando se calla: cuando la rama que coges es del mismo camino por el que
// llegas (sigues por donde ibas, no hay perdida), y cuando te desvias menos
// de CRUCE_RECTO grados y ninguna otra rama va mas recta que la tuya -ahi
// vas recto de verdad y tampoco hay nada que elegir-.
//
// Medido sobre las 72 rutas y 1.600 km: 2.601 avisos, uno cada 615 m, frente
// a los 1.952 de antes -uno cada 820-. La ruta con mas es hirutxikiak, con
// 88; el servicio de Android admite hasta 2000 por ruta (GIROS_MAX).
const CRUCE_RECTO=25;
const RAMA_ENCAJA=45;
function difRumbo(a,b){let d=(a-b)%360;if(d>=180)d-=360;if(d<-180)d+=360;return d}
function decideCruce(cruce,centro,antes,despues){
 const grupos=cruce[2];
 if(!Array.isArray(grupos)||!grupos.length)return {sinRamas:true};
 const ramas=[];
 for(let g=0;g<grupos.length;g++)for(const r of grupos[g])ramas.push({r,g});
 if(ramas.length<3)return {sinRamas:true};
 const entra=bearingBetween(antes,centro),sale=bearingBetween(centro,despues);
 const detras=(entra+180)%360;
 let atras=ramas[0];
 for(const x of ramas)if(Math.abs(difRumbo(x.r,detras))<Math.abs(difRumbo(atras.r,detras)))atras=x;
 const resto=ramas.filter(x=>x!==atras);
 if(!resto.length)return null;
 let mia=resto[0];
 for(const x of resto)if(Math.abs(difRumbo(x.r,sale))<Math.abs(difRumbo(mia.r,sale)))mia=x;
 // LAS RAMAS TIENEN QUE SER LAS DE LA RUTA. El cruce se busca a 25 m del
 // punto, y a veces el que sale es OTRO, uno de al lado. Lo vio el autor el 14
 // de noviembre de 2026: llegaba a 101 grados y salia a 161 -derecha-, el
 // cruce encontrado estaba a 23 m con ramas a 6, 60 y 216, ninguna por donde
 // salia, y se le dijo «cruce a la izquierda». Si la rama por la que se sale,
 // o la de llegada, no se parece a la ruta, esas ramas no son de este giro: se
 // decide como sin ramas, por la forma del propio trazado. Medido en las 72
 // rutas: el lado de las ramas contradecia el giro del trazado en 295 avisos.
 if(Math.abs(difRumbo(mia.r,sale))>RAMA_ENCAJA||Math.abs(difRumbo(atras.r,detras))>RAMA_ENCAJA)return {sinRamas:true};
 if(mia.g===atras.g)return null;          // sigues por el mismo camino
 const otras=resto.filter(x=>x!==mia),desvio=difRumbo(mia.r,entra);
 let recta=null;
 for(const x of otras)if(!recta||Math.abs(difRumbo(x.r,entra))<Math.abs(difRumbo(recta.r,entra)))recta=x;
 // «Mas recta» con 5 grados de margen: por debajo de eso es el ruido del
 // rumbo del track y del redondeo de las ramas, no una eleccion.
 const masRecta=!!recta&&Math.abs(difRumbo(recta.r,entra))<Math.abs(desvio)-5;
 if(!masRecta&&Math.abs(desvio)<CRUCE_RECTO)return null;
 const mantente=Math.abs(desvio)<CRUCE_RECTO;
 // Yendo casi recto, el lado se dice respecto a la rama que SI va recta
 // -«sigue por la derecha»-, no respecto a por donde venias: son los dos
 // grados de diferencia los que no se ven, y lo que hay que decir es de que
 // lado se queda la buena.
 const lado=mantente?(difRumbo(mia.r,recta.r)<0?'izquierda':'derecha')
                    :(desvio<0?'izquierda':'derecha');
 return {grados:Math.round(Math.abs(desvio)),lado,mantente};
}
function computeJunctions(){
 resetJunctionView();
 junctions=[];junctionWarned.clear();junctionZoomOnce.clear();
 routeCumulative=[0];
 for(let k=1;k<routePoints.length;k++)routeCumulative[k]=routeCumulative[k-1]+dist(routePoints[k-1],routePoints[k]);
 if(routePoints.length<3){if(window.TrabakutikAndroid?.setJunctions)window.TrabakutikAndroid.setJunctions('[]');return;}
 const pts=routePoints;
 // Los cruces identificados admiten cambios de camino desde 45°.
 // Sin datos del cruce, solo se anuncian giros cerrados del trazado, desde
 // 85° sobre 12 m: las curvas suaves no producen una indicación.
 const VENTANA=12;
 const CRUCE_GIRO=45;
 // 130 GRADOS Y NO 85. Estuvo en 85 unos dias y el autor lo mando volver:
 // «cruces y curvas cerradas». Con 85 avisa de esquinas corrientes, que es
 // justo lo que el pidio quitar -«en realidad solo queria que me indicaran los
 // cruces no las curvas»-. Medido sobre 137,8 km de siete rutas: con 130 son
 // 218 avisos, uno cada 632 m, de los que 38 son curvas; con 85 son 276, uno
 // cada 499 m, y las curvas suben a 100. En la ruta de Lekeitio, 7 curvas
 // frente a 30. Antes de volver a bajarlo, preguntarselo.
 const CURVA_SOLA=130;
 // HORQUILLAS: LAS REVUELTAS EN ZETA DE LAS PISTAS. En 12 m una horquilla
 // apenas dobla 80 grados, asi que se callaba; y la de al lado SI avisaba, por
 // tener encima un cruce de OSM -donde basta con 45-. En la misma pista, una
 // hablaba y la otra no, y eso desconcierta andando. Lo autorizo el autor con
 // los numeros delante.
 // 160 GRADOS Y NO 150. Medido sobre las 72 rutas, 1600 km, con los cruces
 // publicados: hoy 1732 avisos, uno cada 924 m. Con 150 se van a 2088, uno
 // cada 766 m, un 21% mas; con 160 a 1961, uno cada 816 m, un 13% mas, que es
 // lo que el autor autorizo. La tabla entera, por si hay que mover el dial:
 //   150/40 -> 2088 (uno cada 766 m)   160/40 -> 1961 (816 m)
 //   150/30 -> 2027 (789 m)            160/30 -> 1920 (833 m)
 //   170/40 -> 1860 (860 m)            175/25 -> 1782 (898 m)
 // Las curvas corrientes no se enteran: un arco de radio 25 m solo dobla 92
 // grados en 40 m, y una S entra y sale con el mismo rumbo, asi que da 0.
 const HORQUILLA=160,VENTANA_HORQUILLA=40;
 const CERCA_CRUCE=25;
 // Un aviso por cruce y no uno por punto: la ruta deja varios puntos dentro
 // de los 25 m de un mismo nodo y el de 35 m de abajo no siempre los junta.
 // POR PASO, NO POR RUTA. Era un Set de toda la ruta, y si la ruta volvia a
 // pasar por el mismo cruce y alli cambiaba de camino, el segundo paso se
 // quedaba mudo, tambien en el servicio con la pantalla apagada. Medido sobre
 // las 72 rutas publicadas: 114 avisos de mas en 42 rutas al dejar avisar
 // otra vez (santaeufemia 35->47, intxorta 73->82). Ahora se guarda en que
 // punto de la ruta se aviso, y vale otra vez solo si DESDE ENTONCES la ruta
 // se ha alejado del nodo mas de SALIDA_CRUCE_M: eso es salir y volver a
 // entrar, un paso nuevo. No vale medirlo en metros recorridos -se probo con
 // 60 m-: una herradura alrededor del propio cruce recorre mas que eso sin
 // salir de sus 25 m y lo habria avisado dos veces.
 // Y se apunta SOLO si el aviso se queda en la lista. Antes se apuntaba al
 // decidir, y si despues el filtro de 35 m lo tiraba, el cruce quedaba
 // «dicho» sin aviso ninguno.
 const crucesDichos=new Map(),SALIDA_CRUCE_M=40;
 const haSalido=(cruce,desde,hasta)=>{
  for(let k=desde+1;k<hasta;k++)if(dist(pts[k],cruce)>SALIDA_CRUCE_M)return true;
  return false;
 };
 const CELDA=0.0006,rejCruces=new Map();
 for(const c of crucesOsm){
  const k=Math.floor(c[0]/CELDA)+'/'+Math.floor(c[1]/CELDA);
  let l=rejCruces.get(k);if(!l)rejCruces.set(k,l=[]);l.push(c);
 }
 // Medir a distancias fijas evita que la densidad de puntos del GPX
 // convierta una curva suave en un giro cerrado al simplificarla.
 const geometriaEn=(i,V)=>{
  const centro=pts[i];
  const muestra=paso=>{
   let j=i,recorrido=0;
   while(j+paso>=0&&j+paso<pts.length){
    const k=j+paso,d=dist(pts[j],pts[k]);
    if(d>0&&recorrido+d>=V){
     const t=(V-recorrido)/d;
     return [pts[j][0]+t*(pts[k][0]-pts[j][0]),pts[j][1]+t*(pts[k][1]-pts[j][1])];
    }
    recorrido+=d;j=k;
   }
   return recorrido>=V*0.7?pts[j]:null;
  };
  const a=muestra(-1),c=muestra(1);
  if(!a||!c)return null;
  const kx=Math.cos(centro[0]*R);
  const v1=[(centro[1]-a[1])*kx,centro[0]-a[0]],v2=[(c[1]-centro[1])*kx,c[0]-centro[0]];
  const norma=Math.hypot(...v1)*Math.hypot(...v2);
  if(!norma)return null;
  // «a» y «c» salen tambien: con ellos se saca POR DONDE LLEGAS y POR DONDE
  // SALES, que es lo que hay que comparar con las ramas del cruce.
  return {angle:Math.acos(Math.max(-1,Math.min(1,(v1[0]*v2[0]+v1[1]*v2[1])/norma)))*180/Math.PI,
   cross:v1[0]*v2[1]-v1[1]*v2[0],antes:a,despues:c};
 };
 // Devuelve EL CRUCE, no un si o un no: hacen falta sus ramas para decidir.
 const cruceEn=p=>{
  if(!crucesOsm.length)return null;
  const k0=Math.floor(p[0]/CELDA),k1=Math.floor(p[1]/CELDA);
  let mejor=null,suya=Infinity;
  for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){
   const l=rejCruces.get((k0+a)+'/'+(k1+b));if(!l)continue;
   for(const c of l){const d=dist(p,c);if(d<=CERCA_CRUCE&&d<suya){suya=d;mejor=c}}
  }
  return mejor;
 };
 // LAS HORQUILLAS SE MIDEN POR EL CAMBIO DE RUMBO, NO POR LA FORMA. Mirar la
 // forma desde 40 m -con geometriaEn- no sirve: en una zeta cuyos ramales se
 // separan, esos dos extremos quedan muy abiertos y el angulo sale pequeño.
 // Lo que define una horquilla es que el camino se dobla sobre si mismo: el
 // rumbo al entrar y el rumbo al salir son opuestos. Se compara eso en
 // VENTANA_HORQUILLA metros de camino.
 // Una S no cuenta -entra y sale casi con el mismo rumbo- y el ruido del GPS
 // tampoco, porque se va en un sentido y vuelve en el otro y se anula.
 // Una sola por horquilla: encontrada, se salta hasta su final.
 const rumboTramo=(a,b)=>Math.atan2((b[1]-a[1])*Math.cos(a[0]*R),b[0]-a[0])*180/Math.PI;
 const horquillas=new Map();
 // ¿Los puntos que quedan a 20 y a 60 m despues de i caen a menos de
 // RETORNO_M de lo andado en los 80 m anteriores? Uno solo no basta: una
 // herradura con las dos ramas pegadas tambien pasa cerca a los 20 m, y
 // medido en las 72 rutas eso eran 27 «da la vuelta» falsos de 37.
 const RETORNO_M=6;
 const sobreLoAndado=(i,q)=>{
  const kx=111195*Math.cos(q[0]*R),ky=111195;
  for(let a=i;a>0&&routeCumulative[i]-routeCumulative[a]<80;a--){
   const A=pts[a-1],B=pts[a],ax=(A[1]-q[1])*kx,ay=(A[0]-q[0])*ky,dx=(B[1]-A[1])*kx,dy=(B[0]-A[0])*ky,nn=dx*dx+dy*dy;
   const t=nn?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/nn)):0;
   if(Math.hypot(ax+t*dx,ay+t*dy)<RETORNO_M)return true;
  }
  return false;
 };
 const vuelvePorLoAndado=i=>{
  for(const metros of [20,60]){
   // El punto a esos metros, interpolado: la copia simplificada deja rectas
   // largas y el vertice siguiente puede estar a 150 m.
   let k=i;
   while(k+1<pts.length&&routeCumulative[k]-routeCumulative[i]<metros)k++;
   const hecho=routeCumulative[k]-routeCumulative[i];
   if(hecho<metros-5)return false;
   const tramo=routeCumulative[k]-routeCumulative[k-1],t=tramo>0?Math.max(0,Math.min(1,1-(hecho-metros)/tramo)):1;
   const q=[pts[k-1][0]+t*(pts[k][0]-pts[k-1][0]),pts[k-1][1]+t*(pts[k][1]-pts[k-1][1])];
   if(!sobreLoAndado(i,q))return false;
  }
  return true;
 };
 // La ventana se mide DESDE i hacia delante, no desde el punto anterior: la
 // copia simplificada deja rectas larguisimas, asi que el punto de antes puede
 // estar a 150 m y la ventana no se abriria nunca. Lo que se compara es el
 // rumbo con el que LLEGAS a i y el rumbo con el que SALES de la ventana;
 // esas rectas largas no estorban, porque lo que dicen es por donde vas.
 // UN BRINCO DEL GPS NO ES UNA HORQUILLA. El rumbo de llegada se toma del
 // ultimo tramo, y galdaramiño tiene en el km 2,457 -en plena salida de la
 // BI-633- un tramo de seis metros hacia ATRAS: ahi ese rumbo sale 180
 // grados cambiado y el prepaso cantaba una horquilla donde la via va recta.
 // Antes no se veia porque ese punto esta encima de un cruce y la rama de los
 // cruces se lo comia; desde que los cruces se deciden por sus ramas, el
 // punto llega hasta aqui y soltaba un «da la vuelta» falso.
 // No se cambia la medida -son los grados que el autor tiene ajustados-: se
 // descarta el BRINCO. Un tramo de llegada de menos de BRINCO_M metros que
 // ademas apunta al reves de por donde se viene -mirando 20 m de camino
 // atras- no es por donde llegas, es un pico del GPS. Una revuelta en zeta
 // no cae aqui: por corto que sea su ultimo tramo, apunta hacia donde sube
 // la rama de antes, no al contrario.
 const BRINCO_M=10,BRINCO_GIRO=120;
 const atrasDe=(i,metros)=>{
  let j=i,rec=0;
  while(j>0){
   const d=dist(pts[j-1],pts[j]);
   if(d>0&&rec+d>=metros){
    const t=(metros-rec)/d;
    return [pts[j][0]+t*(pts[j-1][0]-pts[j][0]),pts[j][1]+t*(pts[j-1][1]-pts[j][1])];
   }
   rec+=d;j--;
  }
  return rec>0?pts[0]:null;
 };
 for(let i=1;i<pts.length-1;i++){
  let j=i;
  while(j+2<pts.length&&routeCumulative[j+1]-routeCumulative[i]<=VENTANA_HORQUILLA)j++;
  if(j<=i)continue;
  const llegada=rumboTramo(pts[i-1],pts[i]);
  let d=Math.abs(rumboTramo(pts[j],pts[j+1])-llegada)%360;
  if(d>180)d=360-d;
  if(d<HORQUILLA)continue;
  if(dist(pts[i-1],pts[i])<BRINCO_M){
   const desde=atrasDe(i,VENTANA_HORQUILLA/2);
   if(desde){
    let v=Math.abs(llegada-rumboTramo(desde,pts[i]))%360;
    if(v>180)v=360-v;
    if(v>BRINCO_GIRO)continue;
   }
  }
  // EL LADO DE LA HORQUILLA ES EL DE LA HORQUILLA ENTERA, de la llegada a la
  // salida (40 m), no el de los 12 m del punto: una revuelta grande a la
  // derecha que empieza torciendo un poco a la izquierda se cantaba «a la
  // izquierda». Lo saco el Garmin del autor: 63 grados reales a la derecha.
  // Se SUMA el giro tramo a tramo: con casi 180 grados, «salida menos
  // llegada» cambia de signo por un grado de mas o de menos.
  let giroTotal=0;
  for(let k=i;k<=j;k++){
   const g=((rumboTramo(pts[k],pts[k+1])-rumboTramo(pts[k-1],pts[k]))%360+540)%360-180;
   giroTotal+=g;
  }
  horquillas.set(i,{grados:Math.round(d),lado:giroTotal>0?'derecha':'izquierda'});
  i=j;
 }
 for(let i=1;i<pts.length-1;i++){
  // Cerca del inicio o final hay menos de 12 m a ambos lados.
  // Ajustar solo esos giros; evitar quiebros inferiores a 6 m por ruido GPS.
  const margen=Math.min(routeCumulative[i],routeCumulative[pts.length-1]-routeCumulative[i]);
  if(margen<6)continue;
  const giro=geometriaEn(i,Math.min(VENTANA,margen));
  if(!giro)continue;
  const {angle,cross}=giro,b=pts[i];
  // NO INTENTAR DETECTAR CRUCES MIRANDO SI PASA OTRA RUTA CERCA. Esta medido
  // y es PEOR: en Mallabia las 70 rutas comparten camino durante kilometros,
  // asi que «otra ruta a menos de 28 m» es cierto casi todo el rato y no
  // significa cruce, significa que van juntas. Por eso los cruces se traen de
  // OSM y no de las propias rutas.
  const elCruce=cruceEn(b);
  const cruce=!!elCruce;
  let grados=angle,ladoCruce=null,mantente=false,porElCruce=false,cruceAvisado=null;
  if(cruce){
   const d=decideCruce(elCruce,b,giro.antes,giro.despues);
   if(d&&d.sinRamas){
    // Fichero de cruces antiguo, sin ramas: se decide como siempre, por el
    // angulo del propio track.
    porElCruce=angle>=CRUCE_GIRO;
    // Y si no llega en 12 m, se mira en 30: un giro redondeado reparte el
    // angulo y, medido justo en el cruce, parece casi recto. Visto en una ruta
    // del autor: giro real de 114 grados a la derecha que en 12 m eran 44 y se
    // quedaba sin aviso. El lado, de esa misma ventana ancha.
    if(!porElCruce){
     const ancho=geometriaEn(i,Math.min(30,margen));
     if(ancho&&ancho.angle>=CRUCE_GIRO){
      porElCruce=true;grados=ancho.angle;ladoCruce=ancho.cross>0?'izquierda':'derecha';
     }
    }
   }else if(d&&!(crucesDichos.has(elCruce)&&!haSalido(elCruce,crucesDichos.get(elCruce),i))){
    cruceAvisado=elCruce;
    porElCruce=true;
    grados=d.grados;ladoCruce=d.lado;mantente=d.mantente;
   }
  }
  // Que el cruce no pida aviso NO cierra el punto: encima de un cruce puede
  // haber una horquilla, y «una curva cerrada tambien se avisa». Sin esto,
  // una revuelta de 170 grados con un camino saliendo al lado se quedaba
  // muda por seguir por el mismo camino.
  if(!porElCruce){
   let vale=angle>=CURVA_SOLA;
   if(vale){
    const confirma=geometriaEn(i,20);
    if(confirma!==null&&confirma.angle<(angle>=130?100:85))vale=false; // pico aislado
   }
   if(!vale){
    // Lo que no es curva cerrada en 12 m puede ser una horquilla. Un pico
    // aislado del GPS tambien cae aqui, y el prepaso no lo marca porque se va
    // y vuelve: por eso se consulta despues y no en vez de.
    const h=horquillas.get(i);
    if(!h)continue;
    grados=h.grados;ladoCruce=h.lado;
   }
  }
  // Dos avisos pegados serian dos «ahora» uno encima del otro. Pero EL CRUCE
  // MANDA: si el de antes era una curva o una horquilla y este es un cruce, se
  // queda el cruce, que es lo que el autor pidio que no se perdiera nunca.
  const previo=junctions[junctions.length-1];
  if(previo&&dist(previo.point,b)<35){
   if(!(cruce&&!previo.cruce))continue;
   junctions.pop();
  }
  // EL LADO SE GUARDA SIEMPRE, TAMBIEN EN UNA HERRADURA. Antes, al pasar de
  // los 145 grados, «direction» se quedaba en «vuelta» y el lado se perdia por
  // el camino: la flecha se dibujaba girando a la derecha aunque la curva
  // fuera a la izquierda. Lo vio el autor en una herradura de 173 grados.
  const hacia=ladoCruce||(cross>0?'izquierda':'derecha');
  // «DA LA VUELTA» SOLO CUANDO DE VERDAD TE DAS LA VUELTA. Estaba en 145 y
  // el autor se encontro un cruce de 147 grados anunciado como «Cruce · da
  // la vuelta»: lo vio y dijo «no sé qué sea un giro, por muy cerrado que
  // sea; además me ha indicado que dé la vuelta, no que gire». Y tiene
  // razon en lo peligroso: oir «da la vuelta» en marcha invita a volver por
  // donde has venido, que es lo contrario de lo que toca.
  // Ahora el umbral es el mismo 160 con el que se detectan las horquillas,
  // asi que las dos cosas dicen lo mismo: por debajo es un giro cerrado, y
  // de 160 para arriba es una herradura de verdad.
  const direction=grados>=HORQUILLA?'vuelta':hacia;
  // UNA IDA Y VUELTA SI ES DAR LA VUELTA. Si lo que viene despues vuelve
  // por encima de lo que se acaba de andar (a menos de RETORNO_M), no es una
  // curva: es volver por el mismo camino, y ahi no hay lado que decir.
  const retorno=direction==='vuelta'&&vuelvePorLoAndado(i);
  junctions.push({i,point:b,along:routeCumulative[i],direction,hacia,angle:Math.round(grados),cruce,mantente,retorno});
  if(cruceAvisado)crucesDichos.set(cruceAvisado,i);
 }
 enviaGirosNativos();
}
// Punto de avance sobre la ruta, no solo distancia en línea recta.
