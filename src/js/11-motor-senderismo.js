const MotorSenderismo=(()=>{
// Selección de rutas de MallabiGPS 1.0.15 para el lápiz de Trabakutik.
'use strict';
const RAD = Math.PI / 180;
const EARTH = 6371000;
const wrapped = x => ((x + 540) % 360) - 180;
function meters(a, b) {
  const h = Math.sin((b[0] - a[0]) * RAD / 2) ** 2
    + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(wrapped(b[1] - a[1]) * RAD / 2) ** 2;
  return 2 * EARTH * Math.asin(Math.sqrt(Math.min(1, h)));
}
function prepare(parts) {
  const edges = [], points = [];
  let total = 0, ascent = 0, descent = 0;
  for (const part of parts) {
    part.forEach((point, i) => {
      if (i) {
        const previous = part[i - 1];
        const length = meters(previous, point);
        if (length > 0.1) edges.push({ a: previous, b: point, start: total, length });
        total += length;
        if (previous[2] != null && point[2] != null) {
          const rise = point[2] - previous[2];
          ascent += Math.max(0, rise);
          descent += Math.max(0, -rise);
        }
      }
      points.push({ distance: total, altitude: point[2], first: !i });
    });
  }
  return { edges, total, points, ascent, descent };
}
function roundaboutSteps(steps=[]) {
  return steps.filter(s=>['roundabout','rotary','roundabout turn','exit roundabout','exit rotary'].includes(s.maneuver?.type));
}
function validateDrawingLeg(origin, target, path, distance, steps=[]) {
  if (!Array.isArray(path) || path.length < 2 || !Number.isFinite(distance) || distance <= 0)
    throw new Error('Recorrido no válido');
  if (path.some(p=>!Array.isArray(p)||!Number.isFinite(p[0])||!Number.isFinite(p[1]))) throw new Error('Geometría inválida');
  if (meters(origin,path[0])>20 || meters(target,path.at(-1))>20)
    throw new Error('Marca el punto sobre el camino correcto');
  const direct = meters(origin,target);
  // Only allow a bounded extra distance for a manoeuvre explicitly returned by the router.
  // No change to profile, access or direction; never fabricate an arc.
  const circles=roundaboutSteps(steps);
  const allowance=Math.min(350,circles.reduce((n,s)=>n+Math.max(0,Number(s.distance)||0),0));
  if (direct < 250 && distance > Math.max(200, direct * 4)+allowance)
    throw new Error(`Rodeo: ${Math.round(distance)} m para ${Math.round(direct)} m directos (rotonda: ${circles.length})`);
  if (direct >= 250 && distance > direct * 5 && distance - direct > 1500)
    throw new Error('Rodeo excesivo. Añade un punto intermedio');
}
function routeRequest(origin,target) {
  const points=[origin,target].map(([lat,lon])=>lon+','+lat).join(';');
  const params=new URLSearchParams({overview:'full',geometries:'geojson',steps:'true',radiuses:'20;20',alternatives:'true',generate_hints:'true'});
  return 'https://routing.openstreetmap.de/routed-foot/route/v1/driving/'+points+'?'+params;
}
function chooseNetworkRoute(payload,origin,target,context={},all=false) {
  const candidates=[], rejected=[];
  for(const r of payload.routes||[]) {
    const coords=r.geometry?.coordinates;
    if(!Array.isArray(coords)||coords.some(p=>!Array.isArray(p)||!Number.isFinite(p[0])||!Number.isFinite(p[1]))) continue;
    const path=coords.map(([lon,lat])=>[lat,lon,null]);
    if(!Array.isArray(r.legs)||r.legs.some(l=>!Array.isArray(l.steps))) {rejected.push('Respuesta sin maniobras');continue;}
    try {validateDrawingLeg(origin,target,path,r.distance,r.legs.flatMap(l=>l.steps));} catch(error) {rejected.push(error.message);continue;}
    if((context.hint || context.connected) && meters(origin,path[0])>2) {rejected.push('Continuidad: '+meters(origin,path[0]).toFixed(1)+' m');continue;}
    const score=r.distance+8*(meters(origin,path[0])+meters(target,path.at(-1)));
    candidates.push({r,path,score});
  }
  candidates.sort((a,b)=>a.score-b.score);
  if(!candidates.length) throw new Error(payload.code && payload.code!=='Ok'?'Red de caminos: '+payload.code:'Enlace rechazado: '+(rejected.join(' | ')||'sin geometría válida'));
  return all?candidates:candidates[0];
}
function valhallaRequest(points,alternates=0) {
  const options={locations:points.map(([lat,lon])=>({lat,lon,type:'break',radius:20})),costing:'pedestrian',units:'kilometers',language:'es-ES',shape_format:'polyline6',roundabout_exits:true};
  if(alternates && points.length===2)options.alternates=alternates;
  return 'https://valhalla1.openstreetmap.de/route?json='+encodeURIComponent(JSON.stringify(options));
}
function decodeValhalla(shape) {
  if(typeof shape!=='string')throw new Error('Geometría Valhalla ausente');
  let i=0,lat=0,lon=0;const points=[];
  function number(){let v=0,shift=0,b;do{if(i>=shape.length||shift>30)throw new Error('Polilínea inválida');b=shape.charCodeAt(i++)-63;if(b<0||b>63)throw new Error('Polilínea inválida');v+=(b&31)*2**shift;shift+=5;}while(b>=32);return v%2?-(v+1)/2:v/2;}
  while(i<shape.length){lat+=number();lon+=number();if(Math.abs(lat)>90e6||Math.abs(lon)>180e6)throw new Error('Coordenadas inválidas');points.push([lat/1e6,lon/1e6,null]);}
  return points;
}
function valhallaStep(m,path) {
  const a=m.begin_shape_index,b=m.end_shape_index;
  if(!Number.isInteger(a)||!Number.isInteger(b)||a<0||b<a||b>=path.length||!Number.isFinite(m.length)||m.length<0)throw new Error('Maniobra Valhalla inválida');
  let type='notification',modifier;
  if([1,2,3].includes(m.type))type='depart';else if([4,5,6].includes(m.type))type='arrive';
  else if(m.type===26)type='roundabout';else if(m.type===27)type='exit roundabout';
  else if([9,10,11,14,15,16,12,13].includes(m.type)){type='turn';modifier=[12,13].includes(m.type)?'uturn':[9,10,11].includes(m.type)?'right':'left';}
  else if([22,23,24].includes(m.type)){type='fork';modifier=m.type===23?'right':m.type===24?'left':'straight';}
  return {distance:m.length*1000,name:m.street_names?.[0],maneuver:{type,modifier,exit:m.roundabout_exit_count},geometry:{coordinates:path.slice(a,b+1).map(p=>[p[1],p[0]])}};
}
function valhallaLegs(payload,points,locked=false) {
  const trip=payload.trip;if(!trip||trip.status!==0||trip.units!=='kilometers'||trip.legs?.length!==points.length-1)throw new Error('Valhalla: respuesta incompleta');
  const legs=trip.legs.map((l,i)=>{
    const path=decodeValhalla(l.shape),distance=l.summary?.length*1000;
    if(!Array.isArray(l.maneuvers)||!l.maneuvers.length)throw new Error('Valhalla: sin maniobras');
    const steps=l.maneuvers.map(m=>valhallaStep(m,path));
    validateDrawingLeg(points[i],points[i+1],path,distance,steps);
    return {source:'network',provider:'Valhalla',target:points[i+1],name:'Ruta por caminos',parts:[path],steps,networkDistance:distance,duration:l.summary.time};
  });
  if(locked&&meters(points[0],legs[0].parts[0][0])>2)throw new Error('Valhalla: cambia de vía anterior');
  for(let i=1;i<legs.length;i++)if(meters(legs[i-1].parts[0].at(-1),legs[i].parts[0][0])>.5)throw new Error('Valhalla: enlace discontinuo');
  return legs;
}
function alternativeModel(candidate,origin,target){
  if(candidate.parts?.length!==1)throw Error('Geometría discontinua');
  const path=candidate.parts[0];
  validateDrawingLeg(origin,target,path,candidate.networkDistance,candidate.steps);
  if(path.some(p=>Math.abs(p[0])>90||Math.abs(p[1])>180))throw Error('Coordenadas inválidas');
  const m=prepare(candidate.parts);
  if(!Number.isFinite(m.total)||m.total<2||Math.abs(m.total-candidate.networkDistance)>Math.max(40,m.total*.15))throw Error('Distancia incoherente');
  const hasElevation=path.every(p=>Number.isFinite(p[2]));
  return {...candidate,comparison:{distance:m.total,ascent:hasElevation?m.ascent:null}};
}
function routeSamples(candidate){
  const {edges,total}=prepare(candidate.parts),samples=[];let i=0;
  for(let k=0;k<=80;k++){const d=total*k/80;while(i<edges.length-1&&edges[i].start+edges[i].length<d)i++;const e=edges[i];const f=Math.max(0,Math.min(1,(d-e.start)/e.length));samples.push([e.a[0]+(e.b[0]-e.a[0])*f,e.a[1]+(e.b[1]-e.a[1])*f]);}return samples;
}
function similarAlternatives(a,b){
  if(Math.abs(a.comparison.distance-b.comparison.distance)>Math.max(40,a.comparison.distance*.08))return false;
  const x=routeSamples(a),y=routeSamples(b);
  return x.filter((p,i)=>meters(p,y[i])<=35).length>=76;
}
function uniqueAlternatives(candidates,origin,target){
  const result=[];
  for(const c of candidates){try{const valid=alternativeModel(c,origin,target);if(!result.some(r=>similarAlternatives(r,valid)))result.push(valid);}catch{}}
  return result.slice(0,3);
}
async function fetchAlternatives(origin,target,signal){
  async function json(url){
    const controller=new AbortController(),cancel=()=>controller.abort();
    const timer=setTimeout(cancel,10000);
    signal?.addEventListener('abort',cancel,{once:true});
    if(signal?.aborted)cancel();
    try{const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw Error('HTTP '+response.status);return await response.json();}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
  }
  const candidates=[],errors=[];
  async function attempt(label,fn){try{const items=await fn();if(!items.length)throw Error('Sin recorridos');for(const item of items){try{alternativeModel(item,origin,target);candidates.push(item);}catch(e){errors.push(label+': '+e.message);}}}catch(e){errors.push(label+': '+(e.name==='AbortError'?'Tiempo agotado':e.message));}}
  async function valhalla(n){const payload=await json(valhallaRequest([origin,target],n));const result=valhallaLegs(payload,[origin,target]);for(const alt of payload.alternates||[]){try{result.push(valhallaLegs(alt,[origin,target])[0]);}catch(e){errors.push('Valhalla alternativa: '+e.message);}}return result;}
  async function osrm(){
    const payload=await json(routeRequest(origin,target));
    return chooseNetworkRoute(payload,origin,target,{},true).map(({r,path})=>({
      provider:'OSRM',networkDistance:r.distance,steps:r.legs.flatMap(l=>l.steps),parts:[path],
    }));
  }
  await Promise.all([attempt('Valhalla',()=>valhalla(0)),attempt('OSRM',osrm)]);
  if(!candidates.length)throw Error('Ningún motor devolvió un recorrido válido. '+errors.join(' · '));
  if(!signal?.aborted&&uniqueAlternatives(candidates,origin,target).length<3)
    await attempt('Valhalla alternativas',()=>valhalla(2));
  const priority={Valhalla:0,OSRM:1};
  candidates.sort((a,b)=>priority[a.provider]-priority[b.provider]);
  return uniqueAlternatives(candidates,origin,target);
}
return {fetchAlternatives,similarAlternatives};
})();
