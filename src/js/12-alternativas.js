// Las alternativas son una vista previa. El borrador cambia al elegir ruta.
let altInicio=null,altActivo=false,altGeneracion=0,altCapas=[],altControl=null;
let altAlturas=null,altBusqueda=null,altDocumentados=null,ultimaBusquedaDestino=0;
const cacheDestinos=new Map();
const CARTOCIUDAD='https://www.cartociudad.es/geocoder/api/geocoder/';

function limpiaCapasAlternativas(){
 altCapas.forEach(l=>map.removeLayer(l));
 altCapas=[];
 altDocumentados?.remove();
 altDocumentados=null;
}
function cierraBusquedaDestino(){
 altBusqueda?.abort();
 altBusqueda=null;
 $('destinoForm').classList.add('hidden');
 $('destinoResultados').replaceChildren();
 $('destinoEstado').textContent='';
}
function pasoAlternativas(texto,paso=null){
 $('alternativasEstado').textContent=texto;
 $('alternativasPaso').textContent=paso??'';
 $('alternativasPaso').hidden=paso===null;
 $('alternativasEntrada').classList.toggle('hidden',paso===null);
 $('altMiPosicion').classList.toggle('hidden',paso!==1);
 $('altBuscarDestino').classList.toggle('hidden',paso!==2);
}
function cancelaAlternativas(){
 altGeneracion++;
 altActivo=false;
 altInicio=null;
 altControl?.abort();
 altAlturas?.abort();
 altControl=altAlturas=null;
 cierraBusquedaDestino();
 limpiaCapasAlternativas();
 $('altMiPosicion').disabled=false;
 $('alternativasPanel').classList.add('hidden');
 $('alternativasLista').replaceChildren();
 $('alternativasLista').classList.add('hidden');
 $('alternativasLista').classList.remove('compact-preview');
 $('modoDosPuntos').setAttribute('aria-pressed','false');
 $('modoManual').setAttribute('aria-pressed','true');
}
function marcaPuntoAlternativas(p){
 if(!redGps){pasoAlternativas('Preparando caminos…',altInicio?2:1);return;}
 if(!altInicio){
  altInicio=p;
  altCapas.push(L.circleMarker(p,{radius:8,color:'#73e8e7',fillOpacity:1,interactive:false}).addTo(map));
  pasoAlternativas('Marca el destino en el mapa',2);
  return;
 }
 if(dist(altInicio,p)<10){pasoAlternativas('Marca el destino a más de 10 m del inicio',2);return;}
 cierraBusquedaDestino();
 void calculaAlternativas(altInicio,p);
}
function capturaAlternativas(e){
 if(!altActivo)return false;
 if(!altControl&&$('alternativasLista').classList.contains('hidden')){
  marcaPuntoAlternativas([e.latlng.lat,e.latlng.lng]);
 }
 return true;
}
function usaPosicionAlternativas(){
 const gen=altGeneracion;
 const coloca=p=>{
  if(gen!==altGeneracion||altInicio)return;
  if(!p){pasoAlternativas('Sin posición precisa. Marca el inicio en el mapa.',1);return;}
  marcaPuntoAlternativas(p);
  if(altInicio)map.setView(p,Math.max(16,map.getZoom()),{animate:false});
 };
 const fix=fixVisualGps&&Date.now()-fixVisualGps.time<=30000&&fixVisualGps.accuracy<=50?position:null;
 const cached=fix??quickNativePosition();
 if(cached){coloca(cached);return}
 if(!navigator.geolocation){coloca(null);return}
 pasoAlternativas('Buscando tu posición…',1);
 $('altMiPosicion').disabled=true;
 const termina=p=>{
  if(gen!==altGeneracion)return;
  $('altMiPosicion').disabled=false;
  coloca(p);
 };
 navigator.geolocation.getCurrentPosition(
  ({coords})=>termina(coords.accuracy<=50?[coords.latitude,coords.longitude]:null),
  ()=>termina(null),{enableHighAccuracy:true,timeout:10000,maximumAge:5000},
 );
}
function puntoCartoCiudad(lugar){
 const {lat,lng}=lugar;
 return Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180&&(lat!==0||lng!==0)?[lat,lng]:null;
}
async function consultaCartoCiudad(metodo,params,signal){
 const respuesta=await fetch(CARTOCIUDAD+metodo+'?'+new URLSearchParams(params),{
  signal,credentials:'omit',headers:{Accept:'application/json'},
 });
 if(!respuesta.ok)throw Error('Búsqueda no disponible');
 return respuesta.json();
}
async function eligeDestinoAlternativas(lugar){
 const directo=puntoCartoCiudad(lugar);
 if(directo){marcaPuntoAlternativas(directo);return}
 if(altBusqueda)return;
 const ctl=new AbortController();
 altBusqueda=ctl;
 const espera=setTimeout(()=>ctl.abort(),8000);
 const estado=$('destinoEstado');
 estado.textContent='Localizando el destino…';
 try{
  const params={id:lugar.id,q:lugar.address,type:lugar.type};
  if(lugar.portalNumber!=null)params.portal=String(lugar.portalNumber);
  const dato=await consultaCartoCiudad('find',params,ctl.signal);
  if(altBusqueda!==ctl)return;
  const punto=puntoCartoCiudad(dato);
  if(!punto)throw Error('Sin coordenadas');
  estado.textContent='';
  marcaPuntoAlternativas(punto);
 }catch{
  if(altBusqueda===ctl)estado.textContent='No se pudo localizar. Elige otro resultado o marca el destino en el mapa.';
 }finally{
  clearTimeout(espera);
  if(altBusqueda===ctl)altBusqueda=null;
 }
}
function destinosTrabakutik(consulta){
 const nombre=sinTildes(consulta).replace(/\s+/g,' ');
 if(!/^(?:(?:la )?cima (?:de |del )?|(?:el )?monte )?oiz$/.test(nombre)&&nombre!=='oiz cima')return [];
 // Punto de la cresta en el track publicado a pie de Trabakua a Oiz.
 return [{address:'Oiz (cima)',province:'Bizkaia',lat:43.227608,lng:-2.591572}];
}
function pintaDestinosAlternativas(lugares){
 const resultados=$('destinoResultados');
 resultados.replaceChildren();
 for(const lugar of lugares){
  const b=document.createElement('button');
  b.type='button';
  b.textContent=[lugar.address,lugar.province].filter(Boolean).join(' · ');
  b.onclick=()=>eligeDestinoAlternativas(lugar);
  resultados.append(b);
 }
}
async function buscaDestinoAlternativas(event){
 event.preventDefault();
 if(!altInicio||altBusqueda)return;
 const consulta=$('destinoNombre').value.trim();
 if(consulta.length<2)return;
 const estado=$('destinoEstado');
 estado.textContent='';
 const locales=destinosTrabakutik(consulta);
 pintaDestinosAlternativas(locales);
 const key=sinTildes(consulta);
 let lugares=cacheDestinos.get(key);
 if(!lugares){
  if(Date.now()-ultimaBusquedaDestino<1000)return;
  ultimaBusquedaDestino=Date.now();
  const ctl=new AbortController();
  altBusqueda=ctl;
  estado.textContent='Buscando lugares…';
  const espera=setTimeout(()=>ctl.abort(),8000);
  try{
   const datos=await consultaCartoCiudad('candidates',{q:consulta,limit:'5'},ctl.signal);
   lugares=datos.filter(l=>typeof l.address==='string'&&l.id!=null&&typeof l.type==='string');
   if(altBusqueda!==ctl)return;
   if(cacheDestinos.size>=40)cacheDestinos.delete(cacheDestinos.keys().next().value);
   cacheDestinos.set(key,lugares);
  }catch{
   if(altBusqueda===ctl)estado.textContent=locales.length?'':'Ahora no se puede buscar. Puedes marcar el destino en el mapa.';
   return;
  }finally{
   clearTimeout(espera);
   if(altBusqueda===ctl)altBusqueda=null;
  }
 }
 const todos=[...locales,...lugares];
 pintaDestinosAlternativas(todos);
 estado.textContent=todos.length?'':'Sin resultados. Prueba con el nombre y el municipio.';
}

function mideAlternativa(pts){
 if(!pts.every(p=>Number.isFinite(p[2])))return null;
 let sube=0,tiempo=0,total=0,rampa=null;
 let inicio=0,bloque={m:0,sube:0,baja:0};
 const cierra=fin=>{
  tiempo+=tiempoMIDE(bloque.m,bloque.sube,bloque.baja);
  const pendiente=pendienteBloque(bloque.m,pts[fin][2]-pts[inicio][2]);
  if((bloque.m>=150||(inicio===0&&bloque.m>=60))&&pendiente>=pendFuerte()&&(!rampa||rampa.pendiente<pendiente)){
   rampa={pendiente,metros:bloque.m,desde:total-bloque.m,pts:pts.slice(inicio,fin+1)};
  }
  bloque={m:0,sube:0,baja:0};
  inicio=fin;
 };
 for(let i=1;i<pts.length;i++){
  const m=dist(pts[i-1],pts[i]),h=pts[i][2]-pts[i-1][2];
  total+=m;
  bloque.m+=m;
  if(h>0){bloque.sube+=h;sube+=h}
  else bloque.baja-=h;
  if(bloque.m>=250||i===pts.length-1)cierra(i);
 }
 return {sube,tiempo,rampa};
}

// El track del catálogo es una referencia geométrica simplificada. Exigimos
// cercanía, rumbo compatible y continuidad con una misma ficha.
function buscaTramosDocumentados(recorridos,referencias){
 const escalaX=111195*Math.cos(recorridos[0][0][0]*Math.PI/180);
 const plano=p=>[p[1]*escalaX,p[0]*111195];
 const tam=100,radio=8,paso=15,minimo=100;
 const celdas=new Map();
 let oeste=Infinity,este=-Infinity,sur=Infinity,norte=-Infinity;
 for(const ref of referencias){
  for(let i=1;i<ref.points.length;i++){
   const [x,y]=plano(ref.points[i-1]),[finX,finY]=plano(ref.points[i]);
   const dx=finX-x,dy=finY-y,largo=Math.hypot(dx,dy);
   // No interpretar los saltos de un track como caminos grabados.
   if(largo<1||largo>200)continue;
   const arista={x,y,dx,dy,largo,ref};
   oeste=Math.min(oeste,x,finX);este=Math.max(este,x,finX);
   sur=Math.min(sur,y,finY);norte=Math.max(norte,y,finY);
   for(let cx=Math.floor((Math.min(x,finX)-radio)/tam);cx<=Math.floor((Math.max(x,finX)+radio)/tam);cx++){
    for(let cy=Math.floor((Math.min(y,finY)-radio)/tam);cy<=Math.floor((Math.max(y,finY)+radio)/tam);cy++){
     const clave=cx+','+cy;
     if(!celdas.has(clave))celdas.set(clave,[]);
     celdas.get(clave).push(arista);
    }
   }
  }
 }
 return recorridos.map(pts=>{
  const intervalos=[],abiertos=new Map(),tramos=[];
  let total=0;
  function termina(ref){
   const tramo=abiertos.get(ref);
   if(tramo.metros>=minimo){
    tramos.push({ref,...tramo});
    for(let j=tramo.inicio;j<tramo.fin;j++)intervalos[j].documentado=true;
   }
   abiertos.delete(ref);
  }
  for(let i=1;i<pts.length;i++){
   const a=pts[i-1],b=pts[i],pa=plano(a),pb=plano(b);
   const dx=pb[0]-pa[0],dy=pb[1]-pa[1],largo=Math.hypot(dx,dy);
   if(largo<.1)continue;
   total+=largo;
   if(Math.max(pa[0],pb[0])<oeste-radio||Math.min(pa[0],pb[0])>este+radio||
      Math.max(pa[1],pb[1])<sur-radio||Math.min(pa[1],pb[1])>norte+radio){
    for(const ref of abiertos.keys())termina(ref);
    intervalos.push({m:largo,desde:a,hasta:b,documentado:false});
    continue;
   }
   const n=Math.ceil(largo/paso),interpela=f=>[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f];
   for(let k=0;k<n;k++){
    const f=(k+.5)/n,x=pa[0]+dx*f,y=pa[1]+dy*f;
    const aristas=celdas.get(Math.floor(x/tam)+','+Math.floor(y/tam))||[];
    const coinciden=new Set();
    for(const e of aristas){
     if(Math.abs(dx*e.dx+dy*e.dy)<.92*largo*e.largo)continue;
     const t=((x-e.x)*e.dx+(y-e.y)*e.dy)/(e.largo*e.largo);
     if(t<0||t>1)continue;
     if(Math.hypot(x-e.x-t*e.dx,y-e.y-t*e.dy)<=radio)coinciden.add(e.ref);
    }
    for(const ref of abiertos.keys())if(!coinciden.has(ref))termina(ref);
    const indice=intervalos.length,m=largo/n;
    intervalos.push({m,desde:interpela(k/n),hasta:interpela((k+1)/n),documentado:false});
    for(const ref of coinciden){
     if(!abiertos.has(ref))abiertos.set(ref,{inicio:indice,fin:indice,metros:0});
     const tramo=abiertos.get(ref);
     tramo.fin=indice+1;
     tramo.metros+=m;
    }
   }
  }
  for(const ref of abiertos.keys())termina(ref);
  let metros=0,linea=null;
  const lineas=[];
  for(const intervalo of intervalos){
   if(!intervalo.documentado){linea=null;continue}
   metros+=intervalo.m;
   if(!linea){linea=[intervalo.desde];lineas.push(linea)}
   linea.push(intervalo.hasta);
  }
  return {metros,total,lineas,tramos};
 });
}

function encuadraAlternativa(bounds){
 const alto=map.getSize().y;
 const abajo=Math.min($('creadorDock').offsetHeight+20,Math.round(alto*.68));
 const arriba=Math.min(90,Math.round(alto*.2));
 map.fitBounds(bounds,{paddingTopLeft:[25,arriba],paddingBottomRight:[68,abajo],maxZoom:18,animate:false});
}

// Se recorta el track detallado entre dos proyecciones cercanas. Los
// extremos que se muestran y se guardan son los del track, sin empalmes.
function recortaTrackPublicado(pts,a,b,distance,radio=60){
 const salida=[],llegada=[];
 const [radioA,radioB]=Array.isArray(radio)?radio:[radio,radio];
 const latitud=111195,longitud=latitud*Math.cos((a[0]+b[0])/2*Math.PI/180);
 let acumulado=0,cortes=0;
 for(let i=1;i<pts.length;i++){
  const x=pts[i-1],y=pts[i],m=distance(x,y);
  if(m>125)cortes++;
  if(m<.05||m>125){acumulado+=m;continue}
  const dx=(y[0]-x[0])*latitud,dy=(y[1]-x[1])*longitud;
  for(const [p,lista,limite] of [[a,salida,radioA],[b,llegada,radioB]]){
   const vx=(p[0]-x[0])*latitud,vy=(p[1]-x[1])*longitud;
   const f=Math.max(0,Math.min(1,(vx*dx+vy*dy)/(dx*dx+dy*dy)));
   const ajuste=Math.hypot(vx-f*dx,vy-f*dy);
   if(ajuste>limite)continue;
   const h=Number.isFinite(x[2])&&Number.isFinite(y[2])?x[2]+f*(y[2]-x[2]):null;
   lista.push({p:[x[0]+f*(y[0]-x[0]),x[1]+f*(y[1]-x[1]),h],i,cortes,ajuste,desde:acumulado+f*m});
  }
  acumulado+=m;
 }
 const mejores=lista=>{
  const candidatas=[];
  for(const p of lista.sort((x,y)=>x.ajuste-y.ajuste)){
   if(candidatas.some(q=>q.cortes===p.cortes&&Math.abs(q.desde-p.desde)<15))continue;
   candidatas.push(p);
   if(candidatas.length===16)break;
  }
  return candidatas;
 };
 let mejor=null;
 const directa=distance(a,b),inicios=mejores(salida),finales=mejores(llegada);
 for(const ini of inicios)for(const fin of finales){
  const kmTrack=Math.abs(ini.desde-fin.desde);
  if(ini.cortes!==fin.cortes||kmTrack<10||kmTrack>Math.max(200,directa*5))continue;
  const coste=ini.ajuste+fin.ajuste+kmTrack*.002;
  if(!mejor||coste<mejor.coste)mejor={ini,fin,coste,metros:kmTrack};
 }
 if(!mejor)return null;
 const {ini,fin,metros}=mejor;
 const haciaDelante=ini.desde<fin.desde;
 const intermedios=haciaDelante?pts.slice(ini.i,fin.i):pts.slice(fin.i,ini.i).reverse();
 const points=[ini.p,...intermedios,fin.p].filter((p,i,tramo)=>!i||distance(tramo[i-1],p)>.05);
 if(points.length<2)return null;
 return {points,metros,ajustes:[ini.ajuste,fin.ajuste]};
}

async function recorridoPublicadoAlternativas(a,b,referencias,signal,radio=60){
 const candidatas=[];
 for(const ref of referencias){
  const slug=ref.href.replace(/\.html$/,'');
  if(!/^[a-z0-9_-]+$/i.test(slug))continue;
  const cercaA=closestMeters(a,ref.points),cercaB=closestMeters(b,ref.points);
  if(Math.max(cercaA,cercaB)<=75)candidatas.push({ref,slug,distancia:cercaA+cercaB});
 }
 candidatas.sort((x,y)=>x.distancia-y.distancia);
 const respuestas=await Promise.allSettled(candidatas.slice(0,3).map(async ({ref,slug})=>{
  const base='https://raw.githubusercontent.com/eltzubi/Rutas-Mallabia/main/data/';
  const res=await fetch(base+slug+'.json',{cache:'no-store',signal});
  if(!res.ok)return null;
  const data=await res.json(),pts=data.tracks?.[0]?.points;
  if(!Array.isArray(pts)||pts.length<2||pts.length>15000||
     !pts.every(p=>Array.isArray(p)&&Math.abs(p[0])<=90&&Math.abs(p[1])<=180&&Number.isFinite(p[0])&&Number.isFinite(p[1])))return null;
  const corte=recortaTrackPublicado(pts,a,b,dist,radio);
  if(!corte)return null;
  return {ref,...corte};
 }));
 const validas=respuestas.filter(r=>r.status==='fulfilled'&&r.value).map(r=>r.value);
 validas.sort((x,y)=>x.ajustes[0]+x.ajustes[1]-y.ajustes[0]-y.ajustes[1]||x.metros-y.metros);
 const r=validas[0];
 return r?{parts:[r.points],comparison:{distance:r.metros,ascent:null},publicado:r}:null;
}

const catalogosOficiales=['data/senderos-bizkaia.json','data/senderos-urdaibai.json'];
const cargasCatalogos=new Map();
const organismoForal='Diputación Foral de Bizkaia';
const nombreForal='Diputación de Bizkaia';

function cargaCatalogoOficial(url){
 if(cargasCatalogos.has(url))return cargasCatalogos.get(url);
 const ctl=new AbortController(),espera=setTimeout(()=>ctl.abort(),4500);
 const carga=fetch(url,{signal:ctl.signal})
  .then(r=>{if(!r.ok)throw Error('Catálogo no disponible');return r.json()})
  .then(data=>{
   if(data.version!==1||!Array.isArray(data.tramos))throw Error('Catálogo no compatible');
   return data.tramos.map(ref=>({...ref,organismo:data.organismo,organismoCorto:data.organismoCorto,
    licencia:data.licencia}));
  }).catch(()=>{
   cargasCatalogos.delete(url);
   return [];
  }).finally(()=>clearTimeout(espera));
 cargasCatalogos.set(url,carga);
 return carga;
}

async function senderosBizkaia(){
 return (await Promise.all(catalogosOficiales.map(cargaCatalogoOficial))).flat();
}

function recortaSenderoOficial(a,b,referencias,distance,radio=20){
 let mejor=null;
 for(const ref of referencias){
  const [sur,oeste,norte,este]=ref.limites;
  const cerca=p=>p[0]>=sur-.00035&&p[0]<=norte+.00035&&p[1]>=oeste-.00048&&p[1]<=este+.00048;
  if(!cerca(a)||!cerca(b))continue;
  const corte=recortaTrackPublicado(ref.puntos,a,b,distance,radio);
  if(!corte)continue;
  const coste=corte.ajustes[0]+corte.ajustes[1]+corte.metros*.002;
  if(!mejor||coste<mejor.coste)mejor={ref,corte,coste};
 }
 if(!mejor)return null;
 const {ref,corte}=mejor;
 return {parts:[corte.points],comparison:{distance:corte.metros,ascent:null},
  oficial:{codigo:ref.codigo,nombre:ref.nombre,url:ref.url,ajustes:corte.ajustes,
   organismo:ref.organismo||organismoForal,organismoCorto:ref.organismoCorto||nombreForal,
   licencia:ref.licencia||'CC BY 4.0'}};
}

async function recorridoOficialAlternativas(a,b,signal,radio=20){
 const enBizkaia=p=>p[0]>=42.85&&p[0]<=43.55&&p[1]>=-3.55&&p[1]<=-2.25;
 if(!enBizkaia(a)||!enBizkaia(b)||signal.aborted)return null;
 const datos=await senderosBizkaia();
 return signal.aborted?null:recortaSenderoOficial(a,b,datos,dist,radio);
}

async function tramoDeCatalogo(a,b,signal,primerTramo){
 // Un primer punto puede ajustarse a la línea. Una unión con un tramo
 // previo conserva su ancla y exige que el track pase por ese mismo punto.
 const radio=[primerTramo?20:.8,20];
 const referencias=tracks.filter(t=>coincideActividad(t,'senderismo'));
 const [propio,oficial]=await Promise.all([
  recorridoPublicadoAlternativas(a,b,referencias,signal,radio).catch(()=>null),
  recorridoOficialAlternativas(a,b,signal,radio).catch(()=>null),
 ]);
 const r=propio??oficial;
 if(!r)return null;
 const pts=r.parts[0];
 return {...r,anchors:[pts[0],pts.at(-1)],ajustaInicio:primerTramo};
}

function textoAjustesTrack(ajustes){
 return ajustes.map((m,j)=>Math.round(m)>=5?(j?'Llegada':'Salida')+' ajustada '+Math.round(m)+' m al track':'')
  .filter(Boolean).join(' · ');
}

async function calculaAlternativas(a,b){
 const permiteCalculo=confirm('¿Buscar también rutas de mapa? Para calcularlas se enviarán los puntos a Valhalla y OSRM.');
 const gen=++altGeneracion,ctl=new AbortController();
 altControl=ctl;
 const lista=$('alternativasLista');
 pasoAlternativas(permiteCalculo?'Buscando en los catálogos y calculando opciones…':'Buscando en los catálogos de rutas…');
 altCapas.push(L.circleMarker(b,{radius:8,color:'#ffad4a',fillOpacity:1,interactive:false}).addTo(map));
 try{
  const referencias=tracks.filter(t=>coincideActividad(t,'senderismo'));
  const trackControl=new AbortController(),motorControl=new AbortController();
  const cancelaPeticiones=()=>{trackControl.abort();motorControl.abort()};
  ctl.signal.addEventListener('abort',cancelaPeticiones,{once:true});
  const esperaTrack=setTimeout(()=>trackControl.abort(),6500);
  let esperaMotor;
  const catalogos=Promise.all([
   recorridoPublicadoAlternativas(a,b,referencias,trackControl.signal).catch(()=>null),
   recorridoOficialAlternativas(a,b,trackControl.signal).catch(()=>null),
  ]).then(([propio,oficial])=>{
   if((propio||oficial)&&permiteCalculo)esperaMotor=setTimeout(()=>motorControl.abort(),4500);
   return [propio,oficial];
  });
  const [[publicado,oficial],motor]=await Promise.all([
   catalogos,
   permiteCalculo?MotorSenderismo.fetchAlternatives(a,b,motorControl.signal).catch(()=>[]):[],
  ]).finally(()=>{
   clearTimeout(esperaTrack);
   clearTimeout(esperaMotor);
   ctl.signal.removeEventListener('abort',cancelaPeticiones);
  });
  if(gen!==altGeneracion)return;
  const catalogadas=[publicado,oficial].filter(Boolean);
  const raw=[];
  for(const r of [...catalogadas,...motor]){
   if(raw.some(x=>(x.publicado||x.oficial)&&MotorSenderismo.similarAlternatives(x,r)))continue;
   raw.push(r);
   if(raw.length===3)break;
  }
  const opciones=raw.map(r=>{
   const parts=r.parts.map(p=>p.map(q=>q.slice()));
   return {...r,parts,anchors:[parts[0][0],parts[0].at(-1)],medidas:null};
  });
  if(!opciones.length){
   if(!permiteCalculo){
    altCapas.pop().remove();
    pasoAlternativas('Sin track publicado entre estos puntos. Marca el destino de nuevo para calcular.',2);
    return;
   }
   throw Error('No hay recorridos válidos');
  }
  const documentados=buscaTramosDocumentados(opciones.map(r=>r.parts[0]),referencias);
  opciones.forEach((r,i)=>{
   const doc=documentados[i];
   r.documentado=r.publicado?
    {fraccion:1,metros:r.comparison.distance,lineas:r.parts,tramos:[{ref:r.publicado.ref}]}:
    {...doc,fraccion:doc.total?doc.metros/doc.total:0};
  });
  // A igual porcentaje redondeado se conserva el orden del motor.
  const prioridad=r=>r.publicado?2:r.oficial?1:0;
  opciones.sort((a,b)=>prioridad(b)-prioridad(a)||Math.round(b.documentado.fraccion*100)-Math.round(a.documentado.fraccion*100));
  limpiaCapasAlternativas();
  lista.replaceChildren();
  lista.classList.remove('hidden');
  const insignias=[['Azul','#38bdf8'],['Naranja','#ffad4a'],['Verde','#a3e66c']];
  let selected=0,rampaMapa=null;
  const botones=[],fichas=[];
  const comparacion=document.createElement('div');comparacion.className='alternativaOpciones';
  const acciones=document.createElement('div');acciones.className='alternativaAcciones';
  const choose=document.createElement('button');choose.type='button';choose.className='alternativaConfirmar';choose.textContent='Elegir ruta';
  const rampButton=document.createElement('button');rampButton.type='button';rampButton.className='alternativaRampa hidden';
  const detalleDoc=document.createElement('details');detalleDoc.className='alternativaDocumentada hidden';
  const resumenDoc=document.createElement('summary');detalleDoc.append(resumenDoc);
  const fichasDoc=document.createElement('div');detalleDoc.append(fichasDoc);
  const ajusteDoc=document.createElement('small');ajusteDoc.className='alternativaAjuste hidden';
  const menorDistancia=Math.min(...opciones.map(r=>r.comparison.distance));
  function actualizaDatos(){
   const subidas=opciones.map(r=>r.medidas?.sube??r.comparison.ascent);
   const menorSubida=subidas.every(Number.isFinite)?Math.min(...subidas):null;
   opciones.forEach((r,i)=>{
    const metros=Math.round(r.comparison.distance-menorDistancia);
    const texto=opciones.length===1?'':metros<10?'Más corta':'+'+fmt(metros)+' de recorrido';
    const sube=subidas[i];
    fichas[i].datos.textContent=(Number.isFinite(sube)?'↑ '+Math.round(sube)+' m':'Desnivel —')+
     (r.medidas?' · ≈ '+textoHoras(r.medidas.tiempo):'');
    fichas[i].detalle.textContent=texto;
    fichas[i].subida.textContent=menorSubida!==null&&opciones.length>1?
     (Math.round(sube-menorSubida)===0?'Menos subida':'↑ '+Math.round(sube-menorSubida)+' m más'):'';
    fichas[i].subida.hidden=!fichas[i].subida.textContent;
   });
   const rampa=opciones[selected].medidas?.rampa;
   rampButton.classList.toggle('hidden',!rampa);
   if(rampa)rampButton.textContent='Ver rampa · '+Math.round(rampa.pendiente)+' % · km '+(rampa.desde/1000).toFixed(2).replace('.',',');
  }
  function limpiaRampa(){
   if(rampaMapa){map.removeLayer(rampaMapa);altCapas.pop();rampaMapa=null}
  }
  const preview=i=>{
   limpiaRampa();
   selected=i;
   altCapas.forEach((l,j)=>{
    if(opciones[j].oficial&&j!==i){l.remove();return}
    if(!map.hasLayer(l))l.addTo(map);
    l.setStyle({weight:j===i?7:4,opacity:j===i?1:.58,dashArray:j===i?null:'6 8'});
   });
   altCapas[i].bringToFront();
   altDocumentados?.remove();
   const doc=opciones[i].documentado;
   altDocumentados=doc.lineas.length?L.polyline(doc.lineas,{
    color:'#f1fff0',weight:3,dashArray:'3 6',interactive:false,
   }).addTo(map):null;
   const fuente=opciones[i].publicado,refOficial=opciones[i].oficial;
   ajusteDoc.textContent=textoAjustesTrack((fuente||refOficial)?.ajustes??[]);
   ajusteDoc.classList.toggle('hidden',!ajusteDoc.textContent);
   detalleDoc.open=false;
   detalleDoc.classList.toggle('hidden',!altDocumentados&&!refOficial);
   resumenDoc.textContent=refOficial?'Tramo oficial · '+refOficial.organismoCorto:
    fuente?'Track publicado · ver ficha':fmt(doc.metros)+' de tramos Trabakutik · ver fichas';
   fichasDoc.replaceChildren();
   if(refOficial){
    const enlace=document.createElement('a');
    enlace.textContent=refOficial.codigo+' · '+refOficial.nombre+' · '+refOficial.organismo+' · '+refOficial.licencia;
    enlace.href=refOficial.url;
    enlace.target='_blank';
    enlace.rel='noopener';
    fichasDoc.append(enlace);
   }
   const origenes=[...new Set(doc.tramos.map(t=>t.ref))];
   for(const ref of origenes){
    if(!/^[a-z0-9_-]+\.html$/i.test(ref.href))continue;
    const enlace=document.createElement('a');
    enlace.textContent=toName(ref);
    enlace.href='https://trabakutik.com/'+ref.href;
    enlace.target='_blank';
    enlace.rel='noopener';
    fichasDoc.append(enlace);
   }
   botones.forEach((x,j)=>x.setAttribute('aria-pressed',String(i===j)));
   pasoAlternativas(opciones.length===1?'Un recorrido encontrado':opciones.length+' recorridos · '+insignias[i][0]+' en vista previa');
   actualizaDatos();
   encuadraAlternativa(altCapas[i].getBounds());
  };
  opciones.forEach((r,i)=>{
   const [nombre,color]=insignias[i];
   const trazado=L.polyline(r.parts[0].map(p=>p.slice(0,2)),{color,interactive:false});
   altCapas.push(trazado);
   const button=document.createElement('button');button.type='button';button.className='alternativa';
   button.style.setProperty('--alt-color',color);
   const title=document.createElement('b');title.textContent=(i+1)+' · '+nombre;
   const distancia=document.createElement('strong');distancia.textContent=(r.comparison.distance/1000).toFixed(2).replace('.',',')+' km';
   const datos=document.createElement('small'),detalle=document.createElement('small');
   const subida=document.createElement('small');
   detalle.className='alternativaDetalle';
   button.append(title,distancia,datos,detalle,subida);
   if(r.documentado.metros||r.oficial){
    const coincidente=document.createElement('small');
    coincidente.className='alternativaCoincidencia';
    coincidente.textContent=r.oficial?'Tramo oficial':r.publicado?'Track publicado':Math.max(1,Math.round(r.documentado.fraccion*100))+' % Trabakutik';
    button.append(coincidente);
   }
   comparacion.append(button);
   botones.push(button);
   fichas.push({datos,detalle,subida});
   button.onclick=()=>{if(!altControl&&gen===altGeneracion)preview(i)};
  });
  rampButton.onclick=()=>{
   if(gen!==altGeneracion||altControl)return;
   const rampa=opciones[selected].medidas?.rampa;
   if(!rampa)return;
   limpiaRampa();
   rampaMapa=L.polyline(rampa.pts,{color:'#fff0ae',weight:10,opacity:.92,interactive:false}).addTo(map);
   altCapas.push(rampaMapa);
   encuadraAlternativa(rampaMapa.getBounds());
  };
  const cancel=document.createElement('button');cancel.type='button';cancel.className='alternativaCancelar';cancel.textContent='Descartar';cancel.onclick=cancelaAlternativas;
  acciones.append(cancel,choose);
  detalleDoc.addEventListener('toggle',()=>{
   if(detalleDoc.open&&altDocumentados&&gen===altGeneracion)encuadraAlternativa(altDocumentados.getBounds());
  });
  lista.append(comparacion,detalleDoc,ajusteDoc,rampButton,acciones);
  lista.classList.add('compact-preview');
  choose.onclick=async()=>{
   const r=opciones[selected];
   if(altControl||gen!==altGeneracion)return;
   if(drawPoints.length>1&&!confirm('¿Sustituir el borrador actual por este recorrido?'))return;
   altAlturas?.abort();
   const altura=new AbortController();
   altControl=altura;
   lista.querySelectorAll('button:not(.alternativaCancelar)').forEach(x=>x.disabled=true);
   pasoAlternativas('Preparando recorrido y alturas…');
   const espera=setTimeout(()=>altura.abort(),20000);
   try{if(!r.medidas&&permiteCalculo)await alturasTerrenoGps(r,altura.signal)}catch{}finally{clearTimeout(espera)}
   if(gen!==altGeneracion)return;
   cancelaAlternativas();
   aplicaMapaGps(r);
   estadoMapaGps('');
   notice('Recorrido elegido. Puedes añadir puntos o editarlo.');
  };
  preview(0);
  const terreno=new AbortController();
  altAlturas=terreno;
  void (async()=>{
   for(const r of opciones){
    if(terreno.signal.aborted)return;
    const espera=setTimeout(()=>terreno.abort(),18000);
    try{
     if(permiteCalculo&&!r.parts[0].every(p=>Number.isFinite(p[2])))await alturasTerrenoGps(r,terreno.signal);
     if(terreno.signal.aborted||gen!==altGeneracion)return;
     r.medidas=mideAlternativa(r.parts[0]);
     actualizaDatos();
    }catch{}finally{clearTimeout(espera)}
   }
  })();
 }catch(e){
  if(gen!==altGeneracion)return;
  limpiaCapasAlternativas();
  altInicio=null;
  lista.classList.add('hidden');
  lista.classList.remove('compact-preview');
  pasoAlternativas('No se pudo calcular. Vuelve a marcar el inicio.',1);
 }finally{if(gen===altGeneracion)altControl=null;}
}
if(typeof document!=='undefined'){
 const panel=$('alternativasPanel');
 if(panel){
  panel.addEventListener('click',e=>e.stopPropagation());
  panel.addEventListener('dblclick',e=>e.stopPropagation());
  $('creadorModo').addEventListener('click',e=>e.stopPropagation());
  $('modoManual').onclick=cancelaAlternativas;
  $('modoDosPuntos').onclick=()=>{
   if(calculandoMapaGps||altActivo)return;
   cancelaAlternativas();
   altActivo=true;
   $('modoDosPuntos').setAttribute('aria-pressed','true');
   $('modoManual').setAttribute('aria-pressed','false');
   panel.classList.remove('hidden');
   pasoAlternativas('Marca el inicio en el mapa',1);
  };
  $('alternativasCerrar').onclick=cancelaAlternativas;
  $('altMiPosicion').onclick=usaPosicionAlternativas;
  $('altBuscarDestino').onclick=()=>{
   const form=$('destinoForm');
   if(form.classList.contains('hidden')){
    form.classList.remove('hidden');
    $('destinoNombre').focus();
   }else cierraBusquedaDestino();
  };
  $('destinoForm').onsubmit=buscaDestinoAlternativas;
 }
}

if(typeof module==='object'&&module.exports)module.exports={buscaTramosDocumentados,recortaTrackPublicado,destinosTrabakutik,recortaSenderoOficial};
