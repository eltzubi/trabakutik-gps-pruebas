/* Copia sin cobertura del GPS. Una actualización solo se activa si están
 * todos los recursos imprescindibles. Los trazados visitados y las teselas
 * usan cachés independientes de la versión de la página.
 * IGN y PNOA siguen necesitando conexión; no se precargan mapas. */
const VERSION = "gps-6";
const CONCHA = "trabakutik-gps-concha-" + VERSION;
const DATOS = "trabakutik-gps-datos-v1";
const TESELAS = "trabakutik-gps-teselas-v1";
const TESELAS_MAX = 900;
const BASICOS = [
  "nuevo.html",
  "vendor/leaflet/leaflet.css",
  "vendor/leaflet/leaflet.js",
  "data/trailhead.json",
  "data/rutas.json",
  "data/alturas.json",
];
const esDatoExterno = (url) =>
  /^https:\/\/raw\.githubusercontent\.com\/eltzubi\/Rutas-Mallabia\//i.test(
    url,
  );

self.addEventListener("install", (e) => {
  // Si falta uno, la instalación falla y el worker anterior sigue sirviendo.
  e.waitUntil(
    caches
      .open(CONCHA)
      .then((c) =>
        c.addAll(BASICOS.map((u) => new Request(u, { cache: "reload" }))),
      )
      .then(() => self.skipWaiting()),
  );
});

async function migrarAnteriores() {
  const nombres = await caches.keys();
  for (const nombre of nombres) {
    const antiguaConcha = /^concha-gps-\d+$/.test(nombre);
    const antiguasTeselas = /^teselas-gps-\d+$/.test(nombre);
    if (!antiguaConcha && !antiguasTeselas) continue;
    const anterior = await caches.open(nombre);
    const destino = await caches.open(antiguasTeselas ? TESELAS : DATOS);
    for (const peticion of await anterior.keys()) {
      if (!antiguasTeselas && !esDatoExterno(peticion.url)) continue;
      // No sobrescribir una versión más reciente ya guardada.
      if (await destino.match(peticion)) continue;
      const respuesta = await anterior.match(peticion);
      if (respuesta) await destino.put(peticion, respuesta);
    }
    // Solo borrar esta caché después de copiarla entera sin errores.
    await caches.delete(nombre);
  }
  for (const nombre of nombres) {
    if (nombre.startsWith("trabakutik-gps-concha-") && nombre !== CONCHA) {
      await caches.delete(nombre);
    }
  }
  await recorta(TESELAS, TESELAS_MAX);
}
self.addEventListener("activate", (e) => {
  e.waitUntil(migrarAnteriores().then(() => self.clients.claim()));
});

function esTesela(url) {
  return (
    /^https?:\/\/[a-d]?\.?tile\.openstreetmap\.org\//.test(url) ||
    /^https?:\/\/(server|services)\.arcgisonline\.com\//.test(url) ||
    /\/\{?z\}?\/.*\.png$/.test(url)
  );
}
async function recorta(nombre, maximo) {
  const c = await caches.open(nombre);
  const claves = await c.keys();
  await Promise.all(
    claves
      .slice(0, Math.max(0, claves.length - maximo))
      .map((k) => c.delete(k)),
  );
}
async function leer(nombre, peticion) {
  try {
    return await (await caches.open(nombre)).match(peticion);
  } catch (e) {
    return undefined;
  }
}
async function guardar(nombre, peticion, respuesta) {
  try {
    await (await caches.open(nombre)).put(peticion, respuesta.clone());
  } catch (e) {
    /* La falta de espacio no debe impedir usar la respuesta de red. */
  }
}
async function primeroRed(peticion, nombre, esPagina) {
  let respuesta;
  try {
    respuesta = await fetch(peticion);
    if (respuesta.ok) {
      // La escritura termina antes que la respuesta: no queda una promesa
      // suelta que el navegador pueda cancelar al suspender el worker.
      await guardar(nombre, peticion, respuesta);
      return respuesta;
    }
  } catch (e) {
    /* Sin cobertura: buscar la última copia válida. */
  }
  const copia = await leer(nombre, peticion);
  if (copia) return copia;
  if (esPagina) {
    const pagina = await leer(CONCHA, "nuevo.html");
    if (pagina) return pagina;
  }
  return respuesta || Response.error();
}
async function primeroCopia(peticion, nombre, esMapa) {
  const copia = await leer(nombre, peticion);
  if (copia) return copia;
  const respuesta = await fetch(peticion);
  if (respuesta.ok || (esMapa && respuesta.type === "opaque")) {
    await guardar(nombre, peticion, respuesta);
    if (esMapa) await recorta(nombre, TESELAS_MAX).catch(() => {});
  }
  return respuesta;
}
self.addEventListener("fetch", (e) => {
  const peticion = e.request;
  if (peticion.method !== "GET") return;
  const url = new URL(peticion.url);
  if (esTesela(url.href)) {
    e.respondWith(primeroCopia(peticion, TESELAS, true));
  } else if (esDatoExterno(url.href)) {
    e.respondWith(primeroRed(peticion, DATOS, false));
  } else if (url.origin === self.location.origin) {
    const esPagina = peticion.mode === "navigate";
    e.respondWith(
      esPagina || /\.(html|json)$/.test(url.pathname)
        ? primeroRed(peticion, CONCHA, esPagina)
        : primeroCopia(peticion, CONCHA, false),
    );
  }
});
