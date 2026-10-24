import { createContext, useContext, useEffect, useState } from "react";
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

/** Load the requested layers of a pair; grids that fail stay absent (never substituted). */
export function useGrids(pair: Pair | undefined, kinds: LayerKind[]) {
  const [grids, setGrids] = useState<Partial<Record<LayerKind, Grid>>>({});
  const [error, setError] = useState("");
  const key = pair ? pair.id + ":" + kinds.join(",") : "";
  useEffect(() => {
    if (!pair) {
      setGrids({});
      return;
    }
    let cancelled = false;
    setGrids({});
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
      setError(
        results.some((r) => r.status === "rejected")
          ? "Some evidence layers could not be loaded. Refresh to retry."
          : "",
      );
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { grids, error };
}
