import { afterEach, describe, expect, it, vi } from "vitest";
import { createPreviewLoader, fitSize, MAX_SIDE, pngSize, PreviewCache, type Prepare, type PreviewImage } from "./browse";
import { PREVIEW_TIMEOUT_MS, startPreview, stateFor, type PreviewState } from "./previewRequest";
import type { BBox } from "./types";

const BOX: BBox = [0, 0, 1, 1];
const image = (id: string): PreviewImage => ({ id, bitmap: { close() {} } as ImageBitmap, coordinates: [], width: 10, height: 10, approximate: false });

/** A promise you resolve or reject by hand, to stage races. */
function deferred<T>() {
  let ok!: (v: T) => void, fail!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    ok = a;
    fail = b;
  });
  return { promise, ok, fail };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => vi.useRealTimers());

describe("preview size limits (item 2)", () => {
  it("scales the long side down to 2048 px and keeps the aspect ratio", () => {
    expect(MAX_SIDE).toBe(2048);
    expect(fitSize(4096, 2048)).toMatchObject({ width: 2048, height: 1024, scale: 0.5 });
    expect(fitSize(3000, 6000)).toMatchObject({ width: 1024, height: 2048 });
    // Real NASA GCOV previews (2037 x 2012) are already within the limit.
    expect(fitSize(2037, 2012)).toMatchObject({ width: 2037, height: 2012, scale: 1 });
  });
  it("reads width and height from a PNG header without decoding", () => {
    const head = new Uint8Array(24);
    head.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
    new DataView(head.buffer).setUint32(16, 2037);
    new DataView(head.buffer).setUint32(20, 2012);
    expect(pngSize(head)).toEqual({ width: 2037, height: 2012 });
    expect(pngSize(new Uint8Array(24))).toBeNull();
  });
});

describe("preview cache (item 2)", () => {
  it("keeps at most a few previews and frees the oldest picture", () => {
    const released: string[] = [],
      cache = new PreviewCache(2, (i) => released.push(i.id));
    cache.set("a", image("blob:a"));
    cache.set("b", image("blob:b"));
    cache.get("a"); // a is now the most recently used
    cache.set("c", image("blob:c"));
    expect(cache.size).toBe(2);
    expect(released).toEqual(["blob:b"]);
    expect(cache.get("b")).toBeUndefined();
  });
  it("never drops an image that is on screen, and drops it once it leaves", () => {
    const released: string[] = [],
      cache = new PreviewCache(1, (i) => released.push(i.id));
    cache.set("a", image("blob:a"));
    const unpin = cache.pin("blob:a");
    cache.set("b", image("blob:b"));
    expect(released).toEqual([]);
    expect(cache.size).toBe(2);
    unpin();
    expect(released).toEqual(["blob:a"]);
    unpin(); // a second call does nothing
    expect(cache.size).toBe(1);
  });
});

describe("preview loader (item 2)", () => {
  it("downloads an image once for two views and caches it", async () => {
    const job = deferred<PreviewImage>(),
      prepare = vi.fn<Prepare>(() => job.promise),
      loader = createPreviewLoader(prepare);
    const a = loader.load("u", BOX, false),
      b = loader.load("u", BOX, false);
    job.ok(image("blob:u"));
    expect((await a).id).toBe("blob:u");
    expect((await b).id).toBe("blob:u");
    await loader.load("u", BOX, false);
    expect(prepare).toHaveBeenCalledTimes(1);
  });
  it("aborts the download only when every view has stopped wanting it", async () => {
    let signal!: AbortSignal;
    const prepare: Prepare = (_u, _b, _a, s) => {
      signal = s;
      return new Promise((_, fail) => s.addEventListener("abort", () => fail(s.reason)));
    };
    const loader = createPreviewLoader(prepare),
      first = new AbortController(),
      second = new AbortController();
    const a = loader.load("u", BOX, false, { signal: first.signal }).catch((e) => e.name);
    const b = loader.load("u", BOX, false, { signal: second.signal }).catch((e) => e.name);
    first.abort();
    expect(await a).toBe("AbortError");
    expect(signal.aborted).toBe(false);
    second.abort();
    expect(await b).toBe("AbortError");
    expect(signal.aborted).toBe(true);
    expect(loader.inflight()).toBe(0);
  });
  it("does not cache failures, so a retry downloads again", async () => {
    const prepare = vi.fn<Prepare>().mockRejectedValueOnce(Error("NASA's image server returned 500.")).mockResolvedValue(image("blob:u"));
    const loader = createPreviewLoader(prepare);
    await expect(loader.load("u", BOX, false)).rejects.toThrow("500");
    expect((await loader.load("u", BOX, false)).id).toBe("blob:u");
    expect(prepare).toHaveBeenCalledTimes(2);
  });
});

describe("preview requests: switching product, data type or polarization (item 1)", () => {
  it("ignores a result that arrives after the user moved on, and cancels its download", async () => {
    const jobs = new Map<string, { d: ReturnType<typeof deferred<PreviewImage>>; signal?: AbortSignal }>();
    const load = (url: string, _b: BBox, _a: boolean, o: { signal?: AbortSignal }) => {
      const d = deferred<PreviewImage>();
      jobs.set(url, { d, signal: o.signal });
      return d.promise;
    };
    const seen: PreviewState[] = [];
    // Ground-motion image requested, then the user switches to Backscatter.
    const cancelGunw = startPreview({ key: "gunw|combined|0", url: "gunw.png", approximate: false, bounds: BOX }, (s) => seen.push(s), load);
    cancelGunw();
    startPreview({ key: "gcov|combined|0", url: "gcov.png", approximate: false, bounds: BOX }, (s) => seen.push(s), load);
    expect(jobs.get("gunw.png")!.signal!.aborted).toBe(true);
    // The old image finishes late; it must not be reported.
    jobs.get("gunw.png")!.d.ok(image("blob:gunw"));
    jobs.get("gcov.png")!.d.ok(image("blob:gcov"));
    await flush();
    const ready = seen.filter((s) => s.status === "ready");
    expect(ready).toHaveLength(1);
    expect(ready[0]).toMatchObject({ key: "gcov|combined|0", image: { id: "blob:gcov" } });
    expect(seen.some((s) => s.status === "ready" && s.image.id === "blob:gunw")).toBe(false);
  });
  it("never shows the previous image under the new label, even before the new request starts", () => {
    const old: PreviewState = { status: "ready", key: "gunw|combined|0", image: image("blob:gunw") };
    const now = stateFor(old, "gcov|A_HV|0");
    expect(now.status).toBe("loading");
    expect(now.status === "loading" && now.thumb).toBeFalsy();
    expect(stateFor(old, "gunw|combined|0")).toBe(old);
    expect(stateFor(old, "").status).toBe("idle");
  });
  it("shows the thumbnail while loading but never after the full image", async () => {
    const full = deferred<PreviewImage>(),
      thumb = deferred<PreviewImage>(),
      seen: PreviewState[] = [];
    startPreview(
      { key: "k", url: "full.png", thumbnail: "thumb.png", approximate: false, bounds: BOX },
      (s) => seen.push(s),
      (url) => (url === "thumb.png" ? thumb.promise : full.promise),
    );
    full.ok(image("blob:full"));
    await flush();
    thumb.ok(image("blob:thumb"));
    await flush();
    expect(seen.at(-1)).toMatchObject({ status: "ready", image: { id: "blob:full" } });
  });
  it("stops after 20 seconds with a visible error that a retry can clear", async () => {
    vi.useFakeTimers();
    let signal!: AbortSignal;
    const seen: PreviewState[] = [];
    startPreview(
      { key: "k", url: "slow.png", approximate: false, bounds: BOX },
      (s) => seen.push(s),
      (_u, _b, _a, o) => {
        signal = o.signal!;
        return new Promise((_, fail) => signal.addEventListener("abort", () => fail(signal.reason)));
      },
    );
    expect(PREVIEW_TIMEOUT_MS).toBe(20_000);
    await vi.advanceTimersByTimeAsync(19_000);
    expect(seen.at(-1)!.status).toBe("loading");
    await vi.advanceTimersByTimeAsync(1_500);
    expect(signal.aborted).toBe(true);
    expect(seen.at(-1)).toMatchObject({ status: "error", timedOut: true, message: expect.stringContaining("20 seconds") });
  });
  it("explains an unreachable server in plain words", async () => {
    const seen: PreviewState[] = [];
    startPreview({ key: "k", url: "x.png", approximate: false, bounds: BOX }, (s) => seen.push(s), () => Promise.reject(new TypeError("Failed to fetch")));
    await flush();
    expect(seen.at(-1)).toMatchObject({ status: "error", timedOut: false, message: "NASA's image server could not be reached." });
  });
});
