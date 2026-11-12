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
 if(!redOsm||coords.length<2)return null;
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
  parts.push(tramo);
 }
 return {anchors:[parts[0][0],...parts.map(p=>p[p.length-1])],parts};
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
  return pts;
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
async function solicitaMapaGps(coords,signal){
 const espera=Math.max(0,1100-(Date.now()-ultimaPeticionMapaGps));
 if(espera)await new Promise((resolve,reject)=>{
  const cancel=()=>{clearTimeout(timer);reject(Error('Cálculo cancelado.'))};
  const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve()},espera);
  if(signal.aborted)cancel();else signal.addEventListener('abort',cancel,{once:true});
 });
 if(signal.aborted)throw Error('Cálculo cancelado.');
 ultimaPeticionMapaGps=Date.now();
 const cuerpo=JSON.stringify({
  locations:coords.map(p=>({lat:Number(p[0].toFixed(6)),lon:Number(p[1].toFixed(6)),type:'break'})),
  costing:'pedestrian',directions_options:{units:'kilometers'}});
 const r=await fetch(URL_PLANIFICADOR,{method:'POST',body:cuerpo,signal,cache:'no-store',credentials:'omit',
  headers:{Accept:'application/json','Content-Type':'application/json','X-Client-Id':'trabakutik.com'}});
 if(r.status===429)throw Error('El planificador está ocupado. Espera unos segundos y vuelve a intentarlo.');
 if(!r.ok){
  // Valhalla contesta 400 con un numero cuando no encuentra camino cerca.
  let codigo=0;try{codigo=(await r.json()).error_code|0}catch(e){}
  if([154,170,171,172,442,443,444].includes(codigo))
   throw noHayPaso('No hay conexión a pie entre esos puntos en OpenStreetMap. Acerca el punto al camino o elige otro paso.');
  throw Error('No se pudo conectar con el planificador. Conservamos el trazado anterior.');
 }
 return respuestaMapaGps(await r.json(),coords);
}
// Muestrear el terreno cada 30 m, con un límite por recorrido. Se conservan
// todas las esquinas de la geometría y los puntos de paso del usuario.
const cacheAlturasMapaGps=new Map();
let ultimaAlturaMapaGps=0;
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
  tr.mapa=true;tramosGps.push(tr);
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
 if(!anclasGps.length){
  const ini=nodoManualGps(a[0],a[1],a[2]);
  anclasGps.push(ini);tramosGps.push([ini]);
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
 const fin=nodoManualGps(b[0],b[1],b[2]);
 const pts=result.parts[0]||[];
 const tr=[ini,...pts.slice(1,-1).map(q=>nodoManualGps(q[0],q[1],q[2])),fin];
 tr.mapa=true;
 anclasGps.push(fin);tramosGps.push(tr);
 updateDraw();
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
 const fin=nodoManualGps(hasta[0],hasta[1]);
 const tr=[ini,fin];tr.aMano=true;
 anclasGps.push(fin);tramosGps.push(tr);
 updateDraw();
 estadoMapaGps('');
 notice('Tramo trazado a mano, en recta · '+Math.round(metros(desde,hasta))+' m · no va por ningún camino del mapa');
}
async function planificaTramoMapa(desde,hasta){
 tramoSinCamino=null;
 if(!coordenadaMapaGps(desde)||!coordenadaMapaGps(hasta))return;
 if(!permisoMapaGps){
  permisoMapaGps=confirm('Para calcular los caminos y el desnivel se enviarán los puntos del recorrido a los servicios de rutas y alturas de FOSSGIS (OpenStreetMap). ¿Continuar?');
  if(!permisoMapaGps){estadoMapaGps('Cálculo cancelado. No se han enviado los puntos.');return}
 }
 cancelaMapaGps();const version=calculoMapaGps;
 const controller=new AbortController();peticionMapaGps=controller;calculandoMapaGps=true;
 $('saveCreated').disabled=true;estadoMapaGps('Calculando tramo…');
 const timer=setTimeout(()=>controller.abort(),30000);
 try{
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
  const local=planLocalMapa([desde,hasta]);
  if(local){anadeTramoMapa(local);estadoMapaGps('Sin conexión · tramo por los caminos guardados, sin desnivel.')}
  else if(controller.signal.aborted)estadoMapaGps('No se pudo completar el cálculo. Revisa la conexión y vuelve a intentarlo.');
  else {
   // Ni el planificador ni los caminos guardados. Si es que por ahi no hay
   // camino en el mapa, se le ofrece trazarlo a mano.
   // Solo se ofrece trazarlo a mano cuando SABEMOS que no hay camino: con
   // los caminos de la zona ya bajados. Si todavia no estan, lo que toca es
   // esperar unos segundos, no ponerse a dibujar rectas.
   tramoSinCamino=e&&e.sinCamino&&redOsm?[desde,hasta]:null;
   estadoMapaGps(porQueNoHayCamino(e),!!tramoSinCamino);
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
  const local=planLocalMapa(coords);
  if(local){aplicaMapaGps(local);estadoMapaGps('Sin conexión · recorrido por los caminos guardados, sin desnivel.')}
  else estadoMapaGps(controller.signal.aborted?'No se pudo completar el cálculo. Revisa la conexión y vuelve a intentarlo.':porQueNoHayCamino(e));
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
for(const id of ['elevationPanel','createActions','plannerCredit']){
 const el=$(id);el.addEventListener('click',e=>e.stopPropagation());el.addEventListener('dblclick',e=>e.stopPropagation());
}
document.querySelector('.modes').addEventListener('click',e=>e.stopPropagation());
let profileCollapsed=true,navProfileCollapsed=true;
let profileHeights=null,profileHeightsRequest=null,profileHeightsError=false;
// Las alturas de Trabakutik corresponden punto por punto al mapa general.
// Se usan solo para el perfil: nunca sustituyen la geometría de navegación.
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
  if(Number.isFinite(data.gain))text='↑ Quedan '+Math.round(data.gain)+' m aprox.';
  if(typeof pausado!=='undefined'&&!pausado&&Number.isFinite(data.etaMs)&&data.etaMs>=0){
   const eta=new Date(data.time+data.etaMs);
   text+=' · Llegada aprox. '+eta.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
  }
 }
 if(summary.textContent!==text)summary.textContent=text;
}
function navigationProfilePoints(){
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
  .finally(()=>{profileHeightsRequest=null;updateElevation()});
}
$('toggleProfile').onclick=()=>{
 if(mode==='create')profileCollapsed=!profileCollapsed;
 else{navProfileCollapsed=!navProfileCollapsed;if(!navProfileCollapsed)profileHeightsError=false}
 updateElevation();
};
// La cabecera también se puede tocar; el botón mantiene el acceso por teclado.
$('elevationPanel').querySelector('.elevation-head').addEventListener('click',e=>{
 if(!e.target.closest('button'))$('toggleProfile').click();
});
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
 if(!creating&&!collapsed)loadProfileHeights();
 const pts=creating?drawPoints:navigationProfilePoints(),available=pts.filter(p=>Number.isFinite(p[2]));
 panel.classList.toggle('profile-empty',pts.length<2||available.length<2);
 panel.classList.toggle('profile-distance-only',pts.length>=2&&available.length<2);
 if(pts.length<2||available.length<2){
  $('elevationPath').setAttribute('d','');$('elevationFill').setAttribute('d','');
  $('elevationEnd').style.display='none';
  const total=pts.reduce((sum,p,i)=>sum+(i?dist(pts[i-1],p):0),0);
  $('profileDistance').textContent=profileDistanceText(total,creating);$('profileGain').textContent='↑ —';$('profileLoss').textContent='↓ —';
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
 let desnivelCalculable=false;
 for(let i=0;i<pts.length;i++){
  if(i)travelled+=dist(pts[i-1],pts[i]);
  const elevation=Number.isFinite(pts[i][2])?pts[i][2]:null;
  if(elevation!==null){
   if(lastElev!==null){
    desnivelCalculable=true;
    const delta=elevation-lastElev;
    // Evitar sumar ruido centimétrico entre puntos interpolados.
    if(delta>0)up+=delta;else down-=delta;
   }
   lastElev=elevation;lastKnown=elevation;
  }else{lastElev=null}
  samples.push({d:travelled,h:elevation});
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
  const numero=i+1;
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
 updateElevation();
}
map.on('click',e=>{
 if(mode!=='create')return;
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
