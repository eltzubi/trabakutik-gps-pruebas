# Senderos de Urdaibai en el creador

El catálogo de Urdaibai aporta los PR-BI 160, 161, 165, 167, 176 y 181. Los GPX del [archivo de Open Data Euskadi](https://opendata.euskadi.eus/catalogo/-/red-senderos-urdaibai/) coinciden byte por byte con los de [Urdaibai Turismo](https://turismourdaibai.com/es/ven-a-disfrutar/senderismo). Los seis constan como homologados y revisados en 2025 en el [listado de la Federación Vizcaína de Montaña](https://bmf-fvm.org/senderos/senderos-pr/), consultado el 28 de noviembre de 2026. La fecha de revisión corresponde al sendero. Autoría de los datos: Eusko Jaurlaritza / Gobierno Vasco. [Licencia CC BY 4.0](https://datos.gob.es/es/catalogo/a16003011-red-de-senderos-por-urdaibai1).

Para regenerarlo, descarga el ZIP de Open Data Euskadi y guarda los GPX oficiales de Turismo con su número en el mismo directorio. El script compara las dos copias, conserva las cotas originales y comprueba que el trazado sea continuo.

```sh
python3 scripts/exporta-senderos-urdaibai.py ./descargas/urdaibai.zip ./descargas
```

En el directorio `descargas`, el script espera `actual-160.gpx`, `actual-161.gpx`, `actual-165.gpx`, `actual-167.gpx`, `actual-176.gpx` y `actual-181.gpx`. Escribe `data/senderos-urdaibai.json`.
