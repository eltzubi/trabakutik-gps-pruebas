#!/usr/bin/env python3
"""Exporta trazados compatibles del catálogo PR de Bizkaia para el creador."""
import argparse
from contextlib import closing
import json
from pathlib import Path
import sqlite3

CATALOGO = "https://www.opendatabizkaia.eus/es/catalogo/senderos-pr"


def exporta(base, salida):
    with closing(sqlite3.connect(base.resolve().as_uri() + "?mode=ro", uri=True)) as db:
        if db.execute("PRAGMA user_version").fetchone() != (2,):
            raise ValueError("Se requiere el catálogo de Bizkaia con auditoría por tramos (v2).")
        filas = db.execute("""
            SELECT s.codigo, s.nombre_es, t.orden, t.nombre_original, t.coincidencia,
                   a.geometria_geojson, a.cotas_gpx_m, f.url, f.sha256
            FROM tramo t JOIN sendero s ON s.id=t.sendero_id
            JOIN trazado a ON a.sendero_id=t.sendero_id AND a.formato=t.formato
            JOIN fuente f ON f.id=a.fuente_id
            WHERE t.formato='GPX'
            ORDER BY s.codigo,t.orden
        """).fetchall()
    tramos = []
    for codigo, nombre, orden, etiqueta, coincidencia, geojson, cotas, url, sha in filas:
        derivacion = codigo == "PR-BI 85-2" and etiqueta == "PR®-BI 85 (derivación Atxarte)"
        if coincidencia != "coincidente" and not derivacion:
            continue
        coordenadas = json.loads(geojson)["coordinates"][orden - 1]
        alturas = json.loads(cotas)[orden - 1] if cotas is not None else [None] * len(coordenadas)
        puntos = [[round(lat, 7), round(lon, 7), alt] for (lon, lat), alt in zip(coordenadas, alturas, strict=True)]
        lat, lon = zip(*(p[:2] for p in puntos))
        tramos.append(dict(codigo=codigo, nombre=etiqueta if derivacion else nombre, orden=orden,
                           derivacion=derivacion, url=url, sha256=sha,
                           limites=[min(lat), min(lon), max(lat), max(lon)], puntos=puntos))
    if not tramos:
        raise ValueError("El catálogo no contiene tramos compatibles.")
    data = dict(version=1, organismo="Diputación Foral de Bizkaia", licencia="CC BY 4.0",
                fuente=CATALOGO, tramos=tramos)
    salida.write_text(json.dumps(data, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n",
                      encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sqlite", type=Path)
    parser.add_argument("--salida", type=Path, default=Path("data/senderos-bizkaia.json"))
    args = parser.parse_args()
    exporta(args.sqlite, args.salida)
