#!/usr/bin/env python3
"""Prepara solo el checkout de CI para una APK aislada con la web del PR."""
import argparse
import hashlib
import json
from pathlib import Path

FILES = ('nuevo.html', 'data/rutas.json', 'data/trailhead.json',
         'data/alturas.json', 'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css')


def replace_once(text, before, after):
    if text.count(before) != 1:
        raise ValueError('No se puede preparar la APK: ha cambiado un anclaje del código')
    return text.replace(before, after, 1)


def prepare(root, version):
    java_path = root / 'android/app/src/main/java/com/trabakutik/gps/MainActivity.java'
    manifest_path = root / 'android/app/src/main/AndroidManifest.xml'
    gradle_path = root / 'android/app/build.gradle.kts'
    java, manifest, gradle = (p.read_text() for p in (java_path, manifest_path, gradle_path))
    java = replace_once(java, 'w.setWebViewClient(new WebViewClient(){', '''w.setWebViewClient(new WebViewClient(){
   // Solo la edición de pruebas: servir la interfaz exacta incluida en la APK.
   @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
    android.net.Uri u=request.getUrl();
    if(!navigator||!"https".equals(u.getScheme())||!"eltzubi.github.io".equals(u.getHost()))return null;
    String p=u.getPath();
    if(p==null||!p.startsWith("/trabakutik-gps-pruebas/"))return null;
    String asset=p.substring("/trabakutik-gps-pruebas/".length()),mime;
    switch(asset){
     case "nuevo.html":mime="text/html";break;
     case "data/rutas.json":case "data/trailhead.json":case "data/alturas.json":mime="application/json";break;
     case "vendor/leaflet/leaflet.js":mime="text/javascript";break;
     case "vendor/leaflet/leaflet.css":mime="text/css";break;
     default:return null;
    }
    try{return new WebResourceResponse(mime,"UTF-8",getAssets().open("gps-prueba/"+asset));}
    catch(java.io.IOException e){return new WebResourceResponse("text/plain","UTF-8",500,"Recurso de prueba ausente",java.util.Collections.emptyMap(),new java.io.ByteArrayInputStream(new byte[0]));}
   }''')
    java = replace_once(java, 'MainActivity.this,"com.trabakutik.gps.fileprovider",f',
                        'MainActivity.this,getPackageName()+".fileprovider",f')
    java = replace_once(java, 'title.setText("Trabakutik");', 'title.setText("GPS Pruebas");')
    java = replace_once(java, '"trabakutikgps".equals(uri.getScheme())',
                        '"trabakutikgps-pruebas".equals(uri.getScheme())')
    gradle = replace_once(gradle, 'applicationId = "com.trabakutik.gps"',
                          'applicationId = "com.trabakutik.gps.pruebas"')
    manifest = replace_once(manifest, 'android:label="Trabakutik GPS"',
                            'android:label="GPS Pruebas"')
    manifest = replace_once(manifest, 'android:authorities="com.trabakutik.gps.fileprovider"',
                            'android:authorities="com.trabakutik.gps.pruebas.fileprovider"')
    manifest = replace_once(manifest, 'android:scheme="trabakutikgps"',
                            'android:scheme="trabakutikgps-pruebas"')
    manifest = replace_once(manifest, 'android:name=".MainActivity"',
                            'android:name="com.trabakutik.gps.MainActivity"')
    manifest = replace_once(manifest, 'android:name=".TrackingService"',
                            'android:name="com.trabakutik.gps.TrackingService"')
    originals = {name: (root / name).read_bytes() for name in FILES}
    html = originals['nuevo.html'].decode()
    # La edición de campo usa los recursos empaquetados; nunca instala el SW
    # publicado que podría mezclar la versión normal con la del PR.
    start = html.index('// Guardar la pagina en el movil para poder abrirla SIN COBERTURA.')
    end = html.rindex('})();')
    if start >= end or html[start:end].count("navigator.serviceWorker.register('sw.js')") != 1:
        raise ValueError('No se puede aislar el registro del service worker')
    bundled = dict(originals)
    bundled['nuevo.html'] = (html[:start] + html[end:]).encode()
    out = root / 'android/app/src/main/assets/gps-prueba'
    for name, data in bundled.items():
        target = out / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    (out / 'version.json').write_text(json.dumps({
        'commit': version,
        'original': {n: hashlib.sha256(b).hexdigest() for n, b in originals.items()},
        'empaquetado': {n: hashlib.sha256(b).hexdigest() for n, b in bundled.items()},
        'nota': 'Interfaz del PR empaquetada; service worker desactivado solo en esta edición.'
    }, indent=2))
    for p, content in ((java_path, java), (manifest_path, manifest), (gradle_path, gradle)):
        p.write_text(content)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path('.'))
    parser.add_argument('--version', required=True)
    args = parser.parse_args()
    prepare(args.root.resolve(), args.version)
    print('APK aislada: GPS Pruebas, con interfaz del PR incluida')
