import { describe, expect, it } from "vitest";
import { AI_ASSISTANCE, credits, INDEPENDENCE, team } from "./team";

describe("team and credits", () => {
  it("lists exactly the six members, in the given order, with their roles", () => {
    expect(team.map((m) => `${m.name}: ${m.role}`)).toEqual([
      "Sharifjon Farmonov: Product Manager",
      "Sardorbek Komilov: Backend Developer",
      "Nurjahon Shodiyev: Frontend Developer",
      "Jahongir Karimov: Data Analyst & Researcher",
      "Temurbek Tolibov: UX/UI Designer",
      "Amiriddin Ramazonov: Spokesman",
    ]);
    // Every member has a portrait file named after them.
    for (const m of team) expect(m.photo).toBe(`team/${m.name.toLowerCase().replace(/ /g, "-")}.webp`);
    // Names, roles and an optional portrait only: nothing else about anyone.
    for (const m of team) expect(Object.keys(m).every((k) => ["name", "role", "photo"].includes(k))).toBe(true);
  });
  it("acknowledges AI assistance in code and documentation", () => {
    expect(AI_ASSISTANCE).toMatch(/AI assistance/);
    expect(AI_ASSISTANCE).toMatch(/Claude/);
    expect(AI_ASSISTANCE).toMatch(/code, tests and documentation/);
  });
  it("keeps the independence line", () => {
    expect(INDEPENDENCE).toMatch(/independent .*Space Apps/);
    expect(INDEPENDENCE).toMatch(/No endorsement by NASA, ISRO or any institution is implied/);
  });
  it("credits every data source and tool asked for", () => {
    const names = credits.map((c) => c.source).join(" | ");
    for (const s of ["NISAR", "ASF", "NASA CMR", "NASA GIBS", "Nevada Geodetic Laboratory", "USGS", "OpenStreetMap / Photon", "Esri"])
      expect(names).toContain(s);
  });
});
