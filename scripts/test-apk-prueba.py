"""Verifica la preparación sin modificar el repositorio de trabajo."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('packager', ROOT / 'scripts/preparar-apk-prueba.py')
packager = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packager)


class PreviewApk(unittest.TestCase):
    def test_checkout_aislado_y_recursos_del_pr(self):
        paths = list(packager.FILES) + [
            'android/app/src/main/java/com/trabakutik/gps/MainActivity.java',
            'android/app/src/main/AndroidManifest.xml', 'android/app/build.gradle.kts']
        originals = {n: (ROOT / n).read_bytes() for n in paths}
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            for n, data in originals.items():
                p = root / n
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_bytes(data)
            packager.prepare(root, 'commit-probado')
            assets = root / 'android/app/src/main/assets/gps-prueba'
            info = json.loads((assets / 'version.json').read_text())
            self.assertEqual(info['commit'], 'commit-probado')
            for n in packager.FILES:
                self.assertEqual(info['original'][n], hashlib.sha256(originals[n]).hexdigest())
                data = (assets / n).read_bytes()
                self.assertEqual(info['empaquetado'][n], hashlib.sha256(data).hexdigest())
                if n != 'nuevo.html':
                    self.assertEqual(data, originals[n])
            html = (assets / 'nuevo.html').read_text()
            self.assertNotIn('navigator.serviceWorker.register', html)
            self.assertIn('elevationText(item.points)', html)
            self.assertIn('nativeTrackComplete', html)
            manifest = (root / 'android/app/src/main/AndroidManifest.xml').read_text()
            self.assertIn('com.trabakutik.gps.pruebas.fileprovider', manifest)
            self.assertIn('android:label="GPS Pruebas"', manifest)
            self.assertIn('android:name="com.trabakutik.gps.MainActivity"', manifest)
            self.assertIn('applicationId = "com.trabakutik.gps.pruebas"', (root / 'android/app/build.gradle.kts').read_text())
        for n, data in originals.items():
            self.assertEqual((ROOT / n).read_bytes(), data, 'no modificar el checkout normal')


if __name__ == '__main__':
    unittest.main()
