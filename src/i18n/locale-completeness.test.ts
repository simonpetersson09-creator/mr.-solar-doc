import { describe, expect, it } from "vitest";
import { sv } from "./locales/sv";
import { en } from "./locales/en";
import { fi } from "./locales/fi";
import { da } from "./locales/da";
import { de } from "./locales/de";
import { cs } from "./locales/cs";
import { pl } from "./locales/pl";
import { sk } from "./locales/sk";
import { sl } from "./locales/sl";
import { et } from "./locales/et";
import { lv } from "./locales/lv";
import { lt } from "./locales/lt";
import { fr } from "./locales/fr";
import { it as itLocale } from "./locales/it";

const LOCALES: Record<string, unknown> = {
  sv, en, fi, da, de, cs, pl, sk, sl, et, lv, lt, fr, it: itLocale,
};

function flatten(value: unknown, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      Object.assign(out, flatten(entry, path));
    } else if (typeof entry === "string") {
      out[path] = entry;
    }
  }
  return out;
}

const flat: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(LOCALES).map(([lang, value]) => [lang, flatten(value)]),
);
const english = flat["en"]!;
const swedish = flat["sv"]!;
const englishKeys = Object.keys(english);

describe("i18n completeness", () => {
  it("every language has every English key", () => {
    for (const [lang, entries] of Object.entries(flat)) {
      const missing = englishKeys.filter((key) => !(key in entries));
      expect(missing, `${lang} is missing keys`).toEqual([]);
    }
  });

  it("no language has extra keys English does not know", () => {
    for (const [lang, entries] of Object.entries(flat)) {
      const extra = Object.keys(entries).filter((key) => !englishKeys.includes(key));
      expect(extra, `${lang} has unknown keys`).toEqual([]);
    }
  });

  it("no empty strings", () => {
    for (const [lang, entries] of Object.entries(flat)) {
      const empty = Object.entries(entries)
        .filter(([, value]) => value.trim() === "")
        .map(([key]) => key);
      expect(empty, `${lang} has empty strings`).toEqual([]);
    }
  });

  it("previously missing grid, economics and paywall keys are translated everywhere", () => {
    const keys = [
      "fuse.grid.serviceType",
      "fuse.grid.splitPhase",
      "fuse.grid.unverifiedHint",
      "fuse.genericTitle",
      "fuse.noCountryOptions",
      "fuse.unverifiedCountryNotice",
      "fuse.confirmGrid",
      "fuse.confirmedGrid",
      "result.missingSelfConsumedValue",
      "result.missingExportValue",
      "result.missingInstallationCost",
      "result.economicsIncomplete",
      "result.enterValues",
      "result.economicsRequiresPrice",
      "result.economicsRequiresPriceShort",
      "result.gridUnverifiedTitle",
      "result.gridUnverifiedWarning",
      "result.gridProfileStatusLabel",
      "result.gridProfileStatusVerified",
      "result.gridProfileStatusGeneric",
      "result.gridProfileStatusUnsupported",
      "result.calcErrorTitle",
      "result.calcErrorBody",
      "report.fields.gridMethodNoteDynamic",
      "paywall.priceLoading",
      "paywall.single.ctaNoPrice",
    ];
    for (const [lang, entries] of Object.entries(flat)) {
      for (const key of keys) {
        expect(entries[key], `${lang}.${key}`).toBeTruthy();
        if (lang !== "sv" && swedish[key] !== english[key]) {
          // No Swedish source text leaking into other languages.
          expect(entries[key]).not.toBe(swedish[key]);
        }
      }
    }
  });

  it("interpolation placeholders match English", () => {
    const placeholders = (value: string) =>
      [...value.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
    for (const [lang, entries] of Object.entries(flat)) {
      for (const key of englishKeys) {
        expect(placeholders(entries[key] ?? ""), `${lang}.${key}`).toEqual(
          placeholders(english[key] ?? ""),
        );
      }
    }
  });
});
