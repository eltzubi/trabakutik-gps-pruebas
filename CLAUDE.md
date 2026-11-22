# CLAUDE.md

**Idioma: contesta siempre en castellano, y al autor se le habla de tú, no de
usted.** El euskera solo para los textos de la web (otro repositorio).

## Qué es esto

El navegador GPS de Trabakutik, en dos piezas que se publican juntas:

- **`nuevo.html`**, la página, servida por GitHub Pages en
  `eltzubi.github.io/trabakutik-gps-pruebas/nuevo.html`. Un cambio aquí llega
  al móvil **sin reinstalar nada**.
- **`android/`**, la aplicación: un WebView que carga esa página más un
  servicio nativo que hace el GPS, la voz, los avisos de giro y el GPX. Un
  cambio aquí **compila un APK nuevo** (el flujo sube solo el número de
  versión: no lo toques a mano) y el autor tiene que reinstalar.

`TrabakutikGPS.apk` en la raíz es deliberado: es lo que se descarga desde
`instalar.html`.

## nuevo.html NO SE EDITA A MANO

Se monta con las diez piezas de `src/js/` (más `src/nuevo.plantilla.html`):

```
node scripts/construye.cjs              # monta nuevo.html
node scripts/construye.cjs --comprueba  # falla si no cuadran
```

**El orden de las piezas es el de sus nombres (01, 02, 03…) y no se cambia**:
las 73 variables compartidas se declaran en una pieza y se usan en otra, así
que reordenar cambia cuándo existe cada cosa.

**Al tocar una pieza, se cierra**, y eso quiere decir tres cosas:
1. lo que pueda dejar de ser global sin cambiar el comportamiento, deja de
   serlo;
2. sus pruebas dejan de recortar el fichero por marcadores de texto y piden
   la pieza con `require()`;
3. se queda con su nombre y su número.

No hay proyecto de reforma: cada pieza se cierra cuando haya que tocarla por
un trabajo de verdad. Lo decidió el autor el 12 de noviembre de 2026.

**Cerradas: 04, 05, 06, 07, 08, 09 y 10** (las seis últimas, el 15 de
noviembre de 2026). **Sin cerrar: 01, 02 y 03.** Cómo es una pieza cerrada:

- **Se puede leer sola**: las diez lo hacen desde que la apertura y el cierre
  del bloque de la página (`(()=>{'use strict';` … `})();`) están en la
  plantilla y no en la 01 y la 10. Si una frontera entre piezas cae en mitad
  de una función, se mueve la frontera: `nuevo.html` tiene que salir
  idéntico byte a byte (se comprueba con `cmp`).
- **Exporta** sus funciones al final (`if(typeof module==='object'…)`, que en
  la página no hace nada) y su estado con accesores, que leen y escriben la
  variable de verdad.
- **Sus pruebas la piden con `pieza()` de `tests/pieza.cjs`**: carga la pieza
  con `require()`, le deja en `globalThis` lo que usa de las demás (en la
  página comparten ámbito) y limpia lo que dejó la prueba anterior. Lo que
  la pieza pone en marcha al arrancar (botones, relojes, la caché del mapa)
  no se toca: se carga con una pantalla de mentira (`arranque09`,
  `arranque10`). `trozo()` saca un trozo del código de una función ya
  cargada, para las pruebas que miran el texto de la ficha o de la voz.
- **Las pruebas de integración que cruzan varias piezas con estado
  compartido siguen recortando** (abrir una ruta guardada, terminar la
  salida, la ficha del giro, cerrar el círculo del creador): con piezas
  sueltas, las variables compartidas no estarían en un solo sitio. Lo mismo
  que ya pasaba con la 04.

## La batería, antes de cada push

En este orden. Si algo falla, no se sube.

```
node scripts/construye.cjs --comprueba   # src/ y nuevo.html cuadran
node scripts/revisa-tipos.cjs            # fallos de nombre en el JavaScript
node --test tests/*.test.cjs             # 303 pruebas
node scripts/test-browser.cjs            # 10 bloques en Chromium de verdad
python3 scripts/test-native-turns.py
python3 tests/regression_tracking.py
python3 tests/sin_senal_gps.py
python3 tests/silencio.py
python3 tests/background_lifecycle.py
python3 tests/giros_limite.py
python3 tests/grabaciones_borrar.py
python3 tests/caida_sos.py
python3 tests/barometro.py
python3 tests/llegada.py
python3 tests/fuera_ruta_igual.py
python3 tests/tiempo_marcha.py
python3 tests/informe_fallo.py
python3 scripts/test-gasto-bateria.py
python3 scripts/test-nombre-descarga.py
node scripts/avisos-referencia.cjs      # cruces revisados y foto de avisos (sale con 2 sin Rutas-Mallabia al lado)
```

Integración corre todo esto, pero se pasa **antes** de subir, no después.

## Trampas que ya han mordido

- **El código de salida de la batería, no su texto.** El 15 de noviembre de
  2026 se subió con tres pruebas en rojo: la orden acababa en
  `bateria.sh | tail -1 && git push`, y `&&` miraba el resultado de `tail`,
  que siempre sale bien. Lo que decide es el código de salida de la batería
  misma (`if ! bash bateria.sh; then … no se sube; fi`). Si una orden termina
  en `| algo && git push`, está mal.
- **Compilar Java sin el SDK de Android**: `javac` sobre `android/**` da
  cientos de errores porque no existe ninguna clase de Android. Eso es
  normal. Lo que NO vale es contar errores: `javac` se para en 100 por
  defecto y el número sale siempre igual. Se compara **la lista de símbolos
  que faltan** antes y después (`-Xmaxerrs 10000 … | grep "symbol:"`): si
  aparece uno nuevo que no sea de Android, es un fallo de verdad.
- **Nada que se oiga con la pantalla apagada puede depender de la página**:
  ahí se duerme (`pauseTimers`), así que sus `setInterval` no corren. Costó
  los giros al revés de la 4.9.17: el sentido de la marcha lo decidía la
  página. Lo que se oye lo decide el servicio.
- **`const` y `let` dentro de un `vm` no son propiedades del contexto**: se
  leen evaluando su nombre (`vm.runInContext('redOsm', ctx)`).
- **`deepStrictEqual` falla entre realms**: compara `JSON.stringify`.
- **`setup()` de `scripts/test-browser.cjs` inyecta `window.TrabakutikAndroid`**,
  así que la página se cree dentro de la aplicación. Para probar lo que ve
  alguien desde la web, crea el contexto sin `setup()`.
- **Las pruebas que recortan por texto** (51 rodajas) se rompen al mover una
  línea. Es lo que se va quitando pieza a pieza.

## Reglas permanentes del autor

- **Cuando el autor pide un cambio, en cuanto esta resuelto y comprobado se sube sin volver a preguntar.** Lo pidio el 15 de noviembre de 2026: «si te pido cambios, subes; no tienes que estar pidiendo otra vez "sube", siempre que hayas solucionado algo y no te hayas inventado nada, sin avisarme». Vale para lo que el pide, no para cambios que se te ocurran a ti: esos se proponen y se espera.

- **Nunca sus coordenadas** en nada que se suba. Un commit se bloqueó una vez
  por eso.
- **Los avisos hablados no dicen nombres de sitios.** Medido y decidido: ver
  `docs/decisiones.md`.
- **Un cambio, una batería, un push.** Varias roturas salieron de meter dos
  cosas a la vez.
- Lo que ya se midió y se decidió está en **`docs/decisiones.md`**. Léelo
  antes de volver a proponer algo que suene a idea nueva.

## Habilidades instaladas (`.claude/skills/`)

- **`duel`**: una segunda opinión de GPT sobre un cambio (ver su SKILL.md
  para la clave y el `--stream`).
- **`replica-*`** (once, de github.com/Jakeschincariol/replica-skill, MIT;
  licencia en `replica-LICENSE.txt`). Las instaló el autor el 15 de noviembre
  de 2026 «para que nos pueda ayudar con el navegador y la web». Aquí sirven
  para **estudiar cómo resuelven algo otras apps** (AllTrails, Wikiloc,
  Komoot) y traer la idea, no para clonar una app: lo suyo -código, logos,
  textos, fotos- no se copia nunca, y las propias habilidades lo exigen. Las
  más útiles: `replica-recon` (cómo es una app por dentro, de fuentes
  públicas), `replica-entrepreneur` (qué se queja la gente en las reseñas),
  `replica-test` (recorrer los flujos buscando fallos) y el comprobador de
  contraste de `replica-design` (`python3 contrast.py "#9fb3c0" "#0f1a20"`).
