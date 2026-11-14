import { describe, expect, it } from "vitest";
import { comparePairs, groundMotionWarning, pairSpan, validationLabel } from "./evidence";
import { narratives } from "./stories";
import type { Catalog, Comparison, LayerKind, StudyCase } from "./types";
// The real catalog the site ships, so these tests catch drift after a re-export.
import shipped from "../../public/evidence/catalog.json";

const catalog = shipped as unknown as Catalog;
const study = (id: string) => catalog.cases.find((c) => c.id === id)!;
const kinds: LayerKind[] = ["disturbance", "los", "coherence_change", "backscatter_change", "backscatter_change_hv"];

// Synthetic comparison: never part of the public research export.
const synthetic = (validation: Comparison["validation"]): Comparison => ({
  reference: "REF1",
  count: 9,
  rmse_mm: 4,
  validation,
  stations: [],
  structure: { stations: 9, status: "OK" },
  reference_sweep: [],
});

describe("compare mode (B1)", () => {
  it("never pairs a layer with a pair that lacks it", () => {
    for (const s of catalog.cases)
      for (const k of kinds) {
        const c = comparePairs(s, k);
        if (c.first) {
          expect(c.first.layers[k], `${s.id} ${k} first`).toBeTruthy();
          expect(c.last.layers[k], `${s.id} ${k} last`).toBeTruthy();
          expect(c.first.id).not.toBe(c.last.id);
        } else expect(c.reason.length).toBeGreaterThan(10);
      }
  });
  it("explains why San Joaquin activity change has no swipe", () => {
    const c = comparePairs(study("san-joaquin"), "coherence_change");
    expect(c.first).toBeNull();
    if (!c.first) expect(c.reason).toContain("2026-06-29 → 2026-07-11");
  });
  it("adds the year only when pairs cross a year", () => {
    const s = study("san-joaquin");
    expect(pairSpan(s, s.pairs[0])).toBe("06-29 → 07-11");
    const crossing: StudyCase = {
      ...s,
      pairs: [s.pairs[0], { ...s.pairs[1], before: "2026-12-25", after: "2027-01-06" }],
    };
    expect(pairSpan(crossing, crossing.pairs[1])).toBe("2026-12-25 → 2027-01-06");
  });
});

describe("validation wording comes from the data (B2)", () => {
  it("labels passed, failed and missing checks differently", () => {
    expect(validationLabel(synthetic("PASSED"))).toMatchObject({ state: "passed", code: "PASSED" });
    expect(validationLabel(synthetic("FAILED"))).toMatchObject({ state: "failed", code: "FAILED" });
    expect(validationLabel(null).code).toBe("NO_INDEPENDENT_COMPARISON");
    expect(validationLabel(synthetic("PASSED")).phrase).not.toContain("failed");
  });
  it("warns on ground motion only while it has not passed", () => {
    expect(groundMotionWarning("los", synthetic("PASSED"))).toBeNull();
    expect(groundMotionWarning("disturbance", synthetic("FAILED"))).toBeNull();
    expect(groundMotionWarning("los", synthetic("FAILED"))?.noise).toBe(4);
    expect(groundMotionWarning("los", null)?.short).toBe("Not validated");
  });
});

describe("story numbers match the catalog (B3)", () => {
  const percentIn = (s: StudyCase, phrase: string) => {
    const f = s.findings.find((x) => x.includes(phrase));
    expect(f, `${s.id}: finding with "${phrase}"`).toBeTruthy();
    return parseFloat(f!.match(/([\d.]+)%/)![1]);
  };
  const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

  it("San Joaquin: 'a quarter' of farmland lost more than half its coherence", () => {
    expect(narratives["san-joaquin"].takeaway).toMatch(/^A quarter/);
    const pct = percentIn(study("san-joaquin"), "lost more than half");
    expect(pct).toBeGreaterThan(22);
    expect(pct).toBeLessThan(28);
  });

  it("Venezuela: '35 cm or more' is the 5th percentile of ground motion", () => {
    const s = study("venezuela-2026"),
      p05 = s.pairs[0].layers.los!.native_statistics.p05!;
    expect(narratives[s.id].takeaway).toContain("35 cm");
    expect(Math.round(Math.abs(p05) / 10)).toBe(35);
  });

  it("Venezuela: 'eleven days before and one day after' the M7.5", () => {
    const s = study("venezuela-2026"),
      quake = s.event!.events!.find((e) => e.magnitude === 7.5)!,
      day = quake.time.slice(0, 10);
    expect(narratives[s.id].why).toContain("eleven days before and one day after");
    expect(days(s.pairs[0].before, day)).toBe(11);
    expect(days(day, s.pairs[0].after)).toBe(1);
  });

  it("Venezuela: CCS1 moved 466 mm horizontally", () => {
    const g = study("venezuela-2026").pairs[0].gnss!,
      [e, n] = g.east_north_up_mm;
    expect(narratives["venezuela-2026"].drivers[0].evidence).toContain("466 mm");
    expect(Math.round(Math.hypot(e, n))).toBe(466);
  });

  it("Flores: 'more than a quarter' of land", () => {
    expect(narratives["flores-2026"].takeaway).toMatch(/^More than a quarter/);
    const pct = percentIn(study("flores-2026"), "lost more than half");
    expect(pct).toBeGreaterThan(25);
    expect(pct).toBeLessThan(33);
  });

  it("Flores: the summary places the quake offshore north, as USGS does (B4)", () => {
    const s = study("flores-2026");
    expect(s.event!.events![0].place).toContain("NNW of Ende");
    expect(s.summary).toContain("offshore north of Flores");
    expect(s.summary).not.toMatch(/struck near Ende/);
  });
});
