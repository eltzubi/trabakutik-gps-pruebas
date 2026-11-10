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
 * No se precargan: son millones. Si antes de salir abres la ruta y le das un
 * repaso al mapa, esa zona la tendras luego sin cobertura. Si no, saldra el
 * fondo gris, pero la linea de la ruta, tu posicion y los avisos de cruce
 * funcionan igual, que es lo que importa.
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
  return /^https?:\/\/[a-d]?\.?tile\.openstreetmap\.org\//.test(url) ||
         /^https?:\/\/(server|services)\.arcgisonline\.com\//.test(url) ||
         /\/\{?z\}?\/.*\.png$/.test(url);
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
  if (esTesela(url)) {
    e.respondWith(
      caches.match(peticion).then(function (r) {
        if (r) return r;
        return fetch(peticion).then(function (red) {
          // Las teselas vienen de otro dominio: la respuesta es opaca y no se
          // puede mirar su estado. Se guarda igual, que es lo unico que hay.
          var copia = red.clone();
          if (red.ok || red.type === 'opaque') e.waitUntil(
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
  if (/^https:\/\/raw\.githubusercontent\.com\/eltzubi\/Rutas-Mallabia\//i.test(url)) {
    e.respondWith(
      fetch(peticion).then(function (red) {
        if (red && red.ok) {
          var copia = red.clone();
          caches.open(CONCHA).then(function (c) { c.put(peticion, copia); })
            .catch(function () {});
        }
        return red;
      }).catch(function () {
        return caches.match(peticion).then(function (r) { return r || Response.error(); });
      })
    );
    return;
  }

  // Lo nuestro: la pagina y los datos, primero la red; el resto, primero la
  // copia.
  if (new URL(url).origin !== self.location.origin) return;

  var esDato = /\.(html|json)$/.test(new URL(url).pathname) ||
               peticion.mode === 'navigate';
  if (esDato) {
    e.respondWith(
      fetch(peticion).then(function (red) {
        if (red && red.ok) {
          var copia = red.clone();
          caches.open(CONCHA).then(function (c) { c.put(peticion, copia); });
        }
        return red;
      }).catch(function () {
        return caches.match(peticion).then(function (r) {
          if (r) return r;
          // Una navegacion sin copia exacta -por ejemplo con ?ruta=algo-:
          // vale la pagina guardada, que lee el parametro ella sola.
          if (peticion.mode === 'navigate') return caches.match('nuevo.html');
          return Response.error();
        });
      })
    );
    return;
  }

  e.respondWith(
    caches.match(peticion).then(function (r) {
      return r || fetch(peticion).then(function (red) {
        if (red && red.ok) {
          var copia = red.clone();
          caches.open(CONCHA).then(function (c) { c.put(peticion, copia); });
        }
        return red;
      });
    })
  );
});
