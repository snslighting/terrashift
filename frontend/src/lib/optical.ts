import { normalizeLongitude } from "./science";

/** NASA GIBS daily true-colour mosaic (MODIS Terra), about 250 m detail, public, no key. */
export const gibsTiles = (date: string) =>
  `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`;
/** The GIBS tile containing a point at zoom z (Web Mercator XYZ). */
export function gibsTileAt(date: string, lon: number, lat: number, z = 3) {
  const n = 2 ** z,
    phi = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180,
    x = Math.min(n - 1, Math.max(0, Math.floor(((normalizeLongitude(lon) + 180) / 360) * n))),
    y = Math.min(n - 1, Math.max(0, Math.floor(((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * n)));
  return gibsTiles(date).replace("{z}/{y}/{x}", `${z}/${y}/${x}`);
}
/**
 * Does GIBS have the optical image of `date` here? The map itself cannot tell: MapLibre treats a
 * missing tile (404) as empty, not as an error. GIBS answers 404 for days it has no image of and
 * reports the day it served in the `layer-time-actual` header.
 */
export async function opticalAvailable(date: string, lon: number, lat: number, signal?: AbortSignal) {
  const r = await fetch(gibsTileAt(date, lon, lat), { signal, mode: "cors" });
  const served = r.headers.get("layer-time-actual");
  return r.ok && (!served || served.slice(0, 10) === date);
}
