// LOS TRES MODOS DE TRAZAR, QUE ESTABAN SIN BOTON. El codigo tenia los tres
// -el planificador de FOSSGIS, la red de las rutas de Trabakutik y la linea a
// mano- pero en la pantalla no habia forma de cambiar: siempre se usaba el
// planificador. Habia hasta un aviso que decia «Elige Manual para marcarlo»
// señalando a algo que no se podia elegir. Hizo falta por dos cosas que conto
// el autor: el planificador de a pie se mete por el apartadero de la parada
// de bus en vez de seguir la general -y es correcto por su parte, pero el no
// lo quiere-, y crear desde su casa manda esas coordenadas a un servicio de
// fuera, cosa que en Manual no pasa porque no se calcula nada.
//   0 Caminos : el planificador de FOSSGIS, por cualquier camino de OSM.
//   1 Manual  : lo que tocas, unido en linea recta. No manda nada fuera.
//
// EL TERCERO SE QUITO, Y NO SE VUELVE A PONER SIN QUE EL AUTOR LO PIDA. Habia
// un modo «Rutas» que calculaba por la red de los 71 trazados de la web, sin
// salirse de ellos. El autor lo dijo asi: «¿no podemos marcar las rutas
// tambien con caminos? ya que los tres es un poco liante». Y es verdad: sus
// rutas van por caminos de verdad, asi que el planificador normalmente las
// sigue igual. Lo que se pierde es la GARANTIA de no salirse; cuando se sale,
// para eso esta Manual. El codigo de esa red sigue estando -nodoCerca,
// tramoGps, redGps- porque lo usa el enganche de puntos; lo unico que se ha
// quitado es la posicion del boton.
// UN SOLO MODO DE DIBUJO: POR CAMINOS. Hubo tres, el autor dijo «los tres es
// un poco liante» y se quedaron dos: «Caminos» -por cualquier camino- y
// «Manual» -linea recta entre toques, sin calcular nada-. Manual ya solo
// servia para dos cosas, y las dos se han quedado sin sentido: forzar un
// tramo donde no hay camino, ahora que la red trae 6.656 km de OSM mas los
// 83 km de las rutas del autor que OSM no tiene; y no sacar coordenadas del
// movil, ahora que sin cobertura tambien se calcula aqui dentro. Lo que se
// pierde es cruzar campo a traves donde no hay camino ninguno.
// El codigo de la red local -nodoCerca, tramoGps, redGps- se queda: lo usan
// el prestamo de alturas (alturaCerca) y el guardado de las anclas.
const nodosManualesGps=new Set();

// LA ALTURA DE UN PUNTO MARCADO A MANO SE LA PRESTAN TUS RUTAS. Un punto
// manual nacia sin altura, y en Manual no se le pide a nadie -ese es el trato:
// ahi no sale una coordenada del movil-. Resultado: el perfil se quedaba con
// un hueco justo en el tramo hecho a mano y el desnivel no lo contaba. Lo vio
// el autor en su pantalla: «al cambiar de manual a caminos, en manual no
// marca el grafico».
// Los nodos de la red SI tienen altura -salen de data/alturas.json, que el
// creador ya se baja-, asi que se coge la del punto de tus rutas mas cercano
// si esta a 60 m o menos. Mas lejos no se inventa nada: se queda sin altura,
// que es la verdad -ahi no hay ninguna ruta tuya de la que copiarla-.
const alturaCerca=(()=>{
 const ALTURA_PRESTADA_M=60;
 return function alturaCerca(lat,lon){
  if(!redGps)return null;
  const n=nodoCerca(redGps,lat,lon);
  if(n<0)return null;
  const q=redGps.nodos[n];
  if(!Number.isFinite(q&&q[2]))return null;
  return metros(q,[lat,lon])<=ALTURA_PRESTADA_M?q[2]:null;
 };
})();
function nodoManualGps(lat,lon,elevation=null){
 const n=redGps.nodos.length;
 const h=Number.isFinite(elevation)?elevation:alturaCerca(lat,lon);
 redGps.nodos.push([lat,lon,Number.isFinite(h)?h:null]);redGps.ady.push([]);nodosManualesGps.add(n);
 return n;
}
function tramoGps(a,b,manual=trazadoManual){
 if(manual||nodosManualesGps.has(a)||nodosManualesGps.has(b)){
  const tr=a===b?[a]:[a,b];tr.manual=true;return tr;
 }
 return camino(redGps,a,b);
}
function invierteTramoGps(tr){
 const vuelta=tr.slice().reverse();if(tr.manual)vuelta.manual=true;return vuelta;
}
// Cálculo por la red peatonal de OpenStreetMap. Un error nunca se convierte
// en una recta ni en una ruta por el grafo de tracks de Trabakutik.
let seguirMapaGps=true,calculoMapaGps=0,peticionMapaGps=null,calculandoMapaGps=false;
let permisoMapaGps=false,ultimaPeticionMapaGps=0;
function estadoMapaGps(texto,ofreceRecta){
 const el=$('plannerStatus');el.textContent=texto;el.classList.toggle('hidden',!texto);
 // LA SALIDA CUANDO NO HAY CAMINO. El mapa del IGN dibuja sendas que
 // OpenStreetMap no tiene, y ahi el lapiz no puede calcular nada. Antes el
 // unico camino era rendirse. El boton solo aparece cuando hace falta -no
 // ocupa sitio el resto del tiempo- y lo que mete va en linea recta y
 // marcado como tal: a rayas en el mapa y contado aparte.
 if(ofreceRecta){
  const b=document.createElement('button');
  b.type='button';b.id='uneRecta';b.className='une-recta';
  b.textContent='Unir en recta';
  b.title='Traza este tramo a mano, en línea recta, porque no hay camino en el mapa';
  b.onclick=uneEnRectaMapa;
  el.append(b);
 }
}
function cancelaMapaGps(){
 calculoMapaGps++;if(peticionMapaGps)peticionMapaGps.abort();
 peticionMapaGps=null;calculandoMapaGps=false;
}
function coordenadaMapaGps(p){
 return Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&Math.abs(p[0])<=90&&Math.abs(p[1])<=180;
}
// EL PLANIFICADOR ES VALHALLA EN MODO PEATON, NO EL «A PIE» DE OSRM.
// Lo conto el autor dos veces: «se mete por el apartadero de la parada de bus
// de Apoita en vez de seguir la BI-633» y «no hay forma de que marque el
// camino recto sin que haga salir y entrar». No era su mapa ni sus puntos: el
// perfil a pie de OSRM prefiere cualquier camino de servicio antes que la
// carretera, y al lado del puente de la BI-633 hay uno de 196 m a 18 metros.
//
// MEDIDO, EN EL PUENTE DE LA BI-633 (43.2063 a 43.2095):
//   OSRM a pie   608 m, se sale 43 m de la carretera   <- lo que veia el autor
//   OSRM bici    540 m, 0 m
//   Valhalla pie 540 m, 0 m
// Y EN LA PARADA DE APOITA: OSRM a pie 460 m / 18 m fuera; Valhalla 446 / 0.
//
// POR QUE NO LA BICI, QUE TAMBIEN LO ARREGLABA: respeta los sentidos unicos, y
// un peaton no. De 6 calles de sentido unico de la zona recorridas al reves,
// en 2 la bici da un rodeo del doble (una de 341 m se va a 649). Valhalla en
// peaton las pasa de largo, como se anda.
// Y NO SE PUEDE ARREGLAR DENTRO DE OSRM: su perfil a pie no admite «exclude»
// -probado, lo rechaza- y no ofrece rutas alternativas en ese punto.
//
// EN EL MONTE NO CAMBIA NADA: 24 tramos de 400 m sacados al azar de las 72
// rutas del autor, 23 identicos metro a metro.
//
// EL SERVIDOR ES EL MISMO QUE YA SE USA PARA LAS ALTURAS, asi que esto no
// añade peticiones a nadie: mueve la del planificador de un servidor de
// FOSSGIS a otro. Se mantiene el limite de una peticion por segundo largo.
const URL_PLANIFICADOR='https://valhalla1.openstreetmap.de/route';
// VALHALLA SE INVENTA RODEOS DONDE NO HAY CAMINO. Donde OSRM decia
// honestamente «no hay conexion», Valhalla devuelve una vuelta enorme: en un
// tramo de 176 m en linea recta del autor devolvio 11,4 km. Medido sobre 22
// tramos suyos, los 21 sanos no pasan de 2,13 veces la linea recta. Con el
// tope en 4 se separan de sobra y se dice lo mismo que decia OSRM.
const RODEO_MAXIMO=4;
// La geometria de Valhalla viene como polilinea codificada con 6 decimales.
function descodificaValhalla(texto){
 if(typeof texto!=='string'||!texto)return [];
 const pts=[];let i=0,lat=0,lon=0;
 while(i<texto.length){
  let desp=0,res=0,b;
  do{b=texto.charCodeAt(i++)-63;res|=(b&0x1f)<<desp;desp+=5}while(b>=0x20);
  lat+=(res&1)?~(res>>1):(res>>1);
  desp=0;res=0;
  do{b=texto.charCodeAt(i++)-63;res|=(b&0x1f)<<desp;desp+=5}while(b>=0x20);
  lon+=(res&1)?~(res>>1):(res>>1);
  // Redondear a los 6 decimales que trae Valhalla. Sin esto, 1e-6 por un
  // entero deja basura de coma flotante: -1999000*1e-6 no es -1.999, es
  // -1.9989999999999999, y eso se arrastra hasta el GPX.
  const p=[Number((lat*1e-6).toFixed(6)),Number((lon*1e-6).toFixed(6))];
  if(!pts.length||dist(pts[pts.length-1],p)>.01)pts.push(p);
 }
 return pts;
}
// ========= LOS CAMINOS GUARDADOS, PARA CUANDO NO HAY COBERTURA ===========
// El modo «Caminos» del creador calcula con Valhalla, que es lo mejor que
// hay -sabe de sentidos unicos, de accesos y de por donde se anda- y por eso
// manda. Pero necesita red, y en el monte no la hay: ahi el creador se
// quedaba en «revisa la conexion» y no se podia rehacer un tramo.
//
// Asi que cuando Valhalla no contesta se calcula AQUI, con la misma red de
// caminos que usa el lapiz de la web: 41.632 cruces, 52.567 tramos y 6.656
// km de OpenStreetMap, mas los 83 km de las rutas del autor que OSM no
// tiene. Se baja una vez -638 KB- y el service worker la guarda, asi que a
// partir de la primera vez que abras el creador con cobertura la tienes
// siempre. Valhalla sigue siendo el primero: esto es la red de seguridad.
//
// Los nodos son solo los cruces y la forma del camino va colgada de cada
// tramo; con 6.656 km, guardar punto a punto serian 1,3 millones de nodos y
// en un movil no caben. Y el toque se pega al punto mas cercano DEL CAMINO,
// no al cruce mas cercano: entre cruce y cruce hay 127 m de media.
// La red se cierra sobre si misma: fuera solo se ven redOsm -que leen el
// creador y las pruebas-, la descarga, el enganche y el calculo. Lo demas
// (costes, rejilla, Dijkstra) no lo toca nadie mas.
let redOsm=null;
const {cargaCaminosOsm,enganchaOsm,rutaOsm,descifraCaminos}=(()=>{
const URL_CAMINOS='https://raw.githubusercontent.com/eltzubi/Rutas-Mallabia/main/data/caminos-zona.json';
// Lo que cuesta un metro de cada clase: 0 sendero, 1 pista, 2 calle,
// 3 carretera, 4 bidegorri, 5 nacional, 6 privado, 7 grabado por el autor.
const COSTE_VIA=[1,1,1.05,1.35,1,3,5,1];
const ENGANCHE_OSM=120,CELDA_OSM=100,PASO_CESTA_OSM=40;
// LA REJILLA VA CON UNA SOLA ESCALA, LA MISMA AL GUARDAR QUE AL BUSCAR. Antes
// se guardaba con el coseno de la latitud del PRIMER cruce del fichero (43,12)
// y se buscaba con el del punto tocado. Como la longitud entra entera -unos
// 200 km a 2,5 grados-, medio grado de diferencia en el coseno movia la celda
// varias casillas: al norte de 43,23 el toque buscaba donde no estaba el
// camino. Medido con la red de verdad, 541 toques encima de un camino: 207
// sin enganchar, y de Markina para arriba casi todos. La escala de la rejilla
// es solo un casillero; las distancias de verdad siguen con su coseno.
const KX_CELDA_OSM=Math.cos(43.2*Math.PI/180)*111195;
let pideRedOsm=null;

function descifraCaminos(j){
 if(!j||!Array.isArray(j.nodos)||!Array.isArray(j.tramos))throw Error('caminos-zona.json no valido');
 const esc=j.escala||100000,dn=j.nodos,n=dn.length/2;
 const lat=new Float64Array(n),lon=new Float64Array(n);
 let x=0,y=0,i,k;
 for(i=0;i<n;i++){x+=dn[2*i];y+=dn[2*i+1];lat[i]=x/esc;lon[i]=y/esc}
 const t=j.tramos,ini=[],fin=[],cls=[],lar=[],geo=[];
 i=0;
 while(i+4<t.length){
  const a=t[i],b=t[i+1],c=t[i+2],largo=t[i+3],kk=t[i+4];i+=5;
  const g=new Float64Array(kk*2);
  let gx=Math.round(lat[a]*esc),gy=Math.round(lon[a]*esc);
  for(k=0;k<kk;k++){gx+=t[i];gy+=t[i+1];i+=2;g[2*k]=gx/esc;g[2*k+1]=gy/esc}
  ini.push(a);fin.push(b);cls.push(c);lar.push(largo);geo.push(g);
 }
 const m=ini.length;
 if(!m)throw Error('caminos-zona.json vacio');
 const grado=new Int32Array(n);
 for(k=0;k<m;k++){grado[ini[k]]++;grado[fin[k]]++}
 const arranque=new Int32Array(n+1);
 for(i=0;i<n;i++)arranque[i+1]=arranque[i]+grado[i];
 const cursor=arranque.slice(0,n);
 const vecino=new Int32Array(2*m),porTramo=new Int32Array(2*m);
 for(k=0;k<m;k++){
  vecino[cursor[ini[k]]]=fin[k];porTramo[cursor[ini[k]]++]=k;
  vecino[cursor[fin[k]]]=ini[k];porTramo[cursor[fin[k]]++]=k;
 }
 const red={lat,lon,n,m,ini:Int32Array.from(ini),fin:Int32Array.from(fin),
  clase:Uint8Array.from(cls),largo:Float32Array.from(lar),geo,
  arranque,vecino,porTramo,cestas:new Map()};
 for(k=0;k<m;k++){
  const pts=puntosTramoOsm(red,k);let visto='';
  for(i=1;i<pts.length;i++){
   const p=pts[i-1],q=pts[i],d=dist(p,q),pasos=Math.max(1,Math.ceil(d/PASO_CESTA_OSM));
   for(let s=0;s<=pasos;s++){
    const f=s/pasos;
    const cx=Math.round((p[0]+(q[0]-p[0])*f)*111195/CELDA_OSM);
    const cy=Math.round((p[1]+(q[1]-p[1])*f)*KX_CELDA_OSM/CELDA_OSM);
    const key=cx+':'+cy;
    if(key===visto)continue;
    visto=key;
    let l=red.cestas.get(key);
    if(!l)red.cestas.set(key,l=[]);
    if(l[l.length-1]!==k)l.push(k);
   }
  }
 }
 return red;
}
function puntosTramoOsm(red,k){
 const g=red.geo[k],out=[[red.lat[red.ini[k]],red.lon[red.ini[k]]]];
 for(let i=0;i<g.length;i+=2)out.push([g[i],g[i+1]]);
 out.push([red.lat[red.fin[k]],red.lon[red.fin[k]]]);
 return out;
}
function cargaCaminosOsm(){
 if(redOsm)return Promise.resolve(redOsm);
 if(pideRedOsm)return pideRedOsm;
 pideRedOsm=fetch(URL_CAMINOS,{cache:'default'})
  .then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()})
  .then(j=>{redOsm=descifraCaminos(j);return redOsm})
  .catch(e=>{pideRedOsm=null;console.warn('Caminos de la zona no disponibles',e);return null});
 return pideRedOsm;
}
function enganchaOsm(red,lat,lon){
 const kx=Math.cos(lat*R)*111195,ky=111195;
 const cx=Math.round(lat*111195/CELDA_OSM),cy=Math.round(lon*KX_CELDA_OSM/CELDA_OSM);
 let mejor=null,mejorD=ENGANCHE_OSM;
 const mirados=new Set();
 for(let dx=-2;dx<=2;dx++)for(let dy=-2;dy<=2;dy++){
  const l=red.cestas.get((cx+dx)+':'+(cy+dy));
  if(!l)continue;
  for(const k of l){
   if(mirados.has(k))continue;
   mirados.add(k);
   const pts=puntosTramoOsm(red,k);
   for(let i=1;i<pts.length;i++){
    const ax=(pts[i-1][1]-lon)*kx,ay=(pts[i-1][0]-lat)*ky;
    const bx=(pts[i][1]-pts[i-1][1])*kx,by=(pts[i][0]-pts[i-1][0])*ky;
    const nn=bx*bx+by*by;
    const tt=nn?Math.max(0,Math.min(1,-(ax*bx+ay*by)/nn)):0;
    const d=Math.hypot(ax+tt*bx,ay+tt*by);
    if(d<mejorD){
     mejorD=d;
     mejor={tr:k,seg:i-1,t:tt,p:[pts[i-1][0]+(pts[i][0]-pts[i-1][0])*tt,
                                 pts[i-1][1]+(pts[i][1]-pts[i-1][1])*tt]};
    }
   }
  }
 }
 return mejor;
}
function haciaExtremoOsm(red,anc,hacia){
 const pts=puntosTramoOsm(red,anc.tr),out=[anc.p.slice()];
 let i;
 if(hacia>0)for(i=anc.seg+1;i<pts.length;i++)out.push(pts[i]);
 else for(i=anc.seg;i>=0;i--)out.push(pts[i]);
 let largo=0;
 for(i=1;i<out.length;i++)largo+=dist(out[i-1],out[i]);
 return {pts:out,largo};
}
function dijkstraOsm(red,origenes){
 const n=red.n;
 const coste=new Float64Array(n);coste.fill(Infinity);
 const antes=new Int32Array(n);antes.fill(-1);
 const porDonde=new Int32Array(n);porDonde.fill(-1);
 const visto=new Uint8Array(n);
 const heap=[];
 const sube=i=>{while(i>0){const p=(i-1)>>1;if(heap[p][0]<=heap[i][0])break;
  const t=heap[p];heap[p]=heap[i];heap[i]=t;i=p}};
 const baja=i=>{for(;;){const l=2*i+1,r=l+1;let m=i;
  if(l<heap.length&&heap[l][0]<heap[m][0])m=l;
  if(r<heap.length&&heap[r][0]<heap[m][0])m=r;
  if(m===i)break;const t=heap[m];heap[m]=heap[i];heap[i]=t;i=m}};
 for(const o of origenes)if(o.coste<coste[o.nodo]){coste[o.nodo]=o.coste;heap.push([o.coste,o.nodo]);sube(heap.length-1)}
 while(heap.length){
  const top=heap[0];
  heap[0]=heap[heap.length-1];heap.pop();if(heap.length)baja(0);
  const u=top[1];
  if(visto[u])continue;
  visto[u]=1;
  for(let e=red.arranque[u];e<red.arranque[u+1];e++){
   const v=red.vecino[e],k=red.porTramo[e];
   const nd=top[0]+red.largo[k]*COSTE_VIA[red.clase[k]];
   if(nd<coste[v]){coste[v]=nd;antes[v]=u;porDonde[v]=k;heap.push([nd,v]);sube(heap.length-1)}
  }
 }
 return {coste,antes,porDonde,visto};
}
function rutaOsm(red,A,B){
 if(!A||!B)return null;
 let out,i;
 if(A.tr===B.tr){
  const pts=puntosTramoOsm(red,A.tr);
  const delante=(B.seg>A.seg)||(B.seg===A.seg&&B.t>=A.t);
  out=[A.p.slice()];
  if(delante)for(i=A.seg+1;i<=B.seg;i++)out.push(pts[i]);
  else for(i=A.seg;i>B.seg;i--)out.push(pts[i]);
  out.push(B.p.slice());
  return limpiaRuta(out);
 }
 const aIni=haciaExtremoOsm(red,A,-1),aFin=haciaExtremoOsm(red,A,1);
 const bIni=haciaExtremoOsm(red,B,-1),bFin=haciaExtremoOsm(red,B,1);
 const fA=COSTE_VIA[red.clase[A.tr]],fB=COSTE_VIA[red.clase[B.tr]];
 const res=dijkstraOsm(red,[{nodo:red.ini[A.tr],coste:aIni.largo*fA},
                            {nodo:red.fin[A.tr],coste:aFin.largo*fA}]);
 let mejor=null,mejorC=Infinity;
 for(const mt of [{nodo:red.ini[B.tr],cola:bIni,coste:bIni.largo*fB},
                  {nodo:red.fin[B.tr],cola:bFin,coste:bFin.largo*fB}]){
  if(!res.visto[mt.nodo])continue;
  const c=res.coste[mt.nodo]+mt.coste;
  if(c<mejorC){mejorC=c;mejor=mt}
 }
 if(!mejor)return null;
 const cadena=[];let x=mejor.nodo;
 while(x!==-1&&res.porDonde[x]>=0){cadena.push({hasta:x,tramo:res.porDonde[x]});x=res.antes[x]}
 cadena.reverse();
 out=(x===red.ini[A.tr]?aIni:aFin).pts.slice();
 for(const paso of cadena){
  const k=paso.tramo,pts=puntosTramoOsm(red,k);
  if(paso.hasta===red.fin[k])for(i=1;i<pts.length;i++)out.push(pts[i]);
  else for(i=pts.length-2;i>=0;i--)out.push(pts[i]);
 }
 const cola=mejor.cola.pts.slice().reverse();
 for(i=1;i<cola.length;i++)out.push(cola[i]);
 return limpiaRuta(out);
}
function limpiaRuta(pts){
 const out=[];let ultimo=null;
 for(const p of pts){
  if(ultimo&&dist(ultimo,p)<0.5)continue;
  ultimo=p;out.push([p[0],p[1]]);
 }
 return out.length>1?out:null;
}
 return {cargaCaminosOsm,enganchaOsm,rutaOsm,descifraCaminos};
})();
// El mismo {anchors, parts} que devuelve Valhalla, para que lo de abajo no
// tenga que saber de donde vino el recorrido.
// Un error de «por ahi no se puede pasar», marcado para distinguirlo de uno
// de «el servicio no contesta»: el aviso que se le da al autor no es el mismo.
const noHayPaso=t=>{const e=Error(t);e.sinCamino=true;return e};
// Para las pruebas: en la pagina «module» no existe y esto no hace nada.
if(typeof module==='object'&&module&&module.exports)module.exports={descifraCaminos,enganchaOsm,rutaOsm,cargaCaminosOsm,descodificaValhalla,noHayPaso,RODEO_MAXIMO};
