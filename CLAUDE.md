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

## La batería, antes de cada push

En este orden. Si algo falla, no se sube.

```
node scripts/construye.cjs --comprueba   # src/ y nuevo.html cuadran
node scripts/revisa-tipos.cjs            # fallos de nombre en el JavaScript
node --test tests/*.test.cjs             # 140 pruebas
node scripts/test-browser.cjs            # 8 bloques en Chromium de verdad
python3 scripts/test-native-turns.py
python3 tests/regression_tracking.py
python3 tests/sin_senal_gps.py
python3 tests/silencio.py
python3 tests/background_lifecycle.py
python3 tests/giros_limite.py
python3 scripts/test-gasto-bateria.py
python3 scripts/test-nombre-descarga.py
```

Integración corre todo esto, pero se pasa **antes** de subir, no después.

## Trampas que ya han mordido

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
- **Las pruebas que recortan por texto** (76 rodajas) se rompen al mover una
  línea. Es lo que se va quitando pieza a pieza.

## Reglas permanentes del autor

- **Nunca sus coordenadas** en nada que se suba. Un commit se bloqueó una vez
  por eso.
- **Los avisos hablados no dicen nombres de sitios.** Medido y decidido: ver
  `docs/decisiones.md`.
- **Un cambio, una batería, un push.** Varias roturas salieron de meter dos
  cosas a la vez.
- Lo que ya se midió y se decidió está en **`docs/decisiones.md`**. Léelo
  antes de volver a proponer algo que suene a idea nueva.
