import { describe, expect, it } from "vitest";

import { monthlyOverlapCapKwh, splitProduction } from "./self-consumption";
import { buildPresentationValues } from "./presentation";
import { buildLifetimeProjection } from "./degradation";
import { selfConsumptionCapNoteKey } from "@/lib/self-consumption-cap-note";

/** Summer-heavy production, winter-heavy consumption: same annual totals. */
const monthlyProduction = [200, 400, 800, 1200, 1500, 1600, 1550, 1300, 900, 500, 250, 200];
const monthlyConsumptionWinter = [1600, 1400, 1100, 700, 400, 250, 250, 300, 600, 1000, 1400, 1400];
const monthlyConsumptionFlat = Array(12).fill(10_400 / 12);

const annualProduction = monthlyProduction.reduce((a, b) => a + b, 0); // 10 400
const annualConsumption = monthlyConsumptionWinter.reduce((a, b) => a + b, 0); // 10 400

describe("monthlyOverlapCapKwh", () => {
  it("sums min(production, consumption) per month", () => {
    expect(monthlyOverlapCapKwh(monthlyProduction, monthlyConsumptionWinter)).toBe(
      monthlyProduction.reduce((sum, p, i) => sum + Math.min(p, monthlyConsumptionWinter[i]!), 0),
    );
  });

  it("returns null without a usable 12-month pair", () => {
    expect(monthlyOverlapCapKwh(monthlyProduction, null)).toBeNull();
    expect(monthlyOverlapCapKwh(null, monthlyConsumptionWinter)).toBeNull();
    expect(monthlyOverlapCapKwh(monthlyProduction, [1, 2, 3])).toBeNull();
  });
});

describe("monthly cap on a manual self-consumption share", () => {
  it("caps a manual 90 % when the annual balance allows it but the months do not", () => {
    const overlap = monthlyOverlapCapKwh(monthlyProduction, monthlyConsumptionWinter)!;
    // Annual totals are identical, so the annual cap alone would permit 90 %.
    expect(annualProduction).toBe(annualConsumption);
    expect(overlap).toBeLessThan(annualProduction * 0.9);

    const split = splitProduction(annualProduction, 0.9, annualConsumption, overlap);
    expect(split.selfConsumptionKwh).toBeCloseTo(overlap, 6);
    expect(split.capBinding).toBe("monthly-overlap");
    expect(split.exportedKwh).toBeCloseTo(annualProduction - overlap, 6);
    expect(split.selfConsumptionShare).toBeLessThan(0.9);
  });

  it("does not cap when the monthly distribution allows the requested share", () => {
    const overlap = monthlyOverlapCapKwh(monthlyProduction, monthlyConsumptionFlat)!;
    const split = splitProduction(annualProduction, 0.4, annualConsumption, overlap);
    expect(split.selfConsumptionKwh).toBeCloseTo(annualProduction * 0.4, 6);
    expect(split.capBinding).toBe("none");
  });

  it("keeps the annual caps as well", () => {
    const split = splitProduction(20_000, 0.9, 3_000, 15_000);
    expect(split.selfConsumptionKwh).toBe(3_000);
    expect(split.capBinding).toBe("annual-consumption");
    expect(splitProduction(10_000, 1, null, null).capBinding).toBe("none");
  });

  it("applies the monthly cap in every year of the lifetime projection", () => {
    const overlapFor = (productionKwh: number) =>
      monthlyOverlapCapKwh(
        monthlyProduction.map((v) => v * (productionKwh / annualProduction)),
        monthlyConsumptionWinter,
      );
    const projection = buildLifetimeProjection({
      firstYearProductionKwh: annualProduction,
      selfConsumptionShare: 0.9,
      annualConsumptionKwh: annualConsumption,
      monthlyOverlapKwhForProduction: overlapFor,
      selfConsumedValuePerKwh: 1.44,
      exportValuePerKwh: 0.6,
    });
    for (const year of projection.years) {
      expect(year.selfConsumptionKwh).toBeLessThanOrEqual(overlapFor(year.productionKwh)! + 1e-9);
      expect(year.selfConsumptionKwh + year.exportedKwh).toBeCloseTo(year.productionKwh, 6);
    }
  });
});

describe("presentation and note wording", () => {
  const base = {
    annualProductionKwh: annualProduction,
    selfConsumptionKwh: 5_000,
    selfConsumptionShare: 5_000 / annualProduction,
    requestedSelfConsumptionShare: 0.9,
    annualConsumptionKwh: annualConsumption,
    maxAcPowerKw: 11,
    selfConsumptionValue: 7_200,
    exportValue: 3_240,
  };

  it("separates the requested share from the share actually used", () => {
    const p = buildPresentationValues({ ...base, capBinding: "monthly-overlap" });
    expect(p.requestedSelfConsumptionPercent).toBe(90);
    expect(p.selfConsumptionPercent).toBe(48);
    expect(p.selfConsumptionCapped).toBe(true);
    expect(p.selfConsumptionCapBinding).toBe("monthly-overlap");
    expect(p.selfConsumptionCapIsModelled).toBe(false);
  });

  it("flags a monthly cap from a generated profile as model-dependent", () => {
    const p = buildPresentationValues({
      ...base,
      capBinding: "monthly-overlap",
      monthlyConsumptionIsEstimated: true,
    });
    expect(p.selfConsumptionCapIsModelled).toBe(true);
    expect(selfConsumptionCapNoteKey(p)).toBe(
      "result.selfConsumptionCappedMonthlyModelledNote",
    );
  });

  it("picks the right explanation per binding limit", () => {
    expect(
      selfConsumptionCapNoteKey(buildPresentationValues({ ...base, capBinding: "monthly-overlap" })),
    ).toBe("result.selfConsumptionCappedMonthlyNote");
    expect(
      selfConsumptionCapNoteKey(
        buildPresentationValues({ ...base, capBinding: "annual-consumption" }),
      ),
    ).toBe("result.selfConsumptionCappedNote");
    expect(
      selfConsumptionCapNoteKey(
        buildPresentationValues({
          ...base,
          selfConsumptionKwh: annualProduction * 0.4,
          selfConsumptionShare: 0.4,
          requestedSelfConsumptionShare: 0.4,
          capBinding: "none",
        }),
      ),
    ).toBeNull();
  });
});
