// LAS MARCAS ✋ DEL AUTOR, COMPROBADAS CON LOS DATOS DE HOY.
//
//   node scripts/marcas-campo.cjs            lo que pasa hoy en cada marca
//   node scripts/marcas-campo.cjs --estricto sale con 1 si alguna sigue mal
//
// Por que existe. CLAUDE.md pide que un aviso que falla se apunte ANTES de
// tocar la regla, con su fuente fechada. Las marcas que el autor hace en el
// monte son esa fuente, pero vivian en la pantalla del movil y se perdian; y
// sus rutas no siempre son de las 75 publicadas, asi que avisos-referencia.cjs
// no puede anclarlas. Aqui se guardan tal cual (tests/referencia/marcas-campo.json)
// y se miran todas de una vez: cuales ha resuelto ya un dato nuevo y cuales
// siguen vivas. Las que sigan vivas, y solo esas, pasan a cruces-revisados.json
// con lo que DEBIA hacer, que lo dice el autor.
//
// El trazado no se guarda en el repositorio: los GPX de sus salidas van en
// tests/referencia/trazados/, que no se sube. Sin el GPX la marca sale como
// «sin trazado» y no se cuenta como fallo.
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {pieza}=require('../tests/pieza.cjs');
const RAIZ=path.join(__dirname,'..');
const DATOS=process.env.RUTAS_MALLABIA||path.join(RAIZ,'..','Rutas-Mallabia');
const MARCAS=path.join(RAIZ,'tests/referencia/marcas-campo.json');
const TRAZADOS=path.join(RAIZ,'tests/referencia/trazados');
const CERCA_M=25;     // un aviso a esto de la marca es el de la marca
const MIRA_M=70;      // y hasta aqui se enseña lo que hay alrededor

const mapa=fs.readFileSync(path.join(RAIZ,'src/js/02-mapa.js'),'utf8');
const geo={R:Math.PI/180};
vm.runInNewContext([mapa.match(/^const dist=.*$/m)[0],mapa.match(/^function bearingBetween\(a,b\).*$/m)[0],
 'Object.assign(this,{dist,bearingBetween})'].join('\n'),geo);
const servicio=fs.readFileSync(path.join(RAIZ,'src/js/07-servicio.js'),'utf8');
vm.runInNewContext(servicio.match(/^function versionMayor\(a,b\)\{[\s\S]*?^\}/m)[0],geo);
const {dist,bearingBetween}=geo;
const nodo={classList:{add(){},remove(){},toggle(){}},style:{setProperty(){},removeProperty(){}}};
const c=pieza('08-cruces.js',{versionMayor:geo.versionMayor,R:geo.R,dist,bearingBetween,routePoints:[],
 junctions:[],junctionsReves:null,junctionWarned:new Set(),junctionZoomOnce:new Set(),routeCumulative:[],
 crucesOsm:[],turnMarker:null,junctionActive:-1,junctionBlocked:-1,junctionZoom:null,autoZooming:false,
 $:()=>nodo,notice(){},syncNativeRoute(){},tracks:[],chosen:-1,
 window:{TrabakutikAndroid:{getAppVersion:()=>'9.9.99',setJunctions(){},setJunctionsReves(){}}}});

function hayDatos(){return fs.existsSync(path.join(DATOS,'data/cruces-zona.json'))}
let zona=null,indice=null;
function datos(){
 if(zona)return;
 zona=c.descifraZona(JSON.parse(fs.readFileSync(path.join(DATOS,'data/cruces-zona.json'),'utf8')));
 const f=path.join(DATOS,'data/cruces/indice.json');
 if(fs.existsSync(f))indice=JSON.parse(fs.readFileSync(f,'utf8'));
}
function zonaDe(pts){
 datos();
 if(!c.fueraDeZona(pts,zona.bbox)||!indice)return zona;
 const existe=new Set(indice.teselas.map(t=>t[0]+'_'+t[1])),lista=[zona];
 for(const k of c.teselasDeRuta(pts)){
  if(!existe.has(k))continue;
  const f=path.join(DATOS,'data/cruces/t_'+k+'.json');
  if(fs.existsSync(f))lista.push(c.descifraZona(JSON.parse(fs.readFileSync(f,'utf8'))));
 }
 return c.juntaZonas(lista);
}
// El trazado: el de la ruta publicada si lo es, y si no el GPX que se haya
// dejado en tests/referencia/trazados/.
function trazado(m){
 const slug=String(m.ruta||'').toLowerCase();
 const fino=path.join(DATOS,'data/'+slug+'.json');
 if(fs.existsSync(fino)){
  const j=JSON.parse(fs.readFileSync(fino,'utf8')),p=j.tracks?.[0]?.points;
  if(Array.isArray(p)&&p.length>=2)return p.map(q=>[q[0],q[1]]);
 }
 const g=path.join(TRAZADOS,m.trazado||(slug+'.gpx'));
 if(!fs.existsSync(g))return null;
 const t=fs.readFileSync(g,'utf8');
 return [...t.matchAll(/lat="([\d.-]+)"\s+lon="([\d.-]+)"/g)].map(x=>[+x[1],+x[2]]);
}
const decision=j=>j.rotonda?'rotonda':j.deFrente?'de-frente'
 :j.direction==='vuelta'?(j.retorno?'da-la-vuelta':'herradura '+j.hacia)
 :j.mantente?(j.noRecto?'sigue ':'sigue-recto ')+j.direction
 :j.sigue?'sigue-curva '+j.direction:j.curvaNueva?'curva '+j.direction
 :j.cruce===false?'curva-cerrada '+j.direction:'gira '+j.direction;

if(!hayDatos()){
 console.log('AVISO: no estan los datos de Rutas-Mallabia en '+DATOS+' (o RUTAS_MALLABIA=<ruta>). No se ha comprobado nada.');
 process.exit(2);
}
const {marcas}=JSON.parse(fs.readFileSync(MARCAS,'utf8'));
const cache=new Map();
let vivas=0,resueltas=0,sinTrazado=0;
for(const m of marcas){
 const clave=m.trazado||m.ruta;
 if(!cache.has(clave)){
  const pts=trazado(m);
  if(!pts)cache.set(clave,null);
  else{
   c.routePoints=pts;c.junctions=[];c.junctionsReves=null;c.crucesOsm=[];c.rotondasOsm=[];
   c.aplicaZona(zonaDe(pts),0,false);
   const cum=[0];for(let k=1;k<pts.length;k++)cum[k]=cum[k-1]+dist(pts[k-1],pts[k]);
   cache.set(clave,{pts,cum,avisos:c.junctions.map(j=>({m:j.along,t:decision(j),g:j.angle,nodo:!!j.nodo}))});
  }
 }
 const r=cache.get(clave);
 const cabeza=m.ruta+' km '+String(m.km).replace('.',',')+' · '+(m.que==='sobraba'?'sobraba «'+m.aviso+'»':'faltó un aviso')+' · '+m.fecha;
 if(!r){sinTrazado++;console.log('\n'+cabeza+'\n   SIN TRAZADO · deja el GPX en tests/referencia/trazados/'+(m.trazado||''));continue}
 // EL KILOMETRO MANDA, NO EL PUNTO. En una ruta circular -la de Otzarreta
 // vuelve al parking- el punto mas cercano de una marca del km 7,45 cae en el
 // km 0,09, que es el mismo sitio del suelo pero la otra punta del recorrido,
 // y ahi los avisos son otros. El kilometro lo da la aplicacion y es el bueno;
 // el punto sirve para comprobar que la ruta es esa y no otra.
 const aqui=Math.max(0,Math.min(r.cum[r.cum.length-1],m.km*1000));
 let mejor=null;
 for(let k=0;k<r.pts.length;k++){
  if(Math.abs(r.cum[k]-aqui)>MIRA_M)continue;
  const d=dist(m.lugar,r.pts[k]);if(!mejor||d<mejor.d)mejor={d,k};
 }
 if(!mejor){
  sinTrazado++;
  console.log('\n'+cabeza+'\n   ESE KILOMETRO NO EXISTE EN ESTE TRAZADO · ¿es otra ruta?');
  continue;
 }
 // Una marca hecha estando FUERA de la ruta queda lejos del trazado, y no por
 // eso vale menos: el kilometro que da la aplicacion es el avance sobre la
 // ruta, que es con lo que se calculan los avisos. Se dice y se sigue.
 const fuera=mejor.d>CERCA_M?' · la marca se hizo a '+mejor.d.toFixed(0)+' m del trazado (ibas fuera de la ruta)':'';
 const cerca=r.avisos.filter(a=>Math.abs(a.m-aqui)<=MIRA_M);
 const suyo=cerca.filter(a=>Math.abs(a.m-aqui)<=CERCA_M);
 const bien=m.que==='sobraba'?!suyo.length:!!suyo.length;
 if(bien)resueltas++;else vivas++;
 console.log('\n'+cabeza+fuera);
 console.log('   hoy: '+(bien?'RESUELTA':'SIGUE')+(suyo.length?' · '+suyo.map(a=>'«'+a.t+' '+Math.round(a.g)+'°»').join(', '):' · sin aviso a '+CERCA_M+' m'));
 for(const a of cerca)if(!suyo.includes(a))
  console.log('      (cerca, a '+(a.m-aqui>0?'+':'')+Math.round(a.m-aqui)+' m: '+a.t+' '+Math.round(a.g)+'°'+(a.nodo?', nodo de OSM':', forma del track')+')');
}
console.log('\nMarcas: '+resueltas+' resueltas, '+vivas+' siguen vivas, '+sinTrazado+' sin trazado (de '+marcas.length+')');
if(vivas&&process.argv.includes('--estricto'))process.exit(1);
