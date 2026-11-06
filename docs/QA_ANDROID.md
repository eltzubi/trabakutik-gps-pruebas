# Auditoría Android Trabakutik GPS — 2026-11-06

## Alcance
Rama `auditoria-gps-giros-ci-20261106`, PR #12. No se ha modificado `main`.

## Evidencias verificadas
- Pipeline original del PR #12: `assembleDebug` y pruebas JS completadas correctamente antes de añadir controles.
- Tras activar Android Lint, la ejecución 42243408042 encontró **8 errores y 11 advertencias**.
- La mayoría eran constantes no declaradas, uso de API 29 con `minSdk 26`, permisos de localización, conversiones dependientes del idioma y advertencias de privacidad.
- El informe original de Lint está en el artefacto `TrabakutikGPS-Informes` de la ejecución 42243408042.
- Los nuevos análisis de formato Kotlin encontraron problemas de estructura en Gradle, tests y motor de progreso. Se han corregido sobre esta rama; falta verificar el último resultado de CI.

## Cambios realizados
- `TrackingService.java`: controla permisos y `SecurityException` al escuchar la ubicación por red.
- `MainActivity.java`: anotación de API 29 y guarda de versión; constantes correctas; `Locale.ROOT`; duraciones de Toast; textos en recursos.
- `RouteProgressMatcher.kt`: lógica GPS separada, comprobable sin Android. Limita saltos entre segmentos superpuestos, valida coordenadas y velocidades.
- `RouteProgressMatcherTest.kt`: tests de bucles, pérdida de progreso, desvíos y rutas largas.
- `AndroidNavigationSmokeTest.kt`: comprobación instrumentada de Manifest, servicio y recreación de Activity.
- `build.gradle.kts`: Kotlin, ktlint, detekt, JaCoCo, AndroidX Test y API 36.
- `android-apk.yml`: JDK 21, tareas de estilo, pruebas, Lint, emulador y artefactos Debug/Release; informes conservados.

## Riesgos pendientes: no aprobar publicación
1. Confirmar resultado positivo de todas las tareas de CI para el último commit.
2. La cobertura del 90 % no se ha demostrado. El límite no se puede rebajar ni excluir arbitrariamente código antiguo.
3. Verificar sobre el teléfono real la grabación y la voz con pantalla bloqueada, llamadas, cambio de red y modo avión.
4. Probar Android Auto únicamente si existe integración Android Auto declarada e implementada: hoy no consta esa integración.
5. Auditar exposición de `addJavascriptInterface` y navegación externa a sitios no confiables.
6. Realizar pruebas de consumo energético y memoria de varias horas; las pruebas unitarias no las sustituyen.
7. La APK Debug de GitHub Releases no equivale a un AAB firmado para publicar en Google Play.
8. Configurar reglas de protección de `main` con comprobaciones obligatorias. Un workflow fallido por sí mismo no impide que un administrador fusione cambios.
9. Realizar un ciclo real de pruebas de estrés y recuperación del servicio tras muerte del proceso o reinicio.
10. Añadir análisis de datos personales y declaración Data Safety antes de subir a Play.

## Criterio de salida
No fusionar PR #12 ni publicar Play hasta superar CI, validación instrumental y manual relevante. Registrar los informes en cada ejecución; no marcar pruebas sin ejecutar como realizadas.

## Auditoría de uso prolongado y resistencia (segunda pasada)
- **Avisos de giro desordenados:** el lector nativo suponía una lista de giros ya ordenada y el algoritmo podía omitir avisos posteriores. Ahora ordena los giros por índice de track. Pendiente ensayo real de retroceso y cruces repetidos.
- **Grabación GPX interrumpida:** había un `catch(Exception ignored)` al escribir puntos de grabación. Ahora registra el fallo y marca `recordingError`, visible en la notificación del servicio. Pendiente comprobar escritura con almacenamiento lleno.
- **Rutas largas:** el puente rechaza más de 15000 puntos / 2 MB, antes sin aviso. Ahora guarda un mensaje de error y muestra advertencia. El lector de rutas rechaza archivos truncados o coordenadas inválidas, en lugar de cargar parcialmente un track. Sigue pendiente soportar tracks mayores mediante otro modelo de datos y pruebas de memoria.
- **WebView:** el código no destruía explícitamente ambas vistas ni cancelaba el selector de documentos al destruir la Activity. Se ha añadido liberación sin detener TrackingService. Pendiente análisis instrumental de memoria.
- **Compatibilidad QA:** Java y Kotlin deben generar JVM 17 aunque la compilación utilice JDK 21. Solucionado en Gradle; probado previamente en `assembleQa`, debe validarse nuevamente tras cada cambio.
- **Calidad estática:** ktlint y Detekt están activos y han bloqueado la rama; no se han apagado reglas. Se ha dividido el comparador GPX en métodos de menor complejidad. No se aprobará mientras el último pipeline no esté completamente verde.

## Riesgos que siguen abiertos
- El GPS escribe archivos GPX/TSV y evalúa hasta miles de segmentos en callbacks asociados al hilo principal. Puede provocar retrasos o ANR en dispositivos lentos y grabaciones muy largas. Hace falta medición y una refactorización cuidadosa con pruebas de concurrencia; no es seguro mover toda esa lógica de hilo sin proteger su estado.
- `addJavascriptInterface` se expone desde WebViews que cargan páginas remotas. Necesita una revisión específica de límites de origen y contenido embebido antes de publicar.
- La ruta base no está completamente disponible sin Internet (carga inicial de WebView y recursos web); una prueba unitaria de cálculo offline no acredita navegación offline.
- El servicio usa `START_NOT_STICKY` y requiere ensayos tras muerte del proceso, reinicio y bloqueo prolongado.
- La cobertura de líneas del 90 % todavía no se ha demostrado y las pruebas de memoria, batería, Android Auto y llamadas reales no han pasado.
- Aunque GitHub Actions falle, impedir el merge en `main` requiere activar protección de rama / ruleset con checks obligatorios en la configuración de GitHub.

## Decisión de publicación
**NO APROBADA.** Compilación QA no sustituye cobertura, integración, pruebas reales y revisión de seguridad. No se ha fusionado la rama.

## Ciclo QA posterior — escrituras atómicas y cierre de actividad
- **Causa raíz:** `MainActivity.Bridge` guardaba `ruta-activa.json` y `giros-activos.json` directamente con `FileOutputStream`. Un cierre durante la escritura podía dejar un archivo JSON parcial.
- **Corrección aplicada:** `AtomicNavigationStore.write()` utiliza `android.util.AtomicFile` con `finishWrite()` / `failWrite()`. La operación se serializa para evitar escrituras concurrentes del propio proceso. Las tres rutas de escritura identificadas en `MainActivity` usan este helper.
- **Prueba añadida:** `routeAndTurnJsonUseAtomicWrites` en las pruebas instrumentadas de Android; valida creación y sustitución de archivo, pendiente confirmación de ejecución en el emulador.
- **Causa raíz:** `CrashReport.install()` añadía un nuevo manejador `UncaughtExceptionHandler` global en cada creación de la Activity, encadenando manejadores tras sucesivas recreaciones.
- **Corrección aplicada:** `install()` sincronizado e idempotente en el proceso. **Prueba añadida:** `crashReporterDoesNotStackHandlersAfterMultipleInstalls`.
- **CI:** se ha corregido el orden de imports de la prueba Android informado por ktlint. Una nueva ejecución se inició sobre el último commit, pero la validación completa no está acreditada hasta que terminen emulador, Lint, Release y cobertura.
- **Nota sobre cobertura:** JaCoCo midió 78/928 líneas (8,4 %) en la ejecución 42248648450. No se ha relajado el mínimo del 90 %, ni se han excluido clases heredadas.
