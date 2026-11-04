# Revisión del navegador · 4 de noviembre de 2026

## Fallo principal

La web pública y GPS Pruebas no servían el mismo creador. `main/nuevo.html` permitía dibujar solamente sobre los tracks del catálogo; la edición GPS Pruebas tenía un planificador por caminos de OpenStreetMap. Publicar el perfil y los cambios de navegación en la web no actualizaba los recursos incluidos en la APK de pruebas.

La corrección de la web recupera el creador único por caminos de OpenStreetMap, el cálculo de alturas, mover puntos, deshacer, cerrar, ida y vuelta y guardar/reabrir. Conserva el perfil plegable y el inicio conjunto de grabación y guía. La importación GPX rechaza puntos sin latitud o longitud, en lugar de convertir una coordenada ausente en cero.

## Comprobaciones realizadas

| Parte | Evidencia | Límite |
| --- | --- | --- |
| Creación fuera del catálogo | Prueba de la interfaz con servicios reales en calles públicas de Bilbao: 29 puntos con altura; guardado y reapertura con 12 puntos para navegar. | Los caminos deben existir en OpenStreetMap y el cálculo necesita conexión. No se ha usado la ubicación privada del usuario. |
| Giros después de guardar | La ruta real conservó un giro de 99° a la derecha; el navegador envió el giro y la ruta al puente Android al pulsar Iniciar grabación. | El puente Android de esta prueba es una simulación; no demuestra voz o pitidos con el móvil bloqueado. |
| Giros importantes | Pruebas de 90°, herraduras y cambios de camino; descarte de curvas suaves y saltos aislados. | Los cruces identificados dependen de los datos de OpenStreetMap; fuera de su cobertura se detectan giros cerrados por geometría. |
| Carga y estado | Cargar o reabrir una ruta no inicia la guía. Mi posición no activa avisos de giro o desvío. | Una APK antigua puede tener otra interfaz empaquetada. |
| Grabar, Pausar, Parar, guardar | Pruebas de la botonera y los sondeos posteriores: pausa conserva la guía; parada y guardado la dejan apagada en la página. | El servicio real y las restricciones de Samsung requieren prueba en dispositivo. |
| Rutas y perfil | 70 trazados y sus alturas alineados; distancia publicada; huecos de altura sin inventar valores. | El desnivel del perfil es una estimación, separada de la ficha. |
| Creador | Deshacer, mover puntos, cerrar, ida y vuelta, cancelación de respuestas tardías y guardado con alturas; pruebas en cuatro anchos. | Fallos de los servicios conservan el borrador anterior, no dibujan una conexión ficticia. |
| Importación GPX | Importar, reabrir y conservar alturas; punto sin coordenadas rechazado sin guardar una ruta inválida. | Los GPX con tramos separados importan el tramo más largo tras avisar. |
| Mapas y filtros | Lectura cruzada del selector, capas, ruta elegida, ubicación y modos; pruebas de apertura y mapa montado. | IGN y PNOA necesitan conexión; no se han comprobado teselas de todas las zonas. |
| Sin conexión | Reapertura de página guardada con parámetro de ruta en Chromium. | No implica que se hayan descargado todos los mapas ni permite calcular un camino nuevo sin el servicio de rutas. |
| Android | Revisión del puente Java, TrackingService, permisos, manifiesto, recuperación del WebView, exportación y limitación de vista a 25.000 líneas. | No hay un dispositivo Android conectado. Sigue pendiente comprobar permisos iniciales, bloqueo de pantalla, pausa tras recrear la Activity y cancelación inmediata del audio. |
| APK de pruebas | Se inspeccionaron los bytes de las APK 4.9 y 4.10. La 4.10 incluye el perfil y el creador integrado; sus recursos coinciden con los comprobados. | La firma de la 4.10 difiere de la 4.9. No se puede instalar encima conservando datos. No recomendar desinstalar sin exportar las rutas. |
| Actualizaciones Android | El workflow actual compila y distribuye APK debug sin una identidad de firma persistente configurada. | La distribución Android necesita una firma estable y una prueba de actualización antes de darla por resuelta. |

## Qué no se declara comprobado

No se declara que todas las maniobras de cualquier GPX estén identificadas, que el teléfono vaya a mantener el GPS bajo cualquier restricción de batería, ni que los avisos se oigan con pantalla bloqueada. Tampoco se considera que una compilación correcta equivalga a una prueba en el teléfono.

`index.html` es un prototipo anterior independiente. El navegador que carga la app y enlaza la web es `nuevo.html`; no se ha eliminado el prototipo durante esta corrección.

## Repetir las pruebas

- `node --test tests/*.test.cjs`
- `node scripts/test-browser.cjs` con Playwright y Chromium instalados.
- `node scripts/test-creator-real.cjs` para la prueba opcional contra los servicios reales; requiere Python, conexión y disponibilidad de los servicios.
- `GPS_CHROMIUM_PATH` permite seleccionar un Chromium ya instalado.

La prueba con servicios reales usa puntos públicos de prueba. No sustituye una salida real ni debe cambiarse para publicar la ubicación de la vivienda del usuario.
