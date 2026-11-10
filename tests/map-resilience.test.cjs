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
