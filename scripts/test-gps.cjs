// Pruebas de regresión: ejecutan funciones del HTML y el service worker reales.
// Cache API, DOM y puente Android se simulan; no sustituyen una prueba en teléfono.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");
const os = require("node:os");
const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "nuevo.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
function section(start, end) {
  const i = html.indexOf(start);
  assert(i >= 0, start);
  const j = html.indexOf(end, i + start.length);
  assert(j > i, end);
  return html.slice(i, j);
}
function run(code, ctx) {
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx;
}
function elements() {
  const nodes = {};
  return (id) =>
    (nodes[id] ??= {
      textContent: "",
      disabled: false,
      hidden: false,
      classList: { add() {}, remove() {}, toggle() {} },
      setAttribute() {},
    });
}
function savedContext(points) {
  const $ = elements();
  return {
    $,
    R: Math.PI / 180,
    drawPoints: [],
    drawLayer: null,
    createdSavedItem: null,
    selectedRouteRequest: 0,
    activeSavedId: null,
    routePoints: [],
    chosen: 0,
    otherTracksVisible: false,
    savedLine: null,
    map: { removeLayer() {}, fitBounds() {} },
    L: {
      polyline: () => ({
        addTo() {
          return this;
        },
        bringToFront() {
          return this;
        },
        getBounds() {
          return {};
        },
      }),
    },
    resetOffRoute() {},
    resetJunctionView() {},
    updateNativeLaunchLink() {},
    pintaBotonNavegar() {},
    changeMode() {},
    updateDirectionArrows() {},
    notice() {},
    setRouteTitle() {},
    setTimeout() {},
    refreshRouteLayers() {},
    item: { name: "Subida y bajada", created: 1, points },
  };
}
test("reabrir usa las alturas originales aunque el camino sea recto", () => {
  const points = Array.from({ length: 101 }, (_, i) => [
    43 + i * 0.00001,
    -2,
    100 + 2 * Math.min(i, 100 - i),
  ]);
  const ctx = savedContext(points);
  run(section("function elevationText(", "let savedLine=null;"), ctx);
  ctx.loadSaved(ctx.item);
  assert.equal(
    ctx.$("distance").textContent,
    "Ruta propia · +96 / -96 m aprox.",
  );
  assert(
    ctx.routePoints.length < points.length,
    "la simplificación para dibujar sigue activa",
  );
});
test("la rampa suave conserva 100 m de subida", () => {
  const ctx = run(section("function elevationText(", "function loadSaved("), {
    R: Math.PI / 180,
  });
  assert.match(
    ctx.elevationText(
      Array.from({ length: 101 }, (_, i) => [43 + i * 0.00001, -2, 100 + i]),
    ),
    /\+100 \/ -0/,
  );
  assert(
    ctx
      .compactRoutePoints([
        [43, -2, 100],
        [43.1, -2, 200],
      ])
      .every((p) => p.length === 3),
  );
});
function watchdog(active) {
  let tick;
  const $ = elements();
  $("status").textContent = "Mapa listo";
  const ctx = {
    gpsApagadoPorTi: false,
    window: {},
    setInterval: (f) => (tick = f),
    $,
    routePoints: [],
    ultimoErrorGps: null,
    ultimoFix: 0,
    junctionActive: -1,
    watch: null,
    fuenteNativa: false,
    navegaNativo: active,
    gpsSolicitado: active,
    notice: (t) => ($("status").textContent = t),
  };
  run(section("const GUIA_CADUCA_MS=", "function syncNativeRoute()"), ctx);
  tick();
  return $("status").textContent;
}
test("abrir sin iniciar GPS no anuncia búsqueda", () =>
  assert.equal(watchdog(false), "Mapa listo"));
test("GPS solicitado sin primera posición sí anuncia búsqueda", () =>
  assert.match(watchdog(true), /buscando señal/));
test("IGN avisa de conexión sin sustituir el mapa elegido", () => {
  const $ = elements(),
    map = { addLayer() {}, removeLayer() {} };
  const layer = {
    options: { attribution: "© IGN" },
    addTo() {
      return this;
    },
    bringToBack() {},
  };
  const ctx = run(section("function changeBase(", "let initialBase="), {
    baseMaps: { ign: layer },
    currentBase: null,
    map,
    $,
    localStorage: { setItem() {} },
    navigator: { onLine: false },
  });
  ctx.changeBase("ign");
  assert.equal(ctx.currentBase, layer);
  assert.match($("mapCredit").textContent, /conexión/);
});
function worker({
  failBasic = false,
  networkError = false,
  httpStatus = 200,
} = {}) {
  const base = "https://eltzubi.github.io/trabakutik-gps-pruebas/";
  const stores = new Map(),
    handlers = {};
  let skipped = false;
  const key = (r) => new URL(typeof r === "string" ? r : r.url, base).href;
  const caches = {
    async open(n) {
      if (!stores.has(n)) stores.set(n, new Map());
      const m = stores.get(n);
      return {
        async add(r) {
          if (failBasic && key(r) === base + "nuevo.html")
            throw Error("sin red");
          m.set(key(r), new Response("basic"));
        },
        async addAll(rs) {
          const pending = [];
          for (const r of rs) {
            if (failBasic && key(r) === base + "nuevo.html")
              throw Error("sin red");
            pending.push([key(r), new Response("basic")]);
          }
          for (const [k, v] of pending) m.set(k, v);
        },
        async match(r) {
          return m.get(key(r))?.clone();
        },
        async put(r, v) {
          m.set(key(r), v.clone());
        },
        async keys() {
          return [...m.keys()].map((url) => ({ url }));
        },
        async delete(r) {
          return m.delete(key(r));
        },
      };
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(n) {
      return stores.delete(n);
    },
    async match(r) {
      for (const m of stores.values())
        if (m.has(key(r))) return m.get(key(r)).clone();
    },
  };
  class WorkerRequest extends Request {
    constructor(u, opts) {
      super(new URL(typeof u === "string" ? u : u.url, base), opts);
    }
  }
  const ctx = {
    self: {
      location: new URL(base + "sw.js"),
      addEventListener: (n, f) => (handlers[n] = f),
      skipWaiting: async () => {
        skipped = true;
      },
      clients: { claim: async () => {} },
    },
    caches,
    Request: WorkerRequest,
    Response,
    URL,
    fetch: async () => {
      if (networkError) throw Error("sin red");
      return new Response("red", { status: httpStatus });
    },
    console,
  };
  run(sw, ctx);
  return {
    ctx,
    caches,
    stores,
    base,
    get skipped() {
      return skipped;
    },
    async event(name) {
      let p;
      handlers[name]({ waitUntil: (v) => (p = v) });
      await p;
    },
    async request(url, mode = "cors") {
      let result;
      const waits = [];
      handlers.fetch({
        request: { url, method: "GET", mode },
        respondWith: (p) => (result = p),
        waitUntil: (p) => waits.push(p),
      });
      const response = await result;
      await Promise.all(waits);
      return response;
    },
  };
}
test("no activa una actualización sin HTML esencial y conserva la copia previa", async () => {
  const w = worker({ failBasic: true });
  const old = await w.caches.open("concha-gps-2");
  await old.put("nuevo.html", new Response("anterior"));
  await assert.rejects(w.event("install"));
  assert.equal(w.skipped, false);
  assert.equal(await (await old.match("nuevo.html")).text(), "anterior");
});
test("actualizar conserva rutas, mapas y cachés de otros sitios", async () => {
  const w = worker();
  const u =
    "https://raw.githubusercontent.com/eltzubi/Rutas-Mallabia/main/data/oiz.json";
  const tile = "https://tile.openstreetmap.org/15/1/1.png";
  await (await w.caches.open("concha-gps-2")).put(u, new Response("ruta"));
  await (await w.caches.open("teselas-gps-2")).put(tile, new Response("mapa"));
  await w.caches.open("otra-web");
  await w.event("install");
  await w.event("activate");
  assert(w.stores.has("otra-web"));
  assert.equal(await (await w.caches.match(u)).text(), "ruta");
  assert.equal(await (await w.caches.match(tile)).text(), "mapa");
});
test("sin red abre una ruta nueva por parámetro con la página guardada", async () => {
  const w = worker({ networkError: true });
  await w.event("install");
  const r = await w.request(w.base + "nuevo.html?ruta=oiz", "navigate");
  assert(r);
  assert.equal(await r.text(), "basic");
});
test("un 503 utiliza la copia de los datos guardados", async () => {
  const w = worker({ httpStatus: 503 });
  await w.event("install");
  const r = await w.request(w.base + "data/rutas.json");
  assert.equal(await r.text(), "basic");
});
test("la respuesta termina con los datos disponibles para abrir sin red", async () => {
  const w = worker();
  await w.event("install");
  await w.event("activate");
  const u =
    "https://raw.githubusercontent.com/eltzubi/Rutas-Mallabia/main/data/oiz.json";
  await w.request(u);
  assert.equal(await (await w.caches.match(u)).text(), "red");
});
test("una grabación parcial no se puede guardar como completa en Mis rutas", () => {
  let saved = false;
  const $ = elements();
  const ctx = {
    pendingSave: {
      kind: "recording",
      points: [
        [43, -2],
        [43.1, -2],
      ],
      name: "Larga",
      complete: false,
    },
    nativeTrackComplete: false,
    cortesGrabacion: 0,
    window: { TrabakutikAndroid: {} },
    savedList: () => [],
    putSaved: () => {
      saved = true;
      return true;
    },
    finishRecording() {},
    closeSaveDialog() {},
    showSaved() {},
    notice() {},
    $,
    confirm: () => true,
  };
  run(section("function savePendingToMine(", "$('closeSave').onclick="), ctx);
  ctx.savePendingToMine();
  assert.equal(saved, false);
});
test("una grabación parcial se exporta desde el GPX nativo, incluso sin vista previa", () => {
  let exported = false;
  const $ = elements();
  const ctx = {
    recorded: [],
    nativeTrackComplete: false,
    window: {
      TrabakutikAndroid: {
        saveRecording() {
          exported = true;
        },
      },
    },
    notice() {},
    $,
    prompt: () => null,
  };
  run(section("$('saveRecording').onclick=", "// Al descartar se apaga"), ctx);
  $("saveRecording").onclick();
  assert.equal(exported, true);
});
test("la vista nativa indica que falta el inicio al limitar a 25000 líneas", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gps-preview-"));
  try {
    const java = fs.readFileSync(
      path.join(
        root,
        "android/app/src/main/java/com/trabakutik/gps/MainActivity.java",
      ),
      "utf8",
    );
    const start = java.indexOf(
      "org.json.JSONArray pts=new org.json.JSONArray();",
      java.indexOf("private String trackingSnapshot"),
    );
    const end = java.indexOf('o.put("points",pts);', start);
    assert(start > 0 && end > start);
    const block = java.slice(start, end);
    fs.mkdirSync(path.join(dir, "org/json"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "org/json/JSONArray.java"),
      "package org.json; public class JSONArray { java.util.ArrayList<Object> a=new java.util.ArrayList<>(); public JSONArray put(Object x){a.add(x);return this;} public int length(){return a.size();} public Object get(int i){return a.get(i);} }",
    );
    fs.writeFileSync(
      path.join(dir, "org/json/JSONObject.java"),
      "package org.json; public class JSONObject { public static final Object NULL=null; java.util.HashMap<String,Object> a=new java.util.HashMap<>(); public JSONObject put(String k,Object v){a.put(k,v);return this;} public Object get(String k){return a.get(k);} }",
    );
    fs.writeFileSync(
      path.join(dir, "PreviewCheck.java"),
      "import java.io.*; public class PreviewCheck { public static void main(String[] args)throws Exception { File f=new File(args[0]); org.json.JSONObject o=new org.json.JSONObject(); " +
        block +
        ' System.out.println(pts.length()+","+o.get("pointsComplete")+","+((org.json.JSONArray)pts.get(0)).get(0)); }}',
    );
    const input = path.join(dir, "track.tsv");
    fs.writeFileSync(
      input,
      Array.from({ length: 30001 }, (_, i) => `${i}\t-2\n`).join(""),
    );
    execFileSync(
      "java",
      [
        "com.sun.tools.javac.Main",
        "org/json/JSONArray.java",
        "org/json/JSONObject.java",
        "PreviewCheck.java",
      ],
      { cwd: dir },
    );
    assert.equal(
      execFileSync("java", ["-cp", dir, "PreviewCheck", input], {
        encoding: "utf8",
      }).trim(),
      "25000,false,5001.0",
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function creatorContext() {
  const ctx = run(section('const CELDA_M=', '// Perfil de altura del creador:'), {
    $: elements(), notice() {}, drawPoints:[], AbortController, setTimeout, clearTimeout, confirm:()=>true, dist:(a,b)=>Math.hypot((a[0]-b[0])*111320,(a[1]-b[1])*81000),
  });
  vm.runInContext(`redGps=construyeRed([{points:[[43,-2,100],[43.001,-2,120]]}],null);
    seguirMapaGps=false;
    globalThis.state=()=>({red:redGps,anchors:anclasGps,segments:tramosGps});
    globalThis.draft=(a,t)=>{anclasGps=a;tramosGps=t};
    globalThis.updateDraw=()=>{};`,ctx);
  run(section('function cierraCirculoGps()', 'let savedLine=null;'),ctx);
  return ctx;
}
test('un inicio manual conserva su posición y no abre atajos en la red pública',()=>{
  const c=creatorContext(), original=c.state().red.nodos.length;
  const home=c.nodoManualGps(43.01,-2.01), bend=c.nodoManualGps(43.0103,-2.0105);
  assert.equal(c.nodoCerca(c.state().red,43.01,-2.01),-1);
  assert.deepEqual(Array.from(c.state().red.nodos[home]),[43.01,-2.01,null]);
  assert.deepEqual(Array.from(c.tramoGps(home,bend,true)),[home,bend]);
  assert.equal(c.camino(c.state().red,home,0),null,'no se añade un acceso público');
  const junction=c.nodoCerca(c.state().red,43,-2);
  const link=c.tramoGps(bend,junction,false);
  assert.equal(link.manual,true,'el enlace a la red conserva la recta manual');
  assert(c.tramoGps(0,original-1,false).length>2,'después sigue los caminos');
});
test('mover, cerrar y deshacer conservan un trazado mixto',()=>{
  const c=creatorContext(),home=c.nodoManualGps(43.01,-2.01);
  const link=c.tramoGps(home,0,false),road=c.tramoGps(0,3,false);
  c.draft([home,0,3],[[home],link,road]);
  c.mueveAnclaGps(0,43.02,-2.02);
  let s=c.state();
  assert.equal(s.red.nodos[s.anchors[0]][0],43.02);
  assert(s.segments[1].manual);
  c.cierraCirculoGps();s=c.state();
  assert.equal(s.anchors.at(-1),s.anchors[0]);assert(s.segments.at(-1).manual);
  c.$('undo').onclick();assert.equal(c.state().anchors.length,3);
  c.idaYVueltaGps();s=c.state();
  assert.equal(s.anchors.at(-1),s.anchors[0]);assert(s.segments.at(-1).manual);
  assert.deepEqual(Array.from(s.segments.at(-1)),Array.from(s.segments[1]).reverse());
});
test('el GPX manual no inventa alturas y el resumen no une huecos',()=>{
  const c=run(section('function xmlEscape(', 'function download('),{});
  const points=[[43,-2,100],[43.01,-2.01,null],[43.02,-2.02,300]];
  const xml=c.gpx(points,'Ruta personal');
  assert.equal((xml.match(/<trkpt /g)||[]).length,3);
  assert(!xml.includes('<ele>null</ele>'));assert(!xml.includes('<ele>0</ele>'));
  const e=run(section('function elevationText(', 'function loadSaved('),{R:Math.PI/180});
  assert.match(e.elevationText(points),/\+0 \/ -0.*alturas incompletas/);
});

test('Manual permite mover un punto de la red fuera de los trazados',()=>{
  const c=creatorContext();
  c.draft([0,3],[[0],c.tramoGps(0,3,false)]);
  vm.runInContext('trazadoManual=true',c);
  c.mueveAnclaGps(0,43.03,-2.03);
  const s=c.state();
  assert.equal(s.red.nodos[s.anchors[0]][0],43.03);
  assert.equal(s.red.nodos[s.anchors[0]][1],-2.03);
  assert.equal(s.segments[1].manual,true);
});

function mapReply(coords){
 return {code:'Ok',waypoints:coords.map(p=>({location:[p[1],p[0]]})),routes:[{legs:coords.slice(1).map((p,i)=>({steps:[{geometry:{type:'LineString',coordinates:[[coords[i][1],coords[i][0]],[coords[i][1]+.001,coords[i][0]],[p[1]+.001,p[0]],[p[1],p[0]]]}}]}))}]};
}
test('el planificador conserva las curvas recibidas y funciona sin tracks guardados',async()=>{
 const c=creatorContext(),coords=[[43,-2],[43.001,-2]];
 vm.runInContext('seguirMapaGps=true;redGps=construyeRed([],null)',c);
 c.fetch=async url=>{
  if(url.includes('/height?')){const q=JSON.parse(new URL(url).searchParams.get('json'));return {ok:true,json:async()=>({height:q.shape.map((p,i)=>100+i*2),shape:q.shape})};}
  assert.match(url,/routed-foot/);assert.match(url,/geometries=geojson/);assert.match(url,/steps=true/);return {ok:true,status:200,json:async()=>mapReply(coords)};
 };
 await c.planificaMapaGps(coords);
 const s=c.state();assert.equal(s.anchors.length,2);assert(s.segments[1].length>=4);
 assert(s.segments[1].every(id=>Number.isFinite(s.red.nodos[id][2])),'el recorrido conserva alturas');
 assert(s.segments[1].some(id=>s.red.nodos[id][1]===-1.999),'no corta la curva');
 assert(!s.segments[1].manual,'la respuesta del motor no se etiqueta como recta manual');
});
test('si no hay camino o servicio conserva el borrador sin dibujar una recta',async()=>{
 const c=creatorContext(),before=c.state();
 c.fetch=async()=>({ok:true,status:200,json:async()=>({code:'NoRoute'})});
 await c.planificaMapaGps([[43,-2],[43.001,-2]]);
 assert.equal(c.state().anchors.length,0);assert.equal(c.state().red,before.red);
 assert.match(c.$('plannerStatus').textContent,/No hay conexión/);
 assert.throws(()=>c.respuestaMapaGps(mapReply([[43,-2],[43.001,-2]]),[[44,-2],[44.001,-2]]),/cerca/);
});
test('cancelar un cálculo impide que su respuesta tardía cambie el borrador',async()=>{
 const c=creatorContext(),coords=[[43,-2],[43.001,-2]];let finish;
 c.fetch=()=>new Promise(r=>{finish=r});
 const pending=c.planificaMapaGps(coords);
 c.cancelaMapaGps();await c.planificaMapaGps([[44,-3]]);
 finish({ok:true,status:200,json:async()=>mapReply(coords)});await pending;
 assert.equal(c.state().anchors.length,1);
 assert.equal(c.state().red.nodos[c.state().anchors[0]][0],44);
});
test('sin aceptar el servicio no se envían coordenadas',async()=>{
 const c=creatorContext();let sent=0;c.confirm=()=>false;c.fetch=async()=>{sent++;throw Error('no debe enviarse')};
 await c.planificaMapaGps([[43,-2],[43.001,-2]]);
 assert.equal(sent,0);assert.equal(c.state().anchors.length,0);
 assert.match(c.$('plannerStatus').textContent,/No se han enviado/);
});

test('rechaza geometrías separadas en vez de unirlas con una recta',()=>{
 const c=creatorContext(),coords=[[43,-2],[43.001,-2]],j=mapReply(coords);
 j.routes[0].legs[0].steps=[{geometry:{type:'LineString',coordinates:[[-2,43],[-1.999,43]]}},{geometry:{type:'LineString',coordinates:[[-1.998,43],[-2,43.001]]}}];
 assert.throws(()=>c.respuestaMapaGps(j,coords),/corte/);
 assert.throws(()=>c.respuestaMapaGps(null,coords),/no es válida/);
});

test('detecta una cima intermedia en una recta nueva y exporta sus alturas',async()=>{
 const c=creatorContext(),result={anchors:[[43,-2],[43.009,-2]],parts:[[[43,-2],[43.009,-2]]]};
 c.fetch=async url=>{const q=JSON.parse(new URL(url).searchParams.get('json'));return {ok:true,json:async()=>({height:q.shape.map(p=>100+100*(1-Math.abs((p.lat-43)/.009-.5)*2))})}};
 await c.alturasTerrenoGps(result,new AbortController().signal);
 assert(result.parts[0].length>20,'muestras dentro de la recta');
 const e=run(section('function elevationText(', 'function loadSaved('),{R:Math.PI/180});
 const summary=e.elevationText(result.parts[0]);assert.match(summary,/\+9\d \/ -9\d/);
 const xml=run(section('function xmlEscape(', 'function download('),{}).gpx(result.parts[0],'Cima nueva');
 assert.equal((xml.match(/<ele>/g)||[]).length,result.parts[0].length);
 assert(result.anchors.every(p=>Number.isFinite(p[2])));
});
test('una altura ausente no se sustituye por cero ni se interpola sobre el hueco',async()=>{
 const c=creatorContext(),result={anchors:[[43,-2],[43.001,-2]],parts:[[[43,-2],[43.001,-2]]]};let calls=0;
 c.fetch=async url=>{calls++;const q=JSON.parse(new URL(url).searchParams.get('json'));return {ok:true,json:async()=>({height:q.shape.map((p,i)=>i===2?null:100)})}};
 const original=JSON.parse(JSON.stringify(result));
 await c.alturasTerrenoGps(result,new AbortController().signal);
 assert(result.parts[0].some(p=>p[2]===null));assert(!result.parts[0].some(p=>p[2]===0));
 await c.alturasTerrenoGps(original,new AbortController().signal);assert.equal(calls,1,'se reutilizan las alturas consultadas');
});
test('si falla el servicio de alturas conserva el camino y permite guardarlo',async()=>{
 const c=creatorContext(),coords=[[43,-2],[43.001,-2]];
 c.fetch=async url=>url.includes('/height?')?{ok:false,status:503}:{ok:true,status:200,json:async()=>mapReply(coords)};
 await c.planificaMapaGps(coords);
 assert.equal(c.state().anchors.length,2);assert.match(c.$('plannerStatus').textContent,/Recorrido conservado/);
 assert(c.state().segments[1].every(id=>c.state().red.nodos[id][2]===null));
});
test('cancelar mientras llegan alturas impide modificar un borrador posterior',async()=>{
 const c=creatorContext(),coords=[[43,-2],[43.001,-2]];let finish,batch;
 c.fetch=async url=>{
  if(!url.includes('/height?'))return {ok:true,status:200,json:async()=>mapReply(coords)};
  batch=JSON.parse(new URL(url).searchParams.get('json')).shape;
  return new Promise(r=>{finish=r});
 };
 const pending=c.planificaMapaGps(coords);
 while(!finish)await new Promise(r=>setTimeout(r,1));
 c.cancelaMapaGps();await c.planificaMapaGps([[44,-3]]);
 finish({ok:true,json:async()=>({height:batch.map(()=>200)})});await pending;
 assert.equal(c.state().anchors.length,1);assert.equal(c.state().red.nodos[c.state().anchors[0]][0],44);
});

test('Crear no ofrece selector de métodos ni instrucciones permanentes',()=>{
 assert(!html.includes('id="drawMethod"'));
 assert(!html.includes("$('drawMethod')"));
 assert(!html.includes('Marca puntos en los caminos del mapa · a pie · necesita conexión.'));
});
