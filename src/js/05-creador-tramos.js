// POR QUE NO HA SALIDO EL TRAMO. Decir «no hay conexion a pie en
// OpenStreetMap» cuando lo que pasa es que los caminos de la zona todavia se
// estan bajando manda a buscar el fallo donde no esta: el autor se encontro
// con ese mensaje sobre un sendero que veia dibujado. Y cuando de verdad no
// hay camino, lo que hace falta saber es que el lapiz solo conoce lo que
// esta en OpenStreetMap -mas los tramos de las rutas de Trabakutik-, y que
// el mapa del IGN dibuja sendas que OpenStreetMap no tiene.
function porQueNoHayCamino(e){
 if(!redOsm)return 'Los caminos de la zona todavía se están bajando. Espera unos segundos y vuelve a tocar.';
 // Un fallo del servicio NO es «no hay camino»: si se lo decimos, el autor
 // se pone a mover el punto en el monte buscando un paso que si existe.
 if(!e||!e.sinCamino)return (e&&e.message)||'No se pudo calcular.';
 return e.message+' El lápiz solo conoce los caminos de OpenStreetMap y los de las rutas de Trabakutik: el mapa del IGN dibuja sendas que OpenStreetMap no tiene.';
}
function planLocalMapa(coords){
 if(!redOsm||coords.length<2||rumboDeCalzada(coords)!==null)return null;
 const anclas=coords.map(p=>enganchaOsm(redOsm,p[0],p[1]));
 if(anclas.some(a=>!a))return null;
 // El mismo listón que con Valhalla: si el punto marcado se queda a mas de
 // 40 m del camino, no es ese el camino que querias.
 for(let i=0;i<coords.length;i++)if(dist(anclas[i].p,coords[i])>40)return null;
 const parts=[];
 for(let i=1;i<anclas.length;i++){
  const tramo=rutaOsm(redOsm,anclas[i-1],anclas[i]);
  if(!tramo)return null;
  let largo=0;
  for(let k=1;k<tramo.length;k++)largo+=dist(tramo[k-1],tramo[k]);
  if(largo>Math.max(400,dist(coords[i-1],coords[i])*RODEO_MAXIMO))return null;
  parts.push(rotondasPorLaDerecha(tramo,rotondasDelCreador()));
 }
 return {anchors:[parts[0][0],...parts.map(p=>p[p.length-1])],parts};
}
// LAS ROTONDAS, SIEMPRE POR LA DERECHA (17 nov 2026). Lo pidio el autor:
// «crear la rotonda por el lado que toca; vamos siempre por la derecha», y
// «en bici tambien hay que respetar las normas». El planificador calcula a
// pie, y a pie una rotonda se rodea por donde sea mas corto: para girar a la
// izquierda iba por el lado contrario, y luego las indicaciones salian mal.
// No se pasa a la bici para todo (en las calles de sentido unico da rodeos del
// doble, ver URL_PLANIFICADOR): se corrige solo el trozo de la rotonda. Si el
// camino la recorre al reves de su giro (cruces-zona.json trae centro, radio
// y sentido de las 192 de la zona), ese trozo se cambia por el arco que va en
// su sentido, de la misma entrada a la misma salida. Un punto marcado DENTRO
// de la rotonda no se toca: lo ha puesto el autor.
const ROTONDA_MARGEN=6,ROTONDA_GIRO_MIN=15,ROTONDA_PASO=4;
// LAS ROTONDAS DE FUERA DE MALLABIA TAMBIEN (23 nov 2026). «Vamos siempre por
// el lado derecho de la carretera», y por eso existe rotondasPorLaDerecha.
// Pero sus rotondas salian SOLO de cruces-zona.json, el cuadro de Mallabia:
// creando una ruta en Gorbeia o en Otzarreta no habia ni una rotonda que
// corregir y el planificador la rodeaba por el lado corto, que a pie es el
// izquierdo. El navegador si se baja los cuadrados de 0,1 grados de Euskadi
// (cargaTeselas); el creador no los miraba. Ahora si, y como el navegador:
// solo cuando el trozo se sale del cuadro base, y con los cuadrados que ya
// estan en memoria no se vuelve a pedir nada.
let rotondasTeselas=[];
function rotondasDelCreador(){
 try{
  const base=typeof zonaCruces!=='undefined'&&zonaCruces&&Array.isArray(zonaCruces.rotondas)?zonaCruces.rotondas:[];
  if(!rotondasTeselas.length)return base;
  const vistas=new Set(base.map(r=>r[0]+','+r[1]));
  return base.concat(rotondasTeselas.filter(r=>!vistas.has(r[0]+','+r[1])));
 }catch(e){return []}
}
async function cargaRotondas(pts){
 if(typeof cargaZonaCruces==='function'&&(typeof zonaCruces==='undefined'||!zonaCruces))
  await cargaZonaCruces().catch(()=>null);
 if(!Array.isArray(pts)||pts.length<2)return;
 if(typeof fueraDeZona!=='function'||typeof cargaTeselas!=='function')return;
 const bbox=typeof zonaCruces!=='undefined'&&zonaCruces?zonaCruces.bbox:null;
 if(bbox&&!fueraDeZona(pts,bbox))return;
 const r=await cargaTeselas(pts).catch(()=>null);
 const vistas=new Set(rotondasTeselas.map(x=>x[0]+','+x[1]));
 for(const z of (r&&r.zonas)||[])for(const rot of z.rotondas||[]){
  const k=rot[0]+','+rot[1];
  if(!vistas.has(k)){vistas.add(k);rotondasTeselas.push(rot)}
 }
}
// Que esten cargadas antes de calcular, sin esperar mas de un par de segundos.
// Devuelve null si no hay nada que esperar: un await de mas cambia el orden
// en que se cancela un calculo.
function esperaRotondas(pts){
 try{
  if(typeof cargaZonaCruces!=='function')return null;
  const hayBase=typeof zonaCruces!=='undefined'&&!!zonaCruces;
  const fuera=hayBase&&Array.isArray(pts)&&pts.length>=2
    &&typeof fueraDeZona==='function'&&typeof cargaTeselas==='function'
    &&fueraDeZona(pts,zonaCruces.bbox);
  if(hayBase&&!fuera)return null;
  return Promise.race([cargaRotondas(pts),new Promise(ok=>setTimeout(ok,2500))]);
 }catch(e){return null}
}
function rumboDesde(c,p){return (Math.atan2((p[1]-c[1])*Math.cos(c[0]*Math.PI/180),p[0]-c[0])*180/Math.PI+360)%360}
function difRumboCreador(a,b){let d=(a-b)%360;if(d>=180)d-=360;if(d<-180)d+=360;return d}
function rotondasPorLaDerecha(pts,rotondas){
 if(!Array.isArray(pts)||pts.length<3||!rotondas||!rotondas.length)return pts;
 let out=pts;
 for(const rot of rotondas){
  const c=[rot[0],rot[1]],r=rot[2],sentido=rot[3]&&rot[3].sentido===-1?-1:1;
  // Lejos de esta rotonda: nada que mirar.
  if(!out.some(p=>dist(p,c)<=r+ROTONDA_MARGEN))continue;
  const nuevo=[];let i=0;
  while(i<out.length){
   if(dist(out[i],c)>r+ROTONDA_MARGEN){nuevo.push(out[i]);i++;continue}
   let j=i;while(j+1<out.length&&dist(out[j+1],c)<=r+ROTONDA_MARGEN)j++;
   // El trozo i..j esta dentro. Si empieza o acaba el tramo ahi dentro (un
   // punto marcado en la rotonda), se deja como esta.
   if(i===0||j===out.length-1){for(let k=i;k<=j;k++)nuevo.push(out[k]);i=j+1;continue}
   let giro=0;for(let k=i+1;k<=j;k++)giro+=difRumboCreador(rumboDesde(c,out[k]),rumboDesde(c,out[k-1]));
   // Al reves que el reloj es rumbo DECRECIENTE: giro negativo con sentido 1.
   const alReves=Math.abs(giro)>=ROTONDA_GIRO_MIN&&Math.sign(giro)===sentido;
   if(!alReves){for(let k=i;k<=j;k++)nuevo.push(out[k]);i=j+1;continue}
   const e=out[i],x=out[j],bE=rumboDesde(c,e),bX=rumboDesde(c,x);
   const R=Math.max(3,(dist(e,c)+dist(x,c))/2);
   // Lo que hay que girar en el sentido de la rotonda (siempre de 0 a 360).
   const vuelta=sentido>0?((bE-bX)%360+360)%360:((bX-bE)%360+360)%360;
   const n=Math.max(2,Math.ceil(R*vuelta*Math.PI/180/ROTONDA_PASO));
   nuevo.push(e);
   for(let k=1;k<n;k++){
    const b=(bE-sentido*vuelta*k/n)*Math.PI/180;
    nuevo.push([c[0]+R*Math.cos(b)/111195,c[1]+R*Math.sin(b)/(111195*Math.cos(c[0]*Math.PI/180))]);
   }
   nuevo.push(x);
   i=j+1;
  }
  out=nuevo;
 }
 return out;
}
function respuestaMapaGps(data,solicitados){
 const viaje=data&&data.trip;
 if(!viaje||typeof viaje!=='object')throw Error('La respuesta del planificador no es válida.');
 const tramos=viaje.legs;
 if(!Array.isArray(tramos)||tramos.length!==solicitados.length-1)throw Error('La respuesta del planificador está incompleta.');
 const sinCamino='No hay conexión a pie entre esos puntos en OpenStreetMap. Acerca el punto al camino o elige otro paso.';
 const parts=tramos.map((tramo,i)=>{
  const pts=descodificaValhalla(tramo&&tramo.shape);
  if(pts.length<2)throw noHayPaso(sinCamino);
  for(const p of pts)if(!coordenadaMapaGps(p))throw Error('El recorrido contiene coordenadas inválidas.');
  let largo=0;for(let k=1;k<pts.length;k++)largo+=dist(pts[k-1],pts[k]);
  if(largo>Math.max(400,dist(solicitados[i],solicitados[i+1])*RODEO_MAXIMO))throw noHayPaso(sinCamino);
  return rotondasPorLaDerecha(pts,rotondasDelCreador());
 });
 if(!parts.length)throw Error('La respuesta del planificador está incompleta.');
 // Valhalla devuelve en «locations» los puntos que le has pedido, no los que
 // ha pegado al camino: las anclas de verdad son los extremos del trazado.
 const anchors=[parts[0][0],...parts.map(p=>p[p.length-1])];
 anchors.forEach((p,i)=>{
  if(dist(p,solicitados[i])>40)throw noHayPaso('No hay un camino suficientemente cerca del punto marcado.');
 });
 for(let i=1;i<parts.length;i++)
  if(dist(parts[i-1][parts[i-1].length-1],parts[i][0])>1)throw Error('El recorrido contiene un corte.');
 return {anchors,parts};
}
// Los enlaces con varias bocas de sentido único pueden confundir al perfil
// de a pie. Solo se usa el perfil direccional entre puntos de carretera.
function rumboDeCalzada(coords){
 if(coords.length!==2||typeof redOsm==='undefined'||!redOsm?.clase||
    typeof zonaCruces==='undefined'||!zonaCruces?.puntos)return null;
 const [a,b]=coords;
 if(dist(a,b)<25)return null;
 const carretera=p=>{
  const ancla=enganchaOsm(redOsm,p[0],p[1]);
  return ancla&&dist(p,ancla.p)<=15&&[3,5].includes(redOsm.clase[ancla.tr]);
 };
 if(!carretera(a)||!carretera(b))return null;
 // UNA ROTONDA NO ES UN ENLACE DE CALZADAS SEPARADAS (23 nov 2026). Sus
 // nodos tienen lo mismo que los de un enlace -dos o mas ramas prohibidas y
 // todo carretera-, asi que entraban aqui y metian al creador en el modo
 // estricto: rumbo forzado, el punto anterior pegado a menos de 3 m y el
 // trazado como mucho un 35 % mas largo que la recta. Dar la vuelta a una
 // rotonda ES mas largo que la recta, asi que saltaba «El punto anterior
 // esta en otra calzada» y la unica salida era «Unir en recta». El autor,
 // con una ruta por la N-634 en Berriz: «coge las rotondas pero en carretera
 // falla, me da mucha linea recta, ademas traza por donde quiere».
 // Medido en cruces-zona.json: de los 159 nodos que pasaban por enlace, 90
 // -el 57 %- eran nodos de rotonda.
 // Y no hace falta el modo estricto en una rotonda: el sentido lo impone la
 // propia rotonda, y el lado por el que se rodea ya lo arregla despues
 // rotondasPorLaDerecha.
 const rotondas=typeof rotondasDelCreador==='function'?rotondasDelCreador():[];
 const enRotonda=n=>rotondas.some(r=>dist(n,[r[0],r[1]])<=r[2]+5);
 const enlace=zonaCruces.puntos.some(n=>n.prohibidas?.filter(Boolean).length>=2&&
  n.clases?.every(c=>c===1)&&distARuta(n,coords)<=30&&!enRotonda(n));
 return enlace?Math.round(rumboDesde(a,b))%360:null;
}
// Revisa también enlaces intermedios: las anclas de usuario pueden quedar
// lejos y la cuerda entre ellas no representa la carretera.
async function revisaCalzadas(result,signal){
 if(typeof zonaCruces==='undefined'||!zonaCruces?.puntos||!redOsm?.clase)return result;
 const enlaces=zonaCruces.puntos.filter(n=>n.prohibidas?.filter(Boolean).length>=2&&n.clases?.every(c=>c===1));
 for(const tramo of result.parts){
  for(const enlace of enlaces){
   let centro=-1,cerca=8;
   for(let i=1;i<tramo.length-1;i++){
    if(Math.abs(tramo[i][0]-enlace[0])>.00008||Math.abs(tramo[i][1]-enlace[1])>.00011)continue;
    const d=dist(tramo[i],enlace);
    if(d<cerca){cerca=d;centro=i}
   }
   if(centro<0)continue;
   let a=centro,b=centro;
   while(a>0&&dist(tramo[a],enlace)<65)a--;
   while(b<tramo.length-1&&dist(tramo[b],enlace)<65)b++;
   if(dist(tramo[a],enlace)<30||dist(tramo[b],enlace)<30)continue;
   const entrada=rumboDesde(tramo[a],enlace),salida=rumboDesde(enlace,tramo[b]);
   if(Math.abs(difRumboCreador(entrada,salida))>25)continue;
   const puntos=[tramo[a],tramo[b]],rumbo=rumboDeCalzada(puntos);
   if(rumbo===null)continue;
   const reparado=await calculaCalzada(puntos,signal,rumbo);
   if(dist(reparado.anchors[0],tramo[a])>3||dist(reparado.anchors[1],tramo[b])>3)
    throw Error('No se pudo mantener la calzada en un enlace. Marca un punto de paso antes y otro después, en el sentido que quieres seguir.');
   const interior=reparado.parts[0].filter((p,i,pts)=>
    (i!==0||dist(p,tramo[a])>.5)&&(i!==pts.length-1||dist(p,tramo[b])>.5));
   tramo.splice(a+1,b-a-1,...interior);
  }
 }
 return result;
}
// CUANDO SE PUEDE OFRECER LA RECTA. Dos casos, y solo dos:
// 1. No hay camino en OpenStreetMap y los caminos de la zona YA estan
//    bajados -si no, lo que toca es esperar, no ponerse a dibujar rectas-.
// 2. El planificador no sabe en que calzada estas. Es lo que pasa en una
//    nacional de calzadas separadas, como la N-634 en Areitiogana: el punto
//    anterior le cae en la calzada contraria y se niega a seguir. Ahi los
//    caminos guardados NO valen -no respetan los sentidos unicos y te
//    meterian a contramano-, pero la recta si: entre dos puntos de la misma
//    calzada el trozo es casi recto, y quien decide es el autor. Antes no
//    habia salida ninguna y solo quedaba ir dando puntos cortisimos; lo
//    conto el 23 de noviembre de 2026: «le cuesta coger, tengo que ir
//    cogiendo puntos muy muy cortos».
// Un servicio caido no entra: eso no significa que no haya camino.
function ofreceRectaTrasFallo(e,hayRed){return !!(e&&(e.sinCamino&&hayRed||e.calzadaDudosa))}
async function calculaCalzada(coords,signal,rumbo){
 const respuesta=await pideMapaGps(coords,signal,null,rumbo);
 const result=respuestaMapaGps(respuesta,coords);
 const tramo=result.parts[0];
 const metrosTramo=tramo.slice(1).reduce((m,p,i)=>m+dist(tramo[i],p),0);
 const directo=dist(coords[0],coords[1]);
 const cambioDeSentido=respuesta.trip.legs[0].maneuvers?.some(m=>m.type===12||m.type===13);
 if(cambioDeSentido||metrosTramo>directo*1.35+25)
  throw Error('No se pudo confirmar la continuidad de la calzada. Acerca los puntos al sentido que quieres seguir.');
 return result;
}
// DOS CARRILES JUNTOS EN LA MISMA DIRECCION SON UNO (23 nov 2026, lo pidio el
// autor: «da igual que haya dos calzadas, si son en la misma direccion para mi
// los dos son uno... que marque como uno, a menos que influya en el cruce»).
//
// El planificador pega el punto anterior a la calzada gemela y antes eso era
// un «no» seco -«El punto anterior esta en otra calzada»-, asi que solo
// quedaba ir dando puntos cortisimos. Ahora se mira COMO se ha movido el
// punto, no cuanto:
//  - DE LADO, perpendicular al sentido de la marcha: es la calzada de al
//    lado, la misma carretera. Se acepta hasta 30 m, que es mas de lo que
//    separa a dos calzadas de una nacional.
//  - HACIA DELANTE O HACIA ATRAS: eso si cambia el recorrido -te saltarias un
//    trozo o lo repetirias-, y se sigue diciendo que no. Ocho metros de
//    margen, que es el error de pegado normal.
//
// Lo de «a menos que influya en el cruce» ya lo caza calculaCalzada, que corre
// antes: si para pasar de una calzada a la otra hay que dar la vuelta o
// rodear, el trazado sale un 35 % mas largo que la recta o trae una maniobra
// de cambio de sentido, y entonces no pasa.
const CALZADA_LADO_M=30,CALZADA_AVANCE_M=8;
function mismaCalzada(pedido,pegado,rumbo){
 if(!Array.isArray(pedido)||!Array.isArray(pegado)||!Number.isFinite(rumbo))return false;
 const norte=(pegado[0]-pedido[0])*111195;
 const este=(pegado[1]-pedido[1])*111195*Math.cos(pedido[0]*Math.PI/180);
 const r=rumbo*Math.PI/180;
 const avance=norte*Math.cos(r)+este*Math.sin(r);
 const lado=-norte*Math.sin(r)+este*Math.cos(r);
 return Math.abs(avance)<=CALZADA_AVANCE_M&&Math.abs(lado)<=CALZADA_LADO_M;
}
async function solicitaMapaGps(coords,signal){
 const rumbo=rumboDeCalzada(coords);
 if(rumbo!==null){
  const result=await calculaCalzada(coords,signal,rumbo).catch(e=>{e.calzadaDudosa=true;throw e});
  if(typeof anclasGps!=='undefined'&&anclasGps.length>1&&dist(result.anchors[0],coords[0])>3
     &&!mismaCalzada(coords[0],result.anchors[0],rumbo))
   throw Object.assign(Error('El punto anterior está en otra calzada. Acércalo al sentido que quieres seguir.'),{calzadaDudosa:true});
  result.calzada=true;
  return result;
 }
 const normal=respuestaMapaGps(await pideMapaGps(coords,signal,null),coords);
 // La segunda opinion (ver eligeTramosCortos). Si falla, no pasa nada: se
 // queda el normal. Solo se corta si el calculo se cancela.
 // Con tope de SEGUNDA_MS: si no contesta, la normal ya esta y no se espera
 // mas (lo vio la revision con GPT: sin tope, una segunda colgada dejaba al
 // creador esperando con la ruta buena ya en la mano).
 let corto=null;
 const SEGUNDA_MS=6000,ctl=new AbortController();
 const corta=()=>ctl.abort();signal.addEventListener('abort',corta,{once:true});
 let reloj=null;
 // Carrera con un reloj: no basta con cancelar la peticion, que una que no
 // atienda la cancelacion dejaria la espera colgada igual.
 const tope=new Promise((_,ko)=>{reloj=setTimeout(()=>{corta();ko(Error('Sin segunda opinión'))},SEGUNDA_MS)});
 try{corto=respuestaMapaGps(await Promise.race([pideMapaGps(coords,ctl.signal,{pedestrian:{shortest:true}}),tope]),coords)}
 catch(e){if(signal.aborted)throw e}
 finally{clearTimeout(reloj);signal.removeEventListener('abort',corta)}
 try{return await revisaCalzadas(eligeTramosCortos(normal,corto),signal)}
 catch(e){e.calzadaDudosa=true;throw e}
}
async function pideMapaGps(coords,signal,opciones,rumbo=null){
 const espera=Math.max(0,1100-(Date.now()-ultimaPeticionMapaGps));
 if(espera)await new Promise((resolve,reject)=>{
  const cancel=()=>{clearTimeout(timer);reject(Error('Cálculo cancelado.'))};
  const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve()},espera);
  if(signal.aborted)cancel();else signal.addEventListener('abort',cancel,{once:true});
 });
 if(signal.aborted)throw Error('Cálculo cancelado.');
 ultimaPeticionMapaGps=Date.now();
 const peticion={
  locations:coords.map(p=>({lat:Number(p[0].toFixed(6)),lon:Number(p[1].toFixed(6)),type:'break',...(rumbo===null?{}:{heading:rumbo,heading_tolerance:35,radius:35,rank_candidates:false})})),
  costing:rumbo===null?'pedestrian':'auto',directions_options:{units:'kilometers'}};
 if(opciones)peticion.costing_options=opciones;
 const r=await fetch(URL_PLANIFICADOR,{method:'POST',body:JSON.stringify(peticion),signal,cache:'no-store',credentials:'omit',
  headers:{Accept:'application/json','Content-Type':'application/json','X-Client-Id':'trabakutik.com'}});
 if(r.status===429)throw Error('El planificador está ocupado. Espera unos segundos y vuelve a intentarlo.');
 if(!r.ok){
  // Valhalla contesta 400 con un numero cuando no encuentra camino cerca.
  let codigo=0;try{codigo=(await r.json()).error_code|0}catch(e){}
  if([154,170,171,172,442,443,444].includes(codigo))
   throw noHayPaso('No hay conexión a pie entre esos puntos en OpenStreetMap. Acerca el punto al camino o elige otro paso.');
  throw Error('No se pudo conectar con el planificador. Conservamos el trazado anterior.');
 }
 return r.json();
}
// Muestrear el terreno cada 30 m, con un límite por recorrido. Se conservan
// todas las esquinas de la geometría y los puntos de paso del usuario.
function interpolaMapaGps(a,b,f){
 let dl=b[1]-a[1];if(dl>180)dl-=360;if(dl< -180)dl+=360;
 const lon=((a[1]+dl*f+540)%360)-180;
 return [a[0]+(b[0]-a[0])*f,lon];
}
function muestrasAlturaGps(result){
 let total=0,prev=null;const rows=[],limits=[0];
 result.parts.forEach((part,leg)=>{
  for(const p of part){if(prev)total+=dist(prev,p);rows.push({p,d:total,leg});prev=p}
  limits.push(total);
 });
 const targets=new Set(limits.map(d=>d.toFixed(4))),paso=Math.max(30,total/500);
 for(let d=paso;d<total;d+=paso)targets.add(d.toFixed(4));
 let i=0;
 const samples=[...targets].map(Number).sort((a,b)=>a-b).map(d=>{
  while(i+1<rows.length&&rows[i+1].d<d)i++;
  const a=rows[i],b=rows[Math.min(i+1,rows.length-1)];
  const f=b.d>a.d?Math.max(0,Math.min(1,(d-a.d)/(b.d-a.d))):0;
  return {d,p:interpolaMapaGps(a.p,b.p,f),h:null};
 });
 return {rows,samples};
}
const cacheAlturasMapaGps=new Map();
let ultimaAlturaMapaGps=0;
async function alturasTerrenoGps(result,signal){
 const {rows,samples}=muestrasAlturaGps(result);
 const key=p=>p[0].toFixed(6)+','+p[1].toFixed(6);
 const missing=samples.filter(s=>!cacheAlturasMapaGps.has(key(s.p)));
 for(let off=0;off<missing.length;off+=80){
  const batch=missing.slice(off,off+80),wait=Math.max(0,1100-(Date.now()-ultimaAlturaMapaGps));
  if(wait)await new Promise((resolve,reject)=>{
   const cancel=()=>{clearTimeout(timer);reject(Error('Alturas canceladas.'))};
   const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve()},wait);
   if(signal.aborted)cancel();else signal.addEventListener('abort',cancel,{once:true});
  });
  if(signal.aborted)throw Error('Alturas canceladas.');
  ultimaAlturaMapaGps=Date.now();
  const shape=batch.map(s=>({lat:Number(s.p[0].toFixed(6)),lon:Number(s.p[1].toFixed(6))}));
  const url='https://valhalla1.openstreetmap.de/height?json='+encodeURIComponent(JSON.stringify({shape,height_precision:1}));
  const response=await fetch(url,{signal,cache:'no-store',credentials:'omit',headers:{Accept:'application/json','X-Client-Id':'trabakutik.com'}});
  if(!response.ok)throw Error('No se han podido obtener las alturas del terreno.');
  const data=await response.json();
  if(!Array.isArray(data.height)||data.height.length!==batch.length||data.height.some(h=>h!==null&&(!Number.isFinite(h)||h< -12000||h>10000)))throw Error('El servicio de alturas devolvió datos incompletos.');
  if(signal.aborted)throw Error('Alturas canceladas.');
  batch.forEach((s,i)=>cacheAlturasMapaGps.set(key(s.p),data.height[i]));
 }
 samples.forEach(s=>s.h=cacheAlturasMapaGps.get(key(s.p))??null);
 let i=0;
 function elevation(d){
  while(i+1<samples.length&&samples[i+1].d<d-.001)i++;
  const a=samples[i],b=samples[Math.min(i+1,samples.length-1)];
  if(Math.abs(d-a.d)<.01)return a.h;
  if(Math.abs(d-b.d)<.01)return b.h;
  if(!Number.isFinite(a.h)||!Number.isFinite(b.h))return null;
  return a.h+(b.h-a.h)*(d-a.d)/(b.d-a.d);
 }
 // Añadir también las muestras intermedias permite ver una cima situada
 // en mitad de una recta larga, sin cambiar el camino calculado.
 const parts=result.parts.map(()=>[]);
 for(let r=0;r<rows.length;r++){
  const row=rows[r];parts[row.leg].push({d:row.d,p:row.p});
  const next=rows[r+1];
  if(next&&next.leg===row.leg)for(const s of samples)if(s.d>row.d+.01&&s.d<next.d-.01)parts[row.leg].push({d:s.d,p:s.p});
 }
 result.parts=parts.map(part=>part.map(row=>[row.p[0],row.p[1],elevation(row.d)]));
 result.anchors=result.parts.length?[result.parts[0][0],...result.parts.map(part=>part[part.length-1])]:result.anchors;
 while(cacheAlturasMapaGps.size>4000)cacheAlturasMapaGps.delete(cacheAlturasMapaGps.keys().next().value);
 return result;
}

function aplicaMapaGps(result){
 // Solo después de validar la respuesta se sustituye el borrador.
 if(nodosManualesGps.size){const base=nodosManualesGps.values().next().value;redGps.nodos.length=base;redGps.ady.length=base;nodosManualesGps.clear()}
 const ids=result.anchors.map(p=>nodoManualGps(p[0],p[1],p[2]));
 if(ids.length>2&&dist(result.anchors[0],result.anchors[ids.length-1])<.01)ids[ids.length-1]=ids[0];
 anclasGps=ids;tramosGps=ids.length?[[ids[0]]]:[];
 result.parts.forEach((pts,i)=>{
  const tr=[ids[i],...pts.slice(1,-1).map(p=>nodoManualGps(p[0],p[1],p[2])),ids[i+1]];
  tr.mapa=true;
  if(result.oficial)tr.oficial=result.oficial;
  tramosGps.push(tr);
 });
 updateDraw();
}
// AÑADIR UN TRAMO SIN TOCAR LO DE ANTES. aplicaMapaGps sustituye el trazado
// ENTERO por lo que devuelve el planificador, y eso estaba detras de un fallo
// que conto el autor: trazas un trozo recto a mano, cambias de modo, tocas un
// punto y «el desvio de antes vuelve a salir». Claro: el planificador rehacia
// la ruta desde la primera ancla y se llevaba por delante lo hecho a mano.
// Esto añade el tramo calculado al final y deja lo anterior como estaba.
function anadeTramoMapa(result){
 const a=result.anchors[0],b=result.anchors[1];
 if(!anclasGps.length||(result.calzada||result.ajustaInicio)&&anclasGps.length===1){
  const ini=nodoManualGps(a[0],a[1],a[2]);
  anclasGps[0]=ini;tramosGps[0]=[ini];
 }
 const ini=anclasGps[anclasGps.length-1];
 // EL PRIMER PUNTO SE QUEDABA SIN ALTURA. Esto reutiliza el ancla que ya
 // existe, y la primera nace en el primer toque, cuando todavia no se le ha
 // preguntado la altura a nadie -antes aplicaMapaGps rehacia TODAS las anclas
 // con la altura del servicio, y por eso no se notaba-. Si esa ancla sigue sin
 // altura, la respuesta para ese mismo punto llega con este tramo: se le pone.
 // Si ya tiene -prestada de tus rutas por alturaCerca- no se toca.
 // Solo si es un punto puesto a mano: a un nodo de la red de caminos no se le
 // escribe encima, que lo comparten todas las rutas.
 if(nodosManualesGps.has(ini)&&redGps.nodos[ini]&&!Number.isFinite(redGps.nodos[ini][2])&&Number.isFinite(a[2]))redGps.nodos[ini][2]=a[2];
 const cierre=cierraEnElInicio(b);
 const esCatalogo=!!(result.oficial||result.publicado);
 const fin=cierre!==null&&(!esCatalogo||dist(redGps.nodos[cierre],b)<=.8)?cierre:nodoManualGps(b[0],b[1],b[2]);
 const pts=result.parts[0]||[];
 const tr=[ini,...pts.slice(1,-1).map(q=>nodoManualGps(q[0],q[1],q[2])),fin];
 tr.mapa=true;
 if(result.oficial)tr.oficial=result.oficial;
 anclasGps.push(fin);tramosGps.push(tr);
 updateDraw();
}
// VOLVER AL PUNTO DE PARTIDA CIERRA EL CIRCULO. Si el tramo que se añade
// acaba encima del primer punto, su final ES el primer punto -el mismo
// nodo-, que es lo que el resto del creador entiende por «cerrado»: una sola
// bola en el mapa y mover la salida mueve tambien la llegada. Lo usa «Cerrar
// el circulo», que ya solo calcula ese ultimo tramo, y vale igual si el autor
// toca a mano encima de la salida. 5 m: lo que puede mover el planificador un
// punto que ya estaba pegado al camino.
function cierraEnElInicio(p){
 if(anclasGps.length<2||!p)return null;
 const ini=redGps.nodos[anclasGps[0]];
 return ini&&dist(ini,p)<5?anclasGps[0]:null;
}
// Un solo tramo: del ultimo punto puesto al que acabas de tocar. Se esperan
// tambien las alturas antes de pintarlo, que asi se añade una sola vez y no
// hay que repintar el tramo a medias.
let manoLayers=[];
// EL TRAMO QUE NO SE PUDO CALCULAR, a la espera de que el autor decida si
// lo une en recta. Se borra en cuanto se vuelve a calcular algo.
let tramoSinCamino=null;
function uneEnRectaMapa(){
 if(!tramoSinCamino)return;
 const [desde,hasta]=tramoSinCamino;tramoSinCamino=null;
 if(!anclasGps.length){
  const ini=nodoManualGps(desde[0],desde[1]);
  anclasGps.push(ini);tramosGps.push([ini]);
 }
 const ini=anclasGps[anclasGps.length-1];
 const fin=cierraEnElInicio(hasta)??nodoManualGps(hasta[0],hasta[1]);
 const tr=[ini,fin];tr.aMano=true;
 anclasGps.push(fin);tramosGps.push(tr);
 updateDraw();
 estadoMapaGps('');
 notice('Tramo trazado a mano, en recta · '+Math.round(metros(desde,hasta))+' m · no va por ningún camino del mapa');
}
async function planificaTramoMapa(desde,hasta){
 tramoSinCamino=null;
 if(!coordenadaMapaGps(desde)||!coordenadaMapaGps(hasta))return;
 cancelaMapaGps();const version=calculoMapaGps;
 const controller=new AbortController();peticionMapaGps=controller;calculandoMapaGps=true;
 $('saveCreated').disabled=true;estadoMapaGps('Calculando tramo…');
 const timer=setTimeout(()=>controller.abort(),30000);
 try{
  if(typeof tramoDeCatalogo==='function'){
   const referencias=new AbortController(),cancela=()=>referencias.abort();
   controller.signal.addEventListener('abort',cancela,{once:true});
   const limite=setTimeout(cancela,5500);
   const conocido=await tramoDeCatalogo(desde,hasta,referencias.signal,anclasGps.length<=1)
    .catch(()=>null).finally(()=>{clearTimeout(limite);controller.signal.removeEventListener('abort',cancela)});
   if(version!==calculoMapaGps)return;
   if(conocido){
    anadeTramoMapa(conocido);
    estadoMapaGps(textoAjustesTrack((conocido.oficial||conocido.publicado).ajustes));
    return;
   }
  }
  if(!permisoMapaGps){
   permisoMapaGps=confirm('Para calcular los caminos y el desnivel se enviarán los puntos del recorrido a los servicios de rutas y alturas de FOSSGIS (OpenStreetMap). ¿Continuar?');
   if(!permisoMapaGps){estadoMapaGps('Cálculo cancelado. No se han enviado los puntos.');return}
  }
  {const espera=esperaRotondas([desde,hasta]);if(espera)await espera}
  const result=await solicitaMapaGps([desde,hasta],controller.signal);
  if(version!==calculoMapaGps)return;
  try{await alturasTerrenoGps(result,controller.signal);}catch(e){}
  if(version!==calculoMapaGps)return;
  anadeTramoMapa(result);
  const completo=result.parts.every(part=>part.every(q=>Number.isFinite(q[2])));
  estadoMapaGps(completo?'':'Faltan alturas en este tramo.');
 }catch(e){
  if(version!==calculoMapaGps)return;
  // Sin cobertura, con los caminos guardados. Sin desnivel: las cotas las
  // da Valhalla y es justo lo que no hay.
  const local=e.calzadaDudosa?null:planLocalMapa([desde,hasta]);
  if(local){anadeTramoMapa(local);estadoMapaGps('Sin conexión · tramo por los caminos guardados, sin desnivel.')}
  else if(controller.signal.aborted)estadoMapaGps('No se pudo completar el cálculo. Revisa la conexión y vuelve a intentarlo.');
  else {
   // Ni el planificador ni los caminos guardados. Si es que por ahi no hay
   // camino en el mapa, se le ofrece trazarlo a mano.
   // Solo se ofrece trazarlo a mano cuando SABEMOS que no hay camino: con
   // los caminos de la zona ya bajados. Si todavia no estan, lo que toca es
   // esperar unos segundos, no ponerse a dibujar rectas.
   tramoSinCamino=ofreceRectaTrasFallo(e,!!redOsm)?[desde,hasta]:null;
   estadoMapaGps(e.calzadaDudosa?e.message:porQueNoHayCamino(e),!!tramoSinCamino);
  }
 }finally{
  clearTimeout(timer);
  if(version===calculoMapaGps){peticionMapaGps=null;calculandoMapaGps=false;$('saveCreated').disabled=drawPoints.length<2}
 }
}
async function planificaMapaGps(coords){
 if(coords.some(p=>!coordenadaMapaGps(p))||coords.length>80){estadoMapaGps('Marca hasta 80 puntos de paso por recorrido.');return}
 cancelaMapaGps();const version=calculoMapaGps;
 if(coords.length<2){aplicaMapaGps({anchors:coords,parts:[]});estadoMapaGps('');return}
 if(!permisoMapaGps){
  permisoMapaGps=confirm('Para calcular los caminos y el desnivel se enviarán los puntos del recorrido a los servicios de rutas y alturas de FOSSGIS (OpenStreetMap y Valhalla). Guardar en Mis rutas no publica el recorrido en Trabakutik. ¿Continuar?');
  if(!permisoMapaGps){estadoMapaGps('Cálculo cancelado. No se han enviado los puntos.');return}
 }
 const controller=new AbortController();peticionMapaGps=controller;calculandoMapaGps=true;
 $('saveCreated').disabled=true;estadoMapaGps('Calculando recorrido…');
 const timer=setTimeout(()=>controller.abort(),30000);
 try{
  {const espera=esperaRotondas(coords);if(espera)await espera}
  const result=await solicitaMapaGps(coords,controller.signal);
  if(version!==calculoMapaGps)return;
  aplicaMapaGps(result);$('saveCreated').disabled=true;estadoMapaGps('Calculando desnivel…');
  try{
   await alturasTerrenoGps(result,controller.signal);
   if(version!==calculoMapaGps)return;
   aplicaMapaGps(result);
   const complete=result.parts.every(part=>part.every(p=>Number.isFinite(p[2])));
   estadoMapaGps(complete?'':'Faltan alturas en algunos tramos.');
  }catch(e){
   if(version===calculoMapaGps)estadoMapaGps('Recorrido conservado · no se pudieron cargar las alturas. Vuelve a calcular con conexión.');
  }
 }catch(e){
  if(version!==calculoMapaGps)return;
  const local=e.calzadaDudosa?null:planLocalMapa(coords);
  if(local){aplicaMapaGps(local);estadoMapaGps('Sin conexión · recorrido por los caminos guardados, sin desnivel.')}
  else estadoMapaGps(controller.signal.aborted?'No se pudo completar el cálculo. Revisa la conexión y vuelve a intentarlo.':e.calzadaDudosa?e.message:porQueNoHayCamino(e));
 }finally{
  clearTimeout(timer);
  if(version===calculoMapaGps){peticionMapaGps=null;calculandoMapaGps=false;$('saveCreated').disabled=drawPoints.length<2}
 }
}

function metros(a, b){
    var dy = (a[0] - b[0]) * 111320, dx = (a[1] - b[1]) * KX;
    return Math.sqrt(dy * dy + dx * dx);
  }

  // ---- la red ------------------------------------------------------------

  function construyeRed(tracks, alturas){
    var nodos = [], clave = Object.create(null), ady = [];
    function id(p){
      var k = Math.round(p[0] * 111320 / CELDA_M) + ':' +
              Math.round(p[1] * KX / CELDA_M);
      var i = clave[k];
      if (i === undefined) { i = nodos.length; clave[k] = i; nodos.push([p[0], p[1], null]); ady.push([]); }
      return i;
    }
    function une(a, b){
      if (a === b) return;
      var d = metros(nodos[a], nodos[b]);
      var i, vs = ady[a];
      for (i = 0; i < vs.length; i++) if (vs[i][0] === b) return;
      ady[a].push([b, d]); ady[b].push([a, d]);
    }
    // Los puntos vienen simplificados a 10 m y dos caminos que se CRUZAN
    // pueden caer en celdas distintas: el cruce no existe para la red y el
    // calculo tiene que irse a buscar la vuelta larga. Rellenando cada tramo
    // cada 5 m antes de pegar a la rejilla, el cruce cae en la misma celda.
    // Medido sobre 120 pares de puntos a 100-600 m: el rodeo mediano baja de
    // 1,94 a 1,58 veces la linea recta y los rodeos de mas de 3x pasan de 31
    // a 22. Los que quedan son de verdad: solo hay caminos grabados.
    tracks.forEach(function(t){
      var pts = t.points || [];
      var alt = (alturas && t.href) ? alturas[String(t.href).split('/').pop().replace('.html', '')] : null;
      var prev = -1;
      for (var i = 0; i < pts.length; i++) {
        if (i > 0) {
          var a = pts[i - 1], b = pts[i], largo = metros(a, b);
          // La altura del punto de relleno se interpola entre los dos puntos
          // grabados que tiene a los lados. Sin esto, el GPX que se baja
          // salia con altura solo en uno de cada cinco puntos.
          var ea = alt ? alt[i - 1] : null, eb = alt ? alt[i] : null;
          var hayE = typeof ea === 'number' && typeof eb === 'number';
          for (var k = 1; k * PASO_M < largo; k++) {
            var f = k * PASO_M / largo;
            var m = id([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
            if (hayE && nodos[m][2] === null) nodos[m][2] = Math.round(ea + (eb - ea) * f);
            if (prev >= 0) une(prev, m);
            prev = m;
          }
        }
        var n = id(pts[i]);
        if (alt && nodos[n][2] === null && typeof alt[i] === 'number') nodos[n][2] = alt[i];
        if (prev >= 0) une(prev, n);
        prev = n;
      }
    });
    // rejilla de 100 m para buscar el nodo mas cercano a un toque
    var cestas = Object.create(null);
    nodos.forEach(function(n, i){
      var k = Math.round(n[0] * 111320 / 100) + ':' + Math.round(n[1] * KX / 100);
      (cestas[k] || (cestas[k] = [])).push(i);
    });
    return { nodos: nodos, ady: ady, cestas: cestas };
  }

  function nodoCerca(red, lat, lon){
    var cx = Math.round(lat * 111320 / 100), cy = Math.round(lon * KX / 100);
    var mejor = -1, mejorD = Infinity;
    for (var dx = -2; dx <= 2; dx++) for (var dy = -2; dy <= 2; dy++) {
      var lista = red.cestas[(cx + dx) + ':' + (cy + dy)];
      if (!lista) continue;
      for (var i = 0; i < lista.length; i++) {
        var d = metros(red.nodos[lista[i]], [lat, lon]);
        if (d < mejorD) { mejorD = d; mejor = lista[i]; }
      }
    }
    return mejorD <= MAX_ENGANCHE_M ? mejor : -1;
  }

  // Dijkstra con monticulo binario. 8.418 nodos: sobra de rapido.
  function camino(red, desde, hasta){
    if (desde === hasta) return [desde];
    var n = red.nodos.length;
    var dist = new Float64Array(n); dist.fill(Infinity);
    var antes = new Int32Array(n); antes.fill(-1);
    var visto = new Uint8Array(n);
    var heap = [[0, desde]];
    dist[desde] = 0;
    function sube(i){
      while (i > 0) {
        var p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        var t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p;
      }
    }
    function baja(i){
      for (;;) {
        var l = 2 * i + 1, r = l + 1, m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        var t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m;
      }
    }
    while (heap.length) {
      var top = heap[0];
      heap[0] = heap[heap.length - 1]; heap.pop(); if (heap.length) baja(0);
      var u = top[1];
      if (visto[u]) continue;
      visto[u] = 1;
      if (u === hasta) break;
      var vs = red.ady[u];
      for (var i = 0; i < vs.length; i++) {
        var v = vs[i][0], nd = top[0] + vs[i][1];
        if (nd < dist[v]) { dist[v] = nd; antes[v] = u; heap.push([nd, v]); sube(heap.length - 1); }
      }
    }
    if (!visto[hasta]) return null;
    var ruta = [], x = hasta;
    while (x !== -1) { ruta.push(x); x = antes[x]; }
    return ruta.reverse();
  }



// Perfil de altura del creador: relación entre pendiente real y ángulo visible.
// Con una ventana vertical proporcional a la distancia, las pendientes suaves
// se ven suaves y las pronunciadas mantienen un ángulo mayor.
// Los paneles flotantes no deben marcar puntos al pulsarlos.
// En la pagina siempre hay documento; en las pruebas (require) no.
if(typeof document!=='undefined'){
for(const id of ['elevationPanel','createActions','plannerCredit']){
 const el=$(id);el.addEventListener('click',e=>e.stopPropagation());el.addEventListener('dblclick',e=>e.stopPropagation());
}
document.querySelector('.modes').addEventListener('click',e=>e.stopPropagation());
}
let profileCollapsed=true,navProfileCollapsed=true;
let profileHeights=null,profileHeightsRequest=null,profileHeightsError=false;
// Las alturas de Trabakutik corresponden punto por punto al mapa general.
// Se usan solo para el perfil: nunca sustituyen la geometría de navegación.
// Lo que falta por subir segun el perfil de la ruta: lo escribe la tarjeta de
// alturas (07-servicio) y lo usa tambien esta linea, para que la pantalla no
// enseñe dos cifras distintas para lo mismo.
let faltaSubidaRuta=null;
let liveProfileAlong=null,liveNativeMetrics=null,liveProfilePlot=null,nativeRouteKey=null,detailedProfilePoints=null;
function expireNavigationMetrics(){
 if(mode==='create'||liveProfileAlong===null&&!liveNativeMetrics)return;
 if(guiaIniciada()&&fixVisualGps&&Date.now()-fixVisualGps.time<=10000)return;
 liveProfileAlong=null;liveNativeMetrics=null;paintNavigationMetrics();
}
function paintNavigationMetrics(){
 const marker=$('elevationEnd'),plot=liveProfilePlot;
 if(marker&&plot){
  const distance=liveProfileAlong;
  if(!guiaIniciada()){
   marker.setAttribute('cx',plot.end[0]);marker.setAttribute('cy',plot.end[1]);marker.style.display='';
  }else if(!navProfileCollapsed&&plot.points===routePoints&&distance!==null&&distance>=0&&distance<=plot.total+.1){
   let lo=1,hi=plot.samples.length-1;
   while(lo<hi){const mid=(lo+hi)>>1;if(plot.samples[mid].d<distance)lo=mid+1;else hi=mid}
   const a=plot.samples[lo-1],b=plot.samples[lo];
   if(a.h!==null&&b.h!==null){
    const fraction=b.d>a.d?Math.max(0,Math.min(1,(distance-a.d)/(b.d-a.d))):1;
    marker.setAttribute('cx',plot.x(distance));marker.setAttribute('cy',plot.y(a.h+fraction*(b.h-a.h)));
    marker.style.display='';
   }else marker.style.display='none';
  }else marker.style.display='none';
 }
 const data=liveNativeMetrics;
 const summary=$('elevationSlope');
 if(!summary)return;
 let text=$('profileDistance')?.textContent??'';
 if(data&&Date.now()-data.time<=10000){
  const falta=Number.isFinite(faltaSubidaRuta)?faltaSubidaRuta:data.gain;
  if(Number.isFinite(falta))text='↑ Quedan '+Math.round(falta)+' m aprox.';
  if(typeof pausado!=='undefined'&&!pausado&&Number.isFinite(data.etaMs)&&data.etaMs>=0){
   const eta=new Date(data.time+data.etaMs);
   text+=' · Llegada aprox. '+eta.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
  }
 }
 if(summary.textContent!==text)summary.textContent=text;
}
let perfilGuardado=null;
function navigationProfilePoints(){
 if(chosen<0&&perfilGuardado&&perfilGuardado.compacta===routePoints&&perfilGuardado.completa.some(p=>p&&Number.isFinite(p[2])))return perfilGuardado.completa;
 if(chosen<0||!tracks[chosen]||routePoints===detailedProfilePoints&&routePoints.some(p=>Number.isFinite(p[2])))return routePoints;
 const track=tracks[chosen],slug=track.href?.replace(/\.html$/,'');
 const heights=profileHeights?.[slug];
 return track.points.map((p,i)=>[p[0],p[1],Array.isArray(heights)&&heights.length===track.points.length&&Number.isFinite(heights[i])?heights[i]:null]);
}
function profileDistanceText(total,creating){
 if(!creating&&chosen>=0&&tracks[chosen]){
  const published=(datosDeRuta[tracks[chosen].href]||'').match(/^[\d.,]+\s*km/);
  if(published)return published[0];
 }
 return (total/1000).toFixed(2).replace('.',',')+' km';
}
function loadProfileHeights(){
 if(profileHeights||profileHeightsRequest||profileHeightsError||chosen<0)return;
 profileHeightsRequest=fetch('data/alturas.json',{cache:'no-cache'})
  .then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json()})
  .then(data=>{if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('Alturas no válidas');profileHeights=data})
  .catch(()=>{profileHeightsError=true})
  .finally(()=>{
   profileHeightsRequest=null;
   updateElevation();
   // Si el detalle Garmin no ha llegado, enviar las alturas alineadas con
   // la geometría activa. No sustituir puntos ni índices de los cruces.
   if(!profileHeightsError&&typeof syncNativeRoute==='function'&&typeof window!=='undefined'&&window.TrabakutikAndroid&&typeof chosen!=='undefined'&&chosen>=0&&routePoints.length>1){
    const pts=heightsForNativeRoute();
    if(pts.some((p,i)=>Number.isFinite(p[2])&&!Number.isFinite(routePoints[i][2]))&&typeof nativeRouteJson==='function'){
     const json=nativeRouteJson();
     let key=0;for(let i=0;i<json.length;i++)key=(Math.imul(key,31)+json.charCodeAt(i))|0;
     if(key!==nativeRouteKey)syncNativeRoute();
    }
   }
  });
}
if(typeof $==='function'){
$('toggleProfile').onclick=()=>{
 if(mode==='create')profileCollapsed=!profileCollapsed;
 else{navProfileCollapsed=!navProfileCollapsed;if(!navProfileCollapsed)profileHeightsError=false}
 updateElevation();
};
// La cabecera también se puede tocar; el botón mantiene el acceso por teclado.
$('elevationPanel').querySelector('.elevation-head').addEventListener('click',e=>{
 if(!e.target.closest('button'))$('toggleProfile').click();
});
}
function updateElevation(){
 const panel=$('elevationPanel');
 if(!panel)return;
 const creating=mode==='create',visible=creating||routePoints.length>1;
 liveProfilePlot=null;
 panel.classList.toggle('hidden',!visible);
 panel.classList.toggle('navigation-profile',!creating);
 const collapsed=creating?profileCollapsed:navProfileCollapsed;
 panel.classList.toggle('collapsed',collapsed);
 $('elevationTitle').textContent=creating&&collapsed?'RESUMEN DE RUTA':'PERFIL DE ALTURA';
 const toggle=$('toggleProfile');
 toggle.setAttribute('aria-expanded',String(!collapsed));
 toggle.setAttribute('aria-label',collapsed?'Desplegar perfil':'Plegar perfil');
 toggle.textContent=collapsed?'⌃':'⌄';
 if(!visible)return;
 if(!creating)loadProfileHeights();
 const pts=creating?drawPoints:navigationProfilePoints(),available=pts.filter(p=>Number.isFinite(p[2]));
 panel.classList.toggle('profile-empty',pts.length<2||available.length<2);
 panel.classList.toggle('profile-distance-only',pts.length>=2&&available.length<2);
 if(pts.length<2||available.length<2){
  $('elevationPath').setAttribute('d','');$('elevationFill').setAttribute('d','');
  $('elevationEnd').style.display='none';
  const total=pts.reduce((sum,p,i)=>sum+(i?dist(pts[i-1],p):0),0);
  $('profileDistance').textContent=profileDistanceText(total,creating);$('profileGain').textContent='↑ —';$('profileLoss').textContent='↓ —';
  if(creating)pintaCreaResumen(total,0,0,false);
  $('elevationSlope').textContent=pts.length>=2?'Sin alturas suficientes':pts.length?'Marca el siguiente punto':'Marca el inicio';
  $('elevationSlope').className='';
  $('profileLow').textContent=available.length?'Altura inicial '+Math.round(available[0][2])+' m':'Sin alturas todavía';
  $('profileHigh').textContent=available.length?'':'Perfil disponible cuando haya desnivel';
  if(!creating){
   paintNavigationMetrics();
   $('elevationSlope').className='';
   $('profileLow').textContent=profileHeightsRequest?'Cargando alturas…':'Sin alturas suficientes';
   $('profileHigh').textContent=profileHeightsRequest?'':'No se puede dibujar el perfil';
  }
  return;
 }
 const samples=[];let travelled=0,up=0,down=0,lastKnown=null,lastElev=null;
 // MIDE POR TRAMOS de unos 250 m, no sobre los totales: con los totales, una
 // ruta que alterna llano largo y repecho fuerte salia hasta media hora corta.
 let msMide=0,bloque={m:0,s:0,b:0};
 const cierraBloque=()=>{if(bloque.m>0||bloque.s>0||bloque.b>0)msMide+=tiempoMIDE(bloque.m,bloque.s,bloque.b);bloque={m:0,s:0,b:0}};
 let desnivelCalculable=false;
 for(let i=0;i<pts.length;i++){
  if(i){const dd=dist(pts[i-1],pts[i]);travelled+=dd;bloque.m+=dd}
  const elevation=Number.isFinite(pts[i][2])?pts[i][2]:null;
  if(elevation!==null){
   if(lastElev!==null){
    desnivelCalculable=true;
    const delta=elevation-lastElev;
    // Evitar sumar ruido centimétrico entre puntos interpolados.
    if(delta>0){up+=delta;bloque.s+=delta}else{down-=delta;bloque.b-=delta}
   }
   lastElev=elevation;lastKnown=elevation;
  }else{lastElev=null}
  samples.push({d:travelled,h:elevation});
  if(bloque.m>=250)cierraBloque();
 }
 cierraBloque();
 // EL DESNIVEL, CONTADO IGUAL EN TODA LA PANTALLA. En navegacion se sumaba
 // cada metro de un punto al siguiente -ruido del GPS incluido- mientras que
 // «Ruta propia» (elevationText) usa un umbral de 5 m: dos cifras distintas
 // para la misma ruta, una encima de otra. Ahora navegacion cuenta igual que
 // elevationText: umbral de 5 m y un hueco sin altura reinicia la cuenta. El
 // creador sigue con la suma exacta: sus alturas son del modelo del terreno.
 if(!creating){
  up=0;down=0;let ref=null;
  for(const p of pts){
   const h=Number.isFinite(p[2])?p[2]:null;
   if(h===null){ref=null;continue}
   if(ref===null){ref=h;continue}
   if(h>=ref+5){up+=h-ref;ref=h}else if(h<=ref-5){down+=ref-h;ref=h}
  }
 }
 const known=samples.filter(p=>p.h!==null);
 const hMin=Math.min(...known.map(p=>p.h)),hMax=Math.max(...known.map(p=>p.h));
 const total=Math.max(1,travelled), width=800,top=8,bottom=108,drawH=bottom-top;
 // 8% del recorrido total como escala vertical mínima: no amplificar
 // una cuesta suave para que parezca una pared.
 const verticalSpan=Math.max(35,creating?total*.08:0,(hMax-hMin)*1.18);
 const center=(hMax+hMin)/2,base=center-verticalSpan/2;
 const x=d=>d/total*width;
 const y=h=>Math.max(top,Math.min(bottom,bottom-(h-base)/verticalSpan*drawH));
 const coords=known.map(p=>[x(p.d),y(p.h)]);
 let continuar=false;
 const line=samples.map(p=>{if(p.h===null){continuar=false;return ''}const cmd=continuar?'L':'M';continuar=true;return cmd+x(p.d).toFixed(2)+' '+y(p.h).toFixed(2)}).join(' ');
 $('elevationPath').setAttribute('d',line);
 $('elevationFill').setAttribute('d',available.length<pts.length?'':line+' L'+coords[coords.length-1][0].toFixed(2)+' '+bottom+' L'+coords[0][0].toFixed(2)+' '+bottom+' Z');
 $('elevationEnd').style.display='';
 $('elevationEnd').setAttribute('cx',coords[coords.length-1][0]);$('elevationEnd').setAttribute('cy',coords[coords.length-1][1]);
 $('profileDistance').textContent=profileDistanceText(travelled,creating);
 $('profileGain').textContent=creating&&!desnivelCalculable?'↑ —':'↑ '+Math.round(up)+' m'+(creating?'':' aprox.');
 $('profileLoss').textContent=creating&&!desnivelCalculable?'↓ —':'↓ '+Math.round(down)+' m'+(creating?'':' aprox.');
 $('profileLow').textContent=(available.length<pts.length?'Alturas incompletas · ':'Mín. ')+Math.round(hMin)+' m';
 $('profileHigh').textContent='Máx. '+Math.round(hMax)+' m';
 if(!creating){
  liveProfilePlot={points:pts,samples,x,y,total:travelled,end:coords.at(-1)};
  paintNavigationMetrics();$('elevationSlope').className='';
  return;
 }
 // La rampa, SOLO del ultimo tramo marcado (con typeof: las pruebas que
 // recortan esta funcion no traen lo demas).
 const rampa=typeof rampaUltimoTramo==='function'&&typeof tramosGps!=='undefined'&&tramosGps.length?rampaUltimoTramo(pts,pts.length-tramosGps[tramosGps.length-1].length):null;
 pintaCreaResumen(travelled,up,down,desnivelCalculable,msMide,available.length<pts.length,rampa?rampa.pend:0,rampa?rampa.metros:0);
 const info=$('elevationSlope');
 if(collapsed&&available.length<pts.length){
  info.textContent=desnivelCalculable?'Desnivel parcial':'Sin alturas suficientes';
  info.className='';
  return;
 }
 // Pendiente media del último tramo marcado, con su distancia real.
 const part=tramosGps[tramosGps.length-1]||[];
 let partDist=0,partFirst=null,partLast=null;
 for(let i=0;i<part.length;i++){
  const p=redGps.nodos[part[i]];
  if(i)partDist+=dist(redGps.nodos[part[i-1]],p);
  if(Number.isFinite(p[2])){if(partFirst===null)partFirst=p[2];partLast=p[2]}
 }
 if(partDist>=3&&partFirst!==null&&partLast!==null){
  const grade=(partLast-partFirst)/partDist*100;
  const gradeText=Math.abs(grade).toFixed(1).replace('.',',')+'%';
  info.textContent=(grade>0.5?'↗ Subida ':grade<-.5?'↘ Bajada ':'→ Casi llano ')+gradeText;
  info.className=grade>0.5?'up':grade<-.5?'down':'';
 }else{info.textContent='Pendiente sin datos';info.className=''}
}

function letraPunto(i){let s='';i++;while(i>0){const r=(i-1)%26;s=String.fromCharCode(65+r)+s;i=Math.floor((i-1)/26)}return s}
// EL TIEMPO ANDANDO, POR EL METODO MIDE de las federaciones de montaña: 4 km/h
// en llano, 400 m/h subiendo y 600 m/h bajando; el mayor de los dos tiempos
// mas la mitad del menor. En bici no: depende demasiado de la asistencia.
// SUBIDA A 550 m/h, NO A 400. Lo corrigio el autor el 16 nov 2026 con el
// cartel oficial de la subida a Zengotitagane: 1,26 km y +380 m, «50 min»;
// con los 400 m/h de MIDE salia 1 h 06. Con 550, 51 min. Es un solo cartel:
// si salen mas, se recalibra con ellos.
const SUBIDA_MH=550;
function tiempoMIDE(m,sube,baja){const h=m/4000,v=sube/SUBIDA_MH+baja/600;return (Math.max(h,v)+Math.min(h,v)/2)*3600000}
// EL ESFUERZO ANDANDO, con la regla que mejor reproduce el que el autor puso a
// mano en las 38 rutas a pie de la web: km + desnivel/50; menos de 23,5 Facil,
// menos de 43,2 Media, si no Dificil (acierta 34 de 38). En bici acertaba 21
// de 32, asi que no se da.
function esfuerzoAndando(m,sube){const s=m/1000+sube/50;return s<23.5?'Fácil':s<43.2?'Media':'Difícil'}
function textoHoras(ms){const min=Math.round(ms/60000);return min<60?min+' min':Math.floor(min/60)+' h '+String(min%60).padStart(2,'0')}
// Pendiente media (en %) de un bloque de 250 m a partir de la cual es «rampa
// dura». Funcion y no const: se usa antes de esta linea y en pruebas que recortan.
function pendFuerte(){return 20}
// Pendiente media de SUBIDA de un bloque, en %. Las bajadas no son rampa.
function pendienteBloque(m,sube){return m>0?sube/m*100:0}
// LA RAMPA DEL ULTIMO TRAMO. El autor: «lo de la subida marca bien, pero si
// es bajada no deberia quedarse rampa dura; o llaneando. Lo que toque». Asi
// que se mira solo el tramo que se acaba de marcar (desde el punto `desde` de
// pts), en bloques de 250 m; uno de menos de 150 m solo cuenta si es todo el
// tramo (y pasa de 60 m), que si no son picos del modelo del terreno.
function rampaUltimoTramo(pts,desde){
 let pend=0,metros=0,b={m:0,s:0},largo=0,ult=pts[desde]&&Number.isFinite(pts[desde][2])?pts[desde][2]:null;
 const cierra=(fin)=>{if(b.m>=150||(fin&&b.m>=60&&b.m===largo)){const p=pendienteBloque(b.m,b.s);if(p>=pendFuerte()){pend=Math.max(pend,p);metros+=b.m}}b={m:0,s:0}};
 for(let i=Math.max(1,desde+1);i<pts.length;i++){
  const d=metros2(pts[i-1],pts[i]);b.m+=d;largo+=d;
  const h=Number.isFinite(pts[i][2])?pts[i][2]:null;
  if(h!==null&&ult!==null&&h>ult)b.s+=h-ult;
  ult=h;
  if(b.m>=250)cierra(false);
 }
 cierra(true);
 return {pend,metros};
}
function metros2(a,b){const k=111195,x=(b[1]-a[1])*k*Math.cos((a[0]+b[0])/2*Math.PI/180),y=(b[0]-a[0])*k;return Math.hypot(x,y)}
// EL ESFUERZO CON UN TRAMO MUY EMPINADO. Lo pidio el autor el 16 nov 2026
// con un tramo de 1,26 km y +380 m que salia «Facil»: «es lo peor que hay».
// La regla km+desnivel/50 mira la ruta entera y un muro corto sale facil; con
// un bloque de 250 m por encima del 20 % no se dice Facil.
// Y DICE CUANTO MIDE LO DURO. «Muy empinado · hasta 44 %» se leia como toda
// la ruta y el autor no sabia como tomarlo: 400 m de rampa al principio y el
// resto llano. Ahora: «Rampa dura: 400 m al 44 %», y solo mientras el ultimo
// tramo marcado es esa subida (ver rampaUltimoTramo).
function textoMetros(m){return m<950?Math.max(100,Math.round(m/100)*100)+' m':(m/1000).toFixed(1).replace('.',',')+' km'}
function textoEsfuerzo(m,sube,pendMax,duros){
 const e=esfuerzoAndando(m,sube),p=Math.round(pendMax);
 if(!(pendMax>=pendFuerte()))return 'Esfuerzo andando: '+e;
 const lon=textoMetros(duros>0?duros:250);
 return e==='Fácil'?'Rampa dura: '+lon+' al '+p+' %':e+' · rampa de '+lon+' al '+p+' %';
}
function pintaCreaResumen(m,sube,baja,conDesnivel,msMide,parcial,pendMax,duros){
 if(typeof $!=='function'||!$('creaTiempo'))return;
 if(!(m>=50)){$('creaTiempo').textContent='—';$('creaEsfuerzo').textContent='';return}
 if(!conDesnivel){$('creaTiempo').innerHTML='≈ '+textoHoras(tiempoMIDE(m,0,0))+' <small>andando · sin datos de desnivel</small>';$('creaEsfuerzo').textContent='';return}
 const ms=Number.isFinite(msMide)?msMide:tiempoMIDE(m,sube,baja);
 // Con alturas a medias el desnivel se queda corto: el tiempo se avisa y el
 // esfuerzo no se da, que saldria mas facil de lo que es.
 if(parcial){$('creaTiempo').innerHTML='≈ '+textoHoras(ms)+' <small>andando · desnivel parcial</small>';$('creaEsfuerzo').textContent='';return}
 $('creaTiempo').innerHTML='≈ '+textoHoras(ms)+' <small>andando · aprox.</small>';
 $('creaEsfuerzo').textContent=textoEsfuerzo(m,sube,pendMax,duros);
}
function updateDraw(){
 drawMarks.forEach(m=>map.removeLayer(m));drawMarks=[];
 junctionMarks.forEach(m=>map.removeLayer(m));junctionMarks=[];
 if(drawLayer)map.removeLayer(drawLayer);drawLayer=null;
 drawPoints=[];
 for(let k=0;k<tramosGps.length;k++)for(let j=0;j<tramosGps[k].length;j++){
  if(k>0&&j===0)continue;
  const p=redGps.nodos[tramosGps[k][j]];drawPoints.push(p.slice(0,3));
 }
 if(drawPoints.length)drawLayer=L.polyline(drawPoints.map(p=>p.slice(0,2)),{color:'#38bdf8',weight:6,opacity:1,interactive:false}).addTo(map);
 // Los tramos trazados a mano, a rayas y por encima: lo que no va por un
 // camino tiene que verse que no va por un camino.
 manoLayers.forEach(l=>map.removeLayer(l));manoLayers=[];
 for(const tr of tramosGps){
  if(!tr.aMano||tr.length<2)continue;
  const pts=tr.map(id=>redGps.nodos[id].slice(0,2));
  manoLayers.push(L.polyline(pts,{color:'#fbbf24',weight:6,opacity:1,dashArray:'2 10',interactive:false}).addTo(map));
 }
 // Con el trazado cerrado el ultimo punto es el mismo nodo que el primero:
 // se dibuja una sola bola, o quedarian dos superpuestas y no se sabria cual
 // estas arrastrando.
 const cerradoGps=anclasGps.length>2&&anclasGps[0]===anclasGps[anclasGps.length-1];
 anclasGps.forEach((id,i)=>{
  if(cerradoGps&&i===anclasGps.length-1)return;
  const p=redGps.nodos[id];
  const inicio=i===0, destino=!inicio&&!cerradoGps&&i===anclasGps.length-1;
  // LETRAS Y NO NUMEROS (A, B, C…): se habla de ellos -«arrastra la C»- y
  // el orden se ve de un vistazo. Pasada la Z, AA, AB…
  const numero=letraPunto(i);
  const tipo=inicio?(cerradoGps?'Inicio y destino':'Inicio'):destino?'Destino':'Punto';
  const mk=L.marker([p[0],p[1]],{draggable:true,autoPan:true,keyboard:false,title:tipo+' · '+numero,
    icon:L.divIcon({
      className:'gps-dot'+(inicio?' es-primera':'')+(destino?' es-destino':''),
      html:String(numero),iconSize:[24,24],iconAnchor:[12,12]
    })}).addTo(map);
  mk.on('dragend',ev=>{const ll=ev.target.getLatLng();mueveAnclaGps(i,ll.lat,ll.lng)});
  drawMarks.push(mk);
 });
 $('cerrarCirculo').classList.toggle('hidden',anclasGps.length<2);
 $('idaVuelta').classList.toggle('hidden',anclasGps.length<2);
 $('undo').disabled=anclasGps.length===0;
 $('clearCreated').disabled=anclasGps.length===0;
 $('saveCreated').disabled=drawPoints.length<2;
 createdSavedItem=null;
 $('navCreated').disabled=true;
 $('navCreated').classList.add('hidden');
 $('clearActiveRoute').classList.toggle('hidden',routePoints.length<2&&drawPoints.length<2);
 const fuente=$('creaFuente');
 if(fuente){
  const oficial=tramosGps.find(tr=>tr.oficial)?.oficial;
  fuente.hidden=!oficial;
  if(oficial)fuente.href=oficial.url;
  else fuente.removeAttribute('href');
 }
 updateElevation();
 // Los mandos nuevos del creador (pieza 06): rehacer deja de valer en cuanto
 // el trazado cambia, aunque ningun boton de siempre cambie de estado.
 if(typeof sincronizaCrea==='function')sincronizaCrea();
}
if(typeof map!=='undefined')map.on('click',e=>{
 if(mode!=='create')return;
 if(typeof capturaAlternativas==='function'&&capturaAlternativas(e))return;
 if(!redGps){notice('Preparando red de caminos…');return}
 if(seguirMapaGps){
  if(calculandoMapaGps)return;
  const p=[e.latlng.lat,e.latlng.lng];
  if(!anclasGps.length){planificaMapaGps([p]);return}
  const ult=redGps.nodos[anclasGps[anclasGps.length-1]].slice(0,2);
  if(dist(ult,p)<1)return;
  planificaTramoMapa(ult,p);
  return;
 }
 const node=trazadoManual?nodoManualGps(e.latlng.lat,e.latlng.lng):nodoCerca(redGps,e.latlng.lat,e.latlng.lng);
 if(node<0){notice('Ese punto no está en los trazados de Trabakutik. Elige Manual para marcarlo.');return}
 if(!anclasGps.length){anclasGps.push(node);tramosGps.push([node]);updateDraw();notice('Punto inicial marcado. Toca otro punto del camino.');return}
 const prev=anclasGps[anclasGps.length-1];
 let segment=tramoGps(prev,node);
 // EN MANUAL, EL TOQUE LARGO BUSCA CAMINO. Lo pidio el autor: «marcaje en
 // corto, recto; marcaje largo que busque el camino o ruta por donde va y que
 // lo marque bien». Por debajo de MARCA_LARGA metros se queda la recta de
 // siempre -que es para lo que se usa: forzar un trozo, cruzar donde no hay
 // camino-; por encima se intenta ir por los trazados de Trabakutik. Se hace
 // con la red local, NO con el planificador de fuera: en Manual no sale del
 // movil ni una coordenada, y eso se mantiene.
 // Si no hay conexion por los trazados, o el rodeo es desproporcionado, se
 // queda la recta y no se dice nada: el toque hace lo que hacia.
 if(trazadoManual&&segment.manual){
  const pa=redGps.nodos[prev],pb=redGps.nodos[node],recto=metros(pa,pb);
  if(recto>=MARCA_LARGA){
   const na=nodoCerca(redGps,pa[0],pa[1]),nb=nodoCerca(redGps,pb[0],pb[1]);
   if(na>=0&&nb>=0&&na!==nb){
    const via=camino(redGps,na,nb);
    if(via&&via.length>1){
     const largo=via.slice(1).reduce((v,id,i)=>v+metros(redGps.nodos[via[i]],redGps.nodos[id]),0);
     if(largo<=Math.max(300,recto*2.5)){
      const tr=[prev];
      for(const id of via)if(id!==tr[tr.length-1])tr.push(id);
      if(node!==tr[tr.length-1])tr.push(node);
      segment=tr;
      notice('Tramo por los caminos de Trabakutik · '+(largo/1000).toFixed(2)+' km');
     }
    }
   }
  }
 }
 if(!segment){notice('No hay conexión por los trazados de Trabakutik. Puedes añadir el enlace en Manual.');return}
 if(segment.length===1)return;
 anclasGps.push(node);tramosGps.push(segment);updateDraw();
 const routeLength=segment.slice(1).reduce((v,id,i)=>v+metros(redGps.nodos[segment[i]],redGps.nodos[id]),0);
 const direct=metros(redGps.nodos[prev],redGps.nodos[node]);
 if(direct>30&&routeLength>direct*2.5&&routeLength-direct>300)
  notice('Este tramo da un rodeo de '+(routeLength/1000).toFixed(2)+' km. Deshacer permite cambiarlo.');
 else notice((segment.manual?'Tramo manual en recta · ':'Punto añadido · ')+(drawPoints.reduce((v,p,i)=>i?v+metros(drawPoints[i-1],p):0,0)/1000).toFixed(2)+' km · Guardar GPX cuando quieras');
});
// Para las pruebas: en la pagina «module» no existe y esto no hace nada.
if(typeof module==='object'&&module&&module.exports)module.exports={mismaCalzada,rumboDeCalzada,cargaRotondas,esperaRotondas,ofreceRectaTrasFallo,rotondasPorLaDerecha,rotondasDelCreador,letraPunto,tiempoMIDE,esfuerzoAndando,pendienteBloque,rampaUltimoTramo,textoEsfuerzo,textoMetros,textoHoras,pintaCreaResumen,porQueNoHayCamino,planLocalMapa,respuestaMapaGps,solicitaMapaGps,pideMapaGps,interpolaMapaGps,muestrasAlturaGps,aplicaMapaGps,anadeTramoMapa,cierraEnElInicio,uneEnRectaMapa,planificaTramoMapa,planificaMapaGps,metros,expireNavigationMetrics,paintNavigationMetrics,navigationProfilePoints,profileDistanceText,loadProfileHeights,updateElevation,updateDraw};
