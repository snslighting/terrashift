import type { Catalog } from "./types";
import { trustOf } from "./evidence";

/**
 * "What we can and cannot claim", built from the catalog so it stays true when the data
 * changes. Placement numbers come from docs/PREVIEW_ALIGNMENT.md (checked 14 November 2026).
 */
export function claims(catalog: Catalog | undefined) {
  const cases = catalog?.cases ?? [];
  const pairs = cases.flatMap((c) => c.pairs.map((p) => ({ study: c, pair: p })));
  const failed = pairs.filter(({ pair }) => trustOf(pair) === "failed");
  const partly = pairs.filter(({ pair }) => trustOf(pair) === "partly_checked");
  const validated = pairs.filter(({ pair }) => trustOf(pair) === "validated");
  const processedTypes = new Set(cases.flatMap((c) => c.change_types));
  const unprocessed = (["flood", "wildfire"] as const).filter((t) => !processedTypes.has(t));
  const label = (t: string) => catalog?.change_types[t as keyof Catalog["change_types"]]?.label ?? t;
  const can = [
    "NISAR observed a place on a date: every product listed comes from NASA's public catalog (level 1).",
    "What NASA's own preview images show, placed on the map within about 0.2 to 1.5 km (checked against coastlines on three scenes). They are pictures, not measurements (level 2).",
    ...(cases.length
      ? [
          `Maps TerraShift measured itself from NASA's science files: ${pairs.length} radar pair${pairs.length === 1 ? "" : "s"} in ${cases.map((c) => c.name).join(", ")} (level 3).`,
        ]
      : []),
    ...(validated.length
      ? [`Ground motion that agrees with independent GNSS stations: ${validated.map((v) => v.study.name).join(", ")} (level 4).`]
      : []),
    ...(partly.length
      ? [
          `For ${[...new Set(partly.map((v) => v.study.name))].join(", ")}, a GNSS station confirms the size of the motion, but not at the same pixels: partly checked.`,
        ]
      : []),
    "How far each result was checked, shown on every result with the four-level status ladder.",
  ];
  const cannot = [
    "Why the ground changed. Likely drivers (rain, harvest, fire, an earthquake) are hypotheses, not findings.",
    "Anything measured from a NASA preview image: colours there are a guide, not values.",
    ...(failed.length
      ? [
          `That the ground-motion values in ${[...new Set(failed.map((f) => f.study.name))].join(", ")} are right: they differ from GNSS by ${failed
            .map((f) => `${f.pair.comparison!.rmse_mm.toFixed(1)} mm`)
            .join(" and ")} RMS, so the check failed.`,
        ]
      : []),
    "A total uncertainty for the ground-motion maps: it is not known yet.",
    ...(unprocessed.length
      ? [
          `Any measured result for ${unprocessed.map(label).map((l) => l.toLowerCase()).join(" or ")}: no case has been processed yet.`,
        ]
      : []),
    "That an earthquake, rather than background change, caused every change on an event map: the quiet-period control pairs are processed but not yet compared with the event maps (the Flores control keeps almost no usable pixels).",
    "That the Pantanal brightening is flooding or any other real change: it is large and even across the scene, so a seasonal or processing effect is not ruled out.",
    "Anything from other radars (RCM, SAOCOM, RADARSAT-1): they are described, not loaded.",
  ];
  return { can, cannot };
}
