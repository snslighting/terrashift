import { readFile, writeFile, mkdir } from "node:fs/promises";
const html = await readFile("../website-v2/index.html", "utf8");
for (const route of [
  "explore",
  "analysis",
  "discoveries",
  "science",
  "data",
  "about",
]) {
  await mkdir(`../website-v2/${route}`, { recursive: true });
  await writeFile(`../website-v2/${route}/index.html`, html);
}
await writeFile("../website-v2/404.html", html);
await writeFile("../website-v2/.nojekyll", "");
