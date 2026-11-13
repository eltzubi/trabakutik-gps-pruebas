const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
test('La caché reconoce IGN y PNOA, sin incluir otros servicios IGN',()=>{
 const context={URL,self:{addEventListener(){}},caches:{}};vm.createContext(context);
 vm.runInContext(fs.readFileSync(path.join(root,'sw.js'),'utf8'),context);
 for(const layer of ['mapa-raster','pnoa-ma'])assert(context.esTesela('https://www.ign.es/wmts/'+layer+'?REQUEST=GetTile&TILEMATRIX=14&TILEROW=2&TILECOL=3'));
 assert(!context.esTesela('https://www.ign.es/wmts/pnoa-ma?REQUEST=GetCapabilities'));
 assert(!context.esTesela('https://otro.es/wmts/pnoa-ma?REQUEST=GetTile'));
});
for(const file of ['nuevo.html']){
 const html=fs.readFileSync(path.join(root,file),'utf8');
 function runner(fetch){
  let fire,cleared=false;
  const c={fetch,AbortController,setTimeout(fn,ms){assert.equal(ms,15000);fire=fn;return 1},clearTimeout(){cleared=true}};
  vm.createContext(c);vm.runInContext(html.slice(html.indexOf('async function fetchRouteJson('),html.indexOf('let selectedRouteRequest=0;')),c);
  return {c,fire:()=>fire(),cleared:()=>cleared};
 }
 test(file+': una respuesta HTTP inválida no se interpreta como ruta',async()=>{
  const r=runner(async()=>({ok:false,status:503}));await assert.rejects(r.c.fetchRouteJson('/ruta'),/503/);assert(r.cleared());
 });
 test(file+': el límite incluye un cuerpo JSON atascado',async()=>{
  const r=runner(async(url,{signal})=>({ok:true,json:()=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))))}));
  const result=r.c.fetchRouteJson('/ruta');await new Promise(resolve=>setImmediate(resolve));r.fire();await assert.rejects(result,/aborted/);assert(r.cleared());
 });
 test(file+': tocar el interior conserva el panel; el fondo lo cierra',()=>{
  const nodes={};let closed=0;
  for(const id of ['routeDialog','savedDialog','saveDialog','closeDialog','closeSaved'])nodes[id]={addEventListener(t,fn){this.fn=fn},click(){closed++}};
  const c={$:id=>nodes[id],closeSaveDialog(){closed++},document:{addEventListener(){}}};vm.createContext(c);
  vm.runInContext(html.slice(html.indexOf('// Tocar el panel'),html.indexOf("if('serviceWorker' in navigator){")),c);
  nodes.routeDialog.fn({target:{}});assert.equal(closed,0);
  nodes.routeDialog.fn({target:nodes.routeDialog});assert.equal(closed,1);
  nodes.saveDialog.fn({target:nodes.saveDialog});assert.equal(closed,2);
 });
}

// EL SERVICE WORKER, PROBADO POR LO QUE HACE Y NO POR SU TEXTO. Dos fallos del
// repaso de noviembre de 2026: un 404/503 del servidor tapaba la copia buena
// guardada, y sin plazo la app esperaba minutos con cobertura mala.
function trabajador({red,copias={},plazoYa=false}){
 const guardadas=new Map(Object.entries(copias)),puestas=[],esperas=[];
 let fetchHandler;
 const caches={
  match:async(req)=>{const u=typeof req==='string'?req:req.url;return guardadas.get(u)||guardadas.get(u.replace(/^.*\//,''))||undefined},
  open:async()=>({put:async(req,resp)=>{puestas.push(req.url||req);guardadas.set(req.url||req,resp)},keys:async()=>[],delete:async()=>{}}),
  keys:async()=>[]
 };
 class Respuesta{constructor(cuerpo,init={}){if((init.status===204||init.status===205)&&cuerpo!=null)throw TypeError('sin cuerpo');this.cuerpo=cuerpo;this.ok=(init.status||200)<300;this.status=init.status||200}static error(){return {error:true}}}
 const pedidas=[];
 const c={URL,caches,Response:Respuesta,Request:class{constructor(url,op){this.url=url;this.mode=op&&op.mode}},Promise,
  setTimeout:(fn,ms)=>{if(plazoYa)queueMicrotask(fn);return 1},clearTimeout(){},
  fetch:(req)=>{pedidas.push(req);return red(req)},
  self:{location:{origin:'https://eltzubi.github.io'},addEventListener:(t,fn)=>{if(t==='fetch')fetchHandler=fn},skipWaiting(){},clients:{claim(){}}}};
 vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(root,'sw.js'),'utf8'),c);
 return {pide:async(url,extra={})=>{let respuesta;
  fetchHandler({request:{method:'GET',url,mode:'cors',destination:'',...extra},respondWith:p=>{respuesta=p},waitUntil:p=>esperas.push(p)});
  const r=await respuesta;if(!extra.sinEsperar)await Promise.all(esperas);return r},puestas,pedidas};
}
const ok=(cuerpo)=>({ok:true,status:200,type:'basic',cuerpo,headers:{},clone(){return this},blob:async()=>cuerpo});
test('Service worker: con un 503 del servidor se usa la copia guardada',async()=>{
 const url='https://eltzubi.github.io/trabakutik-gps-pruebas/data/trailhead.json';
 const w=trabajador({red:async()=>({ok:false,status:503}),copias:{[url]:ok('copia')}});
 assert.equal((await w.pide(url)).cuerpo,'copia');
});
test('Service worker: una navegacion con error y sin copia exacta abre la pagina guardada',async()=>{
 const w=trabajador({red:async()=>({ok:false,status:404}),copias:{'nuevo.html':ok('pagina')}});
 assert.equal((await w.pide('https://eltzubi.github.io/trabakutik-gps-pruebas/nuevo.html?ruta=x',{mode:'navigate'})).cuerpo,'pagina');
});
test('Service worker: si la red no contesta en el plazo, la copia',async()=>{
 const url='https://raw.githubusercontent.com/eltzubi/Rutas-Mallabia/main/data/oiz.json';
 const w=trabajador({red:()=>new Promise(()=>{}),copias:{[url]:ok('copia')},plazoYa:true});
 let fuera=false;const r=await Promise.race([w.pide(url,{sinEsperar:true}).catch(()=>null),new Promise(res=>setTimeout(()=>{fuera=true;res(null)},500))]);
 assert(!fuera,'no se queda esperando a una red que no contesta');assert.equal(r.cuerpo,'copia');
});
test('Service worker: con la red bien manda la red, y la copia se guarda de verdad',async()=>{
 const url='https://eltzubi.github.io/trabakutik-gps-pruebas/data/rutas.json';
 const w=trabajador({red:async()=>ok('nueva'),copias:{[url]:ok('vieja')}});
 assert.equal((await w.pide(url)).cuerpo,'nueva');
 assert(w.puestas.includes(url),'la escritura en la cache se espera con waitUntil');
});
test('Service worker: una tesela con error no se guarda; una buena si',async()=>{
 const tesela='https://www.ign.es/wmts/mapa-raster?SERVICE=WMTS&REQUEST=GetTile&TILEMATRIX=14&TILEROW=2&TILECOL=3';
 let w=trabajador({red:async()=>({ok:false,status:503,type:'cors',clone(){return this}})});
 await w.pide(tesela,{destination:'image'});assert.deepEqual(w.puestas,[]);
 w=trabajador({red:async()=>ok('tesela')});
 await w.pide(tesela,{destination:'image'});assert(w.puestas.includes(tesela));
});
test('Las teselas: el worker las pide en CORS para ver su estado, y las capas no llevan crossOrigin',async()=>{
 // Con crossOrigin en las capas, las teselas opacas ya guardadas en el movil
 // dejarian de valer de golpe. El worker pide en CORS por su cuenta.
 const html=fs.readFileSync(path.join(root,'nuevo.html'),'utf8');
 const capas=html.slice(html.indexOf('const baseMaps={'),html.indexOf('// Se declara aqui'));
 assert(!/crossOrigin/.test(capas),'las capas siguen pidiendo como siempre');
 const tesela='https://www.ign.es/wmts/pnoa-ma?SERVICE=WMTS&REQUEST=GetTile&TILEMATRIX=14&TILEROW=2&TILECOL=3';
 const w=trabajador({red:async()=>ok('tesela')});
 await w.pide(tesela,{destination:'image',mode:'no-cors'});
 assert.equal(w.pedidas[0].mode,'cors','el worker la pide en CORS');
 assert(w.puestas.includes(tesela));
});
test('Service worker: un 200 cuyo cuerpo no termina de bajar no deja la pagina esperando',async()=>{
 const url='https://eltzubi.github.io/trabakutik-gps-pruebas/nuevo.html';
 const atascado={ok:true,status:200,headers:{},clone(){return this},blob:()=>new Promise(()=>{})};
 const w=trabajador({red:async()=>atascado,copias:{[url]:ok('copia')},plazoYa:true});
 let fuera=false;const r=await Promise.race([w.pide(url,{sinEsperar:true}),new Promise(res=>setTimeout(()=>{fuera=true;res(null)},500))]);
 assert(!fuera,'el plazo cubre tambien el cuerpo');assert.equal(r.cuerpo,'copia');
});
test('Service worker: un 204 no tumba la respuesta: si hay copia, la copia',async()=>{
 const url='https://eltzubi.github.io/trabakutik-gps-pruebas/data/rutas.json';
 const vacio={ok:true,status:204,headers:{},clone(){return this},blob:async()=>''};
 const w=trabajador({red:async()=>vacio,copias:{[url]:ok('copia')}});
 const r=await w.pide(url);
 assert(!r.error,'no se convierte en un error de red');assert.equal(r.cuerpo,'copia');
});
