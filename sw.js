/* Service worker del navegador GPS.
 *
 * POR QUE EXISTE. La aplicacion de Android no lleva la pagina dentro: la carga
 * de GitHub Pages, y ademas con la cache del WebView desactivada
 * (LOAD_NO_CACHE en MainActivity, para que una version nueva llegue siempre).
 * Sin esto, abrir la aplicacion de cero SIN COBERTURA no daba nada: ni mapa,
 * ni ruta, ni avisos. Y es justo en el monte donde hace falta. Lo que hace
 * esto es guardar la pagina y lo suyo en el movil la primera vez que se abre
 * con cobertura, y servirlo despues aunque no haya red.
 *
 * COMO. Para la pagina y los datos, PRIMERO LA RED: asi una version nueva
 * llega en cuanto hay cobertura y no te quedas con una vieja pegada para
 * siempre -eso ya paso en la web con los tracks corregidos-. Si la red falla,
 * la copia. Para Leaflet y las teselas, primero la copia, que no cambian.
 *
 * LAS TESELAS DEL MAPA se van guardando segun las miras, hasta TESELAS_MAX.
 * Esas no se precargan: son millones.
 *
 * Y APARTE ESTA EL MAPA QUE BAJAS A PROPOSITO, en una cache suya -MAPAS-. La
 * pagina ofrece «guardar el mapa de esta ruta» y mete ahi el pasillo entero
 * de teselas del IGN a lo largo del track. Van separadas de las otras por dos
 * razones: no se recortan nunca -lo que bajaste para una salida no se puede
 * caer por mirar otra zona- y sobreviven a los cambios de version de la
 * concha, que en el monte volver a bajarlas no es una opcion. Solo las borra
 * quien las bajo, desde el mismo dialogo.
 */
// LA CONCHA Y LAS TESELAS VAN POR SEPARADO, A PROPOSITO. Al cambiar lo que
// se precarga hay que tirar la concha vieja -si no, nuevo-qa.html se quedaba
// guardado en el movil para siempre-, pero las teselas NO se tocan: son
// hasta 900 imagenes del monte descargadas para andar sin cobertura, y
// volver a bajarlas cuesta datos y tiempo en un sitio donde no hay.
const VERSION_CONCHA = 'gps-3';
const VERSION_TESELAS = 'gps-2';
const CONCHA = 'concha-' + VERSION_CONCHA;
const TESELAS = 'teselas-' + VERSION_TESELAS;
const TESELAS_MAX = 900;
// El mapa bajado a proposito vive en una cache aparte, «mapas-gps-1», que
// crea y llena la pagina. Aqui solo hay que saber que empieza por «mapas-»
// para no borrarla y para servirla: no se recorta y no tiene version.

// Lo imprescindible para que la pagina abra sin red.
const BASICOS = [
  'nuevo.html',
  'vendor/leaflet/leaflet.css',
  'vendor/leaflet/leaflet.js',
  'data/trailhead.json',
  'data/rutas.json',
  'data/alturas.json'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CONCHA).then(function (c) {
      // addAll es todo o nada: si falla uno, no se guarda ninguno. Aqui
      // interesa lo contrario, que lo que se pueda guardar se guarde.
      return Promise.all(BASICOS.map(function (u) {
        return c.add(new Request(u, { cache: 'reload' })).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (claves) {
      return Promise.all(claves.map(function (k) {
        // Las de mapas bajados a mano NO se tocan, sea cual sea su version.
        if (k.indexOf('mapas-') === 0) return;
        if (k !== CONCHA && k !== TESELAS) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

function esTesela(url) {
  const parsed = new URL(url);
  if (parsed.origin === 'https://www.ign.es' &&
      /^\/wmts\/(mapa-raster|pnoa-ma)$/.test(parsed.pathname) &&
      parsed.searchParams.get('REQUEST') === 'GetTile') return true;
  // OpenTopoMap salio del navegador en noviembre de 2026; si alguien tiene
  // teselas suyas guardadas, se le siguen sirviendo hasta que se recorten.
  return /^https?:\/\/[a-d]?\.?tile\.openstreetmap\.org\//.test(url) ||
         /^https?:\/\/(server|services)\.arcgisonline\.com\//.test(url) ||
         /\/\{?z\}?\/.*\.png$/.test(url);
}

// PRIMERO LA RED, PERO NO A CUALQUIER PRECIO. Dos fallos que salieron en el
// repaso completo del navegador (13 de noviembre de 2026):
//  - fetch no falla con un 404 o un 503: devuelve la respuesta. Asi que si
//    GitHub daba un error momentaneo, la pagina recibia ESE error aunque
//    tuviera una copia buena guardada, y el modo sin cobertura no servia.
//  - Sin plazo, con cobertura mala pero no nula -una raya en el monte- abrir
//    la app esperaba lo que tardara en caducar la peticion, minutos.
// Ahora: si la red contesta bien, manda la red. Si contesta con error o no
// contesta, la copia. Y si a los PLAZO_RED_MS no ha contestado y hay copia,
// la copia, mientras la red sigue por detras y refresca la cache para la
// proxima vez. Sin copia se espera a la red, que no hay otra cosa.
const PLAZO_RED_MS = 4000;
function primeroLaRed(e, peticion, sinCopia) {
  var red = fetch(peticion);
  // «Buena» es un 200, no cualquier 2xx: un 204 sin cuerpo guardado encima
  // de la copia la estropearia, y entregado dejaria la pagina sin datos.
  function buena(r) { return !!r && r.status === 200; }
  e.waitUntil(red.then(function (r) {
    if (!buena(r)) return;
    var copia = r.clone();
    return caches.open(CONCHA).then(function (c) { return c.put(peticion, copia); });
  }).catch(function () {}));
  function copiaGuardada() {
    return caches.match(peticion).then(function (r) {
      return r || (sinCopia ? sinCopia() : null);
    });
  }
  return new Promise(function (resolve) {
    var plazo = setTimeout(function () {
      copiaGuardada().then(function (c) { if (c) resolve(c); });
    }, PLAZO_RED_MS);
    red.then(function (r) {
      if (buena(r)) {
        // El plazo cubre tambien el CUERPO: fetch se resuelve con las
        // cabeceras, y un 200 que se atasca a mitad de bajar dejaria la
        // pagina esperando aunque hubiera copia. Se baja entero aqui y, si
        // llega dentro del plazo, se entrega; si no, manda el plazo.
        // Se lee la original, no otro clon: la copia para la cache ya se
        // saco arriba, y un clon de mas sin leer obliga a guardar el cuerpo
        // dos veces en memoria.
        return r.blob().then(function (cuerpo) {
          clearTimeout(plazo);
          var entera;
          // Si aun asi no se pudiera rehacer, la copia, y si no hay, un error.
          try { entera = new Response(cuerpo, { status: r.status, statusText: r.statusText, headers: r.headers }); }
          catch (err) { return copiaGuardada().then(function (c) { resolve(c || Response.error()); }); }
          resolve(entera);
        }, function () {
          clearTimeout(plazo);
          return copiaGuardada().then(function (c) { resolve(c || Response.error()); });
        });
      }
      clearTimeout(plazo);
      return copiaGuardada().then(function (c) { resolve(c || r); });
    }, function () {
      clearTimeout(plazo);
      return copiaGuardada().then(function (c) { resolve(c || Response.error()); });
    }).catch(function () { resolve(Response.error()); });
  });
}

function recorta(nombre, maximo) {
  return caches.open(nombre).then(function (c) {
    return c.keys().then(function (ks) {
      if (ks.length <= maximo) return;
      // Las mas viejas primero: keys() las devuelve en orden de insercion.
      return Promise.all(ks.slice(0, ks.length - maximo).map(function (k) {
        return c.delete(k);
      }));
    });
  });
}

self.addEventListener('fetch', function (e) {
  var peticion = e.request;
  if (peticion.method !== 'GET') return;
  var url = peticion.url;

  // Teselas del mapa: primero la copia, y se guarda lo nuevo.
  // Solo las que pide el MAPA -un <img> de Leaflet, destination 'image'-. La
  // descarga del mapa de una ruta las pide con fetch, destination '', y esa
  // se deja pasar tal cual: la guarda la pagina en su cache de mapas, y si
  // pasara por aqui se guardaria ademas en la de teselas, que tiene tope de
  // 900 y se recorta: bajar una ruta entera echaria fuera lo demas.
  if (esTesela(url) && peticion.destination === 'image') {
    e.respondWith(
      // caches.match sin nombre busca en TODAS, asi que encuentra tanto las
      // que se guardaron solas como el mapa bajado a proposito. ignoreVary
      // porque Leaflet pide la tesela con un <img> y la descarga la pidio un
      // fetch con CORS: si el servidor mandara «Vary: Origin», la guardada no
      // casaria con la del mapa y se bajaria otra vez.
      caches.match(peticion, { ignoreVary: true }).then(function (r) {
        if (r) return r;
        // SOLO LAS BUENAS. Leaflet pide las teselas sin CORS y la respuesta
        // llega opaca: con ella no se sabe si es la imagen o un 503, y antes
        // se guardaban todas, de modo que una que fallo una vez se servia
        // rota, primero la copia, hasta que la desplazaran otras 900. Ahora
        // la pide el propio worker en CORS -IGN, PNOA y OSM lo sirven, con
        // «access-control-allow-origin: *»-, ve el estado de verdad y solo
        // guarda las buenas. A una peticion sin CORS se le puede contestar
        // con una respuesta CORS. Si un servidor no diera CORS, se pide como
        // antes y esa no se guarda.
        // NO se pone crossOrigin en las capas: las teselas ya guardadas son
        // opacas y una peticion CORS no las acepta; se perderia de golpe todo
        // el mapa visto que hubiera en el movil.
        return fetch(new Request(url, { mode: 'cors', credentials: 'omit' }))
          .catch(function () { return fetch(peticion); })
          .then(function (red) {
          var copia = red.clone();
          if (red.ok) e.waitUntil(
            caches.open(TESELAS).then(function (c) {
              return c.put(peticion, copia).then(function () {
                return recorta(TESELAS, TESELAS_MAX);
              });
            }).catch(function () {})
          );
          return red;
        });
      })
    );
    return;
  }

  // Los datos de Rutas-Mallabia: el trazado fino de cada ruta y el fichero de
  // cruces. Vienen de otro dominio pero con CORS abierto, asi que se pueden
  // guardar de verdad. Primero la red -que se corrigen- y si no hay, la copia
  // de la ultima vez. Asi una ruta que ya hayas abierto en casa conserva su
  // trazado fino en el monte, que es el que mide bien y con el que se calculan
  // los cruces.
  // LOS DOS FICHEROS GORDOS DE LA ZONA VAN AL REVES: PRIMERO LA COPIA. Son
  // los cruces (300 KB) y la red de caminos (1,6 MB), y con «primero la red»
  // se bajaban enteros cada vez que abres la app o el creador con cobertura.
  // No cambian casi nunca -se rehacen a mano desde OpenStreetMap-, asi que se
  // sirve lo guardado al instante y se vuelven a pedir por detras: la
  // siguiente vez ya esta lo nuevo. Es lo mismo que se hizo en la web con las
  // fotos. El trazado fino de cada ruta sigue yendo primero a la red, que ese
  // si se corrige.
  if (/\/(caminos|cruces)-zona\.json$/i.test(new URL(url).pathname)) {
    e.respondWith(
      caches.match(peticion, { ignoreVary: true }).then(function (r) {
        var red = fetch(peticion).then(function (resp) {
          if (resp && resp.ok) {
            var copia = resp.clone();
            // Se devuelve la escritura para que waitUntil la espere: suelta,
            // el navegador podia parar el worker antes de terminar de guardar.
            return caches.open(CONCHA).then(function (c) { return c.put(peticion, copia); })
              .catch(function () {}).then(function () { return resp; });
          }
          return resp;
        });
        if (r) { e.waitUntil(red.catch(function () {})); return r; }
        return red;
      })
    );
    return;
  }

  if (/^https:\/\/raw\.githubusercontent\.com\/eltzubi\/Rutas-Mallabia\//i.test(url)) {
    e.respondWith(primeroLaRed(e, peticion));
    return;
  }

  // Lo nuestro: la pagina y los datos, primero la red; el resto, primero la
  // copia.
  if (new URL(url).origin !== self.location.origin) return;

  var esDato = /\.(html|json)$/.test(new URL(url).pathname) ||
               peticion.mode === 'navigate';
  if (esDato) {
    // Una navegacion sin copia exacta -por ejemplo con ?ruta=algo-: vale la
    // pagina guardada, que lee el parametro ella sola.
    e.respondWith(primeroLaRed(e, peticion, peticion.mode === 'navigate'
      ? function () { return caches.match('nuevo.html'); } : null));
    return;
  }

  e.respondWith(
    caches.match(peticion).then(function (r) {
      return r || fetch(peticion).then(function (red) {
        if (red && red.ok) {
          var copia = red.clone();
          e.waitUntil(caches.open(CONCHA).then(function (c) { return c.put(peticion, copia); })
            .catch(function () {}));
        }
        return red;
      });
    })
  );
});
