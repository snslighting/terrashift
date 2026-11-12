import type { BBox, Comparison, LayerKind, Pair, StudyCase } from "./types";

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

/** Longitude/latitude box around the corner coordinates of a pair's display grid. */
export function dataBounds(pair: Pair): BBox {
  const lons = pair.coordinates.map((c) => c[0]),
    lats = pair.coordinates.map((c) => c[1]);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

/** "06-29 → 07-11", with the year added when the pairs of a study span more than one year. */
export function pairSpan(study: StudyCase, pair: Pair) {
  const years = new Set(study.pairs.flatMap((p) => [p.before.slice(0, 4), p.after.slice(0, 4)]));
  const cut = years.size > 1 ? 0 : 5;
  return `${pair.before.slice(cut)} → ${pair.after.slice(cut)}`;
}
