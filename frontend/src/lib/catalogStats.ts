import type { Product, ProductKind } from "./types";

/** Products of one family, oldest first, undated ones left out. */
export function timeline(products: Product[], kind: ProductKind) {
  return products
    .filter((p) => p.kind === kind && p.date)
    .sort((a, b) => a.date!.localeCompare(b.date!) || (a.frame ?? 0) - (b.frame ?? 0));
}

const DAY = 864e5;
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

export interface Geometry {
  key: string;
  kind: ProductKind;
  track: number | null;
  orbit: string | null;
  dates: string[];
}

/** One row per family, track and orbit direction: the repeat-pass geometries of a place. */
export function geometries(products: Product[]): Geometry[] {
  const rows = new Map<string, Geometry>();
  for (const p of products) {
    if (!p.date) continue;
    const key = `${p.kind}-${p.track ?? "?"}-${p.orbit ?? "?"}`;
    const row = rows.get(key) ?? { key, kind: p.kind, track: p.track, orbit: p.orbit, dates: [] };
    if (!row.dates.includes(p.date)) row.dates.push(p.date);
    rows.set(key, row);
  }
  for (const r of rows.values()) r.dates.sort();
  return [...rows.values()].sort(
    (a, b) => a.kind.localeCompare(b.kind) || (a.track ?? 0) - (b.track ?? 0) || (a.orbit ?? "").localeCompare(b.orbit ?? ""),
  );
}

const median = (v: number[]) => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b),
    m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export interface PlaceStats {
  counts: Record<ProductKind, number>;
  first: string | null;
  last: string | null;
  /** Median days between passes of the same track and direction (NISAR's design: 12). */
  repeatDays: number | null;
  tracks: { track: number | null; orbit: string | null }[];
  orbits: string[];
}

/** Catalog facts about a place, computed only from the products already fetched. */
export function placeStats(products: Product[]): PlaceStats {
  const dated = products.map((p) => p.date).filter((d): d is string => Boolean(d)).sort();
  const gaps = geometries(products).flatMap((g) =>
    g.dates.slice(1).map((d, i) => days(g.dates[i], d)),
  );
  const tracks = new Map<string, { track: number | null; orbit: string | null }>();
  for (const p of products) tracks.set(`${p.track}-${p.orbit}`, { track: p.track, orbit: p.orbit });
  return {
    counts: {
      GUNW: products.filter((p) => p.kind === "GUNW").length,
      GCOV: products.filter((p) => p.kind === "GCOV").length,
    },
    first: dated[0] ?? null,
    last: dated.at(-1) ?? null,
    repeatDays: median(gaps.filter((g) => g > 0)),
    tracks: [...tracks.values()].sort((a, b) => (a.track ?? 0) - (b.track ?? 0)),
    orbits: [...new Set(products.map((p) => p.orbit).filter((o): o is string => Boolean(o)))].sort(),
  };
}
