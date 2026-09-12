import { describe, expect, it } from "vitest";
import { migrateWizardState } from "./wizard-migrations";
import { WIZARD_STORAGE_VERSION, initialWizardState } from "./wizard-initial-state";

describe("load profile persistence", () => {
  it("keeps the stored choice across a reload", () => {
    const stored = { ...initialWizardState, loadProfileClass: "daytime" };
    const result = migrateWizardState(JSON.parse(JSON.stringify(stored)), WIZARD_STORAGE_VERSION);
    expect(result.state.loadProfileClass).toBe("daytime");
  });

  it("falls back to mixed for older sessions and invalid values", () => {
    const base = initialWizardState as unknown as Record<string, unknown>;
    const { loadProfileClass: _omit, ...legacy } = base;
    expect(migrateWizardState(legacy, WIZARD_STORAGE_VERSION).state?.loadProfileClass).toBe("mixed");
    expect(
      migrateWizardState({ ...base, loadProfileClass: "nonsense" }, WIZARD_STORAGE_VERSION).state?.loadProfileClass,
    ).toBe("mixed");
  });
});
