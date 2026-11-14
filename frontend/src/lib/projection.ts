/**
 * Map projections for placing NASA's single-polarization NISAR previews, which come in the
 * product's own map grid: UTM (zone of the scene centre) or polar stereographic near the poles
 * (EPSG:3413 north, EPSG:3031 south). WGS84 ellipsoid, formulas from Snyder (1987), "Map
 * Projections: A Working Manual", USGS Professional Paper 1395 (transverse Mercator §8,
 * polar stereographic §21). Checked against PROJ (pyproj) to better than 1 m in the tests.
 */
import type { Position } from "./types";

const A = 6378137,
  F = 1 / 298.257223563,
  E2 = F * (2 - F),
  E = Math.sqrt(E2),
  EP2 = E2 / (1 - E2),
  RAD = Math.PI / 180;

export interface Grid {
  name: string;
  forward: (lon: number, lat: number) => [number, number];
  inverse: (x: number, y: number) => [number, number];
}

/** Meridian arc length from the equator to latitude phi (radians). */
function meridian(phi: number) {
  const e4 = E2 * E2,
    e6 = e4 * E2;
  return (
    A *
    ((1 - E2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi -
      ((3 * E2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi) +
      ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi) -
      ((35 * e6) / 3072) * Math.sin(6 * phi))
  );
}

/** UTM zone (1-60) containing a longitude. */
export function utmZone(lon: number) {
  const l = ((((lon + 180) % 360) + 360) % 360) - 180;
  return Math.min(60, Math.floor((l + 180) / 6) + 1);
}

/** UTM grid for a zone and hemisphere (EPSG 326zz north, 327zz south). */
export function utm(zone: number, south: boolean): Grid {
  const k0 = 0.9996,
    lon0 = (zone * 6 - 183) * RAD,
    fn = south ? 10_000_000 : 0;
  return {
    name: `UTM zone ${zone}${south ? "S" : "N"}`,
    forward(lon, lat) {
      const phi = lat * RAD,
        dl = ((((lon * RAD - lon0 + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI,
        s = Math.sin(phi),
        c = Math.cos(phi),
        t = Math.tan(phi),
        N = A / Math.sqrt(1 - E2 * s * s),
        T = t * t,
        C = EP2 * c * c,
        a = dl * c;
      const x =
        k0 * N * (a + ((1 - T + C) * a ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * EP2) * a ** 5) / 120);
      const y =
        k0 *
        (meridian(phi) +
          N *
            t *
            ((a * a) / 2 +
              ((5 - T + 9 * C + 4 * C * C) * a ** 4) / 24 +
              ((61 - 58 * T + T * T + 600 * C - 330 * EP2) * a ** 6) / 720));
      return [x + 500_000, y + fn];
    },
    inverse(x, y) {
      const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2)),
        mu = (y - fn) / k0 / (A * (1 - E2 / 4 - (3 * E2 * E2) / 64 - (5 * E2 ** 3) / 256)),
        p1 =
          mu +
          ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
          ((21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
          ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
          ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu),
        s = Math.sin(p1),
        c = Math.cos(p1),
        t = Math.tan(p1),
        C1 = EP2 * c * c,
        T1 = t * t,
        N1 = A / Math.sqrt(1 - E2 * s * s),
        R1 = (A * (1 - E2)) / (1 - E2 * s * s) ** 1.5,
        D = (x - 500_000) / (N1 * k0);
      const phi =
        p1 -
        ((N1 * t) / R1) *
          ((D * D) / 2 -
            ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * EP2) * D ** 4) / 24 +
            ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * EP2 - 3 * C1 * C1) * D ** 6) / 720);
      const lam =
        lon0 +
        (D - ((1 + 2 * T1 + C1) * D ** 3) / 6 + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * EP2 + 24 * T1 * T1) * D ** 5) / 120) /
          c;
      return [lam / RAD, phi / RAD];
    },
  };
}

const tFactor = (phi: number) => Math.tan(Math.PI / 4 - phi / 2) / ((1 - E * Math.sin(phi)) / (1 + E * Math.sin(phi))) ** (E / 2);

/**
 * Polar stereographic with a standard parallel: EPSG:3413 (north, 70°N, central meridian
 * 45°W) or EPSG:3031 (south, 71°S, central meridian 0°).
 */
export function polarStereographic(south: boolean): Grid {
  const latC = (south ? 71 : 70) * RAD,
    lon0 = (south ? 0 : -45) * RAD,
    mc = Math.cos(latC) / Math.sqrt(1 - E2 * Math.sin(latC) ** 2),
    tc = tFactor(latC),
    sign = south ? -1 : 1;
  return {
    name: south ? "EPSG:3031 (Antarctic polar stereographic)" : "EPSG:3413 (Arctic polar stereographic)",
    forward(lon, lat) {
      const rho = (A * mc * tFactor(sign * lat * RAD)) / tc,
        dl = lon * RAD - lon0;
      return [rho * Math.sin(dl), -sign * rho * Math.cos(dl)];
    },
    inverse(x, y) {
      const rho = Math.hypot(x, y),
        t = (rho * tc) / (A * mc),
        chi = Math.PI / 2 - 2 * Math.atan(t),
        e4 = E2 * E2,
        e6 = e4 * E2,
        e8 = e6 * E2;
      const phi =
        chi +
        (E2 / 2 + (5 * e4) / 24 + e6 / 12 + (13 * e8) / 360) * Math.sin(2 * chi) +
        ((7 * e4) / 48 + (29 * e6) / 240 + (811 * e8) / 11520) * Math.sin(4 * chi) +
        ((7 * e6) / 120 + (81 * e8) / 1120) * Math.sin(6 * chi) +
        ((4279 * e8) / 161280) * Math.sin(8 * chi);
      const lam = lon0 + (south ? Math.atan2(x, y) : Math.atan2(x, -y));
      const lon = ((((lam / RAD + 180) % 360) + 360) % 360) - 180;
      return [lon, (sign * phi) / RAD];
    },
  };
}

/** The grids a single-polarization preview may be in, for a footprint. */
export function nativeGrids(ring: Position[]): Grid[] {
  const lons = ring.map((p) => p[0]);
  let w = Math.min(...lons),
    e = Math.max(...lons);
  if (e - w > 180) {
    const un = lons.map((x) => (x < 0 ? x + 360 : x));
    w = Math.min(...un);
    e = Math.max(...un);
  }
  const lats = ring.map((p) => p[1]),
    south = (Math.min(...lats) + Math.max(...lats)) / 2 < 0;
  return [utm(utmZone((w + e) / 2), south), polarStereographic(south)];
}

/** Web Mercator y (unitless, radians) of a latitude, and back. */
export const mercatorY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (Math.max(-85.05, Math.min(85.05, lat)) * RAD) / 2));
export const mercatorLat = (y: number) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / RAD;
