import { createContext, useContext, useEffect, useRef, useState } from "react";
import type {
  Catalog,
  Grid,
  LayerEntry,
  LayerKind,
  Pair,
  Selection,
} from "./types";
import { loadGrid } from "./api";
export interface AppState {
  catalog?: Catalog;
  error: string;
  selection?: Selection;
  setSelection: (s: Selection | undefined) => void;
}
export const AppContext = createContext<AppState>({
  error: "",
  setSelection: () => {},
});
export const useApp = () => useContext(AppContext);

/**
 * Load the requested layers of a pair; grids that fail stay absent (never substituted).
 * While a new pair or layer set on the *same display grid* loads, the previous grids stay
 * on screen (no blank flash); `loading` is true until the new ones arrive, and callers
 * must not inspect values while it is. A different grid geometry (another study area)
 * clears immediately, so one place's data is never drawn over another. `retry` reloads.
 */
export function useGrids(pair: Pair | undefined, kinds: LayerKind[]) {
  const [grids, setGrids] = useState<Partial<Record<LayerKind, Grid>>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const geometry = useRef("");
  const key = pair ? pair.id + ":" + kinds.join(",") : "";
  useEffect(() => {
    if (!pair) {
      geometry.current = "";
      setGrids({});
      setLoading(false);
      return;
    }
    let cancelled = false;
    const g = pair.grid.size + ":" + pair.grid.bounds_mercator.join(",");
    if (g !== geometry.current) setGrids({});
    geometry.current = g;
    setLoading(true);
    const wanted = kinds.filter((k) => pair.layers[k]);
    Promise.allSettled(
      wanted.map((k) => loadGrid(pair, pair.layers[k] as LayerEntry)),
    ).then((results) => {
      if (cancelled) return;
      const next: Partial<Record<LayerKind, Grid>> = {};
      results.forEach((r, i) => {
        if (r.status === "fulfilled") next[wanted[i]] = r.value;
      });
      setGrids(next);
      setLoading(false);
      setError(
        results.some((r) => r.status === "rejected")
          ? "Some evidence layers could not be loaded."
          : "",
      );
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);
  return { grids, error, loading, retry: () => setAttempt((n) => n + 1) };
}
