// Browser smoke test of the production build, served the way GitHub Pages serves it
// (/terrashift/ base, folder routes with a trailing-slash redirect, 404.html fallback).
// Usage: npm run build && node e2e/smoke.mjs
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { crc32, deflateSync } from "node:zlib";

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
  ".webp": "image/webp",
  ".bin": "application/octet-stream",
  ".pbf": "application/x-protobuf",
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

// A synthetic NASA-style preview: grey scene inside a black no-data margin.
function previewPng(w = 64, h = 48) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const inside = x >= 6 && x < w - 4 && y >= 5 && y < h - 6,
        o = y * (w * 4 + 1) + 1 + x * 4,
        v = inside ? 90 + ((x * 7 + y * 3) % 120) : 0;
      raw.set([v, v, v, 255], o);
    }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4),
      body = Buffer.concat([Buffer.from(type), data]),
      crc = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const PREVIEW = previewPng();
const BROWSE = "https://nisar.asf.earthdatacloud.nasa.gov/BROWSE/TEST";
/** Synthetic catalog records shaped like NASA's (no real product is implied). */
function cmrItems(url) {
  const gcov = url.includes("GCOV"),
    broken = url.includes("bounding_box=0%2C") || url.includes("bounding_box=0,");
  const dates = gcov ? ["2026-09-27", "2026-10-09", "2026-10-21"] : ["2026-09-15", "2026-09-27", "2026-10-09"];
  return dates.map((d, i) => {
    const name = `TEST_${gcov ? "GCOV" : "GUNW"}_${i}${broken ? "_BROKEN" : ""}`;
    const links = [`${BROWSE}/${name}_LATLON.png`, `${BROWSE}/${name}_LATLON_thumbnail.png`];
    if (gcov) links.push(`${BROWSE}/${name}_NATIVE_A_HHHH.png`, `${BROWSE}/${name}_NATIVE_A_HVHV.png`);
    const attrs = [
      ["TRACK_NUMBER", ["42"]],
      ["FRAME_NUMBER", ["70"]],
      ["ASCENDING_DESCENDING", ["ASCENDING"]],
      ["FREQUENCIES", ["A"]],
      ["FREQUENCY_A_POLARIZATION", ["HH", "HV"]],
    ];
    if (!gcov)
      attrs.push(
        ["REFERENCE_ZERO_DOPPLER_START_TIME", [`${dates[Math.max(0, i - 1)]}T10:00:00Z`]],
        ["SECONDARY_ZERO_DOPPLER_START_TIME", [`${d}T10:00:00Z`]],
      );
    return {
      meta: { "concept-id": `G-${name}` },
      umm: {
        GranuleUR: name,
        CollectionReference: { ShortName: gcov ? "NISAR_L2_GCOV_PROVISIONAL_V1" : "NISAR_L2_GUNW_PROVISIONAL_V1" },
        TemporalExtent: { RangeDateTime: { BeginningDateTime: `${d}T10:00:00Z` } },
        RelatedUrls: links.map((URL) => ({ URL, Type: "GET RELATED VISUALIZATION" })),
        AdditionalAttributes: attrs.map(([Name, Values]) => ({ Name, Values })),
        SpatialExtent: {
          HorizontalSpatialDomain: {
            Geometry: {
              BoundingRectangles: [
                { WestBoundingCoordinate: -57.6, SouthBoundingCoordinate: -18.6, EastBoundingCoordinate: -56.4, NorthBoundingCoordinate: -17.4 },
              ],
            },
          },
        },
      },
    };
  });
}

const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const failures = [];
const check = async (name, fn) => {
  // SMOKE_ONLY=text runs only the checks whose name contains it (for chasing a flaky check).
  if (process.env.SMOKE_ONLY && !name.includes(process.env.SMOKE_ONLY)) return;
  try {
    await fn();
    console.log("PASS", name);
  } catch (error) {
    failures.push(name);
    console.error("FAIL", name, "\n ", error.message.split("\n").slice(0, process.env.SMOKE_VERBOSE ? 30 : 4).join("\n  "));
  }
};
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, acceptDownloads: true });
  // Keep the test hermetic: third-party tiles, geocoder and catalog calls are stubbed.
  const stub = (route) => {
    const u = route.request().url();
    if (u.includes("cmr.earthdata.nasa.gov")) {
      // Only the sample-place checks below search Pantanal; everything else gets an empty catalog.
      const items = u.includes("-57.5") || u.includes("bounding_box=0") ? cmrItems(u) : [];
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ hits: items.length, items }) });
    }
    if (u.startsWith(BROWSE))
      return u.includes("_BROKEN")
        ? route.fulfill({ status: 404, body: "" })
        : route.fulfill({ contentType: "image/png", headers: { "access-control-allow-origin": "*" }, body: PREVIEW });
    return route.fulfill({ status: 204, body: "" });
  };
  await context.route(/^https:\/\/(?!127\.0\.0\.1)/, stub);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await check("home leads with change types and study areas", async () => {
    await page.goto(origin + base);
    // Change types with processed data get cards; the rest are listed under "Coming next".
    const live = new Set(catalog.cases.flatMap((c) => c.change_types));
    await page.locator(".change-card").first().waitFor();
    assert.equal(await page.locator(".change-card").count(), live.size);
    assert.equal(
      (await page.locator(".change-card").count()) + (await page.locator(".change-next li").count()),
      Object.keys(catalog.change_types).length,
    );
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
    // Each story is a sequence of steps; findings and limits must stay reachable in every one.
    for (const story of await page.locator(".earth-story").all()) {
      await story.getByRole("button", { name: /^Step 2:/ }).click();
      await story.locator(".findings li").first().waitFor();
      await story.getByRole("button", { name: /How sure we are/ }).first().click();
      await story.locator(".confidence").waitFor();
    }
    const first = page.locator(".earth-story").first();
    await first.getByRole("button", { name: /^Step 3:/ }).click();
    await first.getByText(/Hypotheses, not conclusions/).waitFor();
    await page.locator(".story-applications").waitFor();
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

  await check("analysis view is shareable through the URL", async () => {
    const study = catalog.cases.find((c) => c.pairs.length > 1) ?? catalog.cases[0];
    const pair = study.pairs[0];
    const layer = Object.keys(pair.layers).at(-1);
    await page.goto(`${origin}${base}analysis/?case=${study.id}&pair=${pair.id}&layer=${layer}&mode=side`);
    await page.locator(".analysis-timeline .active, .analysis-summary").first().waitFor();
    await page.waitForFunction((id) => location.search.includes(`pair=${id}`), pair.id);
    const url = new URL(page.url());
    assert.equal(url.searchParams.get("case"), study.id);
    assert.equal(url.searchParams.get("pair"), pair.id);
    assert.equal(url.searchParams.get("layer"), layer);
    assert.equal(url.searchParams.get("mode"), "side");
  });

  await check("learn page: official resources open safely in a new tab, with the NASA note", async () => {
    await page.goto(origin + base + "learn/");
    await page.locator(".theme-card").first().waitFor();
    assert.equal(await page.locator(".theme-card").count(), 7);
    for (const card of await page.locator(".theme-card").all())
      assert.equal(await card.locator(".learn-more a").count(), 3);
    const external = await page.locator("main a[target=_blank]").evaluateAll((as) =>
      as.map((a) => ({ href: a.href, rel: a.rel })),
    );
    assert.ok(external.length >= 7 * 3 + 4);
    for (const a of external) {
      assert.match(a.rel, /noopener/, a.href);
      assert.match(a.rel, /noreferrer/, a.href);
    }
    await page.getByRole("heading", { name: "Other SAR sources" }).waitFor();
    await page.getByText("Not loaded in TerraShift").waitFor();
    await page.locator(".site-footer .non-endorsement", { hasText: "do not imply endorsement by NASA" }).waitFor();
    assert.equal(await page.locator("input[type=password]").count(), 0);
  });

  await check("guided tour walks across pages and closes", async () => {
    await page.goto(origin + base);
    await page.getByRole("button", { name: "Take the guided tour" }).click();
    await page.locator("#tour-title", { hasText: "Welcome" }).waitFor();
    for (let i = 0; i < 3; i++) await page.locator(".tour-actions .button").click();
    await page.locator("#tour-title", { hasText: "Earth Stories" }).waitFor();
    assert.match(page.url(), /discoveries/);
    await page.locator(".tour-spotlight").waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await page.locator(".tour-card").count(), 0);
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

  await check("map draws borders and place names from the site's own files, the tag button hides them, no coverage dots", async () => {
    const loaded = [];
    const watch = (r) => loaded.push([new URL(r.url()).pathname, r.status()]);
    page.on("response", watch);
    try {
      await page.goto(origin + base + "explore/");
      await page.locator(".maplibregl-canvas").waitFor();
      const got = (part) => loaded.some(([path, status]) => path.includes(part) && status === 200);
      for (let i = 0; i < 40 && !(got("geo/places.json") && got("geo/borders.json") && got(".pbf")); i++)
        await page.waitForTimeout(250);
      for (const part of ["geo/places.json", "geo/borders.json", "geo/rivers.json", "glyphs/DM%20Sans%20SemiBold/0-255.pbf"])
        assert.ok(got(part), `${part} not loaded: ${JSON.stringify(loaded.filter(([p]) => /geo|glyphs/.test(p)))}`);
      // Glyph files exist for every range the names need (a missing one would be a 404 here).
      assert.deepEqual(loaded.filter(([path, status]) => /glyphs|geo\//.test(path) && status !== 200), []);
      assert.ok(!loaded.some(([path]) => path.includes("coverage.json")), "coverage dots still loaded");
      // With the view still, the picture only changes when the names are switched.
      const map = page.locator(".map-canvas");
      const shot = async () => {
        await page.waitForTimeout(1200);
        return map.screenshot({ animations: "disabled" });
      };
      const on = await shot();
      assert.ok(on.equals(await shot()), "map did not settle");
      const tag = page.getByRole("button", { name: "Hide place names" });
      assert.equal(await tag.getAttribute("aria-pressed"), "true");
      await tag.click();
      const off = await shot();
      assert.ok(!off.equals(on), "hiding names changed nothing");
      await page.getByRole("button", { name: "Show place names" }).click();
      assert.ok((await shot()).equals(on), "names did not come back the same");
    } finally {
      page.off("response", watch);
    }
  });

  await check("a sample place opens NASA's preview on the map and scrubs through dates", async () => {
    await page.goto(origin + base + "explore/");
    await page.locator(".place-tile", { hasText: "Pantanal" }).click();
    await page.locator(".map-ribbon.preview").waitFor({ timeout: 15000 });
    await page.locator(".place-card").waitFor();
    await page.locator(".acq-calendar svg").waitFor();
    assert.equal(await page.locator(".status-ladder li.reached").count(), 2);
    assert.match(page.url(), /preset=pantanal/);
    assert.match(page.url(), /type=GCOV/);
    // Get the full data: steps and links pre-filled with this product, login stays with NASA/ASF.
    const full = page.locator(".map-result-panel details.full-data");
    await full.locator("summary").click();
    await full.getByText("Downloads need your own free NASA Earthdata login").waitFor();
    const hrefs = await full.locator("a").evaluateAll((as) => as.map((a) => a.href));
    assert.ok(hrefs.some((h) => h.startsWith("https://search.earthdata.nasa.gov/") && h.includes("TEST_GCOV_2")));
    assert.ok(hrefs.some((h) => h.startsWith("https://search.asf.alaska.edu/") && h.includes("TEST_GCOV_2")));
    assert.ok(hrefs.includes("https://nisar-docs.asf.alaska.edu/"));
    await page.locator(".place-card .learn-more a").first().waitFor();
    // Polarization switch swaps the image.
    await page.locator(".polarization-switch button", { hasText: /^HV$/ }).click();
    await page.waitForFunction(() => /image=A_HV/.test(location.search));
    // The scrubber moves to the first date.
    const slider = page.locator(".time-scrubber input[type=range]");
    await slider.focus();
    await page.keyboard.press("Home");
    await page.locator(".map-result-panel h2", { hasText: "27 September 2026" }).waitFor();
    // Compare two dates: the divider works from the keyboard.
    await page.getByRole("button", { name: /Compare two dates/ }).click();
    await page.waitForFunction(() => document.querySelectorAll(".swipe-layer canvas").length === 2);
    const divider = page.locator(".swipe-stage input[type=range]");
    await divider.focus();
    await page.keyboard.press("ArrowLeft");
    assert.equal(await divider.inputValue(), "49");
    await page.keyboard.press("Escape");
    // Focus goes back to the button that opened the dialog.
    assert.match(await page.evaluate(() => document.activeElement?.textContent ?? ""), /Compare two dates/);
    await page.screenshot({ path: join(out, "explorer-preview.png") });
  });

  await check("optical basemap loads NASA GIBS imagery for the product's own date", async () => {
    const days = new Set();
    const watch = (r) => {
      const m = r.url().match(/gibs\.earthdata\.nasa\.gov\/wmts\/.*\/default\/(\d{4}-\d{2}-\d{2})\//);
      if (m) days.add(m[1]);
    };
    page.on("request", watch);
    // GIBS answers 404 for a day it has no image of (checked against the real service).
    await page.route(/gibs\.earthdata\.nasa\.gov/, (route) => route.fulfill({ status: 404, body: "" }));
    await page.goto(origin + base + "explore/?preset=pantanal&type=GCOV");
    await page.locator(".map-ribbon.preview").waitFor({ timeout: 15000 });
    await page.locator("select[aria-label=Basemap]").selectOption("optical");
    assert.match(await page.locator("select[aria-label=Basemap] option:checked").innerText(), /Optical on 2026-10-21/);
    await page.waitForTimeout(1500);
    assert.ok(days.has("2026-10-21"), `GIBS days requested: ${[...days].join(", ")}`);
    await page.locator(".optical-note summary", { hasText: "MODIS Terra, 2026-10-21 (UTC)" }).waitFor();
    // No image for that day: the map says so, instead of "basemap offline".
    await page.locator(".map-offline", { hasText: "No NASA optical image of 2026-10-21" }).waitFor();
    // Moving the date slider moves the optical day with it.
    const slider = page.locator(".time-scrubber input[type=range]");
    await slider.focus();
    await page.keyboard.press("Home");
    await page.locator(".map-result-panel h2", { hasText: "27 September 2026" }).waitFor();
    await page.waitForTimeout(1500);
    assert.ok(days.has("2026-09-27"), `GIBS days requested: ${[...days].join(", ")}`);
    page.off("request", watch);
    await page.unroute(/gibs\.earthdata\.nasa\.gov/);
  });

  await check("switching data type drops the old image at once and names the one loading", async () => {
    await page.goto(origin + base + "explore/?preset=pantanal&type=GUNW");
    await page.locator(".map-ribbon.preview", { hasText: "GROUND MOTION" }).waitFor({ timeout: 15000 });
    // Hold every backscatter image for 3 s, so the switch is caught mid-load.
    let release;
    const gate = new Promise((ok) => (release = ok));
    await page.route(/TEST_GCOV/, async (route) => {
      await gate;
      route.fulfill({ contentType: "image/png", headers: { "access-control-allow-origin": "*" }, body: PREVIEW });
    });
    await page.locator(".kind-switch button", { hasText: "Backscatter" }).click();
    await page.locator(".map-ribbon.loading", { hasText: "BACKSCATTER" }).waitFor();
    assert.equal(await page.locator(".map-ribbon.preview").count(), 0, "the ground-motion image is still labelled on the map");
    await page.locator(".map-result-panel .preview-status", { hasText: "Backscatter" }).waitFor();
    release();
    await page.locator(".map-ribbon.preview", { hasText: "BACKSCATTER" }).waitFor({ timeout: 15000 });
    assert.equal(await page.locator(".map-ribbon.loading").count(), 0);
    await page.unroute(/TEST_GCOV/);
  });

  await check("when NASA's image server fails, the footprint and report card remain", async () => {
    await page.goto(origin + base + "explore/?area=0,-1,1,0&type=GUNW");
    await page.locator(".map-result-panel [role=alert]", { hasText: "Preview unavailable" }).waitFor({ timeout: 15000 });
    await page.locator(".place-card").waitFor();
    assert.equal(await page.locator(".map-ribbon.preview").count(), 0);
    await page.locator(".map-result-panel").getByRole("button", { name: "Retry" }).waitFor();
  });

  await check("90-second demo: place, product, date slider, HH/HV, processed story, claims", async () => {
    await page.goto(origin + base);
    await page.getByRole("button", { name: /Watch the 90-second demo/ }).click();
    const card = page.locator(".tour-card");
    await card.getByText("90-SECOND DEMO · 1 / 6").waitFor();
    // Step by hand: pause autoplay first so it cannot race the clicks below (autoplay itself is
    // covered by the two 4x-speed demo checks).
    await card.getByRole("button", { name: "Pause the guided demo" }).click();
    await page.locator("#tour-title", { hasText: "Pick a place" }).waitFor();
    assert.match(page.url(), /preset=pantanal/);
    await page.locator(".place-card").waitFor({ timeout: 15000 });
    await card.getByRole("button", { name: "Next" }).click();
    await page.locator("#tour-title", { hasText: "Open a product" }).waitFor();
    await page.locator(".map-ribbon.preview").waitFor({ timeout: 15000 });
    // The preview has a "How to read this" legend.
    await page.locator(".preview-legend", { hasText: "HOW TO READ THIS" }).waitFor();
    await card.getByRole("button", { name: "Next" }).click();
    await page.locator("#tour-title", { hasText: "Move through time" }).waitFor();
    // The demo moves the slider itself, to the first date.
    await page.locator(".map-result-panel h2", { hasText: "27 September 2026" }).waitFor({ timeout: 10000 });
    await card.getByRole("button", { name: "Next" }).click();
    await page.locator("#tour-title", { hasText: "Switch HH and HV" }).waitFor();
    await page.waitForFunction(() => /image=A_HV/.test(location.search), null, { timeout: 10000 });
    await page.locator(".preview-legend", { hasText: "stronger HV echo" }).waitFor();
    await card.getByRole("button", { name: "Next" }).click();
    await page.locator("#tour-title", { hasText: "Open a processed story" }).waitFor();
    assert.match(page.url(), /discoveries/);
    await card.getByRole("button", { name: "Next" }).click();
    await page.locator("#tour-title", { hasText: "What we can and cannot claim" }).waitFor();
    await page.locator(".claims-box").waitFor();
    await page.locator(".tour-spotlight").waitFor();
    await card.getByRole("button", { name: "Finish" }).click();
    assert.equal(await page.locator(".tour-card").count(), 0);
  });

  await check("about page: team, independence line and credits; no placeholder text", async () => {
    await page.goto(origin + base + "about/");
    await page.locator(".team-list li").first().waitFor();
    // textContent: the names and roles as written (CSS shows the roles in capitals).
    const members = await page.locator(".team-list li").evaluateAll((lis) => lis.map((li) => li.textContent.replace(/\s+/g, " ")));
    assert.equal(members.length, 6);
    assert.match(members[0], /Sharifjon Farmonov ?Product Manager/);
    assert.match(members[5], /Amiriddin Ramazonov ?Spokesman/);
    // Every member has a portrait, and each one loads.
    await page.locator(".team-list").scrollIntoViewIfNeeded();
    assert.equal(await page.locator(".team-list img").count(), 6);
    await page.waitForFunction(() => [...document.querySelectorAll(".team-list img")].every((i) => i.complete), null, { timeout: 10000 });
    const broken = await page.locator(".team-list img").evaluateAll((imgs) => imgs.filter((i) => !i.naturalWidth).map((i) => i.alt));
    assert.deepEqual(broken, []);
    assert.equal(await page.locator(".team-list img[alt='Portrait of Sharifjon Farmonov']").count(), 1);
    await page.getByText("No endorsement by NASA, ISRO or any institution is implied").waitFor();
    assert.equal(await page.getByText("have not been supplied").count(), 0);
    const credits = await page.locator(".credits-section").innerText();
    for (const s of ["NISAR", "NASA CMR", "NASA GIBS", "Nevada Geodetic Laboratory", "USGS", "OpenStreetMap", "Esri"])
      assert.ok(credits.includes(s), `credits miss ${s}`);
  });

  await check("90-second demo plays on by itself when NASA's images never arrive", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
    await ctx.route(/^https:\/\/(?!127\.0\.0\.1)/, stub);
    // NASA's preview images hang forever.
    await ctx.route(/nisar\.asf\.earthdatacloud\.nasa\.gov\/BROWSE/, () => {});
    // 4x speed (test hook): the demo's waits shrink, the logic is the same.
    await ctx.addInitScript(() => sessionStorage.setItem("terrashift-demo-speed", "4"));
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(origin + base);
    const t0 = Date.now();
    await p.getByRole("button", { name: /Watch the 90-second demo/ }).click();
    await p.locator("#tour-title", { hasText: "Open a product" }).waitFor({ timeout: 30000 });
    await p.locator(".tour-slow", { hasText: "NASA's image is slow" }).waitFor({ timeout: 15000 });
    await p.locator("#tour-title", { hasText: "What we can and cannot claim" }).waitFor({ timeout: 60000 });
    const secs = (Date.now() - t0) / 1000;
    assert.ok(secs < 60, `demo took ${secs.toFixed(1)} s to reach the last step at 4x speed`);
    await ctx.close();
  });

  await check("demo steps keep their timing while the page rewrites its address", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
    await ctx.route(/^https:\/\/(?!127\.0\.0\.1)/, stub);
    await ctx.addInitScript(() => sessionStorage.setItem("terrashift-demo-speed", "4"));
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(origin + base);
    await p.getByRole("button", { name: /Watch the 90-second demo/ }).click();
    await p.locator("#tour-title", { hasText: "Open a product" }).waitFor({ timeout: 30000 });
    await p.locator(".polarization-switch button").first().waitFor({ timeout: 15000 });
    // Switch images every 0.4 s: each switch rewrites the URL. Step 2 lasts 12 s / 4 = 3 s.
    const t0 = Date.now();
    let moved = false;
    while (Date.now() - t0 < 9000 && !moved) {
      const buttons = p.locator(".polarization-switch button");
      if (await buttons.count()) await buttons.nth(Math.floor(Math.random() * (await buttons.count()))).click({ force: true }).catch(() => {});
      await p.waitForTimeout(400);
      moved = !(await p.locator("#tour-title", { hasText: "Open a product" }).count());
    }
    assert.ok(moved, "step 2 never advanced while the URL kept changing (the countdown restarted on every change)");
    await ctx.close();
  });

  await check("about page: challenge fit and what we can and cannot claim, from the catalog", async () => {
    await page.goto(origin + base + "about/");
    await page.locator(".challenge-fit tbody tr").first().waitFor();
    const needs = await page.locator(".challenge-fit tbody th").allInnerTexts();
    for (const need of ["Study areas", "Physical drivers", "Polarizations", "Ancillary data", "Time series", "Future applications", "Open source"])
      assert.ok(needs.includes(need), `missing ${need}`);
    const cannot = await page.locator(".claims-columns > div").nth(1).innerText();
    assert.match(cannot, /28\.4 mm and 51\.1 mm RMS/);
    assert.match(cannot, /hypotheses, not findings/);
  });

  await check("phone width: no sideways scrolling and the map stays visible", async () => {
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    await phone.route(/^https:\/\/(?!127\.0\.0\.1)/, (route) => route.fulfill({ status: 204, body: "" }));
    const p = await phone.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    for (const route of ["", "explore/?case=san-joaquin", "analysis/", "discoveries/", "data/", "learn/"]) {
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

  await check("phone: a sample place, a reachable map, and touch targets of 24 px or more", async () => {
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await phone.route(/^https:\/\/(?!127\.0\.0\.1)/, stub);
    const p = await phone.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(origin + base + "explore/?preset=pantanal");
    await p.locator(".map-ribbon.preview").waitFor({ timeout: 15000 });
    assert.ok((await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1, "sideways scroll");
    const small = await p.evaluate(() =>
      [...document.querySelectorAll(".explorer-page button, .explorer-page a, .explorer-page input, .explorer-page summary")]
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && (r.width < 24 || r.height < 24) && !e.closest(".acq-calendar");
        })
        .map((e) => (e.getAttribute("aria-label") || e.textContent || e.tagName).trim().slice(0, 30)),
    );
    assert.deepEqual(small, [], `targets under 24 px: ${small.join(", ")}`);
    await p.getByRole("button", { name: "Show the map" }).click();
    // Smooth scrolling takes a moment: wait for the map to arrive near the top.
    // The map loads in its own chunk: wait for it to exist, then for it to arrive near the top.
    await p.waitForFunction(() => {
      const map = document.querySelector(".map-canvas");
      return !!map && map.getBoundingClientRect().top < 400;
    }, null, { timeout: 10000 });
    await p.screenshot({ path: join(out, "phone-explorer-preview.png") });
    await phone.close();
  });

  await check("390 and 768 px: Explorer, Analysis, Learn and About fit, with 24 px targets and no overlapping map panels", async () => {
    for (const width of [390, 768]) {
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1024 }, isMobile: true, hasTouch: true });
      await ctx.route(/^https:\/\/(?!127\.0\.0\.1)/, stub);
      const p = await ctx.newPage();
      p.on("pageerror", (e) => errors.push(e.message));
      for (const route of ["explore/?preset=pantanal", "analysis/", "learn/", "about/"]) {
        await p.goto(origin + base + route);
        if (route.startsWith("explore")) await p.locator(".map-ribbon.preview").waitFor({ timeout: 15000 });
        else await p.locator("main h1").first().waitFor();
        if (route.startsWith("analysis")) await p.locator(".maplibregl-canvas").waitFor();
        await p.waitForTimeout(500);
        const r = await p.evaluate(() => {
          const shown = (e) => {
            const b = e.getBoundingClientRect();
            return b.width > 0 && b.height > 0 && getComputedStyle(e).visibility !== "hidden";
          };
          // Standalone controls only: links inside a sentence are exempt from the 24 px rule.
          const inSentence = (e) => e.tagName === "A" && e.parentElement?.matches("p, li span, td") && !e.matches(".source-link, .resource-list a, .theme-places a, .challenge-fit td a, .credits-section a, .learn-data a");
          const small = [...document.querySelectorAll("main button, main a, main input, main select, main summary")]
            .filter((e) => shown(e) && !inSentence(e) && !e.closest(".acq-calendar, .maplibregl-ctrl-attrib"))
            .filter((e) => { const b = e.getBoundingClientRect(); return b.width < 24 || b.height < 24; })
            .map((e) => (e.getAttribute("aria-label") || e.textContent || e.tagName).trim().slice(0, 30));
          const panels = [".map-ribbon", ".time-scrubber", ".map-result-panel", ".map-legend", ".map-controls-top", ".map-tools", ".maplibregl-ctrl-top-right"]
            .flatMap((sel) => [...document.querySelectorAll(sel)].filter(shown).map((e) => [sel, e.getBoundingClientRect()]));
          const overlaps = [];
          for (let i = 0; i < panels.length; i++)
            for (let j = i + 1; j < panels.length; j++) {
              const [a, A] = panels[i], [b, B] = panels[j];
              if (Math.min(A.right, B.right) - Math.max(A.left, B.left) > 2 && Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top) > 2) overlaps.push(`${a} x ${b}`);
            }
          const slider = document.querySelector(".time-scrubber input[type=range]")?.getBoundingClientRect().width;
          return { sideways: document.documentElement.scrollWidth - innerWidth, small, overlaps, slider };
        });
        assert.ok(r.sideways <= 1, `${route} at ${width}px scrolls sideways by ${r.sideways}px`);
        assert.deepEqual(r.small, [], `${route} at ${width}px: targets under 24 px`);
        assert.deepEqual(r.overlaps, [], `${route} at ${width}px: overlapping map panels`);
        if (r.slider !== undefined) assert.ok(r.slider >= 100, `${route} at ${width}px: date slider only ${Math.round(r.slider)} px wide`);
        await p.screenshot({ path: join(out, `${route.split("/")[0]}-${width}.png`), fullPage: !route.startsWith("explore") });
      }
      await ctx.close();
    }
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
