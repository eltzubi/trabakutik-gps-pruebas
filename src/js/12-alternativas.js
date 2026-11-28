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
 if(altBusqueda)return;
 const directo=puntoCartoCiudad(lugar);
 if(directo){marcaPuntoAlternativas(directo);return}
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
async function buscaDestinoAlternativas(event){
 event.preventDefault();
 if(!altInicio||altBusqueda)return;
 const consulta=$('destinoNombre').value.trim();
 if(consulta.length<2)return;
 const resultados=$('destinoResultados');
 $('destinoEstado').textContent='';
 const key=sinTildes(consulta);
 let lugares=cacheDestinos.get(key);
 if(!lugares){
  if(Date.now()-ultimaBusquedaDestino<1000)return;
  ultimaBusquedaDestino=Date.now();
  const ctl=new AbortController();
  altBusqueda=ctl;
  resultados.textContent='Buscando lugares…';
  const espera=setTimeout(()=>ctl.abort(),8000);
  try{
   const datos=await consultaCartoCiudad('candidates',{q:consulta,limit:'5'},ctl.signal);
   lugares=datos.filter(l=>typeof l.address==='string'&&l.id!=null&&typeof l.type==='string');
   if(altBusqueda!==ctl)return;
   if(cacheDestinos.size>=40)cacheDestinos.delete(cacheDestinos.keys().next().value);
   cacheDestinos.set(key,lugares);
  }catch{
   if(altBusqueda===ctl)resultados.textContent='Ahora no se puede buscar. Puedes marcar el destino en el mapa.';
   return;
  }finally{
   clearTimeout(espera);
   if(altBusqueda===ctl)altBusqueda=null;
  }
 }
 resultados.replaceChildren();
 if(!lugares.length){resultados.textContent='Sin resultados. Prueba con el nombre y el municipio.';return;}
 for(const lugar of lugares){
  const b=document.createElement('button');
  b.type='button';
  b.textContent=[lugar.address,lugar.province].filter(Boolean).join(' · ');
  b.onclick=()=>eligeDestinoAlternativas(lugar);
  resultados.append(b);
 }
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

async function calculaAlternativas(a,b){
 if(!confirm('Los puntos se enviarán a Valhalla y OSRM para calcular las rutas. ¿Continuar?')){pasoAlternativas('Marca el destino en el mapa',2);return;}
 const gen=++altGeneracion,ctl=new AbortController();
 altControl=ctl;
 const lista=$('alternativasLista');
 pasoAlternativas('Calculando hasta tres recorridos…');
 altCapas.push(L.circleMarker(b,{radius:8,color:'#ffad4a',fillOpacity:1,interactive:false}).addTo(map));
 try{
  const raw=await MotorSenderismo.fetchAlternatives(a,b,ctl.signal);
  if(gen!==altGeneracion)return;
  const opciones=raw.map(r=>{
   const parts=r.parts.map(p=>p.map(q=>q.slice()));
   return {...r,parts,anchors:[parts[0][0],parts[0].at(-1)],medidas:null};
  });
  if(!opciones.length)throw Error('No hay recorridos válidos entre los dos puntos');
  const referencias=tracks.filter(t=>coincideActividad(t,'senderismo'));
  const documentados=buscaTramosDocumentados(opciones.map(r=>r.parts[0]),referencias);
  opciones.forEach((r,i)=>{
   const doc=documentados[i];
   r.documentado={...doc,fraccion:doc.total?doc.metros/doc.total:0};
  });
  // A igual porcentaje redondeado se conserva el orden del motor.
  opciones.sort((a,b)=>Math.round(b.documentado.fraccion*100)-Math.round(a.documentado.fraccion*100));
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
   altCapas.forEach((l,j)=>l.setStyle({weight:j===i?7:4,opacity:j===i?1:.58,dashArray:j===i?null:'6 8'}));
   altCapas[i].bringToFront();
   altDocumentados?.remove();
   const doc=opciones[i].documentado;
   altDocumentados=doc.lineas.length?L.polyline(doc.lineas,{
    color:'#f1fff0',weight:3,dashArray:'3 6',interactive:false,
   }).addTo(map):null;
   detalleDoc.open=false;
   detalleDoc.classList.toggle('hidden',!altDocumentados);
   resumenDoc.textContent=fmt(doc.metros)+' de tramos Trabakutik · ver fichas';
   fichasDoc.replaceChildren();
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
   const trazado=L.polyline(r.parts[0].map(p=>p.slice(0,2)),{color,interactive:false}).addTo(map);
   altCapas.push(trazado);
   const button=document.createElement('button');button.type='button';button.className='alternativa';
   button.style.setProperty('--alt-color',color);
   const title=document.createElement('b');title.textContent=(i+1)+' · '+nombre;
   const distancia=document.createElement('strong');distancia.textContent=(r.comparison.distance/1000).toFixed(2).replace('.',',')+' km';
   const datos=document.createElement('small'),detalle=document.createElement('small');
   const subida=document.createElement('small');
   detalle.className='alternativaDetalle';
   button.append(title,distancia,datos,detalle,subida);
   if(r.documentado.metros){
    const coincidente=document.createElement('small');
    coincidente.className='alternativaCoincidencia';
    coincidente.textContent=Math.max(1,Math.round(r.documentado.fraccion*100))+' % Trabakutik';
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
  lista.append(comparacion,detalleDoc,rampButton,acciones);
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
   try{if(!r.medidas)await alturasTerrenoGps(r,altura.signal)}catch{}finally{clearTimeout(espera)}
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
     if(!r.parts[0].every(p=>Number.isFinite(p[2])))await alturasTerrenoGps(r,terreno.signal);
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

if(typeof module==='object'&&module.exports)module.exports={buscaTramosDocumentados};
