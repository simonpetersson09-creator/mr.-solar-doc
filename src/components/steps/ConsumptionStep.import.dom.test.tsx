// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConsumptionStep } from "./ConsumptionStep";
import { useWizardStore } from "@/state/wizard-store";
import { initialWizardState } from "@/state/wizard-initial-state";
import { parseConsumptionText } from "@/lib/parse-consumption-document";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "sv", t: () => Array.from({ length: 12 }, (_, i) => String(i)) },
  }),
}));
vi.mock("@/hooks/use-app-locale", () => ({ useAppLocale: () => ({ locale: "sv-SE" }) }));
vi.mock("@/services/native-service", () => ({ haptic: vi.fn() }));
vi.mock("@/components/StepShell", () => ({
  StepShell: ({ children, footer }: any) => (
    <div>
      {children}
      {footer}
    </div>
  ),
}));
vi.mock("@/components/MonthlyChart", () => ({ MonthlyChart: () => null }));

const partialText = ["Jan 2025 500 kWh", "Feb 2025 0 kWh"].join("\n");
vi.mock("@/lib/read-consumption-file", () => ({
  readConsumptionFile: async () => ({ ...parseConsumptionText(partialText), text: partialText }),
}));

beforeEach(() =>
  useWizardStore.setState({
    ...initialWizardState,
    selfConsumptionShare: 0.9,
    selfConsumptionShareIsUserSet: true,
  }),
);
afterEach(cleanup);

describe("incomplete import", () => {
  it("keeps the manual self-consumption choice and never fills months with zeros", async () => {
    const { container } = render(<ConsumptionStep totalSteps={5} onBack={() => {}} onNext={() => {}} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File([partialText], "faktura.csv", { type: "text/csv" })] },
    });

    await waitFor(() => expect(screen.getAllByRole("textbox").length).toBeGreaterThan(1));
    const months = screen.getAllByRole("textbox") as HTMLInputElement[];
    expect(months[0]?.value).toBe("500");
    // Explicit zero kept, unknown months left empty rather than zero-filled.
    expect(months[1]?.value).toBe("0");
    expect(months[2]?.value).toBe("");

    // An incomplete series cannot be carried forward.
    expect((screen.getByRole("button", { name: "common.next" }) as HTMLButtonElement).disabled).toBe(true);

    const state = useWizardStore.getState();
    expect(state.selfConsumptionShare).toBe(0.9);
    expect(state.selfConsumptionShareIsUserSet).toBe(true);
    expect(state.monthlyConsumptionKwh).toBe(initialWizardState.monthlyConsumptionKwh);
  });
});
