#!/usr/bin/env python3
"""Coteja los GPX homologados de Urdaibai y exporta el trazado para el creador."""
import argparse
import hashlib
import json
import math
from pathlib import Path
from xml.etree import ElementTree
from zipfile import ZipFile

CATALOGO = "https://www.geo.euskadi.eus/cartografia/DatosDescarga/Medio_Ambiente/Itinerarios/Red_senderos_Urdaibai.zip"
TURISMO = "https://turismourdaibai.com/gestor/recursos/uploads/new/descargas/PR_URDAIBAI"
# Senderos homologados de la Federación Bizkaina de Montaña con revisión en 2025.
SENDEROS = {
    160: ("Caminando a la sombra del txakoli", "Busturia/GPX/PR-BI 160.GPX"),
    161: ("En pleno corazón del encinar", "Atxarre/GPX/PR-BI 161.GPX"),
    165: ("Ogoño: ruta hacia el mar", "Ogoño/GPX/OGOÑO_2016.GPX"),
    167: ("Senda del Golako", "Golako/GPX/PR-BI 167.GPX"),
    176: ("Katillotxu: una mirada al pasado megalítico", "Katillotxu/GPX/PR-BI 176.GPX"),
    181: ("Por el corazón del estuario", "Gernika-Lumo-Forua/GPS/PR-BI 181.GPX"),
}


def distancia(a, b):
    lat_media = math.radians((a[0] + b[0]) / 2)
    return 111195 * math.hypot(b[0] - a[0], (b[1] - a[1]) * math.cos(lat_media))


def puntos_gpx(gpx, codigo):
    segmentos = ElementTree.fromstring(gpx).findall(".//{*}trkseg")
    if len(segmentos) != 1:
        raise ValueError(f"{codigo}: se esperaba un trazado continuo")
    puntos = []
    for punto in segmentos[0].findall("{*}trkpt"):
        lat = float(punto.attrib["lat"])
        lon = float(punto.attrib["lon"])
        ele = punto.findtext("{*}ele")
        if not (43.2 <= lat <= 43.5 and -2.85 <= lon <= -2.5):
            raise ValueError(f"{codigo}: coordenada fuera de Urdaibai")
        puntos.append([round(lat, 7), round(lon, 7), float(ele) if ele else None])
    if len(puntos) < 2 or any(distancia(a, b) >= 125 for a, b in zip(puntos, puntos[1:])):
        raise ValueError(f"{codigo}: se encontró un salto en el trazado")
    return puntos


def exporta(archivo, turismo, salida):
    tramos = []
    with ZipFile(archivo) as datos:
        for numero, (nombre, miembro) in SENDEROS.items():
            codigo = f"PR-BI {numero}"
            gpx = datos.read(f"{codigo}. {miembro}")
            if gpx != (turismo / f"actual-{numero}.gpx").read_bytes():
                raise ValueError(f"{codigo}: las dos publicaciones del GPX difieren")
            puntos = puntos_gpx(gpx, codigo)
            lat, lon = zip(*(p[:2] for p in puntos))
            tramos.append(dict(codigo=codigo, nombre=nombre, orden=1, derivacion=False,
                               url=f"{TURISMO}/PR-BI%20{numero}.GPX",
                               sha256=hashlib.sha256(gpx).hexdigest(),
                               limites=[min(lat), min(lon), max(lat), max(lon)], puntos=puntos))
    data = dict(version=1, organismo="Eusko Jaurlaritza / Gobierno Vasco",
                organismoCorto="Gobierno Vasco", licencia="CC BY 4.0", fuente=CATALOGO,
                tramos=tramos)
    salida.write_text(json.dumps(data, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n",
                      encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archivo", type=Path)
    parser.add_argument("turismo", type=Path, help="directorio con los GPX de Turismo de Urdaibai")
    parser.add_argument("--salida", type=Path, default=Path("data/senderos-urdaibai.json"))
    args = parser.parse_args()
    exporta(args.archivo, args.turismo, args.salida)
