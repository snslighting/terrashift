import type { BBox, Comparison, LayerKind, Pair, Product, StudyCase } from "./types";
import { ringBounds } from "./browse";

export type ValidationState = "passed" | "failed" | "not_assessed";

export interface ValidationLabel {
  state: ValidationState;
  /** Machine-readable value for JSON and CSV exports. */
  code: "PASSED" | "FAILED" | "NO_INDEPENDENT_COMPARISON";
  /** Lower-case phrase for running text, e.g. "validation failed". */
  phrase: string;
  /** Upper-case badge text. */
  badge: string;
  /** CSS modifier: "passed", "failed" or "unknown". */
  tone: "passed" | "failed" | "unknown";
}

/**
 * The single source of the ground-motion validation wording. It always reads
 * `comparison.validation` from the catalog, so a pair that passes (or has no
 * independent check) is never labelled as failed.
 */
export function validationLabel(comparison: Comparison | null | undefined): ValidationLabel {
  if (comparison?.validation === "PASSED")
    return {
      state: "passed",
      code: "PASSED",
      phrase: "validation passed",
      badge: "GROUND-MOTION VALIDATION PASSED",
      tone: "passed",
    };
  if (comparison?.validation === "FAILED")
    return {
      state: "failed",
      code: "FAILED",
      phrase: "validation failed",
      badge: "GROUND-MOTION VALIDATION FAILED",
      tone: "failed",
    };
  return {
    state: "not_assessed",
    code: "NO_INDEPENDENT_COMPARISON",
    phrase: "not assessed",
    badge: "GROUND-MOTION VALIDATION NOT ASSESSED",
    tone: "unknown",
  };
}

/**
 * Plain-language warning for a ground-motion layer that has not passed an
 * independent check, or null when there is nothing to warn about.
 */
export function groundMotionWarning(kind: LayerKind, comparison: Comparison | null | undefined) {
  if (kind !== "los") return null;
  const v = validationLabel(comparison);
  if (v.state === "passed") return null;
  if (v.state === "failed" && comparison)
    return {
      short: "Not validated",
      text: `Not validated: against ${comparison.count} GNSS stations this layer is off by ${Math.round(comparison.rmse_mm)} mm RMS, larger than the motion expected in 12 days. Read patterns as a hypothesis, not as measured subsidence.`,
      ribbon: `NOT VALIDATED · differs from ${comparison.count} GNSS stations by ${Math.round(comparison.rmse_mm)} mm RMS`,
      noise: comparison.rmse_mm,
    };
  return {
    short: "Not validated",
    text: "Not validated: no GNSS station lies close enough to accepted radar pixels to check individual values. Values are relative to a reference area.",
    ribbon: "NOT VALIDATED · no co-located independent check",
    noise: undefined,
  };
}

/**
 * The two pairs to compare for a layer: the first and the latest pair that
 * actually carry that layer. Returns null, with the reason, when fewer than two
 * pairs have it, so the page never shows an empty panel.
 */
export function comparePairs(
  study: StudyCase,
  kind: LayerKind,
): { first: Pair; last: Pair } | { first: null; last: null; reason: string } {
  const withLayer = study.pairs.filter((p) => p.layers[kind]);
  if (withLayer.length >= 2) return { first: withLayer[0], last: withLayer.at(-1)! };
  const only = withLayer[0],
    from = only?.layers[kind]?.from_pair,
    previous = from && study.pairs.find((p) => p.id === from);
  const reason = !only
    ? "This layer does not exist for any pair in this area."
    : previous
      ? `This layer exists only for ${only.before} → ${only.after}: it already compares that 12-day period with the one before it (${previous.before} → ${previous.after}), so there is nothing further to swipe against.`
      : `This layer exists only for ${only.before} → ${only.after}, so there is no second pair to compare it with.`;
  return { first: null, last: null, reason };
}

/**
 * Longitude/latitude box around the corner coordinates of a pair's display grid.
 * Areas that cross the 180° line keep west > east, the convention used by
 * fitBounds and the selection tools.
 */
export function dataBounds(pair: Pair): BBox {
  const [w, s, e, n] = ringBounds(pair.coordinates);
  return [w > 180 ? w - 360 : w, s, e > 180 ? e - 360 : e, n];
}

/**
 * How far independent checks got, in three levels plus "not checked":
 * validated (GNSS check passed), partly checked (GNSS confirms the scale but is
 * not co-located), failed (GNSS check failed).
 */
export type Trust = "validated" | "partly_checked" | "failed" | "not_checked";
export function trustOf(pair: Pair | undefined): Trust {
  const v = validationLabel(pair?.comparison);
  if (v.state === "passed") return "validated";
  if (v.state === "failed") return "failed";
  return pair?.gnss ? "partly_checked" : "not_checked";
}
export const trustLabels: Record<Trust, string> = {
  validated: "Validated against GNSS",
  partly_checked: "Partly checked: GNSS confirms the scale",
  failed: "GNSS check failed",
  not_checked: "No independent check",
};

/** Outcome of the GNSS check in words: never "failed" unless the catalog says FAILED. */
export function checkOutcome(comparison: Comparison | null | undefined): "passed" | "failed" | "was not assessed" {
  const state = validationLabel(comparison).state;
  return state === "not_assessed" ? "was not assessed" : state;
}

/** The four rungs of TerraShift's honest status ladder. */
export const ladder = [
  { level: 1, short: "Catalog record", text: "NASA lists this product: date, track and footprint." },
  { level: 2, short: "NASA preview", text: "NASA's own preview image, not processed by TerraShift." },
  { level: 3, short: "Processed by TerraShift", text: "Measured maps made by TerraShift from the science file." },
  { level: 4, short: "Checked against GNSS", text: "Compared with independent ground stations." },
] as const;

export function statusLevel(product: Product | undefined, pair?: Pair): 1 | 2 | 3 | 4 {
  if (pair) return pair.comparison || pair.gnss ? 4 : 3;
  if (product?.browse.combined || product?.browse.bands.length) return 2;
  return 1;
}

/**
 * Products that can be swiped against each other: same family, track, frame and
 * orbit direction, so both images show the same ground from the same angle.
 */
export function sameGeometry(a: Product, b: Product) {
  return a.kind === b.kind && a.track === b.track && a.frame === b.frame && a.orbit === b.orbit;
}

/** "06-29 → 07-11", with the year added when the pairs of a study span more than one year. */
export function pairSpan(study: StudyCase, pair: Pair) {
  const years = new Set(study.pairs.flatMap((p) => [p.before.slice(0, 4), p.after.slice(0, 4)]));
  const cut = years.size > 1 ? 0 : 5;
  return `${pair.before.slice(cut)} → ${pair.after.slice(cut)}`;
}
