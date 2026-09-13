import { describe, expect, it } from "vitest";
import {
  editedConsumptionOrigin,
  isEstimatedConsumption,
  legacyConsumptionOrigin,
} from "./consumption-provenance";

describe("consumption origin after editing", () => {
  it("marks an edited imported series as manually edited, still real data", () => {
    const edited = editedConsumptionOrigin("imported");
    expect(edited).toBe("monthly-manual");
    // Real, edited months must never be reclassified as estimated/synthetic.
    expect(isEstimatedConsumption(edited)).toBe(false);
  });

  it("keeps editing idempotent", () => {
    expect(editedConsumptionOrigin(editedConsumptionOrigin("imported"))).toBe("monthly-manual");
  });

  it("leaves generated series partly estimated", () => {
    expect(editedConsumptionOrigin("annual-profile")).toBe("partial-profile");
    expect(editedConsumptionOrigin("partial-profile")).toBe("partial-profile");
    expect(isEstimatedConsumption("partial-profile")).toBe(true);
  });

  it("does not upgrade unknown history", () => {
    expect(editedConsumptionOrigin("unknown")).toBe("unknown");
    expect(legacyConsumptionOrigin("monthly-manual")).toBe("unknown");
    expect(legacyConsumptionOrigin("imported")).toBe("imported");
  });
});
