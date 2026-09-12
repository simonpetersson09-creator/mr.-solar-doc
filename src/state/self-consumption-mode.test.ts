import { describe, expect, it } from "vitest";
import { useWizardStore } from "./wizard-store";
import { migrateWizardState, } from "./wizard-migrations";
import { WIZARD_STORAGE_VERSION, initialWizardState } from "./wizard-initial-state";
import { DEFAULT_SELF_CONSUMPTION_SHARE } from "@/config/constants";
import { resolveSelfConsumptionShare } from "@/lib/calc/self-consumption";

describe("self-consumption mode", () => {
  it("switches to manual mode when the slider is used and back on reset", () => {
    useWizardStore.setState({
      selfConsumptionShare: DEFAULT_SELF_CONSUMPTION_SHARE,
      selfConsumptionShareIsUserSet: false,
    });
    useWizardStore.getState().setSelfConsumptionShare(0.2);
    expect(useWizardStore.getState().selfConsumptionShare).toBe(0.2);
    expect(useWizardStore.getState().selfConsumptionShareIsUserSet).toBe(true);

    useWizardStore.getState().resetSelfConsumptionShare();
    expect(useWizardStore.getState().selfConsumptionShareIsUserSet).toBe(false);
    expect(useWizardStore.getState().selfConsumptionShare).toBe(DEFAULT_SELF_CONSUMPTION_SHARE);
  });

  it("re-models the share after a reset instead of keeping the manual value", () => {
    const common = { productionKwh: 10000, annualConsumptionKwh: 20000, loadProfileClass: "mixed" as const };
    const manual = resolveSelfConsumptionShare({ ...common, userShare: 0.2, userSet: true });
    const automatic = resolveSelfConsumptionShare({ ...common, userShare: 0.2, userSet: false });
    expect(manual.share).toBeCloseTo(0.2, 6);
    expect(manual.source).toBe("user-override");
    expect(automatic.share).not.toBeCloseTo(0.2, 3);
    expect(automatic.source).not.toBe("user-override");
  });

  it("keeps both mode and value across a reload", () => {
    const stored = {
      ...initialWizardState,
      selfConsumptionShare: 0.25,
      selfConsumptionShareIsUserSet: true,
    };
    const manual = migrateWizardState(JSON.parse(JSON.stringify(stored)), WIZARD_STORAGE_VERSION);
    expect(manual.state.selfConsumptionShare).toBeCloseTo(0.25, 6);
    expect(manual.state.selfConsumptionShareIsUserSet).toBe(true);

    const auto = migrateWizardState(
      JSON.parse(JSON.stringify({ ...initialWizardState, selfConsumptionShareIsUserSet: false })),
      WIZARD_STORAGE_VERSION,
    );
    expect(auto.state.selfConsumptionShareIsUserSet).toBe(false);
  });

  it("does not turn an older saved calculation into a manual override", () => {
    const base = initialWizardState as unknown as Record<string, unknown>;
    const { selfConsumptionShareIsUserSet: _omit, ...legacy } = base;
    expect(
      migrateWizardState(legacy, WIZARD_STORAGE_VERSION).state?.selfConsumptionShareIsUserSet,
    ).toBe(false);
  });
});
