import { describe, expect, it } from "vitest";

import { LANGUAGES } from "./languages";
import { resources } from "./index";

/**
 * The load-profile question is read as `result.loadProfile*`. A locale that
 * puts the keys anywhere else renders raw key names in the UI, which plain
 * shape-completeness checks against English cannot catch when English is wrong
 * too. Pin the location explicitly.
 */
describe("load profile translation keys", () => {
  for (const language of LANGUAGES) {
    it(`${language.code} exposes result.loadProfile*`, () => {
      const bundle = (resources as Record<string, { translation: Record<string, unknown> }>)[
        language.code
      ];
      expect(bundle).toBeTruthy();
      const result = bundle!.translation["result"] as Record<string, unknown> | undefined;
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
