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
         Math.min(200,Math.max(35,v*18)),
         // El cuarto: donde se dice «… ahora». Dos segundos ANTES del cruce
         // (4-12 m), no encima: con el retraso del GPS y de la voz caia ya
         // dentro o pasado el giro. Igual que avisoYa() del servicio.
         Math.min(Math.min(30,Math.max(8,v*3))-2,Math.min(12,Math.max(4,v*2)))];
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
// En la pagina siempre hay mapa; en las pruebas (require) no.
if(typeof map!=='undefined')map.on('zoomstart',()=>{
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
// Las rotondas de cruces-zona.json pegadas al track cargado: [lat,lon,radio].
let rotondasOsm=[];
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
 // EL PUNTO LEJANO DE CADA RAMA (17 nov 2026): donde esta la rama a 25 m por
 // su camino, en cienmilesimas de grado respecto al cruce (dos bytes con
 // signo; 0,0 = no se sabe). En el mismo orden que las ramas. Sirve para ver
 // por que rama va DE VERDAD la ruta comparando su forma, no solo el rumbo.
 if(ramas&&typeof j.ramas_lejos==='string'&&j.ramas_lejos){
  try{
   const b=atob(j.ramas_lejos),esc2=esc;let o=0;
   const s8=v=>v>127?v-256:v;
   // Compacto (17 nov 2026): con «ramas_con_forma», un bit por cruce dice si
   // ese cruce trae forma; los que no, ni la llevan en el fichero.
   const bits=typeof j.ramas_con_forma==='string'?atob(j.ramas_con_forma):null;
   for(let n=0;n<puntos.length;n++){
    const p=puntos[n];
    const g=p[2];if(!Array.isArray(g))continue;
    if(bits&&!(bits.charCodeAt(n>>3)&(1<<(n&7))))continue;
    const lejos=[];
    for(const grupo of g)for(let k=0;k<grupo.length;k++){
     const la=s8(b.charCodeAt(o)),lo=s8(b.charCodeAt(o+1));o+=2;
     lejos.push(la||lo?[p[0]+la/esc2,p[1]+lo/esc2]:null);
    }
    p.lejos=lejos;
   }
   if(o!==b.length)for(const p of puntos)delete p.lejos;   // no cuadra: mejor sin ellos
  }catch(e){for(const p of puntos)delete p.lejos}
 }
 // LA CLASE DE CADA RAMA (17 nov 2026): 1 carretera, 2 calle, 0 camino. Un
 // byte por rama, en el mismo orden. Solo sirve para decir «sigue la
 // carretera», «la calle» o «el camino».
 // En «ramas_clase2» van 4 por byte (2 bits cada una).
 const clases=typeof j.ramas_clase2==='string'?j.ramas_clase2:typeof j.ramas_clase==='string'?j.ramas_clase:'';
 if(ramas&&clases){
  try{
   const b=atob(clases),dos=typeof j.ramas_clase2==='string';let o=0;
   const lee=()=>{const v=dos?(b.charCodeAt(o>>2)>>((o&3)*2))&3:b.charCodeAt(o)&3;o++;return v};
   // 0 camino, 1 carretera, 2 calle, 3 sin salida (una entrada).
   for(const p of puntos){const g=p[2];if(!Array.isArray(g))continue;const c=[];for(const grupo of g)for(let k=0;k<grupo.length;k++)c.push(lee());p.clases=c}
   if(dos?((o+3)>>2)!==b.length:o!==b.length)for(const p of puntos)delete p.clases;
  }catch(e){for(const p of puntos)delete p.clases}
 }
 // LAS RAMAS DE SENTIDO PROHIBIDO (18 nov 2026): un bit por rama, en el
 // mismo orden. Por ellas se iria a contramano: la otra calzada de un doble
 // carril, una rotonda al reves. No son una alternativa para nadie.
 if(ramas&&typeof j.ramas_prohibidas==='string'&&j.ramas_prohibidas){
  try{
   const b=atob(j.ramas_prohibidas);let o=0;
   for(const p of puntos){const g=p[2];if(!Array.isArray(g))continue;const c=[];for(const grupo of g)for(let k=0;k<grupo.length;k++){c.push(!!(b.charCodeAt(o>>3)&(1<<(o&7))));o++}p.prohibidas=c}
   if(((o+7)>>3)!==b.length)for(const p of puntos)delete p.prohibidas;
  }catch(e){for(const p of puntos)delete p.prohibidas}
 }
 // CRUCES DE CARRETERA CON UN RAMAL MENOR (16 nov 2026): un bit por cruce,
 // en el mismo orden. Va como propiedad del cruce, no como elemento, para no
 // mover las ramas de sitio. Un fichero sin el campo: todo sigue como antes.
 if(typeof j.cruces_carretera==='string'&&j.cruces_carretera){
  try{const b=atob(j.cruces_carretera);for(let i=0;i<puntos.length;i++)if(b.charCodeAt(i>>3)&(1<<(i&7)))puntos[i].carretera=true}catch(e){}
 }
 // Las rotondas: centro en diferencias, como los cruces, y el radio en metros.
 // Un fichero viejo no las trae y todo sigue como antes.
 const rotondas=[];let sal=null;
 if(Array.isArray(j.rotondas)&&j.rotondas.length%3===0){
  let rx=0,ry=0;
  // Y SUS SALIDAS (desde el 16 nov 2026), en el mismo orden: el sentido de
  // giro y los rumbos, desde el centro, de los nodos por los que se sale. Van
  // como cuarto elemento; sin ellas la rotonda se avisa como antes, sin numero.
  sal=Array.isArray(j.rotondas_salidas)&&j.rotondas_salidas.length*3===j.rotondas.length?j.rotondas_salidas:null;
  for(let i=0;i<j.rotondas.length;i+=3){
   rx+=j.rotondas[i];ry+=j.rotondas[i+1];
   const r=j.rotondas[i+2];
   if(!(Number.isFinite(rx)&&Number.isFinite(ry)&&r>0&&r<=60))continue;
   const rot=[rx/esc,ry/esc,r];
   const s=sal&&sal[i/3];
   if(Array.isArray(s)&&s.length>1&&(s[0]===1||s[0]===-1))rot.push({sentido:s[0],salidas:s.slice(1).filter(Number.isFinite)});
   rotondas.push(rot);
  }
 }
 return {bbox:Array.isArray(j.bbox)?j.bbox:null,fecha:j.fecha_osm||'',puntos,ramas:!!ramas,rotondas,salidas:!!sal,carreteras:typeof j.cruces_carretera==='string'?j.cruces_carretera:''};
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
      ||z.fecha!==zonaCruces.fecha||!!z.ramas!==!!zonaCruces.ramas
      ||(z.rotondas||[]).length!==(zonaCruces.rotondas||[]).length
      ||!!z.salidas!==!!zonaCruces.salidas
      // Y las rotondas en si: se recuentan sus bocas sin que cambie su numero.
      ||JSON.stringify(z.rotondas)!==JSON.stringify(zonaCruces.rotondas)
      ||z.carreteras!==zonaCruces.carreteras);
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
  rotondasOsm=(z.rotondas||[]).filter(c=>{
   const k0=Math.floor(c[0]/CEL),k1=Math.floor(c[1]/CEL);
   for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)if(celdas.has((k0+a)+'/'+(k1+b)))return true;
   return false;
  });
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
  const aNativo=lista=>JSON.stringify(lista.map(j=>{
   const herradura=j.direction==='vuelta'&&!j.retorno,lado=herradura?j.hacia:j.direction;
   const o={i:j.i,dir:lado==='izquierda'?-1:lado==='derecha'?1:0,t:j.cruce?(j.mantente?2:1):0};
   if(herradura)o.h=1;
   if(j.curvaNueva)o.cn=1;
   if(j.deFrente)o.df=1;
   // «sg»: SIGUE LA MISMA VIA, que tuerce en un cruce (17 nov 2026): «sigue
   // la carretera a la izquierda». sg=1 carretera, 2 calle, 3 camino. Una APK
   // anterior lo ignora y dice «cruce a la izquierda», el lado bueno.
   if(j.sigue&&!herradura)o.sg=j.via===1?1:j.via===2?2:3;
   // «nr»: horquilla en la que la tuya NO es la mas recta: «sigue por la
   // izquierda», sin «recto» (18 nov 2026). Una APK anterior dice «sigue
   // recto por la izquierda», el lado bueno.
   if(j.mantente&&j.noRecto)o.nr=1;
   // Rotonda: «sal a la derecha» en la APK que lo sepa decir; la anterior
   // ignora «ro» y dice «cruce a la derecha», que es el mismo lado.
   if(j.rotonda)o.ro=1;
   // El numero de la salida, en «rs» (16 nov 2026). Una APK anterior lo
   // ignora y dice «sal a la derecha/izquierda», el lado bueno.
   if(j.rotonda&&j.salida)o.rs=j.salida;
   if(j.rotonda&&j.recto)o.rr=1;
   return o;
  }));
  // Una rotonda que se cruza RECTO solo se avisa con su numero de salida, y
  // una APK anterior no lo sabe decir: con «ro» y sin lado diria «da la
  // vuelta». A esas no se les mandan.
  let v='';try{v=window.TrabakutikAndroid.getAppVersion?window.TrabakutikAndroid.getAppVersion():''}catch(e){}
  const sabeSalidas=typeof versionMayor==='function'&&versionMayor(v,APK_SIN_SALIDAS);
  const sabeDeFrente=typeof versionMayor==='function'&&versionMayor(v,'4.9.70');
  const aNativoFiltrado=lista=>aNativo(lista.filter(j=>(!j.deFrente||sabeDeFrente)&&!(j.rotonda&&j.recto&&!sabeSalidas)));
  window.TrabakutikAndroid.setJunctions(aNativoFiltrado(junctions));
  // Los del sentido inverso, ya con su lado: el servicio los usa tal cual
  // yendo al reves. Una APK que no los sepa leer sigue cambiando el lado.
  if(window.TrabakutikAndroid.setJunctionsReves&&Array.isArray(junctionsReves))window.TrabakutikAndroid.setJunctionsReves(aNativoFiltrado(junctionsReves));
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
// Ventana con la que se comprueba el lado de un cruce en el propio cruce.
var LADO_VENTANA=20;
function difRumbo(a,b){let d=(a-b)%360;if(d>=180)d-=360;if(d<-180)d+=360;return d}
// LA DISTANCIA DE UN PUNTO A UN TROZO DE RUTA, en metros (proyeccion local).
function distARuta(q,linea){
 if(!q||!linea||linea.length<2)return Infinity;
 const kx=111195*Math.cos(q[0]*R),ky=111195;let m=Infinity;
 for(let k=1;k<linea.length;k++){
  const a=linea[k-1],b=linea[k],ax=(a[1]-q[1])*kx,ay=(a[0]-q[0])*ky,dx=(b[1]-a[1])*kx,dy=(b[0]-a[0])*ky,nn=dx*dx+dy*dy;
  const t=nn?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/nn)):0;m=Math.min(m,Math.hypot(ax+t*dx,ay+t*dy));
 }
 return m;
}
// La rama cuyo punto a 25 m queda pegado al trozo de ruta, si esta claro.
var CURVA_CALLE=100,GIRO_CALLE_M=100,GEO_PEGADA=12,GEO_MARGEN=6,GEO_DE_FRENTE=10,FRENTE_M=40,GEO_HORQUILLA=40,CRUCE_GIRO_CALLE=45;
// Con «punto» (la ruta a 25 m del cruce, donde se mide cada rama) se compara
// con ese punto y no con todo el trozo: una curva de despues del cruce podia
// pasar cerca de la otra rama y dejarlo en duda (revision con GPT).
function eligePorForma(lista,linea,punto){
 const prueba=medida=>{
  let mejor=null,dm=Infinity,segunda=Infinity;
  for(const x of lista){const d=medida(x);if(d<dm){segunda=dm;dm=d;mejor=x}else if(d<segunda)segunda=d}
  return mejor&&dm<=GEO_PEGADA&&segunda-dm>=GEO_MARGEN?mejor:null;
 };
 if(!punto)return prueba(x=>distARuta(x.lejos,linea));
 // Con el punto de la ruta a 25 m. Se probo, si no quedaba claro, a mirar los
 // primeros 40 m de ruta: en las marañas de cruces (Zaldibar, exigente 8,19)
 // esos 40 m pasan junto a otras ramas y salian lados al reves; medido, el
 // juez del trazado bajaba de 220 a 214. Si no esta claro, se decide como antes.
 return prueba(x=>dist(x.lejos,punto));
}
// EL CRUCE VISTO POR LA CALLE (17 nov 2026). Con las ramas agrupadas por
// CALLE (referencia o nombre de OSM; sin nombre, la via y su continuacion en
// linea) y el punto a 25 m de cada rama sacado de la geometria real de OSM:
// - la rama de llegada y la de salida se reconocen por su forma (el punto a
//   25 m pegado a la ruta antes y despues del cruce), solo si esta claro;
// - si llegas y sales por la MISMA calle no hay aviso, salvo que otra rama vaya
//   claramente mas recta que la tuya (GEO_DE_FRENTE grados): entonces la calle
//   tuerce y de frente sigue otra, y SI hay que avisar (los giros de recyde
//   4,49, 12,92 y 14,79, confirmados por el autor, son eso);
// - si cambias de calle, se decide como siempre pero con los rumbos medidos en
//   el cruce (de un punto lejano a otro), no en la curva.
// Devuelve undefined si la forma no lo deja claro: entonces, como siempre.
function decideCrucePorCalle(cruce,ramas,ruta){
 if(!ruta||!Array.isArray(cruce.lejos)||cruce.lejos.length!==ramas.length)return undefined;
 ramas.forEach((x,k)=>{x.lejos=cruce.lejos[k];x.clase=Array.isArray(cruce.clases)?cruce.clases[k]:0;x.prohibida=Array.isArray(cruce.prohibidas)&&!!cruce.prohibidas[k]});
 // Una rama por la que se iria a contramano, o una entrada sin salida, no es
 // una alternativa: no cuenta para «de frente», ni como la otra de una
 // horquilla, ni como «la mas recta». El autor, en un doble carril de la
 // BI-633: «es una recta, no hace falta indicar».
 const otraValida=x=>!x.prohibida&&x.clase!==3;
 if(ramas.some(x=>!x.lejos))return undefined;
 const a=eligePorForma(ramas,ruta.antes,ruta.a25);if(!a)return undefined;
 const m=eligePorForma(ramas.filter(x=>x!==a),ruta.despues,ruta.d25);if(!m)return undefined;
 const nodo=[cruce[0],cruce[1]],rumboDe=x=>bearingBetween(nodo,x.lejos);
 // El rumbo con el que LLEGAS, de la ruta 60 m antes del cruce, no de la rama
 // a 25 m: si la carretera ya viene torciendo, a 25 m parece que sigue recta.
 const desde=ruta.desde||ruta.antes[0],hasta=ruta.hasta||ruta.despues[ruta.despues.length-1];
 const entra=bearingBetween(desde,nodo),sale=bearingBetween(nodo,hasta);
 const desvio=difRumbo(rumboDe(m),entra);
 let recta=null;
 for(const x of ramas)if(x!==a&&x!==m&&!x.prohibida&&(!recta||Math.abs(difRumbo(rumboDe(x),entra))<Math.abs(difRumbo(rumboDe(recta),entra))))recta=x;
 if(m.g===a.g){
  // SIGUES POR LA MISMA CALLE. No es un cruce para ti, salvo que la calle
  // tuerza y de frente siga otra: entonces «sigue la carretera a la
  // izquierda», que no es «gira» (el autor, 17 nov 2026: los km 4,49 y 14,79
  // de recyde son giros de verdad; el frontón de Eltzubi y el 17,10 no).
  // La tuya y la de enfrente se comparan A LA MISMA ESCALA: las dos con su
  // punto a 25 m frente al rumbo con el que llegas (revision con GPT: con la
  // tuya a 100 m, una curva de despues del cruce hacia «mas recta» a una
  // rama lateral que no lo era).
  // Con el rumbo de llegada de los ultimos FRENTE_M m, interpolado: medido a
  // distancias exactas sobre los controles del autor, la ventaja de la rama de
  // enfrente sobre la tuya es +8 en recyde 4,49 (avisar) y -29 en el 17,10
  // (callar); a 100 m eran +24 y +34, al reves. Se avisa si otra rama va CASI
  // tan de frente como la tuya (GEO_DE_FRENTE de tolerancia): el corte queda a
  // 18 y 19 grados de los dos.
  const llega=bearingBetween(ruta.llegada||ruta.antes[0],nodo);
  // Y «de frente» de verdad: una rama a 90 grados o mas no esta delante, por
  // muy cerrada que sea tu revuelta.
  // Se mira CUALQUIER otra rama contra ese mismo rumbo, no la que era mas
  // recta frente a otro (revision con GPT: con la llegada torciendo, la mas
  // recta frente a 100 m no es la que esta de frente a 40).
  const mia=Math.abs(difRumbo(rumboDe(m),llega));
  // Una ENTRADA SIN SALIDA (clase 3: se acaba antes de 300 m) no cuenta: es
  // como la de un caserio, que no confunde a nadie. Lo explico el autor en el
  // fronton de Eltzubi: «sale una subidita a una entrada del fronton, como
  // cualquier entrada o caserio, que normalmente no se cuenta»; en OSM esa era
  // una calle residencial de 236 m y por eso contaba.
  const deFrente=ramas.some(x=>{if(x===a||x===m||!otraValida(x))return false;const f=Math.abs(difRumbo(rumboDe(x),llega));return f<90&&f<mia+GEO_DE_FRENTE});
  const cercaH=difRumbo(bearingBetween(nodo,ruta.despues[ruta.despues.length-1]),bearingBetween(ruta.antes[0],nodo));
  // Una revuelta muy cerrada en tu misma via no es un cruce, pero tampoco se
  // calla: «curva cerrada» (exigente 36,48: 127 grados).
  if(!deFrente&&Math.abs(cercaH)>=CURVA_CALLE)return {curva:true,grados:Math.round(Math.abs(cercaH)),lado:cercaH<0?'izquierda':'derecha',porCalle:true};
  if(!deFrente)return null;
  // EL LADO SALE DE COMO SE SEPARA TU RAMA DE LA DE FRENTE, EN EL CRUCE
  // (revision con GPT, 17 nov 2026, tarde): antes salia de lo que hacia la
  // ruta hasta 60 m despues, y si tu camino sale 35 grados a la izquierda y a
  // los pocos metros curva a la derecha, decia «derecha». Lo que pase despues
  // del cruce no cambia por donde hay que salir de el. Cuanto giras, de tu
  // rama a 25 m frente a como llegas: poco es «sigue recto por», mucho «gira».
  let f=null;for(const x of ramas)if(x!==a&&x!==m&&otraValida(x)&&(!f||Math.abs(difRumbo(rumboDe(x),llega))<Math.abs(difRumbo(rumboDe(f),llega))))f=x;
  // Las dos medidas desde COMO LLEGAS (de -180 a 180, de izquierda a
  // derecha): restar los dos rumbos sin mas da la vuelta pasados 180 grados, y
  // una revuelta de 130 a la derecha con la otra rama a la izquierda salia
  // «izquierda».
  const lado=difRumbo(rumboDe(m),llega)<difRumbo(rumboDe(f),llega)?'izquierda':'derecha';
  // Y si las dos van casi juntas (menos de GEO_HORQUILLA entre ellas), es una
  // horquilla aunque la tuya tuerza: «sigue recto por» el lado de la tuya.
  // Dos caminos a 30 y 10 grados a la izquierda con «gira a la izquierda»
  // no dicen cual coger.
  const juntas=Math.abs(difRumbo(rumboDe(m),llega)-difRumbo(rumboDe(f),llega))<GEO_HORQUILLA;
  // «RECTO» SOLO SI LA TUYA ES LA MAS RECTA DE LAS DOS (18 nov 2026). El
  // autor: «lo de recto sobra, porque justo a mano derecha iba una carretera
  // recta que no era la nuestra». Si la mas recta es la otra, «sigue por la
  // izquierda», sin «recto».
  const recto=mia<=Math.abs(difRumbo(rumboDe(f),llega));
  if(mia<CRUCE_RECTO||juntas)return {grados:Math.round(mia),lado,mantente:true,recto,porCalle:true};
  return {grados:Math.round(mia),lado,mantente:false,sigue:true,via:m.clase|0,porCalle:true};
 }
 // Dos ramas casi juntas (una horquilla): «sigue recto por la izquierda o la
 // derecha», con el lado de la tuya frente a la otra.
 // Cambias de via: es una horquilla solo si tu rama casi no se aparta (menos de
 // CRUCE_RECTO). Si se aparta mas, aunque la otra vaya cerca, entras en otra
 // carretera y es «gira» (18 nov 2026; el autor, en una entrada a 40 grados
 // de la BI-633: «debería ser gira a la izquierda, entramos en otro tipo de
 // carretera»; con el limite en 45 decia «sigue recto por la izquierda»).
 if(recta&&Math.abs(difRumbo(rumboDe(m),rumboDe(recta)))<GEO_HORQUILLA&&Math.abs(desvio)<CRUCE_RECTO)
  return {grados:Math.round(Math.abs(desvio)),lado:difRumbo(rumboDe(m),rumboDe(recta))<0?'izquierda':'derecha',mantente:true,
   recto:Math.abs(desvio)<=Math.abs(difRumbo(rumboDe(recta),entra)),porCalle:true};
 const masRecta=!!recta&&Math.abs(difRumbo(rumboDe(recta),entra))<Math.abs(desvio)-5;
 if(!masRecta&&Math.abs(desvio)<CRUCE_RECTO)return null;
 const mantente=Math.abs(desvio)<CRUCE_RECTO;
 const lado=mantente?(difRumbo(rumboDe(m),rumboDe(recta))<0?'izquierda':'derecha'):(desvio<0?'izquierda':'derecha');
 return {grados:Math.round(Math.abs(desvio)),lado,mantente,recto:!mantente||!recta||Math.abs(desvio)<=Math.abs(difRumbo(rumboDe(recta),entra)),porCalle:true};
}
function decideCruce(cruce,centro,antes,despues,ruta){
 const RAMA_ENCAJA=45;
 const grupos=cruce[2];
 if(!Array.isArray(grupos)||!grupos.length)return {sinRamas:true};
 const ramas=[];
 for(let g=0;g<grupos.length;g++)for(const r of grupos[g])ramas.push({r,g});
 if(ramas.length<3)return {sinRamas:true};
 const porCalle=decideCrucePorCalle(cruce,ramas,ruta);
 if(porCalle!==undefined)return porCalle;
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
 // Las ramas de sentido prohibido no son alternativa (la otra calzada de un
 // doble carril): sin esto, en la BI-633 decia «sigue recto por la derecha»
 // en plena recta (18 nov 2026).
 const prohibida=x=>Array.isArray(cruce.prohibidas)&&!!cruce.prohibidas[ramas.indexOf(x)];
 const otras=resto.filter(x=>x!==mia&&!prohibida(x)),desvio=difRumbo(mia.r,entra);
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
 return {grados:Math.round(Math.abs(desvio)),lado,mantente,recto:!mantente||Math.abs(desvio)<=Math.abs(difRumbo(recta.r,entra))};
}
// AL REVES, LOS AVISOS SE CALCULAN AL REVES. Antes se cogian los del sentido
// en que se grabo la ruta y se les cambiaba el lado. En una curva vale; en un
// cruce no: al reves llegas por otra rama y las demas quedan en otro sitio.
// Lo vio el autor el 15 de noviembre de 2026 haciendo Trabakua-Mendibil al
// reves: «me ha indicado a la derecha, pero a la derecha continua la pista».
// Medido en esa ruta: 6 cruces con el lado cambiado, el suyo entre ellos
// (decia «derecha 37°», y en su sentido es a la izquierda). Ahora se calcula
// todo otra vez sobre la ruta dada la vuelta y se guarda en junctionsReves,
// con el punto y la distancia de la ruta tal como esta; al reves se usa esa
// lista tal cual, sin cambiar lados.
// LOS BAILOTEOS DEL GPS NO SON GIROS. En el km 3,93 de Trabakua-Mendibil el
// GPX da un paso de 2,3 m a un lado y vuelve 1,5 m: el tramo con el que se
// «llega» al punto apunta casi hacia atras y salia una «herradura a la
// derecha de 171°» en plena recta. Lo vio el autor el 15 de noviembre de
// 2026: «aqui no deberia haber ninguna indicacion, no hay excusas». Para
// calcular los avisos se saltan los puntos a menos de ESPACIO_GIROS_M del
// ultimo que se queda; las distancias no se tocan: cada aviso vuelve a su
// punto y a su distancia de la ruta tal cual.
function espaciaParaGiros(pts){
 const ESPACIO_GIROS_M=3;
 const idx=[];
 for(let k=0;k<pts.length;k++)
  if(!idx.length||dist(pts[idx[idx.length-1]],pts[k])>=ESPACIO_GIROS_M)idx.push(k);
 if(idx[idx.length-1]!==pts.length-1){if(idx.length>1)idx[idx.length-1]=pts.length-1;else idx.push(pts.length-1)}
 return quitaPicos(pts,idx);
}
// LOS PICOS DEL GPX NO SON GIROS. En el km 1,17 de Trabakua-Mendibil el GPX
// sube 15 m a un lado y vuelve -quien lo grabo se aparto del camino- y, con
// un nodo de cruce a menos de 25 m, salia «cruce a la derecha, 133°» en plena
// recta. El autor, el 15 de noviembre de 2026: «solo tiene que indicar giros
// de verdad o cruces de verdad, todo lo demas se deja sin indicar».
// Un pico es una salida corta (PICO_TRAMO_M de camino como mucho) que se
// aparta del eje PICO_PUNTA_M como mucho, con UNA punta en la que se da la
// vuelta (mas de PICO_VUELTA grados) y tras la que se sigue con el mismo
// rumbo con el que se llego (menos de PICO_SIGUE grados). Una herradura no
// cae: sale con el rumbo contrario. Una vuelta a una manzana tampoco: no
// tiene punta, tiene dos esquinas. Para los avisos se quitan los puntos del
// pico; las distancias de la ruta no se tocan.
function quitaPicos(pts,idx){
 // Sus umbrales solo los usa ella: van dentro (pieza cerrada).
 const PICO_TRAMO_M=60,PICO_PUNTA_M=20,PICO_PUNTA_MIN_M=6,PICO_EXTRA_M=8,PICO_VUELTA=120,PICO_SIGUE=35,PICO_LEJOS_M=25,PICO_PUNTA_ANG=60;
 const m=idx.length;if(m<5)return idx;
 const P=k=>pts[idx[k]],cum=[0];
 for(let k=1;k<m;k++)cum[k]=cum[k-1]+dist(P(k-1),P(k));
 const rumbo=(a,b)=>bearingBetween(a,b);
 const giro=(a,b)=>Math.abs(difRumbo(a,b));
 // El primer punto a «metros» EN LINEA RECTA de k, hacia atras (-1) o hacia
 // delante: medido por el recorrido, un baile del GPS se los come y el rumbo
 // sale de cualquier sitio.
 const aDistancia=(k,metros,paso)=>{
  for(let j=k+paso;j>=0&&j<m;j+=paso)if(dist(P(j),P(k))>=metros)return P(j);
  return null;
 };
 const fuera=(q,a,b)=>{
  const kx=111195*Math.cos(a[0]*R),ky=111195;
  const ax=(q[1]-a[1])*kx,ay=(q[0]-a[0])*ky,dx=(b[1]-a[1])*kx,dy=(b[0]-a[0])*ky,nn=dx*dx+dy*dy;
  const t=nn?Math.max(0,Math.min(1,(ax*dx+ay*dy)/nn)):0;
  return Math.hypot(ax-t*dx,ay-t*dy);
 };
 const queda=[0];
 let a=0;
 while(a<m-1){
  let salto=-1;const validos=[];
  const antes=aDistancia(a,PICO_LEJOS_M,-1);
  for(let b=a+2;b<m&&cum[b]-cum[a]<=PICO_TRAMO_M;b++){
   const A=P(a),B=P(b),cuerda=dist(A,B);
   if(cum[b]-cum[a]-cuerda<PICO_EXTRA_M)continue;
   // La punta: el punto que mas se aparta, y que no se pase de PICO_PUNTA_M.
   let t=-1,lejos=0,ok=true;
   for(let k=a+1;k<b;k++){const f=fuera(P(k),A,B);if(f>PICO_PUNTA_M){ok=false;break}if(f>lejos){lejos=f;t=k}}
   // Menos de PICO_PUNTA_MIN_M es el baile del GPS parado -en un cruce, muchas
   // veces-, no un pico: de eso ya se ocupa espaciaParaGiros, y quitarlo aqui
   // se comia giros de verdad (medido en las 74 rutas).
   if(!ok||t<0||lejos<PICO_PUNTA_MIN_M)continue;
   // La punta, A UN LADO del eje y no pasado uno de sus extremos: un baile del
   // GPS al llegar a un cruce deja la «punta» antes de A o despues de B, y
   // tratarlo como pico se llevaba el giro de verdad (hirutxikiak, intxorta).
   if(cuerda>=3){
    const kx=111195*Math.cos(A[0]*R),q=P(t);
    const u=(((q[1]-A[1])*kx)*((B[1]-A[1])*kx)+((q[0]-A[0])*111195)*((B[0]-A[0])*111195))/(cuerda*cuerda);
    if(u<0.1||u>0.9)continue;
   }
   // En la punta se da la vuelta...
   if(giro(rumbo(P(t-1),P(t)),rumbo(P(t),P(t+1)))<PICO_VUELTA)continue;
   // ...y es una punta de verdad, estrecha: vista desde ella, la ida y la
   // vuelta salen casi juntas (menos de PICO_PUNTA_ANG grados). En el pico de
   // Mendibil son 50; la esquina de un giro de verdad cortada por el baile
   // del GPS da 90 o mas (hirutxikiak, 89).
   if(giro(rumbo(P(t),A),rumbo(P(t),B))>=PICO_PUNTA_ANG)continue;
   // ...y una sola vez: ningun otro punto del pico se dobla asi.
   let otra=false;
   for(let k=a+1;k<b;k++)if(k!==t&&giro(rumbo(P(k-1),P(k)),rumbo(P(k),P(k+1)))>=PICO_VUELTA){otra=true;break}
   if(otra)continue;
   // Y despues se sigue por donde se iba.
   const despues=aDistancia(b,PICO_LEJOS_M,1);
   if(!antes||!despues)continue;
   if(giro(rumbo(antes,A),rumbo(B,despues))>=PICO_SIGUE)continue;
   // Y tambien de lejos, a 50 m: en un cruce donde el GPS bailo parado el
   // giro de verdad se reparte y a 25 m parece que sigues recto.
   const antes2=aDistancia(a,2*PICO_LEJOS_M,-1),despues2=aDistancia(b,2*PICO_LEJOS_M,1);
   // Sin esos puntos -cerca del principio o del final- no se puede saber: el
   // pico se deja como esta (revision con GPT).
   if(!antes2||!despues2||giro(rumbo(antes2,A),rumbo(B,despues2))>=PICO_SIGUE)continue;
   if(cuerda>=3&&giro(rumbo(antes,A),rumbo(A,B))>=PICO_SIGUE)continue;
   validos.push([b,cum[b]-cum[a]-cuerda]);
  }
  // No el primer final que valga, sino el que cierra el pico: el de mas metros
  // de rodeo o, con 2 m de margen, el mas cercano. Cortando en el primero se
  // quitaba la punta y se quedaba media vuelta, otro giro falso.
  if(validos.length){
   const max=Math.max(...validos.map(v=>v[1]));
   salto=validos.find(v=>v[1]>=max-2)[0];
  }
  if(salto>0){queda.push(salto);a=salto}else{a++;queda.push(a)}
 }
 return queda.map(k=>idx[k]);
}
function computeJunctions(){
 const pts=routePoints,n=pts.length;
 const cum=[0];for(let k=1;k<n;k++)cum[k]=cum[k-1]+dist(pts[k-1],pts[k]);
 const idx=n>=3?espaciaParaGiros(pts):pts.map((_,k)=>k),m=idx.length;
 const aRuta=(j,k)=>Object.assign({},j,{i:k,along:cum[k]});
 // null = sin calcular (entonces se le da la vuelta a la ida, como antes);
 // [] = calculada y sin ningun aviso, que al reves puede pasar.
 let ida=[],vuelta=null;
 try{
  routePoints=idx.map(k=>pts[k]);
  calculaCrucesDe();
  ida=junctions.map(j=>aRuta(j,idx[j.i]));
  if(m>=3){
   routePoints=routePoints.slice().reverse();
   calculaCrucesDe();
   vuelta=junctions.map(j=>Object.assign(aRuta(j,idx[m-1-j.i]),{reves:true}));
  }
 }finally{routePoints=pts}
 // Cruce confirmado sobre el trazado detallado publicado de Asuntza bira.
 // Si se sustituye el trazado, la marca no se aplica a otro punto por error.
 const iAsuntza=326;
 if(typeof chosen==='number'&&typeof tracks!=='undefined'&&tracks[chosen]?.href==='asuntzabira.html'&&
    n===809&&Math.abs(cum[iAsuntza]-7120)<15&&!ida.some(j=>Math.abs(j.along-cum[iAsuntza])<25)){
  ida.push({i:iAsuntza,point:pts[iAsuntza],along:cum[iAsuntza],deFrente:true,angle:0,cruce:true});
  ida.sort((a,b)=>a.i-b.i);
 }
 junctions=ida;routeCumulative=cum;junctionsReves=vuelta;
 junctionWarned.clear();junctionZoomOnce.clear();
 enviaGirosNativos();
}
function detectaCurvasDelTrack(pts,cum){
 const indices=[];
 for(let i=0;i<pts.length;i++){
  const anterior=indices[indices.length-1];
  if(anterior===undefined||cum[i]!==cum[anterior])indices.push(i);
 }
 const metros=k=>cum[indices[k]];
 const curvas=[];
 let antes=0,despues=1,pico=null;
 for(let k=1;k<indices.length-1;k++){
  const actual=metros(k);
  while(antes+1<k&&actual-metros(antes+1)>=12)antes++;
  despues=Math.max(despues,k+1);
  while(despues<indices.length&&metros(despues)-actual<12)despues++;
  if(despues===indices.length)break;
  if(actual-metros(antes)<12)continue;
  const i=indices[k],point=pts[i];
  const giro=difRumbo(bearingBetween(point,pts[indices[despues]]),bearingBetween(pts[indices[antes]],point));
  const angle=Math.abs(giro),hacia=giro>0?'derecha':'izquierda';
  if(pico&&(angle<60||pico.hacia!==hacia)){curvas.push(pico);pico=null}
  if(angle>=60&&(!pico||angle>pico.angle)){
   pico={i,point,along:cum[i],direction:hacia,hacia,angle,cruce:false,curvaNueva:true};
  }
 }
 if(pico)curvas.push(pico);
 return curvas;
}
function calculaCrucesDe(){
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
  let grados=angle,ladoCruce=null,mantente=false,porElCruce=false,cruceAvisado=null,sigue=false,via=0,curvaCalle=false,iNodo=null,noRecto=false,nodoEnRuta=false;
  if(cruce){
   // El trozo de ruta de 60 m antes y despues del CRUCE (cortado en el punto
   // de la ruta mas cercano a su nodo y empalmado en el nodo), para reconocer
   // las ramas por su forma.
   let iN=i,dN=dist(pts[i],elCruce);
   // (iNodo se fija al final de esta busqueda: es el punto de la ruta mas
   // cercano al nodo del cruce, desde donde se cuenta el aviso.)
   for(let k=i-1;k>=1&&routeCumulative[i]-routeCumulative[k]<=40;k--){const e=dist(pts[k],elCruce);if(e<dN){dN=e;iN=k}}
   for(let k=i+1;k<pts.length-1&&routeCumulative[k]-routeCumulative[i]<=40;k++){const e=dist(pts[k],elCruce);if(e<dN){dN=e;iN=k}}
   // EXACTOS, no al vertice: con los puntos espaciados la ventana de «60 m»
   // se quedaba en 26 m y una herradura de 127 grados medía 69 (revision con
   // GPT). Los extremos se interpolan sobre la ruta.
   iNodo=iN;
   const enRuta=d=>{
    const objetivo=routeCumulative[iN]+d;
    if(objetivo<=0)return pts[0];
    if(objetivo>=routeCumulative[pts.length-1])return pts[pts.length-1];
    let k=iN;
    if(d<0){while(k>0&&routeCumulative[k]>objetivo)k--}else{while(k<pts.length-1&&routeCumulative[k+1]<objetivo)k++}
    const a=pts[k],z=pts[Math.min(k+1,pts.length-1)],l=routeCumulative[Math.min(k+1,pts.length-1)]-routeCumulative[k];
    const t=l>0?Math.max(0,Math.min(1,(objetivo-routeCumulative[k])/l)):0;
    return [a[0]+t*(z[0]-a[0]),a[1]+t*(z[1]-a[1])];
   };
   const ruta={antes:[enRuta(-60)],despues:[]};
   for(let k=iN;k>=0&&routeCumulative[iN]-routeCumulative[k]<60;k--)ruta.antes.splice(1,0,pts[k]);
   for(let k=iN;k<pts.length&&routeCumulative[k]-routeCumulative[iN]<60;k++)ruta.despues.push(pts[k]);
   ruta.despues.push(enRuta(60));
   // Verifica el nodo contra el trazado real antes de empalmarlo a la ruta.
   // En enlaces próximos, las ramas de la otra calzada pueden parecer
   // compatibles a 25 m aunque la ruta nunca llegue a su cruce.
   nodoEnRuta=!elCruce.lejos||dN<=GEO_PEGADA||distARuta(elCruce,ruta.antes)<=GEO_PEGADA
      ||distARuta(elCruce,ruta.despues)<=GEO_PEGADA;
   ruta.antes.push([elCruce[0],elCruce[1]]);ruta.despues.unshift([elCruce[0],elCruce[1]]);
   // Y donde estabas y donde estaras a GIRO_CALLE_M (cuanto tuerce la calle
   // que llevas) y a FRENTE_M antes (con que rumbo llegas al cruce).
   ruta.a25=enRuta(-25);ruta.d25=enRuta(25);
   ruta.desde=enRuta(-GIRO_CALLE_M);ruta.hasta=enRuta(GIRO_CALLE_M);ruta.llegada=enRuta(-FRENTE_M);
   let d=nodoEnRuta?decideCruce(elCruce,b,giro.antes,giro.despues,ruta):null;
   // EL LADO DE UN CRUCE, MEDIDO EN EL CRUCE (17 nov 2026). Si hay que avisar
   // lo decide lo de siempre; el LADO se comprueba mirando la ruta en su punto
   // mas cercano al nodo del cruce, con LADO_VENTANA m a cada lado. El punto
   // donde la ruta mas se dobla puede quedar a 20 m del cruce, y en la vuelta
   // de Eibar-Eltzubi, entrando a Areitio, ahi la carretera aun torcia a la
   // izquierda: dijo «izquierda» y era a la derecha. Medido sobre todas las
   // rutas: el numero de avisos no cambia, cambia el lado en 46, y juzgados con
   // el giro real de la ruta en el cruce aciertan 29 ahora frente a 3 antes.
   if(d&&!d.sinRamas&&!d.porCalle){
    let iC=i,dC=dist(pts[i],elCruce);
    for(let k=i-1;k>=1&&routeCumulative[i]-routeCumulative[k]<=40;k--){const e=dist(pts[k],elCruce);if(e<dC){dC=e;iC=k}}
    for(let k=i+1;k<pts.length-1&&routeCumulative[k]-routeCumulative[i]<=40;k++){const e=dist(pts[k],elCruce);if(e<dC){dC=e;iC=k}}
    const mC=Math.min(routeCumulative[iC],routeCumulative[pts.length-1]-routeCumulative[iC]);
    const gC=mC>=6?geometriaEn(iC,Math.min(LADO_VENTANA,mC)):null;
    const dN=gC?decideCruce(elCruce,pts[iC],gC.antes,gC.despues):null;
    if(dN&&!dN.sinRamas&&dN.lado!==d.lado&&dN.mantente===d.mantente)d=Object.assign({},d,{lado:dN.lado});
   }
   // UNA CARRETERA QUE SIGUE Y UN RAMAL MENOR AL LADO: «sigue recto por…»
   // solo si de verdad dejas la carretera. Lo pidio el autor en el km 6,37 de
   // recyde: la carretera sigue y a la izquierda solo esta la entrada a un
   // caserio, «no deberia influir en nada». El cruce quedaba a 22 m del punto
   // donde se miraba la ruta, en plena curva, y por el rumbo la entrada se
   // parecia mas que la carretera. En esos cruces (marcados en el fichero) se
   // vuelve a decidir mirando la ruta en su punto mas cercano AL CRUCE, y si
   // ahi sigue por la carretera no se dice nada. En las horquillas de dos
   // carreteras no se toca: ahi el aviso sirve.
   if(d&&d.mantente&&elCruce.carretera){
    // A 40 m por la ruta como mucho, no a 40 puntos: en un lazo, 40 puntos
    // pueden ser otra pasada por el mismo sitio (revision con GPT).
    let iC=i,dC=dist(pts[i],elCruce);
    for(let k=i-1;k>=1&&routeCumulative[i]-routeCumulative[k]<=40;k--){const e=dist(pts[k],elCruce);if(e<dC){dC=e;iC=k}}
    for(let k=i+1;k<pts.length-1&&routeCumulative[k]-routeCumulative[i]<=40;k++){const e=dist(pts[k],elCruce);if(e<dC){dC=e;iC=k}}
    const mC=Math.min(routeCumulative[iC],routeCumulative[pts.length-1]-routeCumulative[iC]);
    const gC=iC!==i&&mC>=6?geometriaEn(iC,Math.min(VENTANA,mC)):null;
    if(gC&&decideCruce(elCruce,pts[iC],gC.antes,gC.despues)===null)d=null;
   }
   if(d&&d.curva){
    // Una sola vez por cruce, como los avisos de cruce.
    if(!(crucesDichos.has(elCruce)&&!haSalido(elCruce,crucesDichos.get(elCruce),i))){curvaCalle=true;grados=d.grados;ladoCruce=d.lado;cruceAvisado=elCruce}
    d=null;
   }
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
    grados=d.grados;ladoCruce=d.lado;mantente=d.mantente;sigue=!!d.sigue;via=d.via|0;noRecto=d.mantente&&d.recto===false;
   }
  }
  // Que el cruce no pida aviso NO cierra el punto: encima de un cruce puede
  // haber una horquilla, y «una curva cerrada tambien se avisa». Sin esto,
  // una revuelta de 170 grados con un camino saliendo al lado se quedaba
  // muda por seguir por el mismo camino.
  if(!porElCruce){
   let vale=angle>=CURVA_SOLA||curvaCalle;
   if(vale&&!curvaCalle){
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
  // La revuelta de tu misma via se dice como curva, no como cruce.
  const esCruce=nodoEnRuta&&!curvaCalle;
  const previo=junctions[junctions.length-1];
  if(previo&&dist(previo.point,b)<35){
   if(!(esCruce&&!previo.cruce))continue;
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
  // EL AVISO SE CUENTA DESDE EL CRUCE (revision con GPT, 17 nov 2026): el
  // punto donde mas se dobla la ruta puede quedar 25 m antes del nodo, y desde
  // ahi «en 10 metros» se decia con el cruce a 35. Si lo ha decidido un cruce,
  // el aviso va en el punto de la ruta mas cercano a su nodo.
  const ultimo=junctions[junctions.length-1];
  const iA=cruceAvisado&&iNodo!=null&&iNodo!==i&&(!ultimo||iNodo>ultimo.i)?iNodo:i;
  junctions.push(Object.assign({i:iA,point:pts[iA],along:routeCumulative[iA],direction,hacia,angle:Math.round(grados),cruce:esCruce,mantente,retorno},sigue?{sigue:true,via}:{},noRecto?{noRecto:true}:{}));
  if(cruceAvisado)crucesDichos.set(cruceAvisado,i);
 }
 // El detector de la app Android aporta curvas por pico y por lado.
 // La clasificación ya calculada mantiene cruces, retornos y herraduras.
 const anteriores=junctions.slice();
 for(const curva of detectaCurvasDelTrack(pts,routeCumulative)){
  const coincide=anteriores.find(j=>Math.abs(j.along-curva.along)<=
   (j.direction==='vuelta'?42:j.cruce?35:12)&&(j.cruce||j.direction==='vuelta'||j.hacia===curva.hacia));
  if(!coincide)junctions.push(curva);
  else if(!coincide.cruce&&coincide.direction!=='vuelta')coincide.curvaNueva=true;
 }
 // Al contar desde el cruce, un aviso puede haber quedado por delante del
 // siguiente: en orden de la ruta, que es como los recorre la aplicacion.
 junctions.sort((p,q)=>p.i-q.i);
 if(crucesOsm.length&&rotondasOsm.length)resuelveRotondas(pts);
}
// UNA ROTONDA ES UN CRUCE, NO DOS. El autor cruzo una rotonda siguiendo recto
// y oyo «gira a la derecha»; a la derecha habia una calle de direccion
// prohibida. En OSM la entrada y la salida son dos cruces, y cada uno, visto
// suelto, es un giro de 50 a 90 grados -casi siempre a la derecha, que es por
// donde se entra-. Simulado sobre las 186 rotondas de la zona con sus ramas
// reales: de 3.824 pasos siguiendo recto, en 3.473 se decia algun giro.
// Ahora, donde la ruta pasa por una rotonda, se quitan los avisos de dentro y
// se compara el rumbo con el que LLEGAS (los ROT_BRAZO m de antes) con el
// rumbo con el que SALES (los de despues). Recto -menos de ROT_RECTO grados-
// no se dice nada, como en cualquier cruce que se pasa de largo; si no, UN
// aviso a la entrada, con el lado de la salida. Da igual por que lado de la
// isleta vaya el track: cuenta por donde entras y por donde sales.
// EL NUMERO DE LA SALIDA. Se cuentan, en el sentido en que se gira, las
// BOCAS del fichero que quedan entre la entrada de la ruta y la suya: todas
// las que se ven, tambien las prohibidas (vienen con 360 grados de mas). Lo
// dejo claro el autor en la rotonda del km 5 de recyde: la primera calle a la
// derecha es de direccion prohibida, «seria la segunda». Los rumbos son desde
// el centro y a radio+20 m, como los del fichero.
// - La salida de la ruta tiene que casar con una boca por la que se pueda
//   salir a menos de SAL_CASA grados; si no, no se da numero.
// - Las que quedan a menos de SAL_ENTRADA de la entrada son la propia
//   carretera por la que se llega: no se cuentan.
// - Con mas de SAL_BOCAS bocas (rotondas grandes de varios anillos) el
//   recuento es dudoso, y pasada la SAL_MAX nadie cuenta: sin numero.
var SAL_CASA=35,SAL_ENTRADA=15,SAL_MAX=6,SAL_BOCAS=7,SAL_DUDA=15;
// La ultima APK que no sabe decir el numero de salida («rs»).
var APK_SIN_SALIDAS='4.9.47';
function salidaDeRotonda(rot,rIn,rOut){
 const S=rot&&rot[3];
 if(!S||!Array.isArray(S.salidas)||!S.salidas.length||S.salidas.length>SAL_BOCAS||!Number.isFinite(rIn)||!Number.isFinite(rOut))return 0;
 const bocas=S.salidas.map(a=>({r:a%360,libre:a<360}));
 const tras=a=>S.sentido>0?((rIn-a)%360+360)%360:((a-rIn)%360+360)%360;
 // Con TODAS las bocas, tambien las prohibidas: andando se puede salir por
 // una calle de direccion prohibida para coches, y entonces casar con la libre
 // de al lado daria el numero de otra (revision con GPT).
 let mia=null,err=Infinity,segundo=Infinity;
 for(const b of bocas){const e=Math.abs(difRumbo(b.r,rOut));if(e<err){segundo=err;err=e;mia=b}else if(e<segundo)segundo=e}
 // Una boca de entrada exclusivamente no es una salida válida en bici ni en coche.
 // Se puede contar como referencia visual, pero nunca anunciar que se salga por ella.
 if(!mia||!mia.libre||err>SAL_CASA)return 0;
 // Y si OTRA boca, sea libre o prohibida, queda casi igual de cerca de la
 // salida de la ruta, no se sabe cual es (puede ser el GPS): sin numero. En
 // los dos sentidos, no solo cuando gana la prohibida (revision con GPT).
 if(segundo-err<SAL_DUDA)return 0;
 const hasta=tras(mia.r);
 if(hasta<=SAL_ENTRADA)return 0;
 let n=0;
 for(const b of bocas){const t=tras(b.r);if(t>SAL_ENTRADA&&t<=hasta+.5)n++}
 return n>=1&&n<=SAL_MAX?n:0;
}
var ORDINALES=['','primera','segunda','tercera','cuarta','quinta','sexta','séptima','octava'];
function textoSalida(n){return ORDINALES[n]?'toma la '+ORDINALES[n]+' salida':''}
function resuelveRotondas(pts){
 const ROT_MARGEN=10,ROT_DENTRO=3,ROT_BRAZO=30,ROT_RECTO=35,ROT_VUELTA=150;
 const cum=routeCumulative,n=pts.length,total=cum[n-1];
 const enMetro=m=>{
  let k=1;while(k<n-1&&cum[k]<m)k++;
  const tr=cum[k]-cum[k-1],t=tr>0?Math.max(0,Math.min(1,(m-cum[k-1])/tr)):1;
  return [pts[k-1][0]+t*(pts[k][0]-pts[k-1][0]),pts[k-1][1]+t*(pts[k][1]-pts[k-1][1])];
 };
 for(const rot of rotondasOsm){
  const c=[rot[0],rot[1]],r=Math.max(rot[2],6)+ROT_MARGEN;
  // Dentro: el punto, o un tramo suyo que pasa por la rotonda. La copia
  // simplificada de una ruta guardada puede cruzar una rotonda pequeña con
  // una sola recta, sin ningun punto dentro.
  const kx=111195*Math.cos(c[0]*R),ky=111195;
  const tramo=(p,q)=>{const ax=(p[1]-c[1])*kx,ay=(p[0]-c[0])*ky,dx=(q[1]-p[1])*kx,dy=(q[0]-p[0])*ky,nn=dx*dx+dy*dy,t=nn?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/nn)):0;return Math.hypot(ax+t*dx,ay+t*dy)};
  const dentro=q=>dist(pts[q],c)<=r||(q>0&&tramo(pts[q-1],pts[q])<=r)||(q+1<n&&tramo(pts[q],pts[q+1])<=r);
  let k=0;
  while(k<n){
   while(k<n&&!dentro(k))k++;
   if(k>=n)break;
   const a=k;
   while(k+1<n&&dentro(k+1))k++;
   const b=k;k++;
   // Los metros donde la ruta entra en la rotonda y sale de ella, medidos de
   // metro en metro: con la copia simplificada no tiene por que haber un
   // punto en el borde.
   let mIn=-1,mOut=-1,cerca=Infinity;
   const m0=cum[Math.max(a-1,0)],m1=cum[Math.min(b+1,n-1)];
   for(let m=m0;m<=m1;m+=1){const d=dist(enMetro(m),c);if(d<cerca)cerca=d;if(d<=r){if(mIn<0)mIn=m;mOut=m}}
   // PASAR AL LADO NO ES CRUZARLA. El margen sirve para medir, pero la ruta
   // tiene que meterse en el anillo (su radio y ROT_DENTRO de error de GPS):
   // en markinaurjauziak y santaeufemia la ruta pasa por una calle a 10 m de
   // una rotonda de 28 m de radio, sin entrar, y su cruce de al lado es suyo.
   if(mIn<0||cerca>Math.max(rot[2],6)+ROT_DENTRO)continue;
   junctions=junctions.filter(j=>!(j.along>=mIn-15&&j.along<=mOut+15&&dist(j.point,c)<=r+15));
   // Sin brazo antes o despues (la ruta empieza o acaba en la rotonda) no
   // hay con que comparar: se quitan los de dentro y no se dice nada.
   if(mIn<8||total-mOut<8)continue;
   const antes=enMetro(Math.max(0,mIn-ROT_BRAZO)),despues=enMetro(Math.min(total,mOut+ROT_BRAZO));
   const neto=difRumbo(bearingBetween(enMetro(mOut),despues),bearingBetween(antes,enMetro(mIn)));
   // QUE SALIDA (16 nov 2026). El autor: «la primera salida, a la derecha, si
   // la detecta; pero si es la segunda no marca, no sabe». Con las salidas
   // del fichero se cuenta: y entonces se avisa TAMBIEN yendo recto, que es
   // justo cuando hace falta saber cual de las salidas es la buena.
   // La entrada y la salida, donde la ruta esta a radio+20 m del centro (como
   // las bocas del fichero); si no llega a alejarse tanto, en el borde.
   const lejos=rot[2]+20,aLejos=(m0,paso)=>{for(let m=m0,k=0;k<90&&m>=0&&m<=total;k++,m+=paso)if(dist(enMetro(m),c)>=lejos)return enMetro(m);return enMetro(m0)};
   const salida=salidaDeRotonda(rot,bearingBetween(c,aLejos(mIn,-1)),bearingBetween(c,aLejos(mOut,1)));
   const recto=Math.abs(neto)<ROT_RECTO;
   if(recto&&!salida)continue;
   let i=1;while(i+1<n&&cum[i+1]<=mIn)i++;
   const lado=neto<0?'izquierda':'derecha',vuelta=!salida&&Math.abs(neto)>=ROT_VUELTA;
   const aviso={i,point:pts[i],along:cum[i],direction:vuelta?'vuelta':lado,hacia:lado,
    angle:Math.round(Math.abs(neto)),cruce:true,mantente:false,retorno:vuelta,rotonda:true};
   if(salida){aviso.salida=salida;if(recto)aviso.recto=true}
   let p=0;while(p<junctions.length&&junctions[p].i<i)p++;
   junctions.splice(p,0,aviso);
  }
 }
}
// Punto de avance sobre la ruta, no solo distancia en línea recta.
// Para las pruebas: en la pagina «module» no existe y esto no hace nada.
if(typeof module==='object'&&module&&module.exports){module.exports={distARuta,eligePorForma,decideCrucePorCalle,salidaDeRotonda,textoSalida,ladoFlecha,actualizaVelocidad,distanciasDeAviso,pitidos,callaYa,closestMeters,resetJunctionView,guardaZona,zonaGuardada,descifraRamas,descifraZona,bajaZona,cargaZonaCruces,aplicaCruces,enviaGirosNativos,difRumbo,decideCruce,espaciaParaGiros,quitaPicos,computeJunctions,detectaCurvasDelTrack,calculaCrucesDe,resuelveRotondas};
 Object.defineProperty(module.exports,'rotondasOsm',{get:()=>rotondasOsm,set:v=>{rotondasOsm=v}});
 Object.defineProperty(module.exports,'velocidadSuave',{get:()=>velocidadSuave,set:v=>{velocidadSuave=v}});
}
