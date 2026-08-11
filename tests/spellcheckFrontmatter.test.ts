import { describe, expect, it } from "vitest";
import {
  parseSpellcheckLangs,
  parseSpellcheckOverride,
  primaryLang,
  promoteSpellcheckLanguage,
  resolveSpellcheckEnabled,
  toggleSpellcheckLanguage,
  writeSpellcheckLangs,
  writeSpellcheckOverride,
} from "@/lib/markdown/spellcheckFrontmatter";

describe("spellcheckFrontmatter", () => {
  it("reads and writes language lists without disturbing neighbors", () => {
    const fm = "---\ntitle: Essay\nstatus: draft\n---\n";
    const next = writeSpellcheckLangs(fm, ["es", "en-US"]);
    expect(next).toContain("spellcheck_langs: es, en-US");
    expect(next).toContain("title: Essay");
    expect(parseSpellcheckLangs(next)).toEqual(["es", "en-US"]);
  });

  it("removes language line when cleared", () => {
    const fm = "---\ntitle: Essay\nspellcheck_langs: es\n---\n";
    const next = writeSpellcheckLangs(fm, []);
    expect(next).not.toContain("spellcheck_langs");
    expect(parseSpellcheckLangs(next)).toEqual([]);
  });

  it("reads and writes on/off override without touching langs", () => {
    const fm = "---\ntitle: Essay\nspellcheck_langs: es\n---\n";
    const off = writeSpellcheckOverride(fm, "off");
    expect(off).toContain("spellcheck: off");
    expect(off).toContain("spellcheck_langs: es");
    expect(parseSpellcheckOverride(off)).toBe("off");

    const on = writeSpellcheckOverride(off, "on");
    expect(parseSpellcheckOverride(on)).toBe("on");

    const cleared = writeSpellcheckOverride(on, null);
    expect(cleared).not.toMatch(/^spellcheck:/m);
    expect(cleared).toContain("spellcheck_langs: es");
    expect(parseSpellcheckOverride(cleared)).toBeNull();
  });

  it("does not treat spellcheck_langs as the override line", () => {
    const fm = "---\nspellcheck_langs: en-US\n---\n";
    expect(parseSpellcheckOverride(fm)).toBeNull();
  });

  it("resolves essay override over the account default", () => {
    expect(resolveSpellcheckEnabled(null, true)).toBe(true);
    expect(resolveSpellcheckEnabled(null, false)).toBe(false);
    expect(resolveSpellcheckEnabled("off", true)).toBe(false);
    expect(resolveSpellcheckEnabled("on", false)).toBe(true);
  });

  it("makes a newly enabled language primary", () => {
    expect(toggleSpellcheckLanguage([], ["en-US"], "es")).toEqual([
      "es",
      "en-US",
    ]);
    expect(primaryLang(toggleSpellcheckLanguage([], ["en-US"], "es"))).toBe(
      "es"
    );
  });

  it("promotes an existing language to primary", () => {
    expect(promoteSpellcheckLanguage(["en-US", "es"], "es")).toEqual([
      "es",
      "en-US",
    ]);
  });

  it("clearing the last explicit language returns inherit", () => {
    expect(toggleSpellcheckLanguage(["es"], ["en-US"], "es")).toEqual([]);
  });
});
