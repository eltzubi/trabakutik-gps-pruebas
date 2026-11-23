// LA REFERENCIA DE LOS AVISOS (22 nov 2026). Dos comprobaciones sobre las
// rutas publicadas, con el codigo de produccion (pieza 08) y los datos reales
// de Rutas-Mallabia (la ruta fina y los cruces de OSM, como en el movil):
//
// 1. CRUCES REVISADOS (tests/referencia/cruces-revisados.json): lo que el
//    navegador DEBIA hacer en cruces que alguien miro con captura o en el
//    terreno, con su fuente fechada. «Callar» tambien es un resultado. Se
//    compara la DECISION (callar, gira, sigue recto, rotonda…, con su lado y
//    su salida), no la frase: la redaccion cambia y la decision no deberia.
// 2. LA FOTO (tests/referencia/avisos.json): todo lo que dice hoy en las
//    rutas, ida y vuelta. No dice si esta bien: dice QUE HA CAMBIADO, para
//    mirar uno a uno los avisos que una regla nueva mueve en cruces que nadie
//    ha revisado.
//
// La foto no lleva coordenadas, solo kilometros. Los revisados llevan el
// punto solo a mas de 1,5 km de Trabakua: nunca el sitio de la casa.
//
//   node scripts/avisos-referencia.cjs                  compara las dos
//   node scripts/avisos-referencia.cjs --escribe-foto   la foto pasa a ser lo de hoy
//   node scripts/avisos-referencia.cjs --ancla <ruta> <ida|vuelta> <km>
//        lo que hay en ese sitio, para apuntar un cruce revisado
//
// Los datos se leen de ../Rutas-Mallabia o de RUTAS_MALLABIA=<ruta>. Sin
// ellos no se puede comprobar nada: lo dice y sale con 2, no con 0.
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const {pieza}=require('../tests/pieza.cjs');

const RAIZ=path.join(__dirname,'..');
const DATOS=process.env.RUTAS_MALLABIA||path.join(RAIZ,'..','Rutas-Mallabia');
const FOTO=path.join(RAIZ,'tests/referencia/avisos.json');
const REVISADOS=path.join(RAIZ,'tests/referencia/cruces-revisados.json');
const CERCA_M=30;          // un aviso a esto del cruce revisado es «suyo»
const RUMBO_TOLERA=45;     // llegada y salida: mas que esto, la ruta cambio ahi
const RUMBO_M=25;          // donde se mide la llegada y la salida
const SIN_PUNTO_M=1500;    // tan cerca de Trabakua no se apunta el punto

// --- el codigo de produccion -------------------------------------------------
const mapa=fs.readFileSync(path.join(RAIZ,'src/js/02-mapa.js'),'utf8');
const geo={R:Math.PI/180};
vm.runInNewContext([
 mapa.match(/^const dist=.*$/m)[0],
 mapa.match(/^function bearingBetween\(a,b\).*$/m)[0],
 'Object.assign(this,{dist,bearingBetween})'
].join('\n'),geo);
const servicio=fs.readFileSync(path.join(RAIZ,'src/js/07-servicio.js'),'utf8');
vm.runInNewContext(servicio.match(/^function versionMayor\(a,b\)\{[\s\S]*?^\}/m)[0],geo);
const {dist,bearingBetween}=geo;
const nodo={classList:{add(){},remove(){},toggle(){}},style:{setProperty(){},removeProperty(){}}};

function cruces(){
 return pieza('08-cruces.js',{
  versionMayor:geo.versionMayor,R:geo.R,dist,bearingBetween,routePoints:[],
  junctions:[],junctionsReves:null,junctionWarned:new Set(),junctionZoomOnce:new Set(),
  routeCumulative:[],crucesOsm:[],turnMarker:null,junctionActive:-1,junctionBlocked:-1,
  junctionZoom:null,autoZooming:false,$:()=>nodo,notice(){},syncNativeRoute(){},
  tracks:[],chosen:-1,
  window:{TrabakutikAndroid:{getAppVersion:()=>'9.9.99',setJunctions(){},setJunctionsReves(){}}}
 });
}

// --- los datos ---------------------------------------------------------------
const huella=b=>crypto.createHash('sha256').update(b).digest('hex').slice(0,12);
function leeJson(f){const b=fs.readFileSync(f);return {j:JSON.parse(b),h:huella(b)}}
function hayDatos(){return fs.existsSync(path.join(DATOS,'data/cruces-zona.json'))}

let c=null,zona=null,indice=null;const teselas=new Map(),huellas={};
function prepara(){
 if(c)return;
 c=cruces();
 const z=leeJson(path.join(DATOS,'data/cruces-zona.json'));
 zona=c.descifraZona(z.j);huellas['cruces-zona.json']=z.h;
 const f=path.join(DATOS,'data/cruces/indice.json');
 if(fs.existsSync(f)){const i=leeJson(f);indice=i.j;huellas['cruces/indice.json']=i.h}
}
function zonaDe(pts){
 if(!c.fueraDeZona(pts,zona.bbox)||!indice)return zona;
 const existe=new Set(indice.teselas.map(t=>t[0]+'_'+t[1])),lista=[zona];
 for(const k of c.teselasDeRuta(pts)){
  if(!existe.has(k))continue;
  if(!teselas.has(k)){
   const f=path.join(DATOS,'data/cruces/t_'+k+'.json');
   if(!fs.existsSync(f)){teselas.set(k,null);continue}
   const t=leeJson(f);huellas['cruces/t_'+k+'.json']=t.h;teselas.set(k,c.descifraZona(t.j));
  }
  if(teselas.get(k))lista.push(teselas.get(k));
 }
 return c.juntaZonas(lista);
}
// Las rutas, en el orden del navegador, y su trazado como lo carga el movil:
// el fino (1 m) si tiene 12.000 puntos o menos; si no, el del mapa general.
function rutas(){
 const t=JSON.parse(fs.readFileSync(path.join(RAIZ,'data/trailhead.json'),'utf8'));
 return (t.tracks||t).map(x=>x.href.replace(/\.html$/,''));
}
// BICI O ANDANDO, SEPARADO (23 nov 2026). Lo pidio el autor: «las normas
// tendrian que ser diferentes en algunas; para no ir rompiendo una cosa
// arreglando otra, porque la misma situacion no va para todos». Antes de
// separar ninguna regla hay que poder VER cual de las dos mitades mueve un
// cambio: hasta hoy la foto daba un numero solo y no se sabia. La actividad
// sale del color de la ficha, que es de donde la saca la pagina: teal es
// bici, violet es senderismo. Las que figuran en las dos cuentan en las dos.
function actividadDe(){
 const t=JSON.parse(fs.readFileSync(path.join(RAIZ,'data/trailhead.json'),'utf8'));
 const m={};
 for(const x of (t.tracks||t)){
  const slug=x.href.replace(/\.html$/,'');
  m[slug]=x.color==='teal'?'bici':x.color==='violet'?'andando':'(sin actividad)';
 }
 return m;
}
function trazado(slug){
 const t=JSON.parse(fs.readFileSync(path.join(RAIZ,'data/trailhead.json'),'utf8'));
 const gruesa=(t.tracks||t).find(x=>x.href===slug+'.html')?.points||[];
 const f=path.join(DATOS,'data/'+slug+'.json');
 if(!fs.existsSync(f))return {pts:gruesa.map(p=>[p[0],p[1]]),h:'sin-fino'};
 const {j,h}=leeJson(f),fina=j.tracks?.[0]?.points;
 const pts=Array.isArray(fina)&&fina.length>=2&&fina.length<=12000?fina:gruesa;
 return {pts:pts.map(p=>[p[0],p[1],Number.isFinite(p[2])?p[2]:null]),h};
}

// --- la decision de un aviso, sin la frase -----------------------------------
// Lo que el visitante tiene que HACER. La vuelta usa su propia lista, que ya
// trae el lado de quien va al reves.
function decision(j){
 if(j.rotonda)return {accion:'rotonda',lado:j.recto?'recto':j.direction==='vuelta'?'vuelta':j.hacia,...(j.salida?{salida:j.salida}:{})};
 if(j.deFrente)return {accion:'de-frente'};
 if(j.direction==='vuelta')return j.retorno?{accion:'da-la-vuelta'}:{accion:'herradura',lado:j.hacia};
 if(j.mantente)return {accion:j.noRecto?'sigue':'sigue-recto',lado:j.direction};
 if(j.sigue)return {accion:'sigue-curva',lado:j.direction};
 if(j.curvaNueva)return {accion:'curva',lado:j.direction};
 if(j.cruce===false)return {accion:'curva-cerrada',lado:j.direction};
 return {accion:'gira',lado:j.direction};
}
const texto=d=>d==='callar'?'callar':d.accion+(d.lado?' '+d.lado:'')+(d.salida?' salida '+d.salida:'');
const km=m=>(m/1000).toFixed(2).replace('.',',');

// Los avisos de una ruta, ida y vuelta, con el metro de la ruta tal como esta
// grabada (tambien los de la vuelta).
const calculadas=new Map();
function avisosDe(slug){
 if(calculadas.has(slug))return calculadas.get(slug);
 prepara();
 const {pts,h}=trazado(slug);
 c.tracks=[{href:slug+'.html'}];c.chosen=0;   // la correccion de Asuntza mira esto
 c.routePoints=pts;c.junctions=[];c.junctionsReves=null;c.crucesOsm=[];c.rotondasOsm=[];
 c.aplicaZona(zonaDe(pts),0,false);
 const cum=[0];for(let k=1;k<pts.length;k++)cum[k]=cum[k-1]+dist(pts[k-1],pts[k]);
 const r={pts,cum,h,ida:c.junctions.map(j=>({m:j.along,d:decision(j)})),
  vuelta:(c.junctionsReves||[]).map(j=>({m:j.along,d:decision(j)}))};
 calculadas.set(slug,r);
 return r;
}

// --- geometria para encontrar un cruce revisado ------------------------------
function enMetro(pts,cum,m){
 m=Math.max(0,Math.min(cum[cum.length-1],m));
 let k=1;while(k<cum.length-1&&cum[k]<m)k++;
 const l=cum[k]-cum[k-1],t=l>0?(m-cum[k-1])/l:0;
 return [pts[k-1][0]+t*(pts[k][0]-pts[k-1][0]),pts[k-1][1]+t*(pts[k][1]-pts[k-1][1])];
}
function rumbos(r,m,sentido){
 const p=enMetro(r.pts,r.cum,m),s=sentido==='vuelta'?-1:1;
 return {llega:Math.round((bearingBetween(enMetro(r.pts,r.cum,m-s*RUMBO_M),p)+360)%360),
         sale:Math.round((bearingBetween(p,enMetro(r.pts,r.cum,m+s*RUMBO_M))+360)%360)};
}
const difR=(a,b)=>Math.abs(((a-b)%360+540)%360-180);
let trabakua=null;
function lejosDeTrabakua(p){
 if(!trabakua)trabakua=trazado('trabakua').pts[0];
 return dist(p,trabakua)>SIN_PUNTO_M;
}
// Donde cae en la ruta el cruce revisado: por su punto si lo tiene (y entonces
// la pasada se elige por la llegada y la salida), si no por su kilometro. Y
// en los dos casos la llegada y la salida tienen que seguir cuadrando: si no,
// la ruta ha cambiado ahi y la ficha hay que volver a mirarla.
function encuentra(r,e){
 const candidatos=[];
 if(Array.isArray(e.lugar)){
  let pasada=null;
  for(let k=0;k<r.pts.length;k++){
   const d=dist(r.pts[k],e.lugar);
   if(d>CERCA_M)continue;
   if(!pasada||r.cum[k]-pasada.fin>60)candidatos.push(pasada={m:r.cum[k],d,fin:r.cum[k]});
   else{pasada.fin=r.cum[k];if(d<pasada.d){pasada.d=d;pasada.m=r.cum[k]}}
  }
 }else candidatos.push({m:e.km*1000});
 let mejor=null;
 for(const p of candidatos){
  const q=rumbos(r,p.m,e.sentido),err=Math.max(difR(q.llega,e.llega),difR(q.sale,e.sale));
  if(err>RUMBO_TOLERA)continue;
  const coste=err+Math.abs(p.m-e.km*1000)/100;
  if(!mejor||coste<mejor.coste)mejor={m:p.m,coste};
 }
 return mejor&&mejor.m;
}
function dicenAhi(r,sentido,m){
 return r[sentido].filter(a=>Math.abs(a.m-m)<=CERCA_M).sort((a,b)=>Math.abs(a.m-m)-Math.abs(b.m-m));
}
function cumple(debia,avisos){
 if(debia==='callar')return !avisos.length;
 return avisos.some(a=>Object.keys(debia).every(k=>a.d[k]===debia[k]));
}

// --- 1. los revisados --------------------------------------------------------
function compruebaRevisados(){
 const lista=JSON.parse(fs.readFileSync(REVISADOS,'utf8')).cruces;
 let mal=0;
 for(const e of lista){
  const r=avisosDe(e.ruta),donde=`${e.ruta} ${e.sentido} km ${km(e.km*1000)}`;
  const m=encuentra(r,e);
  if(m==null){mal++;console.log(`NO ENCONTRADO  ${donde}: la ruta ya no llega ni sale por ahi (llegada ${e.llega}°, salida ${e.sale}°). Vuelve a mirarlo.`);continue}
  const ahi=dicenAhi(r,e.sentido,m),hoy=ahi.length?ahi.map(a=>texto(a.d)).join(' + '):'callar';
  if(cumple(e.debia,ahi))console.log(`bien           ${donde}: ${hoy}`);
  else{mal++;console.log(`MAL            ${donde}: debia «${texto(e.debia)}» y hoy «${hoy}» · ${e.fuente}`)}
 }
 console.log(`Cruces revisados: ${lista.length-mal} bien, ${mal} mal`);
 return mal;
}

// --- 2. la foto --------------------------------------------------------------
function fotoDeHoy(){
 const salida={nota:'La escribe scripts/avisos-referencia.cjs --escribe-foto. No se edita a mano.',
  datos:null,rutas:{}};
 for(const slug of rutas()){
  const r=avisosDe(slug);
  salida.rutas[slug]={huella:r.h,
   ida:r.ida.map(a=>[+(a.m/1000).toFixed(3),texto(a.d)]),
   vuelta:r.vuelta.map(a=>[+(a.m/1000).toFixed(3),texto(a.d)])};
 }
 salida.datos=Object.fromEntries(Object.entries(huellas).sort());
 return salida;
}
// Empareja por kilometro (30 m) y cuenta lo que aparece, se va o cambia.
function comparaFoto(){
 const antes=JSON.parse(fs.readFileSync(FOTO,'utf8')),hoy=fotoDeHoy();
 const lineas=[];
 for(const [k,v] of Object.entries(hoy.datos))if(antes.datos?.[k]!==v)lineas.push(`datos cambiados: ${k}`);
 for(const slug of new Set([...Object.keys(antes.rutas),...Object.keys(hoy.rutas)])){
  const a=antes.rutas[slug],b=hoy.rutas[slug];
  if(!a){lineas.push(`${slug}: ruta nueva, ${b.ida.length} avisos de ida`);continue}
  if(!b){lineas.push(`${slug}: ya no esta`);continue}
  if(a.huella!==b.huella)lineas.push(`${slug}: su trazado ha cambiado (los kilometros pueden moverse)`);
  for(const s of ['ida','vuelta']){
   const quedan=b[s].slice(),cambios=[];
   for(const [m,t] of a[s]){
    let i=quedan.findIndex(([n,u])=>u===t&&Math.abs(n-m)<=CERCA_M/1000);
    if(i>=0){quedan.splice(i,1);continue}
    i=quedan.findIndex(([n])=>Math.abs(n-m)<=CERCA_M/1000);
    if(i>=0){cambios.push(`km ${km(m*1000)}: «${t}» → «${quedan[i][1]}»`);quedan.splice(i,1)}
    else cambios.push(`km ${km(m*1000)}: «${t}» → callar`);
   }
   for(const [n,u] of quedan)cambios.push(`km ${km(n*1000)}: callar → «${u}»`);
   for(const x of cambios.sort((p,q)=>parseFloat(p.slice(3).replace(',','.'))-parseFloat(q.slice(3).replace(',','.'))))lineas.push(`${slug} ${s} ${x}`);
  }
 }
 for(const l of lineas)console.log('  '+l);
 const avisos=Object.values(hoy.rutas).reduce((n,r)=>n+r.ida.length+r.vuelta.length,0);
 console.log(lineas.length?`Foto: ${lineas.length} diferencias (${avisos} avisos hoy). Si son buenas: --escribe-foto`
                          :`Foto: igual (${avisos} avisos en ${Object.keys(hoy.rutas).length} rutas, ida y vuelta)`);
 // Y el reparto, que es lo que dice si un cambio ha tocado una mitad o las dos.
 const act=actividadDe(),cuenta={},mueve={};
 for(const [slug,r] of Object.entries(hoy.rutas)){
  const a=act[slug]||'(sin actividad)';
  cuenta[a]=(cuenta[a]||0)+r.ida.length+r.vuelta.length;
  mueve[a]=mueve[a]||0;
 }
 for(const l of lineas){
  const slug=l.split(' ')[0].replace(/:$/,'');
  const a=act[slug];if(a)mueve[a]=(mueve[a]||0)+1;
 }
 console.log('  reparto: '+Object.keys(cuenta).sort().map(a=>
   `${a} ${cuenta[a]} avisos${lineas.length?` (${mueve[a]||0} movidos)`:''}`).join(' · '));
 return lineas.length;
}

// --- 3. para apuntar un cruce ------------------------------------------------
function ancla(slug,sentido,kmTexto){
 const r=avisosDe(slug),m=parseFloat(String(kmTexto).replace(',','.'))*1000;
 const q=rumbos(r,m,sentido),p=enMetro(r.pts,r.cum,m);
 const ficha={ruta:slug,sentido,km:+(m/1000).toFixed(3),llega:q.llega,sale:q.sale};
 if(lejosDeTrabakua(p))ficha.lugar=[+p[0].toFixed(5),+p[1].toFixed(5)];
 console.log(JSON.stringify(ficha));
 if(!ficha.lugar)console.log('(a menos de 1,5 km de Trabakua: sin punto, se encuentra por el kilometro)');
 for(const a of r[sentido].filter(a=>Math.abs(a.m-m)<=150))console.log(`  km ${km(a.m)}: ${texto(a.d)}`);
}

// --- 2 bis. dos avisos no pueden caer en el mismo sitio ----------------------
// Un aviso a menos de 5 m del anterior no es otra decision: es el mismo punto
// contado dos veces, y no cabe decirlo. Antes habia 24 parejas asi en las 75
// rutas, algunas contradiciendose. Esto no deja que vuelvan.
const MISMO_SITIO_M=5;
function miraElMismoSitio(){
 const malos=[];
 for(const slug of rutas()){
  const r=avisosDe(slug);
  for(const s of ['ida','vuelta']){
   const o=r[s].slice().sort((a,b)=>a.m-b.m);
   for(let i=1;i<o.length;i++)
    if(Math.abs(o[i].m-o[i-1].m)<MISMO_SITIO_M)
     malos.push(`${slug} ${s} km ${km(o[i].m)}: «${texto(o[i-1].d)}» y «${texto(o[i].d)}» a ${Math.round(Math.abs(o[i].m-o[i-1].m))} m`);
  }
 }
 for(const m of malos)console.log('  MISMO SITIO  '+m);
 console.log(malos.length?`Dos avisos en el mismo sitio: ${malos.length}`:'Mismo sitio: ninguno');
 return malos.length;
}

// --- 3. el reparto, para decidir si una regla tiene que separarse ------------
// «Las normas tendrian que ser diferentes en algunas; la misma situacion no va
// para todos» (el autor, 23 nov 2026). Esto no cambia nada: enseña como se
// reparten hoy los avisos entre las rutas de bici y las de andar, por
// kilometro y por tipo de decision. Es lo que hay que mirar antes de separar
// una regla, y otra vez despues.
function reparto(){
 const act=actividadDe(),tot={};
 for(const slug of rutas()){
  const a=act[slug]||'(sin actividad)';
  const r=avisosDe(slug);
  const t=tot[a]||(tot[a]={rutas:0,km:0,avisos:0,tipos:{}});
  t.rutas++;t.km+=r.cum[r.cum.length-1]/1000;
  for(const s of ['ida','vuelta'])for(const x of r[s]){
   t.avisos++;
   const clave=x.d==='callar'?'callar':x.d.accion;
   t.tipos[clave]=(t.tipos[clave]||0)+1;
  }
 }
 for(const a of Object.keys(tot).sort()){
  const t=tot[a];
  console.log(`\n${a.toUpperCase()}: ${t.rutas} rutas, ${t.km.toFixed(0)} km, ${t.avisos} avisos`
    +` (ida y vuelta) = ${(t.avisos/(2*t.km)).toFixed(1)} avisos por km`);
  for(const [k,n] of Object.entries(t.tipos).sort((x,y)=>y[1]-x[1]))
   console.log(`   ${String(n).padStart(5)}  ${(100*n/t.avisos).toFixed(1).padStart(5)}%  ${k}`);
 }
}

if(require.main===module){
 if(!hayDatos()){console.log(`AVISO: no estan los datos de Rutas-Mallabia en ${DATOS} (o RUTAS_MALLABIA=<ruta>). No se ha comprobado nada.`);process.exit(2)}
 const a=process.argv.slice(2);
 if(a[0]==='--ancla'){ancla(a[1],a[2]||'ida',a[3]);process.exit(0)}
 if(a[0]==='--reparto'){reparto();process.exit(0)}
 if(a[0]==='--escribe-foto'){
  fs.mkdirSync(path.dirname(FOTO),{recursive:true});
  const f=fotoDeHoy();
  fs.writeFileSync(FOTO,JSON.stringify(f,null,0).replace(/("[a-z0-9_-]+":\{"huella")/g,'\n$1')+'\n');
  console.log(`Foto escrita: ${Object.keys(f.rutas).length} rutas`);process.exit(0);
 }
 const mal=compruebaRevisados(),juntos=miraElMismoSitio(),cambios=comparaFoto();
 process.exit(mal||juntos||cambios?1:0);
}
module.exports={decision,texto,cumple,encuentra,rumbos,avisosDe};
