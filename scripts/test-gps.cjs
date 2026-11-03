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
