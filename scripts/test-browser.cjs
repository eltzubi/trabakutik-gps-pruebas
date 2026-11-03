// Prueba Chromium con puente Android simulado. No prueba el servicio Android
// ni la navegación con el teléfono bloqueado.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".css": "text/css",
};
const server = http.createServer((req, res) => {
  const file = path.resolve(
    root,
    "." + new URL(req.url, "http://localhost").pathname,
  );
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    res.setHeader(
      "Content-Type",
      types[path.extname(file)] || "application/octet-stream",
    );
    res.end(fs.readFileSync(file));
  } catch (e) {
    res.writeHead(404).end();
  }
});
async function setup(context) {
  await context.addInitScript(() => {
    window.__native = {
      active: false,
      recording: false,
      saves: 0,
      points: [],
      complete: true,
    };
    window.TrabakutikAndroid = {
      getPosition: () =>
        JSON.stringify({
          active: window.__native.active,
          recording: window.__native.recording,
          navigating: window.__native.active,
          guiando: window.__native.active,
          locationEnabled: true,
          lat: 43.2,
          lon: -2.5,
          accuracy: 5,
          time: Date.now(),
          speed: 0,
          bearing: 0,
          giros: 0,
          vozEstado: "ok",
        }),
      getTrackingSnapshot: () =>
        JSON.stringify({
          active: window.__native.active,
          recording: window.__native.recording,
          points: window.__native.points,
          pointsComplete: window.__native.complete,
          trackVersion: JSON.stringify(window.__native.points),
        }),
      getTrackingSnapshotIfChanged: () =>
        window.TrabakutikAndroid.getTrackingSnapshot(),
      setRoute() {},
      setJunctions() {},
      setSentido() {},
      setAudioModo() {},
      startNavigationWithRoute() {
        window.__native.active = true;
      },
      startRecording() {
        window.__native.active = true;
        window.__native.recording = true;
      },
      stopRecording() {
        window.__native.recording = false;
      },
      saveRecording() {
        window.__native.saves++;
      },
      stopNavigation() {
        window.__native.active = false;
      },
      clearRoute() {},
      clearLiveTrack() {},
      pauseRecording() {},
      resumeRecording() {},
      discardRecording() {},
    };
    Object.defineProperty(navigator, "geolocation", {
      value: {
        watchPosition: () => 1,
        clearWatch() {},
        getCurrentPosition() {},
      },
    });
  });
  // Evitar que la disponibilidad de mapas externos decida una prueba de UI.
  await context.route("https://**/*", async (route) => {
    const url = route.request().url();
    if (url.includes("raw.githubusercontent.com")) {
      await route.fulfill({
        status: 503,
        body: "Servicio externo no disponible",
      });
    } else {
      await route.fulfill({
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=",
          "base64",
        ),
      });
    }
  });
}
(async () => {
  let browser;
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port + "/";
  try {
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await setup(context);
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("dialog", (dialog) => dialog.accept());
    await page.goto(base + "nuevo.html");
    await page.waitForFunction(() =>
      document.querySelector(".leaflet-container"),
    );
    // El vigilante tarda cinco segundos: comprobar su efecto real, no solo la carga.
    await page.waitForTimeout(5300);
    assert(
      !/buscando señal/i.test(await page.locator("#status").textContent()),
    );
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        "desborde a " + width,
      );
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.selectOption("#basemap", "ign");
    assert.match(await page.locator("#mapCredit").textContent(), /conexión/);
    await page.click("#savedRoutes");
    const pts = Array.from(
      { length: 101 },
      (_, i) =>
        `<trkpt lat="${43 + i * 0.00001}" lon="-2"><ele>${100 + 2 * Math.min(i, 100 - i)}</ele></trkpt>`,
    ).join("");
    await page.setInputFiles("#importGpxFile", {
      name: "prueba-cima.gpx",
      mimeType: "application/gpx+xml",
      buffer: Buffer.from(
        "<gpx><trk><name>Prueba cima</name><trkseg>" +
          pts +
          "</trkseg></trk></gpx>",
      ),
    });
    await page
      .getByRole("button", { name: /Prueba cima · GPX importado/ })
      .click();
    await page.waitForFunction(
      () => document.querySelector("#navGo").offsetHeight > 0,
    );
    assert.match(await page.locator("#distance").textContent(), /\+96 \/ -96/);
    fs.mkdirSync(path.join(root, ".test-artifacts"), { recursive: true });
    await page.screenshot({
      path: path.join(root, ".test-artifacts/gps-390.png"),
    });
    await page.click("#navGo");
    await page.waitForFunction(() => window.__native.active);
    await page.click("#recordStart");
    await page.evaluate(() => {
      window.__native.points = [
        [43, -2],
        [43.1, -2],
      ];
      window.__native.complete = false;
    });
    await page.waitForTimeout(1300);
    await page.evaluate(() => window.trabakutikSyncNative());
    await page.click("#recordStop");
    await page.click("#saveRecording");
    assert.equal(
      await page.evaluate(() => window.__native.saves),
      1,
      "se exporta el GPX nativo completo",
    );
    assert.deepEqual(errors, [], "errores JS");
    await context.close();
    console.log(
      "PASS Chromium: apertura, 4 anchos, IGN, importar/reabrir GPX, Navegar, Grabar, Parar y exportar completo",
    );
    const offline = await browser.newContext();
    await setup(offline);
    const p = await offline.newPage();
    await p.goto(base + "nuevo.html");
    await p.waitForFunction(() => navigator.serviceWorker.controller);
    await offline.setOffline(true);
    const slug = JSON.parse(
      fs.readFileSync(path.join(root, "data/trailhead.json")),
    ).tracks[0].href.replace(/\.html$/, "");
    await p.goto(base + "nuevo.html?ruta=" + slug);
    await p.waitForFunction(
      () => !document.querySelector("#mapTitle").disabled,
    );
    assert(await p.locator(".leaflet-container").count());
    await offline.close();
    console.log(
      "PASS Chromium: reapertura sin red con parámetro de ruta y mapa montado",
    );
  } finally {
    if (browser) await browser.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
