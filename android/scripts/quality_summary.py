#!/usr/bin/env python3
"""Resume resultados de JUnit, JaCoCo y Android Lint en GitHub Actions."""
from __future__ import annotations

import os
import pathlib
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[1]
APP = ROOT / "app" / "build"
report = []

def section(label: str, value: str) -> None:
    report.append(f"| {label} | {value} |")

report.extend(["# Trabakutik GPS · Calidad Android", "", "| Indicador | Resultado |", "|---|---|"])
tests = failures = errors = skipped = 0
files = list((APP / "test-results").rglob("TEST-*.xml")) if (APP / "test-results").exists() else []
for file in files:
    try:
        root = ET.parse(file).getroot()
        suites = [root] if root.tag == "testsuite" else root.findall(".//testsuite")
        for suite in suites:
            tests += int(suite.get("tests", "0"))
            failures += int(suite.get("failures", "0"))
            errors += int(suite.get("errors", "0"))
            skipped += int(suite.get("skipped", "0"))
    except (ET.ParseError, OSError, ValueError) as exc:
        section("Error informe JUnit", f"{file.name}: {type(exc).__name__}")

section("Tests unitarios", str(tests) if files else "No ejecutados")
section("Tests superados", str(max(0, tests - failures - errors - skipped)) if files else "Sin datos")
section("Tests fallidos", str(failures + errors) if files else "Sin datos")
section("Tests omitidos", str(skipped) if files else "Sin datos")

jacoco = APP / "reports" / "jacoco" / "jacocoDebugReport" / "jacocoDebugReport.xml"
if jacoco.is_file():
    try:
        root = ET.parse(jacoco).getroot()
        counters = [item for item in root.findall("counter") if item.get("type") == "LINE"]
        if counters:
            c = counters[-1]
            covered = int(c.get("covered", "0"))
            missed = int(c.get("missed", "0"))
            total = covered + missed
            ratio = 100 * covered / total if total else 0.0
            section("Cobertura JaCoCo (líneas)", f"{ratio:.2f}% ({covered}/{total})")
            section("Cobertura mínima (90%)", "Cumple" if ratio >= 90 else "NO CUMPLE")
        else:
            section("Cobertura JaCoCo", "XML sin contador de líneas")
    except (ET.ParseError, OSError, ValueError):
        section("Cobertura JaCoCo", "Error leyendo informe")
else:
    section("Cobertura JaCoCo", "No generada")

lint = APP / "reports" / "lint-results-debug.xml"
if lint.is_file():
    try:
        root = ET.parse(lint).getroot()
        issues = root.findall("issue")
        lint_errors = sum(x.get("severity") in ("Fatal", "Error") for x in issues)
        lint_warnings = sum(x.get("severity") == "Warning" for x in issues)
        section("Android Lint", f"{lint_errors} errores · {lint_warnings} advertencias")
    except (ET.ParseError, OSError):
        section("Android Lint", "Error leyendo informe")
else:
    section("Android Lint", "No ejecutado")

report.extend([
    "",
    "El informe indica los resultados disponibles, no certifica pruebas físicas de GPS, llamadas,",
    "pantalla bloqueada, Android Auto ni mapas sin cobertura.",
])
text = "\n".join(report) + "\n"
destination = os.environ.get("GITHUB_STEP_SUMMARY")
if destination:
    with open(destination, "a", encoding="utf-8") as output:
        output.write(text)
else:
    print(text)
