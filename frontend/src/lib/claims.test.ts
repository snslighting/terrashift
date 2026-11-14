import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { claims } from "./claims";
import type { Catalog } from "./types";

const catalog = JSON.parse(readFileSync(new URL("../../public/evidence/catalog.json", import.meta.url), "utf8")) as Catalog;

describe("what we can and cannot claim (item 13)", () => {
  const { can, cannot } = claims(catalog);
  it("names the failed GNSS checks with their numbers from the catalog", () => {
    const failed = catalog.cases.flatMap((c) => c.pairs).filter((p) => p.comparison?.validation === "FAILED");
    const line = cannot.find((t) => t.includes("check failed"))!;
    for (const p of failed) expect(line).toContain(`${p.comparison!.rmse_mm.toFixed(1)} mm`);
  });
  it("keeps drivers as hypotheses and previews as pictures", () => {
    expect(cannot.join(" ")).toMatch(/hypotheses, not findings/);
    expect(can.join(" ")).toMatch(/pictures, not measurements/);
  });
  it("does not claim validation that the catalog does not have", () => {
    const validated = catalog.cases.flatMap((c) => c.pairs).some((p) => p.comparison?.validation === "PASSED");
    expect(can.some((t) => t.includes("level 4"))).toBe(validated);
  });
  it("still says something honest with no catalog", () => {
    const empty = claims(undefined);
    expect(empty.can.length).toBeGreaterThan(0);
    expect(empty.cannot.join(" ")).toMatch(/flood|wildfire/i);
  });
});
