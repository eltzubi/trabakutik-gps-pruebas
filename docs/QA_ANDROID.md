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
