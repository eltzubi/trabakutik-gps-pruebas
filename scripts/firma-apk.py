"""Comprueba que un APK va firmado con la llave fija de Trabakutik GPS.

Uso: python3 scripts/firma-apk.py APK CERTIFICADO.der
     python3 scripts/firma-apk.py APK            (solo enseña la huella)

POR QUE EXISTE. Hasta la 4.9.21 cada APK salia firmado con una llave
distinta: el flujo compilaba con la llave de depuracion que se inventa cada
maquina nueva de GitHub, y Android NO deja instalar encima una app con otra
firma. El autor tenia que desinstalar en cada version («nunca nunca nunca
deja instalar por encima»), y desinstalar borra las grabaciones guardadas
dentro de la app. Medido: 4.9.19, 4.9.20 y 4.9.21 llevaban tres certificados
distintos.

Si un dia el secreto FIRMA_CLAVE falta o Gradle deja de usar la llave, el APK
saldria otra vez con una llave al azar y nadie lo notaria hasta el movil. Esto
lo para antes de publicar.

Lee el bloque de firma v2/v3 a mano, sin el SDK de Android: con minSdk 26 el
APK no lleva firma v1 y keytool -printcert no ve nada.
"""
import hashlib, struct, sys

V2, V3 = 0x7109871A, 0xF05368C0


def certificados(ruta):
    b = open(ruta, 'rb').read()
    eocd = b.rfind(b'PK\x05\x06')
    if eocd < 0:
        raise SystemExit(ruta + ': no es un zip')
    cd = struct.unpack('<I', b[eocd + 16:eocd + 20])[0]
    if b[cd - 16:cd] != b'APK Sig Block 42':
        raise SystemExit(ruta + ': no lleva bloque de firma v2/v3')
    tam = struct.unpack('<Q', b[cd - 24:cd - 16])[0]
    p, fin, salida = cd - tam - 8 + 8, cd - 24, {}
    while p < fin:
        largo, = struct.unpack('<Q', b[p:p + 8])
        ident, = struct.unpack('<I', b[p + 8:p + 12])
        valor = b[p + 12:p + 8 + largo]
        if ident in (V2, V3):
            # firmantes -> firmante -> datos firmados -> (resumenes, certificados)
            datos = valor[12:]
            q = 4 + struct.unpack('<I', datos[:4])[0] + 4
            n, = struct.unpack('<I', datos[q:q + 4])
            salida[ident] = datos[q + 4:q + 4 + n]
        p += 8 + largo
    if not salida:
        raise SystemExit(ruta + ': el bloque de firma no trae ni v2 ni v3')
    return salida


def huella(der):
    return hashlib.sha256(der).hexdigest()


if __name__ == '__main__':
    certs = certificados(sys.argv[1])
    for ident, der in certs.items():
        print(('v2' if ident == V2 else 'v3'), huella(der))
    if len(sys.argv) > 2:
        esperado = huella(open(sys.argv[2], 'rb').read())
        malos = [i for i, der in certs.items() if huella(der) != esperado]
        if malos:
            raise SystemExit('EL APK NO VA FIRMADO CON LA LLAVE FIJA (esperado '
                             + esperado + '). No se publica: no se podria instalar encima.')
        print('Firmado con la llave fija', esperado)
