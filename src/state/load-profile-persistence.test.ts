import { describe, expect, it } from "vitest";
import { migrateWizardState } from "./wizard-migrations";
import { initialWizardState } from "./wizard-initial-state";

describe("load profile persistence", () => {
  it("keeps the stored choice across a reload", () => {
    const stored = { ...initialWizardState, loadProfileClass: "daytime" };
    const result = migrateWizardState(JSON.parse(JSON.stringify(stored)));
    expect(result.data?.loadProfileClass).toBe("daytime");
  });

  it("falls back to mixed for older sessions and invalid values", () => {
    const base = initialWizardState as Record<string, unknown>;
    const { loadProfileClass: _omit, ...legacy } = base;
    expect(migrateWizardState(legacy).data?.loadProfileClass).toBe("mixed");
    expect(
      migrateWizardState({ ...base, loadProfileClass: "nonsense" }).data?.loadProfileClass,
    ).toBe("mixed");
  });
});
