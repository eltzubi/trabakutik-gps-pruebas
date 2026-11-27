// Un solo creador. Las alternativas son una vista previa, no un borrador.
let altInicio=null,altActivo=false,altGeneracion=0,altCapas=[],altControl=null;
function limpiaCapasAlternativas(){altCapas.forEach(l=>map.removeLayer(l));altCapas=[];}
function cancelaAlternativas(){ altGeneracion++;altActivo=false;altInicio=null;if(altControl)altControl.abort();altControl=null;limpiaCapasAlternativas();$('alternativasPanel').classList.add('hidden');$('alternativasLista').replaceChildren();$('alternativasLista').classList.remove('compact-preview');$('modoDosPuntos').setAttribute('aria-pressed','false');$('modoManual').setAttribute('aria-pressed','true');}
function capturaAlternativas(e){
 if(!altActivo)return false;
 if(!redGps){notice('Preparando caminos…');return true;}
 if(altControl||!$('alternativasLista').classList.contains('hidden'))return true;
 const p=[e.latlng.lat,e.latlng.lng];
 if(!altInicio){altInicio=p;altCapas.push(L.circleMarker(p,{radius:8,color:'#73e8e7',fillOpacity:1}).addTo(map));$('alternativasEstado').textContent='Ahora marca el destino';return true;}
 if(dist(altInicio,p)<10)return true;
 void calculaAlternativas(altInicio,p);return true;
}
async function calculaAlternativas(a,b){
 if(!confirm('Los puntos se enviarán a Valhalla y OSRM para calcular las rutas. ¿Continuar?')){cancelaAlternativas();return;}
 const gen=++altGeneracion,ctl=new AbortController();altControl=ctl;
 const estado=$('alternativasEstado'),lista=$('alternativasLista');
 estado.textContent='Buscando hasta 3 recorridos distintos…';
 try{
  const raw=await MotorSenderismo.fetchAlternatives(a,b,ctl.signal);
  if(gen!==altGeneracion)return;
  const opciones=raw.map(r=>{
   const parts=r.parts.map(p=>p.map(q=>q.slice()));
   return {...r,parts,anchors:[parts[0][0],parts[0].at(-1)]};
  });
  if(!opciones.length)throw Error('No hay recorridos válidos entre los dos puntos');
  limpiaCapasAlternativas();lista.replaceChildren();lista.classList.remove('hidden');
  const colores=['#38bdf8','#ffad4a','#a3e66c'];
  const nombres=['Azul','Naranja','Verde'];
  let selected=0;const botones=[];
  const comparacion=document.createElement('div');comparacion.className='alternativaOpciones';
  const acciones=document.createElement('div');acciones.className='alternativaAcciones';
  const choose=document.createElement('button');choose.type='button';choose.className='alternativaConfirmar';choose.textContent='Elegir ruta';
  const preview=i=>{
   selected=i;
   altCapas.forEach((l,j)=>{if(j===i)l.addTo(map);else map.removeLayer(l)});
   botones.forEach((x,j)=>x.setAttribute('aria-pressed',String(i===j)));
   estado.textContent='Ruta '+(i+1)+' de '+opciones.length+(opciones.length<3?' · solo '+opciones.length+(opciones.length===1?' opción distinta':' opciones distintas'):'');
   map.fitBounds(altCapas[i].getBounds(),{paddingTopLeft:[35,110],paddingBottomRight:[65,($('creadorDock')?.offsetHeight||140)+25]});
  };
  opciones.forEach((r,i)=>{
   const trazado=L.polyline(r.parts[0].map(p=>p.slice(0,2)),{color:colores[i],weight:6,opacity:.9,interactive:false});
   altCapas.push(trazado);
   const button=document.createElement('button');button.type='button';button.className='alternativa';
   button.style.setProperty('--alt-color',colores[i]);
   button.setAttribute('aria-label','Ruta '+(i+1)+' · '+nombres[i]);
   const title=document.createElement('b');title.textContent=(i+1)+' · '+nombres[i];
   const info=document.createElement('small');
   info.textContent=(r.comparison.distance/1000).toFixed(2).replace('.',',')+' km'+(r.comparison.ascent===null?'':' · +'+Math.round(r.comparison.ascent)+' m');
   button.append(title,info);comparacion.append(button);botones.push(button);
   button.onclick=()=>{if(!altControl&&gen===altGeneracion)preview(i);};
  });
  const cancel=document.createElement('button');cancel.type='button';cancel.className='alternativaCancelar';cancel.textContent='Descartar';cancel.onclick=cancelaAlternativas;
  acciones.append(cancel,choose);
  lista.append(comparacion,acciones);lista.classList.add('compact-preview');
  choose.onclick=async()=>{
   const r=opciones[selected];
   if(altControl||gen!==altGeneracion)return;
   if(drawPoints.length>1&&!confirm('¿Sustituir el borrador actual por este recorrido?'))return;
   const altura=new AbortController();altControl=altura;
   lista.querySelectorAll('button:not(.alternativaCancelar)').forEach(x=>x.disabled=true);
   estado.textContent='Preparando recorrido y alturas…';
   const espera=setTimeout(()=>altura.abort(),20000);
   try{await alturasTerrenoGps(r,altura.signal)}catch(e){}finally{clearTimeout(espera)}
   if(gen!==altGeneracion)return;
   cancelaAlternativas();aplicaMapaGps(r);
   estadoMapaGps('');
   notice('Recorrido elegido. Puedes añadir puntos o editarlo.');
  };
  preview(0);
 }catch(e){if(gen===altGeneracion){estado.textContent=e.message+' · Vuelve a marcar los puntos';limpiaCapasAlternativas();altInicio=null;}}
 finally{if(gen===altGeneracion)altControl=null;}
}
if(typeof document!=='undefined'){
 const panel=$('alternativasPanel');
 if(panel){
  panel.addEventListener('click',e=>e.stopPropagation());panel.addEventListener('dblclick',e=>e.stopPropagation());
  $('creadorModo').addEventListener('click',e=>e.stopPropagation());
  $('modoManual').onclick=cancelaAlternativas;
  $('modoDosPuntos').onclick=()=>{if(calculandoMapaGps)return;cancelaAlternativas();altActivo=true;$('modoDosPuntos').setAttribute('aria-pressed','true');$('modoManual').setAttribute('aria-pressed','false');$('alternativasLista').classList.add('hidden');panel.classList.remove('hidden');$('alternativasEstado').textContent='Marca el inicio en el mapa';};
  $('alternativasCerrar').onclick=cancelaAlternativas;
 }
}
