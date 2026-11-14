import { describe, expect, it } from "vitest";
import {
  COLLECTION_IDS,
  fullDataLinks,
  learnResources,
  nisarApplications,
  NON_ENDORSEMENT,
  otherSarSources,
  themeCards,
} from "./resources";

const GRANULE = "NISAR_L2_PR_GCOV_033_072_A_018_4005_DHDH_A_20261017T042326_20261017T042400_P05023_N_F_J_001";

describe("official challenge resources (items 5-8)", () => {
  it("links exactly the addresses given for the theme cards", () => {
    expect(nisarApplications.map((r) => r.url)).toEqual([
      "https://nisar.jpl.nasa.gov/applications/arcgis-storymaps/",
      "https://nisar.jpl.nasa.gov/applications/societal-benefit/",
      "https://uavsar.jpl.nasa.gov/education/postcards.html",
    ]);
    expect(themeCards).toEqual(["wetland", "fire", "farming", "subsidence", "volcano", "earthquake", "ice"]);
  });
  it("links the learning pages given, plus the CSA SAR tutorial", () => {
    expect(learnResources.map((r) => r.url)).toEqual([
      "https://www.earthdata.nasa.gov/learn/earth-observation-data-basics/remote-sensing",
      "https://www.earthdata.nasa.gov/learn/earth-observation-data-basics/sar",
      "https://appliedsciences.nasa.gov/get-involved/training",
      "https://github.com/asc-csa/Synthetic_Aperture_Radar_Tutorial",
    ]);
  });
  it("pre-fills the data portals with the product name and its NISAR collection", () => {
    const gcov = fullDataLinks({ granule: GRANULE, kind: "GCOV" });
    expect(gcov.earthdata).toBe(`https://search.earthdata.nasa.gov/search/granules?p=C2854338529-ASF&pg[0][id]=${GRANULE}`);
    expect(gcov.vertex).toContain(`searchList=${GRANULE}`);
    expect(gcov.vertex.startsWith("https://search.asf.alaska.edu/")).toBe(true);
    expect(gcov.guide).toBe("https://nisar-docs.asf.alaska.edu/");
    expect(fullDataLinks({ granule: "X", kind: "GUNW" }).earthdata).toContain(COLLECTION_IDS.GUNW);
  });
  it("never carries credentials in a link", () => {
    const all = [
      ...nisarApplications,
      ...learnResources,
      ...otherSarSources.filter((s) => s.url),
    ].map((r) => r.url);
    all.push(...Object.values(fullDataLinks({ granule: GRANULE, kind: "GCOV" })));
    for (const url of all) {
      expect(url.startsWith("https://")).toBe(true);
      expect(url).not.toMatch(/password|token|user(name)?=|@/i);
    }
  });
  it("describes the other radars without loading any of them", () => {
    expect(otherSarSources.map((s) => s.title)).toEqual(["RADARSAT Constellation Mission (RCM)", "SAOCOM", "RADARSAT-1"]);
    expect(otherSarSources[0].url).toBe("https://donnees-data.asc-csa.gc.ca/en/dataset/rcm");
    expect(otherSarSources[0].band).toMatch(/C-band/);
    expect(otherSarSources[1].band).toMatch(/L-band/);
    expect(otherSarSources[1].access).toMatch(/CONAE/);
    expect(otherSarSources[2].about).toMatch(/1995/);
    expect(NON_ENDORSEMENT).toMatch(/non-U\.S\. Government websites do not imply endorsement by NASA/);
  });
});
