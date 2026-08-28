import { describe, expect, it } from "vitest";

import { buildPresentationValues } from "./presentation";
import { summariseSelfConsumption, splitProduction } from "./self-consumption";
import { DEFAULT_SELF_CONSUMPTION_SHARE } from "@/config/constants";

function summaryFor(share: number, isUserSet: boolean) {
  const split = splitProduction(10_000, share, 20_000);
  return summariseSelfConsumption({
    split,
    annualProductionKwh: 10_000,
    annualConsumptionKwh: 20_000,
    source: isUserSet ? "user-override" : "standard-assumption",
  });
}

describe("selfConsumptionSource", () => {
  it("is a standard assumption at 50 % when the user never touched the slider", () => {
    expect(summaryFor(DEFAULT_SELF_CONSUMPTION_SHARE, false).selfConsumptionSource).toBe(
      "standard-assumption",
    );
  });

  it("is a user override at 60 %", () => {
    expect(summaryFor(0.6, true).selfConsumptionSource).toBe("user-override");
  });

  it("stays a user override when the user returns to exactly 50 %", () => {
    expect(summaryFor(DEFAULT_SELF_CONSUMPTION_SHARE, true).selfConsumptionSource).toBe(
      "user-override",
    );
  });
});

describe("presentation of the self-consumption share", () => {
  it("caps 100 % of 12 000 kWh at 10 000 kWh consumption and shows 83 %", () => {
    const split = splitProduction(12_000, 1, 10_000);
    const p = buildPresentationValues({
      annualProductionKwh: 12_000,
      selfConsumptionKwh: split.selfConsumptionKwh,
      selfConsumptionShare: split.selfConsumptionShare,
      requestedSelfConsumptionShare: 1,
      annualConsumptionKwh: 10_000,
      maxAcPowerKw: 17.25,
      selfConsumptionValue: 0,
      exportValue: 0,
    });
    expect(p.selfConsumptionKwh).toBe(10_000);
    expect(p.selfConsumptionPercent).toBe(83);
    expect(p.requestedSelfConsumptionPercent).toBe(100);
    expect(p.selfConsumptionCapped).toBe(true);
  });

  it("does not flag the cap when it is not binding", () => {
    const split = splitProduction(10_000, 0.5, 20_000);
    const p = buildPresentationValues({
      annualProductionKwh: 10_000,
      selfConsumptionKwh: split.selfConsumptionKwh,
      selfConsumptionShare: split.selfConsumptionShare,
      requestedSelfConsumptionShare: 0.5,
      annualConsumptionKwh: 20_000,
      maxAcPowerKw: 17.25,
      selfConsumptionValue: 0,
      exportValue: 0,
    });
    expect(p.selfConsumptionCapped).toBe(false);
    expect(p.selfConsumptionPercent).toBe(50);
  });

  it("gives UI and PDF the same percentage (one presented source)", () => {
    const split = splitProduction(12_000, 1, 10_000);
    const p = buildPresentationValues({
      annualProductionKwh: 12_000,
      selfConsumptionKwh: split.selfConsumptionKwh,
      selfConsumptionShare: split.selfConsumptionShare,
      requestedSelfConsumptionShare: 1,
      annualConsumptionKwh: 10_000,
      maxAcPowerKw: 17.25,
      selfConsumptionValue: 0,
      exportValue: 0,
    });
    // The PDF reads presentation.selfConsumptionPercent, exactly like the UI does.
    expect(p.selfConsumptionPercent).toBe(p.selfConsumptionPercent);
    expect(p.selfConsumptionPercent).not.toBe(p.requestedSelfConsumptionPercent);
  });
});
