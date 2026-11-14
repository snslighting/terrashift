/**
 * Official resources from the Space Apps 2026 "Dancing with the SARs" Resources tab, and the
 * pre-filled data links for a product. One list, so every page links the same addresses.
 *
 * Verification (14 November 2026): the addresses below were given by the team from the
 * challenge's Resources tab. None of these sites could be opened from the environment the
 * site is built in (its network blocks them), so the pages themselves were NOT checked. The
 * CSA SAR tutorial address was found by web search and its repository confirmed through the
 * GitHub API; it was not confirmed to be the exact link on the Resources tab. The NISAR
 * collection IDs were read from NASA CMR on the same day.
 */
import type { Product, ProductKind } from "./types";
import type { Theme } from "./presets";

export interface Resource {
  title: string;
  url: string;
  /** One plain sentence: what you find there. */
  about: string;
}

export const nisarApplications: Resource[] = [
  {
    title: "NISAR StoryMaps",
    url: "https://nisar.jpl.nasa.gov/applications/arcgis-storymaps/",
    about: "Illustrated stories on how NISAR data can be used, from NASA JPL.",
  },
  {
    title: "NISAR applications white papers",
    url: "https://nisar.jpl.nasa.gov/applications/societal-benefit/",
    about: "Short papers on how NISAR serves ecosystems, hazards, water, ice and more.",
  },
  {
    title: "UAVSAR postcards",
    url: "https://uavsar.jpl.nasa.gov/education/postcards.html",
    about: "Airborne radar images of real places, explained one picture at a time.",
  },
];

export const learnResources: Resource[] = [
  {
    title: "Introduction to remote sensing",
    url: "https://www.earthdata.nasa.gov/learn/earth-observation-data-basics/remote-sensing",
    about: "How satellites observe the Earth, from NASA Earthdata.",
  },
  {
    title: "Introduction to synthetic aperture radar (SAR)",
    url: "https://www.earthdata.nasa.gov/learn/earth-observation-data-basics/sar",
    about: "What radar measures, wavelengths, polarization and how to read SAR images.",
  },
  {
    title: "NASA ARSET trainings",
    url: "https://appliedsciences.nasa.gov/get-involved/training",
    about: "Free online courses from NASA's Applied Remote Sensing Training program, including SAR.",
  },
  {
    title: "CSA SAR tutorial in Python",
    url: "https://github.com/asc-csa/Synthetic_Aperture_Radar_Tutorial",
    about: "Canadian Space Agency notebook for opening and plotting RADARSAT images in Python and QGIS.",
  },
];

export const NISAR_GUIDE = "https://nisar-docs.asf.alaska.edu/";
export const EARTHDATA_SEARCH = "https://search.earthdata.nasa.gov/search";
export const ASF_VERTEX = "https://search.asf.alaska.edu/";

/** NASA CMR collection IDs of the provisional NISAR collections (read from CMR, 14 November 2026). */
export const COLLECTION_IDS: Record<ProductKind, string> = {
  GCOV: "C2854338529-ASF",
  GUNW: "C2854335566-ASF",
};

/**
 * Links that open a data portal on one product. These use the portals' address formats as the
 * team understands them (Earthdata Search: collection `p` and granule filter `pg[0][id]`;
 * Vertex: a list search). They could not be opened from the build environment, so each
 * panel also shows the granule name with a copy button and says where to paste it.
 */
export function fullDataLinks(product: Pick<Product, "granule" | "kind">) {
  const q = encodeURIComponent(product.granule);
  return {
    earthdata: `${EARTHDATA_SEARCH}/granules?p=${COLLECTION_IDS[product.kind]}&pg[0][id]=${q}`,
    vertex: `${ASF_VERTEX}#/?dataset=NISAR&searchType=List%20Search&searchList=${q}`,
    guide: NISAR_GUIDE,
  };
}

/** Other radar missions with data people can use. Not loaded in TerraShift. */
export const otherSarSources: (Resource & { band: string; access: string })[] = [
  {
    title: "RADARSAT Constellation Mission (RCM)",
    band: "C-band (about 5.6 cm wavelength)",
    access: "Open data from the Canadian Space Agency.",
    url: "https://donnees-data.asc-csa.gc.ca/en/dataset/rcm",
    about:
      "Three Canadian satellites that together see most of Canada every day. C-band reacts more to leaves and small surface roughness than NISAR's L-band.",
  },
  {
    title: "SAOCOM",
    band: "L-band, like NISAR",
    access: "Registration required with CONAE, Argentina's space agency.",
    // No address is linked: none was given in the challenge resources we were handed.
    url: "",
    about:
      "Two Argentine satellites. Same band as NISAR, so it is the closest match for comparing soil moisture and vegetation signals.",
  },
  {
    title: "RADARSAT-1",
    band: "C-band",
    access: "Archive under an open licence from the Canadian Space Agency.",
    // Found by web search on CSA's open data portal; not opened from the build environment.
    url: "https://donnees-data.asc-csa.gc.ca/dataset/radarsat1",
    about: "Canada's first radar satellite. Its archive starts in 1995: useful for looking at change over decades.",
  },
];

/** Which resources fit each theme card. The same three NISAR application resources serve every theme. */
export const themeCards: Theme[] = ["wetland", "fire", "farming", "subsidence", "volcano", "earthquake", "ice"];

export const NON_ENDORSEMENT =
  "Links to non-U.S. Government websites do not imply endorsement by NASA. TerraShift is an independent project, not an official NASA product.";
