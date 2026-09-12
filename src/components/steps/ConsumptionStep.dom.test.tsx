// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ConsumptionStep } from "./ConsumptionStep";
import { useWizardStore } from "@/state/wizard-store";
import { initialWizardState, WIZARD_STORAGE_VERSION } from "@/state/wizard-initial-state";
import { migrateWizardState } from "@/state/wizard-migrations";
import { isEstimatedConsumption } from "@/lib/consumption-provenance";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: "sv", t: () => Array.from({length:12}, (_,i) => String(i)) } }) }));
vi.mock("@/hooks/use-app-locale", () => ({ useAppLocale: () => ({ locale: "sv-SE" }) }));
vi.mock("@/services/native-service", () => ({ haptic: vi.fn() }));
vi.mock("@/components/StepShell", () => ({ StepShell: ({ children, footer }: any) => <div>{children}{footer}</div> }));
vi.mock("@/components/MonthlyChart", () => ({ MonthlyChart: () => null }));
const months = Array.from({length:12}, (_,i) => 700.25 + i);
beforeEach(() => useWizardStore.setState({ ...initialWizardState, annualConsumptionKwh: 8469, monthlyConsumptionKwh: months, consumptionInputType: "annual-profile", consumptionShape: "default" }));
afterEach(cleanup);
function open() { return render(<ConsumptionStep totalSteps={5} onBack={() => {}} onNext={() => {}} />); }
function next() { fireEvent.click(screen.getByRole("button", { name: "common.next" })); }
describe("consumption origin through navigation and persistence", () => {
  it("keeps generated values and origin on revisit, toggle, Next and reload", () => {
    let view = open();
    fireEvent.click(screen.getByRole("switch")); fireEvent.click(screen.getByRole("switch")); next();
    expect(useWizardStore.getState().consumptionInputType).toBe("annual-profile");
    expect(useWizardStore.getState().monthlyConsumptionKwh).toEqual(months);
    expect(useWizardStore.getState().annualConsumptionKwh).toBe(8469);
    view.unmount();
    const restored = migrateWizardState(JSON.parse(JSON.stringify(useWizardStore.getState())), WIZARD_STORAGE_VERSION).state;
    useWizardStore.setState(restored); view = open(); next();
    expect(isEstimatedConsumption(useWizardStore.getState().consumptionInputType)).toBe(true);
    expect(useWizardStore.getState().consumptionInputType).toBe("annual-profile");
  });
  it("one edited generated month stays partially estimated after saving and reloading", () => {
    open();
    const firstMonth = screen.getAllByRole("textbox")[0];
    if (!firstMonth) throw new Error("Missing month input");
    fireEvent.change(firstMonth, { target: { value: "800" } }); next();
    expect(useWizardStore.getState().consumptionInputType).toBe("partial-profile");
    const state = migrateWizardState(JSON.parse(JSON.stringify(useWizardStore.getState())), WIZARD_STORAGE_VERSION).state;
    expect(state.consumptionInputType).toBe("partial-profile");
    expect(state.monthlyConsumptionKwh?.[0]).toBe(800);
  });
  it("preserves imported origin", () => {
    useWizardStore.setState({ consumptionInputType: "imported" }); open(); next();
    expect(useWizardStore.getState().consumptionInputType).toBe("imported");
  });
  it("does not guess legacy manual months are actual and retains values", () => {
    const old = { ...initialWizardState, monthlyConsumptionKwh: months, consumptionInputType: "monthly-manual" };
    const migrated = migrateWizardState(old, 5).state;
    expect(migrated.consumptionInputType).toBe("unknown");
    expect(migrated.monthlyConsumptionKwh).toEqual(months);
  });
  it("a new complete manual series is actual, but empty months block Next", () => {
    useWizardStore.setState({ monthlyConsumptionKwh: null, consumptionInputType: "annual-only" });
    open(); fireEvent.click(screen.getByRole("switch"));
    expect((screen.getByRole("button", { name: "common.next" }) as HTMLButtonElement).disabled).toBe(true);
    screen.getAllByRole("textbox").forEach(el => fireEvent.change(el, { target: { value: "800" } })); next();
    expect(useWizardStore.getState().consumptionInputType).toBe("monthly-manual");
  });
});