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
import { es } from "./locales/es";
import { pt } from "./locales/pt";
import { nl } from "./locales/nl";
import { no } from "./locales/no";
import { ro } from "./locales/ro";
import { el } from "./locales/el";
import { hu } from "./locales/hu";
import { hr } from "./locales/hr";
import { sr } from "./locales/sr";
import { bg } from "./locales/bg";
import { uk } from "./locales/uk";
import { tr } from "./locales/tr";
import { hi } from "./locales/hi";
import { id } from "./locales/id";
import { he } from "./locales/he";

const LOCALES: Record<string, unknown> = {
  sv, en, fi, da, de, cs, pl, sk, sl, et, lv, lt, fr, it: itLocale,
  es, pt, nl, no, ro, el, hu, hr, sr, bg, uk, tr, hi, id, he,
};

/**
 * The load-profile question is read as `result.loadProfile*`. A locale that
 * places the keys anywhere else renders raw key names in the UI — a
 * shape-completeness check against English cannot catch it when English has
 * them in the wrong place too, so pin the exact location here.
 */
describe("load profile translation keys", () => {
  for (const [language, bundle] of Object.entries(LOCALES)) {
    it(`${language} exposes result.loadProfile*`, () => {
      const result = (bundle as Record<string, Record<string, unknown>>)["result"];
      expect(result).toBeTruthy();
      for (const key of [
        "loadProfileQuestion",
        "loadProfileHelp",
        "loadProfileNote",
        "loadProfileLabel",
      ]) {
        expect(typeof result![key]).toBe("string");
      }
      const profiles = result!["loadProfile"] as Record<string, unknown> | undefined;
      expect(profiles).toBeTruthy();
      for (const key of [
        "evening",
        "eveningHelp",
        "mixed",
        "mixedHelp",
        "daytime",
        "daytimeHelp",
      ]) {
        expect(typeof profiles![key]).toBe("string");
      }
    });
  }
});

/**
 * The self-consumption mode wording (automatic vs manual) plus the reset
 * control are read as `result.selfConsumption*`. A missing key would render a
 * raw key name next to a money figure.
 */
describe("self-consumption mode translation keys", () => {
  for (const [language, bundle] of Object.entries(LOCALES)) {
    it(`${language} exposes result.selfConsumption mode keys`, () => {
      const result = (bundle as Record<string, Record<string, unknown>>)["result"];
      expect(result).toBeTruthy();
      for (const key of [
        "selfConsumptionModeLabel",
        "selfConsumptionModeAuto",
        "selfConsumptionModeManual",
        "selfConsumptionManualHelp",
        "selfConsumptionResetAuto",
        "selfConsumptionManualProfileNote",
      ]) {
        expect(typeof result![key]).toBe("string");
        expect((result![key] as string).length).toBeGreaterThan(0);
      }
    });
  }
});
