import { describe, expect, it, beforeEach } from "vitest";
import { useWizardStore } from "@/state/wizard-store";
import { getConnectionConfig, hasVerifiedConnectionConfig } from "@/config/connections";
import { amperageCapacity } from "@/config/connection-capacity";

const store = () => useWizardStore.getState();

const location = (countryCode: string) => ({
  latitude: 59,
  longitude: 18,
  address: "Test",
  region: "SE1",
  countryCode,
});

describe("country transition (H2)", () => {
  beforeEach(() => {
    useWizardStore.getState().reset();
  });

  it("clears connection and economics when the country changes", () => {
    store().setLocation(location("SE"));
    const option = getConnectionConfig("SE").connectionOptions[0]!;
    store().selectConnectionOption(option.id, option.capacity);
    store().setSelfConsumedValue(2.5);
    store().setQuotePrice(150000);

    store().setLocation(location("DE"));

    expect(store().connectionCapacity).toBeNull();
    expect(store().connectionOptionId).toBeNull();
    expect(store().selfConsumedValuePerKwh).toBeNull();
    expect(store().quotePrice).toBeNull();
  });

  it("keeps personal, country-independent answers", () => {
    store().setLocation(location("SE"));
    store().setRoof("south", 25);
    store().setConsumption(12000, null);
    store().setAcceptedPaybackYears(9);

    store().setLocation(location("PL"));

    expect(store().tiltDegrees).toBe(25);
    expect(store().annualConsumptionKwh).toBe(12000);
    expect(store().acceptedPaybackYears).toBe(9);
  });

  it("does not reset when only the address within the same country changes", () => {
    store().setLocation(location("SE"));
    const option = getConnectionConfig("SE").connectionOptions[0]!;
    store().selectConnectionOption(option.id, option.capacity);
    store().setLocation({ ...location("SE"), address: "Another street" });
    expect(store().connectionCapacity).not.toBeNull();
  });

  it("requires confirmation only for non-verified country profiles", () => {
    store().setLocation(location("SE"));
    expect(store().gridConfirmed).toBe(hasVerifiedConnectionConfig("SE"));
    store().setLocation(location("ZZ"));
    expect(store().gridConfirmed).toBe(false);
  });
});

describe("grid override vs country option (C3)", () => {
  beforeEach(() => {
    useWizardStore.getState().reset();
  });

  it("invalidates a country option when the grid profile changes", () => {
    store().setLocation(location("SE"));
    const option = getConnectionConfig("SE").connectionOptions[0]!;
    store().selectConnectionOption(option.id, option.capacity);

    store().setGridProfile({ serviceType: "single-phase", voltageV: 230 });

    expect(store().connectionCapacity).toBeNull();
    expect(store().connectionOptionId).toBeNull();
    expect(store().connectionSource).toBeNull();
  });

  it("keeps a manual amount and re-derives it from the new profile", () => {
    store().setLocation(location("ZZ"));
    store().setConnectionCapacity(
      amperageCapacity(25, { serviceType: "single-phase", voltageV: 230, frequencyHz: 50 }),
    );
    store().setGridProfile({ serviceType: "three-phase", voltageV: 400 });

    const capacity = store().connectionCapacity;
    expect(capacity?.type).toBe("amperage");
    expect(capacity && capacity.type === "amperage" ? capacity.amperageA : null).toBe(25);
    expect(capacity?.serviceType).toBe("three-phase");
    expect(capacity?.voltageV).toBe(400);
  });

  it("a country option overrides an earlier manual grid profile", () => {
    store().setLocation(location("SE"));
    store().setGridProfile({ serviceType: "single-phase", voltageV: 230 });
    const option = getConnectionConfig("SE").connectionOptions[0]!;
    store().selectConnectionOption(option.id, option.capacity);

    expect(store().gridServiceType).toBe(option.capacity.serviceType);
    expect(store().gridVoltageV).toBe(option.capacity.voltageV);
  });
});
