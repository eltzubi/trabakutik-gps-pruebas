const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../nuevo.html'),'utf8');
const start=html.indexOf('let profileCollapsed=true,'),end=html.indexOf('function updateDraw(){',start);
assert(start>=0&&end>start);
function fixture(){
 const nodes=new Map(),calls=[];
 const node=id=>{if(!nodes.has(id)){
  const classes=new Set(),attrs={};
  nodes.set(id,{textContent:'',style:{},className:'',classList:{toggle(k,v){if(v)classes.add(k);else classes.delete(k)},contains:k=>classes.has(k)},setAttribute(k,v){attrs[k]=String(v)},getAttribute:k=>attrs[k]??null,querySelector:sel=>node(id+sel),addEventListener(type,fn){this[type]=fn},click(){this.onclick()}});
 }return nodes.get(id)};
 const c={$:node,mode:'nav',routePoints:[[0,0,100],[0,.001,105],[0,.002,110]],drawPoints:[],chosen:-1,tracks:[],datosDeRuta:{},tramosGps:[],redGps:null,
  dist:(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])*111195,
  fetch(){calls.push('fetch');return Promise.reject(Error('sin conexión'))},
  recording:true,navegaNativo:true,watch:1,guiaIniciada:()=>false};
 vm.createContext(c);vm.runInContext(html.slice(start,end),c);
 c.run=s=>vm.runInContext(s,c);c.calls=calls;return c;
}
test('Ruta empieza plegada; abrir y cerrar no cambia el GPS, la grabación ni los puntos',()=>{
 const c=fixture(),points=JSON.stringify(c.routePoints);c.updateElevation();
 assert(c.$('elevationPanel').classList.contains('collapsed'));
 assert.equal(c.$('toggleProfile').getAttribute('aria-expanded'),'false');
 c.$('toggleProfile').click();assert(!c.$('elevationPanel').classList.contains('collapsed'));
 assert.match(c.$('elevationPath').getAttribute('d'),/^M/);
 c.$('toggleProfile').click();
 assert.equal(c.recording,true);assert.equal(c.navegaNativo,true);assert.equal(c.watch,1);
 assert.equal(JSON.stringify(c.routePoints),points);assert.equal(c.calls.length,0);
});
test('Crear arranca con el gráfico plegado y recuerda su estado por separado de Ruta',()=>{
 const c=fixture();c.mode='create';c.drawPoints=c.routePoints;c.updateElevation();
 assert.equal(c.$('toggleProfile').getAttribute('aria-expanded'),'false');
 assert.equal(c.$('elevationTitle').textContent,'RESUMEN DE RUTA');
 assert.equal(c.$('profileGain').textContent,'↑ 10 m');
 c.$('toggleProfile').click();c.mode='nav';c.updateElevation();
 assert.equal(c.$('toggleProfile').getAttribute('aria-expanded'),'false');
 c.mode='create';c.updateElevation();assert.equal(c.$('toggleProfile').getAttribute('aria-expanded'),'true');
 c.mode='nav';c.updateElevation();assert.equal(c.$('toggleProfile').getAttribute('aria-expanded'),'false');
});
test('Sin ruta se oculta; sin alturas no inventa un perfil ni un desnivel cero',()=>{
 const c=fixture();c.routePoints=[];c.updateElevation();assert(c.$('elevationPanel').classList.contains('hidden'));
 c.routePoints=[[0,0],[0,.001]];c.updateElevation();
 assert(!c.$('elevationPanel').classList.contains('hidden'));assert(c.$('elevationPanel').classList.contains('profile-empty'));
 assert.equal(c.$('elevationPath').getAttribute('d'),'');assert.equal(c.$('profileGain').textContent,'↑ —');
 assert.equal(c.$('profileLow').textContent,'Sin alturas suficientes');
});
test('Las alturas se cargan solo al desplegar; un fallo de red deja un mensaje y permite reintentar',async()=>{
 const c=fixture();c.chosen=0;c.tracks=[{href:'ruta.html',points:[[0,0],[0,.001]]}];
 c.updateElevation();assert.equal(c.calls.length,0);c.$('toggleProfile').click();
 assert.equal(c.calls.length,1);await c.run('profileHeightsRequest');
 assert.equal(c.$('profileLow').textContent,'Sin alturas suficientes');
 c.$('toggleProfile').click();c.fetch=()=>{c.calls.push('retry');return Promise.resolve({ok:true,json:()=>({ruta:[100,120]})})};
 c.$('toggleProfile').click();await c.run('profileHeightsRequest');
 assert(c.calls.includes('retry'));assert(!c.$('elevationPanel').classList.contains('profile-empty'));
});
test('Cambiar de ruta mientras llegan las alturas muestra los datos de la selección actual',async()=>{
 const c=fixture();let resolve;
 c.chosen=0;c.tracks=[{href:'a.html',points:[[0,0],[0,.001]]},{href:'b.html',points:[[1,0],[1,.001]]}];
 c.fetch=()=>new Promise(r=>resolve=r);c.$('toggleProfile').click();
 c.chosen=1;c.routePoints=c.tracks[1].points;c.updateElevation();
 resolve({ok:true,json:()=>({a:[100,120],b:[400,450]})});await c.run('profileHeightsRequest');
 assert.equal(c.$('profileLow').textContent,'Mín. 400 m');assert.equal(c.$('profileHigh').textContent,'Máx. 450 m');
});
test('Un número de alturas incompatible no se asocia a puntos distintos y los huecos no se unen',()=>{
 const c=fixture();c.chosen=0;c.tracks=[{href:'ruta.html',points:[[0,0],[0,.001],[0,.002]]}];
 c.run('profileHeights={ruta:[100,120]}');c.updateElevation();assert(c.$('elevationPanel').classList.contains('profile-empty'));
 c.run('profileHeights={ruta:[100,null,120]}');c.updateElevation();
 const line=c.$('elevationPath').getAttribute('d');assert.equal((line.match(/M/g)||[]).length,2);assert(!line.includes('NaN'));assert.equal(c.$('profileGain').textContent,'↑ 0 m aprox.');
});
test('Las 70 rutas usan sus alturas alineadas y la distancia publicada, sin modificar sus tracks',()=>{
 const c=fixture();c.tracks=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/trailhead.json'))).tracks;
 const heights=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/alturas.json')));
 const metadata=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/rutas.json'))).es;
 for(const item of Object.values(metadata))c.datosDeRuta[item.h]=item.s;
 c.heights=heights;c.run('profileHeights=heights');const original=JSON.stringify(c.tracks);
 for(let i=0;i<c.tracks.length;i++){
  c.chosen=i;c.routePoints=c.tracks[i].points;c.updateElevation();
  assert(!c.$('elevationPanel').classList.contains('profile-empty'),c.tracks[i].href);
  assert(!/NaN|Infinity/.test(c.$('elevationPath').getAttribute('d')),c.tracks[i].href);
  assert.equal(c.$('profileDistance').textContent,c.datosDeRuta[c.tracks[i].href].match(/^[\d.,]+\s*km/)[0]);
 }
 assert.equal(JSON.stringify(c.tracks),original);
});

test('Crear indica el desnivel parcial con el gráfico plegado',()=>{
 const c=fixture();c.mode='create';c.drawPoints=[[0,0,100],[0,.001,115],[0,.002,null],[0,.003,95]];
 c.updateElevation();
 assert.equal(c.$('elevationSlope').textContent,'Desnivel parcial');
 assert.equal(c.$('profileGain').textContent,'↑ 15 m');
 assert.equal(c.$('profileLoss').textContent,'↓ 0 m');
 c.drawPoints=[[0,0,100],[0,.001,null],[0,.002,115]];
 c.updateElevation();
 assert.equal(c.$('elevationSlope').textContent,'Sin alturas suficientes');
 assert.equal(c.$('profileGain').textContent,'↑ —');
 assert.equal(c.$('profileLoss').textContent,'↓ —');
});

test('La posición del perfil usa el trazado activo y desaparece al caducar',()=>{
 const c=fixture();c.mode='nav';c.guiaIniciada=()=>true;c.fixVisualGps={time:Date.now()};
 c.$('toggleProfile').click();
 c.run('liveProfileAlong=55.5975');c.paintNavigationMetrics();
 assert(Math.abs(Number(c.$('elevationEnd').getAttribute('cx'))-200)<.001);
 assert.equal(c.$('elevationEnd').style.display,'');
 c.fixVisualGps.time-=10001;c.expireNavigationMetrics();
 assert.equal(c.$('elevationEnd').style.display,'none');
});

test('El perfil evita ubicarte sobre una geometría que solo coincide en longitud',()=>{
 const c=fixture();c.chosen=0;c.guiaIniciada=()=>true;c.tracks=[{href:'ruta.html',points:[[0,0],[0,.001],[0,.002]]}];
 c.run('profileHeights={ruta:[100,105,110]};navProfileCollapsed=false');
 c.updateElevation();c.run('liveProfileAlong=55.5975');c.paintNavigationMetrics();
 assert.equal(c.$('elevationEnd').style.display,'none');
});
