import { describe, expect, it } from "vitest";
import { prefetchOrder } from "./prefetch";
import { clampView, HOME, MAX_ZOOM, zoomView } from "./zoomView";

describe("prefetchOrder", () => {
  it("loads the nearest dates first, the next date before the previous one", () => {
    expect(prefetchOrder(5, 2)).toEqual([3, 1, 4, 0]);
    expect(prefetchOrder(5, 0)).toEqual([1, 2, 3, 4]);
    expect(prefetchOrder(5, 4)).toEqual([3, 2, 1, 0]);
  });
  it("stops at the limit and never lists the open date", () => {
    expect(prefetchOrder(10, 5, 3)).toEqual([6, 4, 7]);
    expect(prefetchOrder(10, 5, 4)).not.toContain(5);
    expect(prefetchOrder(1, 0)).toEqual([]);
  });
  it("returns nothing when the open date is not in the list", () => {
    expect(prefetchOrder(4, -1)).toEqual([]);
    expect(prefetchOrder(4, 9)).toEqual([]);
  });
});

describe("zoomView", () => {
  it("never zooms out past 1 or in past the maximum", () => {
    expect(zoomView(HOME, 0.5, 50, 50, 100, 100).k).toBe(1);
    expect(zoomView({ k: MAX_ZOOM, x: 0, y: 0 }, 2, 50, 50, 100, 100).k).toBe(MAX_ZOOM);
  });
  it("keeps the point under the cursor fixed", () => {
    const v = zoomView(HOME, 2, 40, 60, 100, 100);
    expect(v.k).toBe(2);
    // The picture point that was under (40, 60) is still there: (x + 40k... ) = 40 and 60.
    expect(v.x + 40 * 2).toBeCloseTo(40);
    expect(v.y + 60 * 2).toBeCloseTo(60);
  });
  it("keeps the picture covering the frame", () => {
    const v = clampView({ k: 2, x: 30, y: -500 }, 100, 80);
    expect(v.x).toBe(0);
    expect(v.y).toBe(-80);
  });
});
