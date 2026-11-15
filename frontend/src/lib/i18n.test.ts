import { describe, expect, it } from "vitest";
import { translate } from "./i18n";
import { strings } from "./i18nStrings";

describe("interface translations", () => {
  it("keeps English as written", () => {
    expect(translate("en", "Explorer")).toBe("Explorer");
  });
  it("translates listed interface text into Uzbek and Russian", () => {
    expect(translate("uz", "Explorer")).toBe("Xarita");
    expect(translate("ru", "Explorer")).toBe("Карта");
  });
  it("falls back to English for anything not listed (results and claims stay as published)", () => {
    const claim = "Pantanal is a provisional candidate";
    expect(translate("uz", claim)).toBe(claim);
    expect(translate("ru", claim)).toBe(claim);
  });
  it("has an Uzbek and a Russian text for every entry", () => {
    for (const [en, [uz, ru]] of Object.entries(strings)) {
      expect(uz.trim(), en).not.toBe("");
      expect(ru.trim(), en).not.toBe("");
    }
  });
  it("lists no study-area result wording", () => {
    for (const en of Object.keys(strings)) expect(en).not.toMatch(/Pantanal|Flores|California|San Joaquin|Venezuela/);
  });
});
