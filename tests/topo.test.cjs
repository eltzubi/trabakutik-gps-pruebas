const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
for(const file of ['nuevo.html']){
 const html=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
 test(file+': Topo limita peticiones a z17 y vuelve a IGN si falla',()=>{
  const layers=[],els={basemap:{},mapCredit:{}};
  let warning='';
  const c={L:{tileLayer(url,options){const l={url,options,handlers:{},on(k,fn){this.handlers[k]=fn;return this},addTo(){return this},bringToBack(){}};layers.push(l);return l}},map:{removeLayer(){}},$:id=>els[id],localStorage:{setItem(k,v){this[k]=v}},notice:t=>warning=t};
  vm.createContext(c);
  vm.runInContext(html.slice(html.indexOf('const baseMaps={'),html.indexOf("let initialBase='osm';")),c);
  vm.runInContext("changeBase('topo')",c);
  const topo=layers.find(l=>l.url.includes('opentopomap.org'));
  assert(topo);assert.equal(topo.options.maxNativeZoom,17);assert.equal(topo.options.maxZoom,19);
  assert.equal(els.basemap.value,'topo');assert.match(els.mapCredit.textContent,/OpenTopoMap.*CC-BY-SA/);
  topo.handlers.tileerror();
  assert.equal(els.basemap.value,'ign');assert.match(warning,/Topo no está disponible/);
  assert.equal(c.localStorage['trabakutik-mapa-fondo'],'ign');
  vm.runInContext("changeBase('osm')",c);topo.handlers.tileerror();
  assert.equal(els.basemap.value,'osm','un fallo pendiente de Topo no pisa la elección posterior');
  assert(html.includes('<option value="topo">Topo</option>'));
 });
}
