import type { LayerKind } from "./types";

/**
 * Narrative for each Earth Story, keyed by study id. The measured results
 * (findings, limits, validation) come from catalog.json; this file only adds
 * context and *hypotheses*. Drivers are written as candidates consistent with
 * the evidence, never as proven causes, and each lists what else could explain
 * the signal.
 */
export interface StoryNarrative {
  /** One sentence for the top of the Analysis page: the key result, in plain words. */
  takeaway: string;
  /** Step 1: where this is and why anyone should care. */
  why: string;
  /** Step 3: likely physical drivers, each a hypothesis. */
  drivers: { cause: string; evidence: string }[];
  /** Step 3: what else could produce the same radar signal. */
  alternatives: string;
  /** Step 5: who could use this and how. */
  people: { who: string; use: string }[];
  /** Map layer to show for each step (falls back to the study's primary layer). */
  layers?: Partial<Record<1 | 2 | 3 | 4 | 5, LayerKind>>;
}

export const narratives: Record<string, StoryNarrative> = {
  "san-joaquin": {
    takeaway:
      "A quarter of the mapped farmland lost more than half its radar coherence in 12 days, the pattern expected from actively worked fields.",
    why: "The San Joaquin Valley grows a large share of the fruit, nuts and vegetables eaten in the United States. It is also one of the fastest-sinking places on Earth, because irrigation leans on groundwater in dry years. Both kinds of change are slow, local and easy to miss from the ground.",
    drivers: [
      {
        cause: "Field work: tillage, irrigation, harvest and crop growth",
        evidence:
          "Coherence loss follows field boundaries and switches on and off between consecutive 12-day periods, the pattern of active management rather than a regional event.",
      },
      {
        cause: "Groundwater pumping compacting clay layers (subsidence)",
        evidence:
          "Long-term GNSS and earlier radar missions record sinking here. TerraShift's own ground-motion maps do not yet pass GNSS validation, so they cannot confirm it yet.",
      },
    ],
    alternatives:
      "Changes in soil moisture, wind on crops and natural vegetation growth also reduce coherence. Coherence shows that a surface changed, not which activity changed it.",
    people: [
      {
        who: "Farmers and irrigation districts",
        use: "See which fields were worked or irrigated, cloud or no cloud, every 12 days.",
      },
      {
        who: "Groundwater managers",
        use: "Track where the land sinks as wells are pumped, once ground motion is validated.",
      },
      {
        who: "Canal and road engineers",
        use: "Find settlement along canals, pipelines and highways before it causes damage.",
      },
    ],
    layers: { 2: "disturbance", 3: "coherence_change", 4: "los" },
  },
  "venezuela-2026": {
    takeaway:
      "Across the M7.5 earthquake, parts of the Caracas coast moved 35 cm or more along the radar's line of sight, relative to a reference area.",
    why: "On 24 June 2026 two large earthquakes struck northern Venezuela within a minute; the larger, M7.5, was centred just off the coast west of Caracas. NISAR happened to image the coast eleven days before and one day after, so a single radar pair spans both shocks.",
    drivers: [
      {
        cause: "Slip on the plate-boundary fault system along the coast",
        evidence:
          "Hundreds of millimetres of line-of-sight motion appear across the coastal range, and GNSS station CCS1 in Caracas moved 466 mm between the radar dates. Which fault slipped, and by how much, needs published finite-fault models.",
      },
      {
        cause: "Shaking damage and landslides",
        evidence:
          "Coherence loss across most of the mapped land, including steep slopes, is consistent with ground disturbance during strong shaking.",
      },
    ],
    alternatives:
      "Atmospheric delay, any motion after the earthquakes and vegetation change during the 12 days also contribute. The motion is relative to a reference area whose own stability is unverified.",
    people: [
      {
        who: "Emergency responders",
        use: "Coherence-loss maps can point to areas of likely damage within days, through cloud.",
      },
      {
        who: "Seismologists",
        use: "Ground-motion maps help locate the rupture and estimate how much the fault slipped.",
      },
      {
        who: "Planners and engineers",
        use: "Update hazard maps for the coast's ports, roads and hillside neighbourhoods.",
      },
    ],
    layers: { 2: "los", 3: "los", 4: "los" },
  },
  "flores-2026": {
    takeaway:
      "More than a quarter of mapped land on Flores lost over half its radar coherence across the M7.8 earthquake.",
    why: "A magnitude 7.8 earthquake struck off the north coast of Flores, Indonesia, on 14 August 2026. Tropical cloud often hides islands like Flores from optical satellites, but radar sees through it.",
    drivers: [
      {
        cause: "Shaking and ground disturbance from the earthquake",
        evidence:
          "More than a quarter of mapped land lost over half its coherence in a pair that spans the earthquake.",
      },
      {
        cause: "Thrust faulting north of the island",
        evidence:
          "The epicentre lies offshore to the north, where a large back-arc thrust fault is known to produce big earthquakes. No ground-motion map passes TerraShift's quality policy yet, so the radar cannot show the slip.",
      },
    ],
    alternatives:
      "Without a pair from before the earthquake, the coherence loss cannot be separated from fast-changing tropical vegetation, rain and soil moisture.",
    people: [
      {
        who: "Disaster agencies",
        use: "Map likely damage and landslides on cloudy islands where optical images fail.",
      },
      {
        who: "Hazard scientists",
        use: "Add radar evidence to the record of earthquakes along this fault system.",
      },
    ],
  },
};

/** Applications NISAR's design makes possible, beyond the processed cases. */
export const futureApplications: { title: string; text: string }[] = [
  {
    title: "Flood response",
    text: "Calm floodwater turns dark in radar backscatter, through cloud and at night, when optical satellites cannot see.",
  },
  {
    title: "Crop monitoring",
    text: "Twelve-day revisits track planting, irrigation and harvest field by field across whole growing seasons.",
  },
  {
    title: "Volcano watch",
    text: "Ground inflation of centimetres can signal magma moving beneath a volcano before an eruption.",
  },
  {
    title: "Glaciers and sea ice",
    text: "Radar measures how fast glaciers flow and how sea ice drifts and breaks up, in polar darkness too.",
  },
  {
    title: "Infrastructure settlement",
    text: "Millimetre-scale motion of dams, levees, railways and buildings can be watched over years.",
  },
  {
    title: "Forests and wetlands",
    text: "L-band radar penetrates canopies, helping track deforestation, forest biomass and wetland flooding.",
  },
];
