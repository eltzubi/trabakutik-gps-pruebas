// Calcula los mismos giros que la página y recoge lo que envía al puente.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {pieza} = require('../tests/pieza.cjs');

const {puntos, zona, version} = JSON.parse(fs.readFileSync(0, 'utf8'));
const mapa = fs.readFileSync(path.join(__dirname, '../src/js/02-mapa.js'), 'utf8');
const geo = {R: Math.PI / 180};
vm.runInNewContext([
  mapa.match(/^const dist=.*$/m)[0],
  mapa.match(/^function bearingBetween\(a,b\).*$/m)[0],
  'Object.assign(this, {dist, bearingBetween})'
].join('\n'), geo);
const servicio = fs.readFileSync(path.join(__dirname, '../src/js/07-servicio.js'), 'utf8');
vm.runInNewContext(servicio.match(/^function versionMayor\(a,b\)\{[\s\S]*?^\}/m)[0], geo);
const listas = {ida: [], vuelta: []};
const nodo = {classList: {add(){}, remove(){}, toggle(){}}, style: {setProperty(){}, removeProperty(){}}};
const c = pieza('08-cruces.js', {
  versionMayor: geo.versionMayor, R: geo.R, dist: geo.dist, bearingBetween: geo.bearingBetween, routePoints: puntos,
  junctions: [], junctionsReves: null, junctionWarned: new Set(), junctionZoomOnce: new Set(),
  routeCumulative: [], crucesOsm: [], turnMarker: null, junctionActive: -1,
  junctionBlocked: -1, junctionZoom: null, autoZooming: false, $: () => nodo,
  window: {TrabakutikAndroid: {
    getAppVersion: () => version,
    setJunctions(json) { listas.ida = JSON.parse(json); },
    setJunctionsReves(json) { listas.vuelta = JSON.parse(json); }
  }}
});
if (zona) {
  const datos = c.descifraZona(zona);
  c.crucesOsm = datos.puntos;
  c.rotondasOsm = datos.rotondas;
}
c.computeJunctions();
process.stdout.write(JSON.stringify(listas));
