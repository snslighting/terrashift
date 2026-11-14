import { afterEach, describe, expect, it, vi } from "vitest";
import shipped from "../../public/evidence/catalog.json";
import { fetchJsonIdle, searchFamilies, StallError, withRetry } from "./catalogSearch";
import { discover } from "./api";
import type { Discovery } from "./types";

afterEach(() => vi.unstubAllGlobals());

/** A response whose body arrives in pieces, `gapMs` apart; `stallAfter` pieces then nothing. */
function streamed(json: unknown, pieces: number, gapMs: number, stallAfter = Infinity) {
  const bytes = new TextEncoder().encode(JSON.stringify(json)),
    size = Math.ceil(bytes.length / pieces);
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      if (i >= stallAfter) return new Promise(() => {}); // never sends again
      await new Promise((ok) => setTimeout(ok, gapMs));
      const chunk = bytes.slice(i * size, (i + 1) * size);
      i++;
      if (chunk.length) ctrl.enqueue(chunk);
      if (i * size >= bytes.length) ctrl.close();
    },
  });
  return new Response(body, { status: 200 });
}

describe("catalog requests on slow connections (item 2)", () => {
  it("does not cut off a slow answer that keeps arriving", async () => {
    // 8 pieces, 40 ms apart = 320 ms in all: more than the 100 ms quiet limit, but never quiet that long.
    const fetchImpl = vi.fn(async () => streamed({ items: [1, 2, 3] }, 8, 40));
    await expect(fetchJsonIdle("u", undefined, { idleMs: 100, totalMs: 2000, fetchImpl })).resolves.toEqual({ items: [1, 2, 3] });
  });
  it("gives up when no data arrives for the quiet limit", async () => {
    const fetchImpl = vi.fn(async () => streamed({ items: [1, 2, 3] }, 8, 10, 2));
    await expect(fetchJsonIdle("u", undefined, { idleMs: 100, totalMs: 2000, fetchImpl })).rejects.toBeInstanceOf(StallError);
  });
  it("gives up at the hard limit even if data trickles in", async () => {
    const fetchImpl = vi.fn(async () => streamed({ items: [1] }, 50, 30));
    await expect(fetchJsonIdle("u", undefined, { idleMs: 100, totalMs: 200, fetchImpl })).rejects.toBeInstanceOf(StallError);
  });
  it("reports a cancelled search as cancelled, not as a failure", async () => {
    const ctrl = new AbortController();
    const fetchImpl = vi.fn(async () => streamed({}, 4, 50));
    const pending = fetchJsonIdle("u", ctrl.signal, { idleMs: 1000, fetchImpl });
    ctrl.abort();
    await expect(pending).rejects.toThrow("Search cancelled.");
  });
});

describe("retry and partial failure (item 2)", () => {
  it("retries once, then succeeds", async () => {
    const task = vi.fn().mockRejectedValueOnce(Error("busy")).mockResolvedValue("ok");
    await expect(withRetry(task, undefined, 1)).resolves.toBe("ok");
    expect(task).toHaveBeenCalledTimes(2);
  });
  it("does not retry more than once, or after a cancel", async () => {
    const task = vi.fn().mockRejectedValue(Error("down"));
    await expect(withRetry(task, undefined, 1)).rejects.toThrow("down");
    expect(task).toHaveBeenCalledTimes(2);
    const ctrl = new AbortController();
    ctrl.abort();
    const again = vi.fn().mockRejectedValue(Error("down"));
    await expect(withRetry(again, ctrl.signal, 1)).rejects.toThrow("down");
    expect(again).toHaveBeenCalledTimes(1);
  });
  it("shows the first family as soon as it answers and keeps it when the other fails", async () => {
    const updates: [string[], string[]][] = [];
    const settled = await searchFamilies(
      ["GUNW", "GCOV"],
      async (kind) => {
        if (kind === "GCOV") {
          await new Promise((ok) => setTimeout(ok, 20));
          throw Error("down");
        }
        return kind;
      },
      (s, pending) => updates.push([s.map((x) => x.kind), pending]),
      undefined,
      1,
    );
    expect(updates[0]).toEqual([["GUNW"], ["GCOV"]]);
    expect(settled.map((s) => [s.kind, s.ok])).toEqual([
      ["GUNW", true],
      ["GCOV", false],
    ]);
  });
});

// A fake NASA CMR: one GUNW and one GCOV record over the search box.
const record = (kind: "GUNW" | "GCOV") => ({
  meta: { "concept-id": `G-${kind}` },
  umm: {
    GranuleUR: `TEST_${kind}`,
    CollectionReference: { ShortName: `NISAR_L2_${kind}_PROVISIONAL_V1` },
    TemporalExtent: { RangeDateTime: { BeginningDateTime: "2026-10-01T00:00:00Z" } },
    RelatedUrls: [],
    AdditionalAttributes: [],
  },
});
function fakeCmr(behaviour: Record<"GUNW" | "GCOV", ("ok" | "fail")[]>) {
  const calls = { GUNW: 0, GCOV: 0 };
  const fetch = vi.fn(async (url: string) => {
    if (url.includes("catalog.json")) return new Response(JSON.stringify(shipped));
    const kind = url.includes("GCOV") ? "GCOV" : "GUNW";
    const step = behaviour[kind][Math.min(calls[kind]++, behaviour[kind].length - 1)];
    if (step === "fail") return new Response("", { status: 503 });
    return new Response(JSON.stringify({ hits: 1, items: [record(kind)] }));
  });
  vi.stubGlobal("fetch", fetch);
  return calls;
}
let day = 1;
/** Each test searches different dates, so discover's 5-minute cache never answers. */
const search = (onPartial?: (d: Discovery) => void) => {
  const d = String(day++).padStart(2, "0");
  return discover({ name: "t", bbox: [12.1, 32.9, 12.4, 33.2] }, `2025-11-${d}`, "2026-11-14", undefined, onPartial);
};

describe("discover: both families in parallel, one retry, offline only as a last resort (item 2)", () => {
  it("recovers when a family fails once (the 'press Discover again' case)", async () => {
    const calls = fakeCmr({ GUNW: ["ok"], GCOV: ["fail", "ok"] });
    const d = await search();
    expect(d.offline).toBeFalsy();
    expect(d.products.map((p) => p.kind).sort()).toEqual(["GCOV", "GUNW"]);
    expect(calls.GCOV).toBe(2);
  });
  it("keeps the family that answered when the other fails twice, and says which failed", async () => {
    fakeCmr({ GUNW: ["ok"], GCOV: ["fail", "fail"] });
    const partial: Discovery[] = [];
    const d = await search((p) => partial.push(p));
    expect(d.offline).toBeFalsy();
    expect(d.failed).toEqual(["GCOV"]);
    expect(d.products.map((p) => p.kind)).toEqual(["GUNW"]);
    // The first family was shown while the other was still being tried.
    expect(partial[0].pending).toEqual(["GCOV"]);
    expect(partial[0].products.map((p) => p.kind)).toEqual(["GUNW"]);
  });
  it("falls back to stored products only when both families fail after a retry", async () => {
    const calls = fakeCmr({ GUNW: ["fail", "fail"], GCOV: ["fail", "fail"] });
    const d = await search();
    expect(d.offline).toBe(true);
    expect(calls).toEqual({ GUNW: 2, GCOV: 2 });
  });
});
