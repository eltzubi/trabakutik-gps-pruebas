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
node scripts/avisos-referencia.cjs      # cruces revisados y foto de avisos
# (sale con 2 si no encuentra los datos; en una sesion en la nube el clon se
#  llama en minusculas, asi que: RUTAS_MALLABIA=/home/user/rutas-mallabia)
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

- **Cuando el autor pide un cambio, en cuanto esta resuelto y comprobado se sube sin volver a preguntar.** Lo pidio el 15 de noviembre de 2026: «si te pido cambios, subes; no tienes que estar pidiendo otra vez "sube", siempre que hayas solucionado algo y no te hayas inventado nada, sin avisarme».

- **Y desde el 23 de noviembre de 2026, tampoco hace falta pedirle permiso
  para arreglar un fallo que veas tu.** Sus palabras: «no hace falta que tenga
  que pedir yo nada; si ves errores, los solucionas, siempre que sea para
  mejor. No hace falta que te dé permiso, ya lo tienes. Solo quiero que el
  navegador vaya 100 × 100 seguro y bien. No es que te busques un trabajo que
  sea cómodo. Haz lo que haga falta, pero siempre asegurando que todo funcione
  perfectamente». Lo que eso NO cambia: el orden de siempre -medir antes de
  tocar, un cambio, una bateria entera en verde y un push-, la regla de los
  avisos (la marca ✋ se apunta antes de tocar la regla) y que un cruce
  revisado no se cambia sin que lo diga el. Un fallo se arregla; un capricho
  de diseño, no. Y si una idea cambia lo que el ya decidio, se le pregunta.

- **NINGUN AVISO SE MIDE EN METROS FIJOS.** El autor va a cuatro velocidades
  muy distintas y lo dijo el 23 de noviembre de 2026: anda, va en bici («en
  bici puedo alcanzar velocidades de hasta sesenta kilometros por hora cuesta
  abajo, hay que tenerlo en cuenta») y va en coche («tal vez sea porque voy en
  coche, mas de veinte kilometros por hora, treinta y cinco, cuarenta»). De
  4 a 60 km/h hay quince veces mas metros por segundo. Asi que:
  1. Todo aviso se piensa en SEGUNDOS y se convierte a metros con la
     velocidad. Un numero fijo en metros es un fallo esperando a salir.
  2. **Un techo en metros tambien rompe el tiempo**, y eso no se ve leyendo:
     hay que calcular que segundos deja a 60 km/h. Los techos de los cuatro
     avisos estaban puestos andando y a 60 km/h dejaban el «... ahora» en 0,7
     s, encima del cruce. La velocidad ya esta tapada a 20 m/s en
     actualizaVelocidad, asi que el techo de cada aviso es su tiempo a esos
     20 m/s y no hace falta un segundo guardia.
  3. **Se mide desde donde EMPIEZA la maniobra, no desde su punto mas
     marcado.** El punto de una curva es donde mas se dobla el track, y la
     entrada cae unos 12 m antes: avisar a 10 m del punto era avisar dentro
     de la curva. Sus palabras: «en la mitad de la curva ya se yo que tengo
     que girar, ya lo veo».
  4. **No vale solo para la distancia a la que suena un aviso.** Cualquier
     metro que decida CUANDO se habla es lo mismo: el corte de «y enseguida
     a la izquierda» eran 30 m -27 s andando y 1,8 s a 60 km/h- y por eso se
     amontonaban las palabras con dos cruces seguidos, y el de «siguiente
     cruce a X metros» tambien. Los dos pasaron a tiempo el 23 de noviembre
     de 2026. Si un numero en metros decide algo que se oye, es sospechoso.

  **Como se comprueba, y no leyendo el codigo.** `scripts/test-native-turns.py
  --replay <fichero>` corre el checkTurns de produccion sobre un recorrido
  inventado y saca cada frase con su segundo. Un fichero de repeticion es:
  el numero de puntos, los puntos (lat lon), la lista de giros de ida
  (cuantos, y luego «indice lado tipo salida recto» por giro), la de vuelta,
  y despues una linea por posicion con «ms lat lon precision velocidad». Se
  hace el mismo recorrido a 4, 18, 40 y 60 km/h y se MIRA la separacion entre
  frases: dos frases en el mismo segundo, o un aviso con menos de dos
  segundos, es el fallo. Asi salieron los tres de esta noche, que leyendo el
  codigo no se veian.

- **LA PANTALLA DEL CRUCE NO SE TOCA SIN MEDIRLA, Y NUNCA SUPONIENDO COMO
  LLEVA EL MOVIL.** Se rompio dos veces seguidas en dos dias, las dos con la
  bateria en verde, porque ninguna prueba mira si la ficha APARECE de verdad:
  1. Al moverla al primer pitido empezo a abrirse en todos los cruces y en
     zona de cruces seguidos no se soltaba: «no se va de la pantalla de
     cruces y no puedo marcar "falto aqui"».
  2. Al arreglar eso se le puso «si la aplicacion esta delante, no se abre»,
     suponiendo que iba con el movil dormido. Va con la aplicacion delante en
     el soporte de la bici -lo habia dicho el mismo- y se quedo MUDA: «en la
     ultima actualizacion me ha dejado de salir la pantalla de los cruces».
  Asi que: una suposicion sobre como lleva el movil NO es base para un
  cambio. Si el comportamiento depende de eso, se le pregunta, o se hace que
  no dependa. Y antes de subir se mide sobre una ruta suya con el banco de
  repeticion, contando CUANTAS fichas salen, cuanto tiempo esta la pantalla
  encendida y si se solapan. El 24 de noviembre de 2026: 10 fichas en 9,3 km,
  el 6 % del tiempo a 18 km/h y el 14 % a 40.

- **El creador tiene que facilitar trazar la ruta.** Lo dijo el 23 de
  noviembre de 2026: «a la hora de crear tiene que facilitar trazar la ruta,
  teniendo en cuenta todas las opciones que puedan ocurrir al guiarnos luego».
  Las dos mitades cuentan: dibujar tiene que ser fácil -nada de obligarle a
  dar puntos cortísimos- y lo que salga tiene que guiar bien después. Cuando
  las dos chocan, se busca la condición que separa los dos casos, no se elige
  una. Ejemplo hecho: dos calzadas juntas en la misma dirección son una sola
  al dibujar, y lo que de verdad influiría en el cruce lo sigue parando
  `calculaCalzada`.

- **Un aviso que falla se apunta ANTES de tocar la regla** (lo pidió el autor
  el 22 de noviembre de 2026: «no podemos estar siempre retocando»). Siempre
  en este orden:
  0. **Las marcas ✋ del autor se pegan tal cual** en
     `tests/referencia/marcas-campo.json`, aunque su ruta no sea de las 75
     publicadas: son la fuente fechada y antes se perdían en la pantalla del
     móvil. Cada marca dice qué pasó: `sobraba` (no tenía que haber aviso),
     `falto` (tenía que haber uno) o `amontonado` (hubo demasiados; `deja`
     dice cuántos bastaban). `node scripts/marcas-campo.cjs` dice cuáles ha
     resuelto ya un dato nuevo y cuáles siguen vivas. El GPX de una ruta no publicada va en
     `tests/referencia/trazados/`, que **no se sube** (son sus recorridos);
     sin él la marca sale como «sin trazado» y no cuenta como fallo.
  1. Se añade el cruce a `tests/referencia/cruces-revisados.json`: qué dijo y
     qué **debía** hacer (la decisión, no la frase; «callar» también vale),
     con su fuente fechada, que tiene que ser una marca ✋ o una captura,
     nunca un kilómetro de memoria. `node scripts/avisos-referencia.cjs
     --ancla <ruta> <ida|vuelta> <km>` da la llegada, la salida y el punto.
  2. Se cambia la regla.
  3. `node scripts/avisos-referencia.cjs`: el cambio vale solo si ese cruce
     sale bien y **ninguno de los ya revisados se rompe**. Los avisos que la
     foto marca como cambiados se miran uno a uno; si son buenos,
     `--escribe-foto`.
  4. Si se rompe un cruce revisado, no se sube: se busca otra solución, o se
     le pregunta al autor cuál de los dos manda.
  Un cruce revisado no se borra ni se cambia su «debía» sin que lo diga el
  autor.

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
