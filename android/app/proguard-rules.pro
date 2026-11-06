# Trabakutik GPS: reglas de conservación para compilaciones optimizadas.
# El puente WebView expone únicamente métodos anotados con JavascriptInterface.
# Se deja la contracción desactivada hasta contar con pruebas UI automatizadas
# de la comunicación WebView <-> servicio nativo.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes *Annotation*
