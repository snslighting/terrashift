// Build a self-contained copy of TerraShift for hosts that serve one page and only
// standard web file types (for example a Claude artifact):
//   node scripts/hosted.mjs <outDir>
// - hash routing and relative asset paths (VITE_HASH_ROUTER=1, --base ./)
// - each binary evidence grid (.bin) is repackaged as JSON holding the same bytes in
//   base64, and catalog.json points at those files. The data is unchanged.
// - writes <outDir>/page.html: the page body (title, styles, script, root) for hosts
//   that wrap the page in their own document.
import { execFileSync } from "node:child_process";
import { readFile, writeFile, readdir, rm } from "node:fs/promises";
import { resolve, join } from "node:path";

const out = resolve(process.argv[2] ?? "../website-hosted");
execFileSync("npx", ["vite", "build", "--base", "./", "--outDir", out, "--emptyOutDir"], {
  stdio: "inherit",
  env: { ...process.env, VITE_HASH_ROUTER: "1" },
});

const gridDir = join(out, "evidence", "grids");
for (const name of await readdir(gridDir)) {
  if (!name.endsWith(".bin")) continue;
  const bytes = await readFile(join(gridDir, name));
  await writeFile(join(gridDir, name + ".json"), JSON.stringify({ base64: bytes.toString("base64") }));
  await rm(join(gridDir, name));
}
const catalogPath = join(out, "evidence", "catalog.json");
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
for (const study of catalog.cases)
  for (const pair of study.pairs)
    for (const layer of Object.values(pair.layers)) {
      layer.file += ".json";
      layer.counts += ".json";
    }
await writeFile(catalogPath, JSON.stringify(catalog));

const html = await readFile(join(out, "index.html"), "utf8");
const pick = (re) => html.match(re)?.[0] ?? "";
const page = [
  "<title>TerraShift</title>",
  pick(/<meta name="description"[^>]*>/),
  "<style>:root{color-scheme:dark;background:#070d19}body{background:#070d19;color:#f5f8ff}</style>",
  pick(/<link rel="stylesheet"[^>]*>/).replace(" crossorigin", ""),
  pick(/<script type="module"[^>]*><\/script>/).replace(" crossorigin", ""),
  '<div id="root"></div>',
].join("\n");
await writeFile(join(out, "page.html"), page + "\n");
await rm(join(out, "index.html"));
await rm(join(out, "THIRD_PARTY_NOTICES.md"), { force: true });
console.log("hosted copy ready:", out);
