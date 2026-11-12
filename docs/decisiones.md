# Decisiones tomadas, para no volver a proponerlas

Cosas que ya se plantearon, se midieron o se probaron, y que el autor
**decidió**. Están aquí para que nadie —ni una sesión futura— las vuelva a
sacar como si fueran una idea nueva.

## Los avisos no dicen nombres de sitios (12 de noviembre de 2026)

El aviso de subida dice **«Empieza una subida de 5,5 kilómetros y 344 metros
de desnivel»**. Se ofreció decir además hasta dónde —«subida hasta
Zengotitagane»— cogiendo los topónimos como hace `make_places.py` en la web.
El autor dijo que no: **«los nombres prefiero no meterlos, por si hay
equivocación»**.

Y tiene razón medida. En la web está contado: de los 96 lugares que nombran
los títulos de las rutas, la mediana está a 16 m del track, pero `argineta`
nombra **Trabakua a 763 m**, `iturreta` y `exigente` nombran **Barinaga a
495 m**, y 16 de 96 pasan de 150 m. Para un título eso vale —nombra por
dónde pasa la ruta—; para una **voz en marcha**, no: oír «subida hasta
Zengotitagane» cuando el alto es otro es peor que no oír nada, porque te hace
tomar una decisión con un dato falso.

Lo mismo vale para cualquier otro aviso hablado: **los metros y la distancia
son datos del propio track y no se pueden equivocar; un nombre, sí**.

## Dónde se afina el aviso de subida

Una subida se detecta cuando en 200 m se sube el 10 %, se sigue hasta la cima
—acaba al perder 25 m desde el punto más alto— y se canta una sola vez si
sube 60 m o mide 600. Esos dos últimos números son el dial, en
`NavigationMetrics.java`. Mover el listón apenas cambia la cuenta: con 40/400
son 265 avisos en las 72 rutas y con 100/1200, 193. Lo que quitó el ruido fue
**juntar la subida entera**, de 794 avisos a 238.

## La batería: primero medir, luego bajarla (12 de noviembre de 2026)

El autor preguntó cuánto gasta la aplicación. No se contesta a ojo, así que
la aplicación **se mide a sí misma**: mientras graba, el servicio apunta una
línea cada cinco minutos en `bateria.tsv` —minutos, nivel de batería, metros
y posiciones recibidas— y al parar deja el resumen de la salida:
**«6 h 12 min · 42,3 km · 34 % de batería · 5,5 % por hora · 58
posiciones/min»**. Sale en el mismo aviso de «Salida finalizada».

Tres reglas del resumen, para que no mienta:

- **Con menos de 15 minutos no hay «% por hora».** A diez minutos, un solo
  punto de batería daría 6 %/h o 0 %/h según cuándo lo marque el teléfono.
- **Si iba cargando, o el nivel subió, se dice y no se da número.** Un gasto
  falso es peor que ninguno.
- **Si el teléfono no da el nivel, se dice**; no se inventa un 0 %.

Lo que **todavía no se ha tocado** es el gasto en sí. La idea pendiente es
pedir posiciones más despacio cuando el siguiente cruce está lejos, pero eso
se decide **con el número de una salida real delante**, no antes: tocar la
frecuencia del GPS a ciegas es arriesgar la grabación para ahorrar algo que
no se ha medido.
