"""Reproduce giros Android localmente con los tiempos de un GPX (Java 21 y Node)."""
import argparse
from datetime import datetime
import json
import math
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]


def lee_gpx(fichero, tramo):
    raiz = ET.parse(fichero).getroot()
    segmentos = raiz.findall('./{*}trk/{*}trkseg')
    if not 1 <= tramo <= len(segmentos):
        raise ValueError(f'{fichero.name}: tramo {tramo} no existe (hay {len(segmentos)})')
    puntos = []
    for elemento in segmentos[tramo - 1].findall('{*}trkpt'):
        lat, lon = float(elemento.attrib['lat']), float(elemento.attrib['lon'])
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise ValueError(f'{fichero.name}: coordenadas inválidas')
        puntos.append((lat, lon, elemento.findtext('{*}time')))
    if not 2 <= len(puntos) <= 15000:
        raise ValueError(f'{fichero.name}: usa un tramo de 2 a 15.000 puntos')
    return puntos


def lecturas(puntos, inverso):
    tiempos = []
    for _, _, texto in puntos:
        if not texto:
            raise ValueError('La grabación necesita hora en cada punto')
        fecha = datetime.fromisoformat(texto.replace('Z', '+00:00'))
        if fecha.utcoffset() is None:
            raise ValueError('La hora del GPX necesita zona horaria')
        tiempos.append(fecha)
    base = tiempos[0]
    ms = [round((t - base).total_seconds() * 1000) for t in tiempos]
    if any(a > b for a, b in zip(ms, ms[1:])):
        raise ValueError('Las horas del GPX deben estar en orden')
    if inverso:
        ms = [ms[-1] - t for t in reversed(ms)]
        puntos = list(reversed(puntos))
    anterior = None
    for t, (lat, lon, _) in zip(ms, puntos):
        if anterior and t == anterior[0]:
            continue
        velocidad = 0.0
        if anterior:
            prev_t, a, b = anterior
            dlat, dlon = math.radians(lat - a), math.radians(lon - b)
            h = math.sin(dlat / 2)**2 + math.cos(math.radians(a)) * math.cos(math.radians(lat)) * math.sin(dlon / 2)**2
            velocidad = 12742000 * math.asin(math.sqrt(min(1.0, h))) / ((t - prev_t) / 1000)
        yield t, lat, lon, velocidad
        anterior = t, lat, lon


def giros_nativos(lista):
    yield str(len(lista))
    for giro in lista:
        tipo, salida = giro['t'], 0
        if giro.get('h'):
            tipo = 4 if tipo else 3
        if giro.get('ro'):
            tipo, salida = 5, giro.get('rs', 0)
        if tipo in (1, 2) and giro.get('sg'):
            tipo, salida = 6, giro['sg']
        yield f"{giro['i']} {giro['dir']} {tipo} {salida} {int(bool(giro.get('rr')))}"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('grabacion', type=Path)
    parser.add_argument('--ruta', type=Path, help='GPX que se estaba siguiendo. Por defecto, usa la grabación')
    parser.add_argument('--cruces', type=Path, help='cruces-zona.json local. Sin él solo se analiza la geometría')
    parser.add_argument('--tramo', type=int, default=1, help='tramo de la grabación, empezando en 1')
    parser.add_argument('--tramo-ruta', type=int, default=1)
    parser.add_argument('--sentido', choices=('ida', 'vuelta', 'ambos'), default='ida',
                        help='vuelta invierte la secuencia y conserva el intervalo entre puntos')
    parser.add_argument('--precision', type=float, default=5, help='precisión simulada en metros (por defecto 5)')
    args = parser.parse_args()
    if not math.isfinite(args.precision) or args.precision <= 0:
        parser.error('--precision debe ser positiva y finita')
    try:
        grabacion = lee_gpx(args.grabacion, args.tramo)
        ruta = lee_gpx(args.ruta, args.tramo_ruta) if args.ruta else grabacion
        zona = json.loads(args.cruces.read_text()) if args.cruces else None
        version = re.search(r'versionName = "([^"]+)"', (ROOT / 'android/app/build.gradle.kts').read_text())[1]
        datos = {'puntos': [p[:2] for p in ruta], 'zona': zona, 'version': version}
        listas = json.loads(subprocess.check_output(
            ['node', 'scripts/giros-para-repeticion.cjs'], input=json.dumps(datos), text=True, cwd=ROOT))
        print(f'Precisión simulada: {args.precision:g} m · velocidad estimada entre muestras', flush=True)
        if zona is None:
            print('Sin fichero de cruces: avisos deducidos de la geometría del track.', flush=True)
        sentidos = ('ida', 'vuelta') if args.sentido == 'ambos' else (args.sentido,)
        for sentido in sentidos:
            fixes = list(lecturas(grabacion, sentido == 'vuelta'))
            if len(fixes) < 2:
                raise ValueError('Se necesitan al menos dos horas de grabación distintas')
            with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8') as entrada:
                print(len(ruta), file=entrada)
                for lat, lon, _ in ruta:
                    print(lat, lon, file=entrada)
                for lista in (listas['ida'], listas['vuelta']):
                    print(*giros_nativos(lista), sep='\n', file=entrada)
                for t, lat, lon, velocidad in fixes:
                    print(t, lat, lon, args.precision, velocidad, file=entrada)
                entrada.flush()
                print(f'\n{sentido.upper()} · tiempo (ms) / distancia al giro (m) / frase', flush=True)
                salida = subprocess.check_output(
                    [sys.executable, 'scripts/test-native-turns.py', '--replay', entrada.name], cwd=ROOT, text=True)
                print(salida.strip() or 'Sin avisos de voz.')
    except (OSError, ValueError, KeyError, ET.ParseError, subprocess.CalledProcessError) as error:
        parser.exit(1, f'No se pudo repetir el recorrido: {error}\n')


if __name__ == '__main__':
    main()
