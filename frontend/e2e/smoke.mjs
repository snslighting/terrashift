// Browser smoke test of the production build, served the way GitHub Pages serves it
// (/terrashift/ base, folder routes with a trailing-slash redirect, 404.html fallback).
// Usage: npm run build && node e2e/smoke.mjs
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(here, "../../website-v2");
const out = resolve(here, "output");
const base = "/terrashift/";
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".geojson": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".bin": "application/octet-stream",
  ".md": "text/plain",
  ".txt": "text/plain",
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (!url.pathname.startsWith(base)) {
    res.writeHead(404).end();
    return;
  }
  let file = resolve(root, "." + decodeURIComponent(url.pathname.slice(base.length - 1)));
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const info = await stat(file);
    if (info.isDirectory()) {
      if (!url.pathname.endsWith("/")) {
        res.writeHead(301, { Location: url.pathname + "/" + url.search }).end();
        return;
      }
      file = join(file, "index.html");
    }
    res.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream" });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { "Content-Type": "text/html" });
    res.end(await readFile(join(root, "404.html")));
  }
});
await new Promise((ok) => server.listen(4176, "127.0.0.1", ok));
const origin = "http://127.0.0.1:4176";
await mkdir(out, { recursive: true });
const catalog = JSON.parse(await readFile(join(root, "evidence/catalog.json"), "utf8"));
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const failures = [];
const check = async (name, fn) => {
  try {
    await fn();
    console.log("PASS", name);
  } catch (error) {
    failures.push(name);
    console.error("FAIL", name, "\n ", error.message.split("\n").slice(0, 4).join("\n  "));
  }
};
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, acceptDownloads: true });
  // Keep the test hermetic: third-party tiles, geocoder and catalog calls are stubbed.
  await context.route(/^https:\/\/(?!127\.0\.0\.1)/, (route) => {
    const u = route.request().url();
    if (u.includes("cmr.earthdata.nasa.gov"))
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ hits: 0, items: [] }) });
    return route.fulfill({ status: 204, body: "" });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await check("home leads with change types and study areas", async () => {
    await page.goto(origin + base);
    await page.getByText("Five kinds of change.").waitFor();
    assert.equal(await page.locator(".change-card").count(), 5);
    await page.locator(".case-card").first().waitFor();
    assert.equal(await page.locator(".case-card").count(), catalog.cases.length);
    await page.waitForFunction(() => document.querySelectorAll(".case-card canvas.science-raster").length > 0);
    await page.screenshot({ path: join(out, "home.png") });
  });

  await check("explorer folder route: title fixed, footer hidden, case map opens", async () => {
    const study = catalog.cases.find((c) => c.id === "venezuela-2026") ?? catalog.cases[0];
    await page.goto(`${origin}${base}explore?case=${study.id}`);
    assert.match(page.url(), /\/explore\/\?case=/);
    await page.locator(".map-result-panel h2", { hasText: study.name }).waitFor();
    assert.match(await page.title(), /^Explorer/);
    assert.equal(await page.locator(".site-footer").count(), 0);
    await page.locator(".legend").waitFor();
    await page.locator(".maplibregl-canvas").waitFor();
    await page.waitForTimeout(1500);
    const box = await page.locator(".map-canvas").boundingBox();
    await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.5);
    await page.locator(".map-result-panel .pixel-card").waitFor();
    await page.screenshot({ path: join(out, "explorer.png") });
  });

  await check("earth stories show findings and limits for every area", async () => {
    await page.goto(origin + base + "discoveries/");
    await page.locator(".earth-story").first().waitFor();
    assert.equal(await page.locator(".earth-story").count(), catalog.cases.length);
    assert.equal(await page.locator(".confidence").count(), catalog.cases.length);
    await page.getByRole("button", { name: /Earthquake deformation/ }).click();
    const quakes = catalog.cases.filter((c) => c.change_types.includes("earthquake")).length;
    assert.equal(await page.locator(".earth-story").count(), quakes);
  });

  await check("analysis switches areas and keeps failed checks visible", async () => {
    await page.goto(origin + base + "analysis/?case=san-joaquin");
    await page.locator(".failure-badge").waitFor();
    await page.locator(".structure-panel").waitFor();
    assert.equal(await page.locator(".case-switch button").count(), catalog.cases.length);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /Evidence JSON/ }).click();
    const file = await download;
    const saved = join(out, "evidence.json");
    await file.saveAs(saved);
    const evidence = JSON.parse(await readFile(saved, "utf8"));
    assert.equal(evidence.validation, "FAILED");
    assert.equal(evidence.total_uncertainty_mm, null);
    const quake = catalog.cases.find((c) => c.id === "venezuela-2026");
    if (quake) {
      await page.locator(".case-switch button", { hasText: quake.name }).click();
      await page.getByText(/saw the earthquake/).waitFor();
    }
    await page.screenshot({ path: join(out, "analysis.png"), fullPage: true });
  });

  await check("science, data and about pages render", async () => {
    for (const route of ["science/", "data/", "about/"]) {
      await page.goto(origin + base + route);
      await page.locator("main h1").first().waitFor();
    }
    await page.goto(origin + base + "data/");
    await page.locator(".provenance-card").first().waitFor();
  });

  await check("unknown routes fall back to the app's not-found view", async () => {
    await page.goto(origin + base + "does-not-exist");
    await page.getByText("This perspective isn’t here.").waitFor();
  });

  await check("phone width: no sideways scrolling and the map stays visible", async () => {
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    await phone.route(/^https:\/\/(?!127\.0\.0\.1)/, (route) => route.fulfill({ status: 204, body: "" }));
    const p = await phone.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    for (const route of ["", "explore/?case=san-joaquin", "analysis/", "discoveries/", "data/"]) {
      await p.goto(origin + base + route);
      await p.locator("main").first().waitFor();
      await p.waitForTimeout(400);
      const wide = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(wide <= 1, `${route || "home"} scrolls sideways by ${wide}px`);
    }
    await p.goto(origin + base + "explore/?case=san-joaquin");
    await p.locator(".map-canvas").scrollIntoViewIfNeeded();
    await p.locator(".map-result-panel").waitFor();
    const map = await p.locator(".map-canvas").boundingBox();
    const panel = await p.locator(".map-result-panel").boundingBox();
    assert.ok(panel.height < map.height * 0.6, "result panel covers most of the map");
    await p.screenshot({ path: join(out, "phone-explorer.png") });
    await phone.close();
  });

  await check("no uncaught page errors", async () => {
    assert.deepEqual(errors, []);
  });
} finally {
  await browser.close();
  server.close();
}
if (failures.length) {
  console.error(`\n${failures.length} smoke check(s) failed: ${failures.join("; ")}`);
  process.exit(1);
}
console.log("\nAll smoke checks passed.");
